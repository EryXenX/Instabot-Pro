// Instagram listener. Normalizes each raw inbox event and feeds it through
// handlerAction, which mirrors GoatBot-Pro's handlerAction dispatch.
//
// Two inbound sources feed one deduped pipeline:
//
//   • realtime MQTT push (fast, ~1s) — the primary path when config.realtime is
//     on. It rides the session's single shared MQTT client (the package wires
//     that up), because a second connection on the same device id silently takes
//     the Direct stream away from the first and the bot goes deaf.
//   • inbox poll (the safety net) — runs underneath the push at
//     config.realtimeSafetyPollMs so a push that connects, subscribes and then
//     stops delivering does not leave the bot silent.
//
// Both name the same message differently (poller: mid; push: item id, and the
// same mid when present), so a deduper drops the second copy by mid or by a
// thread+sender+body+timestamp fingerprint. That is what makes running both at
// once safe.

const handlerAction = require("./handlerAction");
const { EventNormalizer } = require("@eryxenx/insta-chat");
const { logger, getText } = require("../utils");
const { Deduper, messageKeys, toMillis } = require("./inbound");

// The package's poll floor when realtime is off. Polling faster is what trips
// Instagram's 429 throttle — 2000 ms on a datacenter IP is a rate-limit, not
// extra speed — so the guaranteed-polling path keeps the documented 15s floor.
// With realtime on, the push is the latency path and the poll is only a safety
// net, so it can run on config.realtimeSafetyPollMs instead.
const MIN_POLL_INTERVAL_MS = 15000;
const MIN_SAFETY_POLL_MS = 4000;
const BACKOFF_START_MS = 30000;
const BACKOFF_MAX_MS = 10 * 60 * 1000;
// Realtime re-arm: faster than the poll backoff, because an MQTT drop is
// usually momentary and the polling-only gap in between is what makes a reply
// feel slow. The package re-arms a failure that happened *before* the
// subscription was confirmed; a drop after that leaves the listener dead, so
// this watchdog re-arms it (see onListenerError).
const REARM_START_MS = 3000;
const REARM_MAX_MS = 60 * 1000;

// Instagram answers a dead/suspended session by redirecting the inbox poll to
// the login page, which surfaces as an axios "Maximum number of redirects
// exceeded" (or a 3xx). That never recovers on its own, so stop polling.
const FATAL_LANG_KEYS = {
  IG_SESSION_INVALID: null,
  IG_CHALLENGE: "sessionChallenge",
  IG_SUSPENDED: "sessionSuspended"
};

function isSessionInvalid(err) {
  return Boolean(err && err.code && Object.prototype.hasOwnProperty.call(FATAL_LANG_KEYS, err.code));
}

function isRateLimited(err) {
  const message = String(err && (err.message || err));
  const status = err && err.response && err.response.status;
  return status === 429 || /\b429\b/.test(message);
}

// Per-stage reply-latency log. Measures, for one inbound message: how long after
// Instagram stamped it the bot saw it (detect), how long normalize+handler took,
// and the wall-clock total to the reply leaving. Printed as one LATENCY line so
// the numbers can be read off without a debugger.
function makeLatencyTracker(enabled) {
  const pending = new Map(); // threadID -> { t0, detectMs, normalizeMs, handlerMs }
  const record = (stage, threadID, ms) => {
    if (enabled) logger.info("LATENCY", `${stage}=${Math.round(ms)}ms thread=${threadID}`);
  };
  return {
    onDetect(threadID, timestampMs) {
      if (!enabled) return;
      pending.set(String(threadID), {
        t0: Date.now(),
        detectMs: timestampMs ? Date.now() - toMillis(timestampMs) : null
      });
    },
    onNormalized(threadID, ms) {
      const p = pending.get(String(threadID));
      if (p) p.normalizeMs = ms;
      record("normalize", threadID, ms);
    },
    onHandled(threadID, ms) {
      const p = pending.get(String(threadID));
      if (p) p.handlerMs = ms;
      record("handler", threadID, ms);
    },
    onSent(threadID, ms) {
      const p = pending.get(String(threadID));
      record("send", threadID, ms);
      if (!p) return;
      const total = Date.now() - p.t0;
      record("detect", threadID, p.detectMs == null ? 0 : p.detectMs);
      logger.info(
        "LATENCY",
        `total=${Math.round(total)}ms thread=${threadID} ` +
        `(detect=${p.detectMs == null ? "?" : Math.round(p.detectMs)}ms ` +
        `normalize=${p.normalizeMs == null ? "?" : Math.round(p.normalizeMs)}ms ` +
        `handler=${p.handlerMs == null ? "?" : Math.round(p.handlerMs)}ms send=${Math.round(ms)}ms)`
      );
      pending.delete(String(threadID));
    }
  };
}

function startListening(api) {
  const normalizer = new EventNormalizer(api);
  const runHandler = handlerAction(api);
  const config = global.InstaBot.config || {};
  const latency = makeLatencyTracker(config.latencyLog !== false);

  // Time every outbound send and close out the pending reply's latency record
  // when the first one for a thread leaves. Wrapped once, on the shared client.
  if (typeof api.sendMessage === "function" && !api.__latencyWrapped) {
    const originalSend = api.sendMessage;
    api.sendMessage = function (form, threadID, ...rest) {
      const t = Date.now();
      const result = originalSend.call(this, form, threadID, ...rest);
      if (result && typeof result.then === "function") {
        return result.then((value) => {
          latency.onSent(threadID, Date.now() - t);
          return value;
        }, (err) => {
          latency.onSent(threadID, Date.now() - t);
          throw err;
        });
      }
      return result;
    };
    api.__latencyWrapped = true;
  }

  // Instagram replays a thread's recent history the first time the bot sees it
  // (e.g. right after it is added to a group), and the realtime stream replays
  // its sync window on subscribe. Those messages predate the bot, so answering
  // them reads as "the bot replied to commands sent before it existed". Drop
  // anything older than startup, with a little slack for clock skew.
  const startedAt = Date.now();
  const STARTUP_SKEW_MS = 90 * 1000;

  const configured = config.pollInterval ?? 20000;
  const interval = Math.max(configured, MIN_POLL_INTERVAL_MS);
  if (interval !== configured) {
    logger.warn("LISTEN", getText("handlerEvents", "pollIntervalRaised", configured, interval));
  }

  const realtimeConfigured = () => {
    const rt = api.api && api.api.inbox && api.api.inbox.realtimeOptions;
    return !!(rt && rt.enabled);
  };
  const safetyPollMs = Math.max(Number(config.realtimeSafetyPollMs) || 8000, MIN_SAFETY_POLL_MS);

  let stopped = false;
  let stopCurrent = null; // the package listen()'s cancel function
  let stopSafety = null; // the safety poller's cancel function
  let backoff = BACKOFF_START_MS;
  let lastRateLimitLog = 0;
  let rateLimitStreak = 0;
  let safetyRateLimited = 0;
  const deduper = new Deduper();

  // A ref'd timer keeps the process alive while the listener is armed. The
  // package's poll timer is not guaranteed to hold the event loop open (and the
  // poller pauses during a throttle), so without this the bot logs "listening"
  // and then exits cleanly a second later, which the supervisor reads as a
  // normal shutdown and never restarts.
  const keepAlive = setInterval(() => {}, 60000);
  const shutdown = (code) => {
    stopped = true;
    if (typeof stopCurrent === "function") stopCurrent();
    if (typeof stopSafety === "function") stopSafety();
    clearInterval(keepAlive);
    process.exit(code);
  };

  const onRateLimited = () => {
    if (stopped) return;
    // Tear down the current fixed-interval poller first, otherwise it keeps
    // hammering the throttle while we back off.
    if (typeof stopCurrent === "function") stopCurrent();
    stopCurrent = null;

    rateLimitStreak += 1;
    const wait = Math.min(backoff, BACKOFF_MAX_MS);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);

    const now = Date.now();
    if (now - lastRateLimitLog >= 60000) {
      logger.warn("LISTEN", getText("handlerEvents", "rateLimited", interval, wait / 1000));
      lastRateLimitLog = now;
    }
    setTimeout(armListener, wait);
  };

  // Realtime is the default. When it is on, the package's listen() delivers
  // events from the MQTT push and does not poll; the safety poll below covers a
  // push that connects and then goes quiet. The package only re-arms a failure
  // that happened *before* the subscription was confirmed; a drop after that
  // leaves the push dead, so this watchdog re-arms it, with a short backoff so a
  // flapping broker still recovers.
  const realtimeAlive = () => {
    const l = api.api && api.api.inbox && api.api.inbox._realtimeListener;
    return !!(l && l.connected);
  };

  let rearmBackoff = REARM_START_MS;
  const onListenerError = (err) => {
    if (stopped) return;
    logger.error("LISTEN", getText("handlerEvents", "listenError", err && (err.message || err)));
    // Only the realtime path needs this: in polling mode the package keeps its
    // own poll timer alive across transient errors.
    if (!realtimeConfigured() || realtimeAlive()) return;
    if (typeof stopCurrent === "function") stopCurrent();
    stopCurrent = null;
    const wait = rearmBackoff;
    rearmBackoff = Math.min(rearmBackoff * 2, REARM_MAX_MS);
    setTimeout(armListener, wait);
  };

  const onEvent = async (raw) => {
    if (!raw) return;
    // The push names a thread by its internal thread_id; the poller uses the
    // inbox id. Hand the rest of the bot one consistent id so commands, replies
    // and the dedupe fingerprint all agree.
    if (raw.threadID != null && typeof api.resolveThreadID === "function") {
      raw = { ...raw, threadID: api.resolveThreadID(raw.threadID) };
    }
    const threadID = raw.threadID != null ? String(raw.threadID) : "";
    // One message, two sources: drop the copy that arrives second. Without this
    // the push and the safety poll each dispatch a reply.
    const keys = messageKeys(raw);
    if (keys.size && !deduper.accept(keys)) {
      logger.info("LISTEN", `deduped duplicate ${raw.messageID || raw.itemID || "?"} thread=${threadID}`);
      return;
    }
    latency.onDetect(threadID, raw.timestamp);

    let event;
    const tNorm = Date.now();
    try {
      event = await normalizer.normalize(raw);
    } catch (error) {
      logger.error("LISTEN", getText("handlerEvents", "normalizeError", error.message));
      return;
    }
    latency.onNormalized(threadID, Date.now() - tNorm);
    if (!event) return;

    // Never react to the bot's own outbound messages.
    if (event.senderID && String(event.senderID) === String(global.InstaBot.userID)) return;

    // Skip the history Instagram replays for a thread the bot has just joined:
    // those messages were sent before this run started, so the bot must not
    // answer them. System events (member added, etc.) have no user timestamp and
    // are synthesized live, so they pass.
    if (event.type !== "event" && typeof event.timestamp === "number" && event.timestamp < startedAt - STARTUP_SKEW_MS) {
      return;
    }

    const tHandler = Date.now();
    try {
      await runHandler(event);
    } catch (error) {
      logger.error("LISTEN", getText("handlerEvents", "eventError", event.type, error.message));
    } finally {
      latency.onHandled(threadID, Date.now() - tHandler);
    }
  };

  const onError = async (err) => {
    if (stopped) return;
    if (isRateLimited(err)) return onRateLimited();
    if (isSessionInvalid(err)) {
      let langKey = FATAL_LANG_KEYS[err.code] || "sessionInvalid";
      if (!FATAL_LANG_KEYS[err.code]) {
        try {
          const diagnoseSession = require("../login/diagnose");
          const result = await diagnoseSession();
          langKey = result.langKey || langKey;
        } catch (_) {}
      }
      logger.error("LISTEN", getText("handlerEvents", langKey));
      // Close with the fatal code so the supervisor reports the bot as stopped
      // instead of leaving a live process that polls a dead session.
      shutdown(1);
      return;
    }
    onListenerError(err);
  };

  const armListener = () => {
    if (stopped) return;
    stopCurrent = api.listen(
      (err, raw) => {
        if (err) return void onError(err);
        // A clean poll means the throttle has lifted - reset the backoff.
        if (backoff !== BACKOFF_START_MS) {
          backoff = BACKOFF_START_MS;
          if (rateLimitStreak) {
            logger.success("LISTEN", getText("handlerEvents", "recvResumed"));
            rateLimitStreak = 0;
          }
        }
        rearmBackoff = REARM_START_MS;
        void onEvent(raw);
      },
      interval
    );
  };

  // Under realtime the poll is only a safety net, so run it on its own timer via
  // the package's dedicated entry point (an independent stream with its own
  // cursor and its own 429 backoff). With realtime off, api.listen() is the poll
  // and this stays off.
  const armSafetyPoll = () => {
    if (stopped || !realtimeConfigured()) return;
    const inbox = api.api && api.api.inbox;
    // startSafetyPoll is the dedicated entry point (its own cursor + 429
    // backoff) on the package that ships it. On an older published package fall
    // back to the plain poller so the push is never a single point of failure;
    // it runs at that package's floor, which is slower but still a safety net.
    const start = inbox && (typeof inbox.startSafetyPoll === "function"
      ? inbox.startSafetyPoll.bind(inbox)
      : typeof inbox._startPolling === "function" ? inbox._startPolling.bind(inbox) : null);
    if (!start) {
      logger.warn("LISTEN", "safety poll unavailable on this package version; push-only");
      return;
    }
    stopSafety = start((err, raw) => {
      if (err) {
        if (isRateLimited(err)) {
          safetyRateLimited += 1;
          logger.warn("LISTEN", `safety poll rate-limited (${safetyRateLimited})`);
        }
        return;
      }
      void onEvent(raw);
    }, safetyPollMs);
    logger.info("LISTEN", `realtime push primary; safety poll every ${safetyPollMs}ms`);
  };

  armListener();
  armSafetyPoll();
}

module.exports = startListening;

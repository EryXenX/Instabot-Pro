// Instagram listener. Normalizes each raw inbox event and feeds it through
// handlerAction, which mirrors GoatBot-Pro's handlerAction dispatch.

const handlerAction = require("./handlerAction");
const { EventNormalizer } = require("@eryxenx/insta-chat");
const { logger, getText } = require("../utils");

// The package's own listen() polls on a fixed interval, so once Instagram
// returns 429 every subsequent poll piles another request on top of the
// throttle and the inbox never recovers. We instead run its listener in a short
// burst and, when throttled, tear it down and re-arm with exponential backoff.
//
// The floor matches the package's documented safe minimum and the library's own
// hard floor (2000): polling faster is what trips IG's rate limiter, and polling
// slower just adds avoidable lag to every reply (IG has no DM push, so
// worst-case latency is one poll cycle).
const MIN_POLL_INTERVAL_MS = 2000;
const BACKOFF_START_MS = 30000;
const BACKOFF_MAX_MS = 10 * 60 * 1000;

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

function startListening(api) {
  const normalizer = new EventNormalizer(api);
  const runHandler = handlerAction(api);
  const configured = global.InstaBot.config.pollInterval ?? 20000;
  const interval = Math.max(configured, MIN_POLL_INTERVAL_MS);
  if (interval !== configured) {
    logger.warn("LISTEN", getText("handlerEvents", "pollIntervalRaised", configured, interval));
  }

  let stopped = false;
  let stopCurrent = null; // the package listen()'s cancel function
  let backoff = BACKOFF_START_MS;
  let lastRateLimitLog = 0;
  let rateLimitStreak = 0;

  // A ref'd timer keeps the process alive while the listener is armed. The
  // package's poll timer is not guaranteed to hold the event loop open (and the
  // poller pauses during a throttle), so without this the bot logs "listening"
  // and then exits cleanly a second later, which the supervisor reads as a
  // normal shutdown and never restarts.
  const keepAlive = setInterval(() => {}, 60000);
  const shutdown = (code) => {
    stopped = true;
    if (typeof stopCurrent === "function") stopCurrent();
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

  const onEvent = async (raw) => {
    if (!raw) return;
    let event;
    try {
      event = await normalizer.normalize(raw);
    } catch (error) {
      logger.error("LISTEN", getText("handlerEvents", "normalizeError", error.message));
      return;
    }
    if (!event) return;

    // Never react to the bot's own outbound messages.
    if (event.senderID && String(event.senderID) === String(global.InstaBot.userID)) return;

    try {
      await runHandler(event);
    } catch (error) {
      logger.error("LISTEN", getText("handlerEvents", "eventError", event.type, error.message));
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
    logger.error("LISTEN", getText("handlerEvents", "listenError", err.message || err));
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
        void onEvent(raw);
      },
      interval
    );
  };

  armListener();
}

module.exports = startListening;

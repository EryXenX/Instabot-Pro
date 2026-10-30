// Reaction watcher.
//
// Instagram delivers no reaction *event* through the normal inbox path: the
// poller (methods/inbox.js) drops REACTION_LOG items and the message-sync bridge
// (realtime/bridge.js) only accepts new *message* items, so a reaction patch is
// dropped there too. Two GoatBot-Pro features depend on reactions arriving, and
// the state is only readable from the thread-detail query:
//
//   reactions:     [{ reaction, sender_fbid }]
//   msg_reactions: [{ sender_fbid, sender_igid }]
//
// This watcher serves both features from that read, via two triggers:
//
//   • Realtime (MQTT) push — the Direct message-sync stream *does* carry
//     `/direct_v2/threads/<tid>/items/<iid>/reactions/likes/<reactor>` patches
//     with op "add"/"remove". The bridge drops them because it only matches
//     item paths, but the raw patch is exactly what we need, and it arrives in
//     ~1s. On an "add" we process that thread immediately (fast path).
//   • Polling fallback — one thread's detail per tick (round-robin, to stay
//     under the rate limit). Used when realtime is unavailable, and to keep the
//     reactUnsend baseline fresh.
//
// The reaction is then acted on:
//   1. `reactUnsend` — unsend a message when a new matching emoji reaction
//      appears (only while `config.reactUnsend.enable` is true).
//   2. `onReaction` — dispatch commands that registered
//      `global.GoatBot.onReaction.set(messageID, { commandName, author, ... })`
//      (cmd.js/event.js/prefix/install/update/emojimean/…). Instagram's FCA
//      message ids match the thread-detail node ids, so a registration keyed by
//      the id `sendMessage` returned resolves directly here.

const handlerAction = require("./handlerAction");
const { logger, getText } = require("../utils");

const TICK_MS = 5000; // one thread per tick, round-robin
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const REFRESH_THREADS_MS = 60000;

// Realtime push tuning.
const RT_DEBOUNCE_MS = 150; // coalesce a burst of patches on one thread
const RT_REPLAY_GUARD_MS = 3000; // ignore subscription-replay patches on connect
const RT_RECONNECT_MS = 5000;
const RT_PATH_RE = /\/items\/[^/]+\/reactions\/likes\/([^/]+)$/;
// A bare new-item patch, e.g. "/direct_v2/threads/<tid>/items/<iid>".
const RT_ITEM_RE = /^\/direct_v2\/threads\/[^/]+\/items\/[^/]+\/?$/;

// Instagram reports "❤" where the picker shows "❤️" (U+FE0F variation selector),
// so compare emojis with the selector stripped.
const normalizeEmoji = (e) => String(e == null ? "" : e).replace(/\uFE0F/g, "");

function startReactionWatcher(api, options = {}) {
  const seen = new Map(); // threadID -> Map(messageID -> Map(reactorIgid -> emoji))
  const runHandler = handlerAction(api);
  const tickMs = options.tickMs || TICK_MS;
  const replayGuardMs = options.replayGuardMs != null ? options.replayGuardMs : RT_REPLAY_GUARD_MS;
  const rtDebounceMs = options.rtDebounceMs != null ? options.rtDebounceMs : RT_DEBOUNCE_MS;
  let stopped = false;
  let timer = null;
  let backoff = tickMs;
  let cursor = 0;
  let threadIDs = [];
  let lastThreadsAt = 0;

  // Realtime (MQTT) push state. The stream carries reaction patches in ~1s, so
  // it is the fast path; the poll above is the fallback and the reactUnsend
  // baseline keeper.
  let rtClient = null;
  let rtStopped = false;
  let rtReconnecting = false;
  let rtTimer = null;
  const rtDebounce = new Map(); // threadID -> timer
  // Instagram uses two ids per thread: the inbox/FCA id (`id` == `thread_fbid`)
  // and the internal `thread_id` that the realtime path carries. The detail
  // query only accepts the former, so map the latter onto it.
  const threadIdMap = new Map(); // internal thread_id -> inbox thread id
  let lastThreadMapAt = 0;

  const config = () => (global.InstaBot.config && global.InstaBot.config.reactUnsend) || {};

  const schedule = (ms) => {
    if (stopped) return;
    timer = setTimeout(tick, ms);
    if (timer.unref) timer.unref();
  };

  // The poller refreshes the inbox every cycle and caches the thread ids; reuse
  // that for the poll list. The internal->inbox id map the realtime path needs
  // is not in that cache, so read the inbox directly (at most once per
  // REFRESH_THREADS_MS) to build it.
  async function refreshThreads() {
    const members = api.api && api.api.inbox && api.api.inbox._members;
    if (members && members.size) {
      threadIDs = [...members.keys()];
      lastThreadsAt = Date.now();
    }
    if (threadIdMap.size && Date.now() - lastThreadMapAt <= REFRESH_THREADS_MS) return;
    try {
      const box = await api.getInbox();
      const threads = (box && box.threads) || [];
      if (!threadIDs.length) threadIDs = threads.map((t) => String(t.id || t.thread_id)).filter(Boolean);
      for (const t of threads) {
        const rt = t.thread_id != null ? String(t.thread_id) : null;
        const inbox = t.id != null ? String(t.id) : (t.thread_fbid != null ? String(t.thread_fbid) : null);
        if (rt && inbox) threadIdMap.set(rt, inbox);
      }
      lastThreadMapAt = Date.now();
    } catch (_) {}
  }

  // Resolve the internal thread id from a realtime patch to the inbox id the
  // detail query needs. Prefer a live inbox snapshot, fall back to the poller's
  // cached members, then to a previously learned mapping.
  async function resolveThreadID(internalID) {
    const key = String(internalID);
    const cached = threadIdMap.get(key);
    if (cached) return cached;
    if (Date.now() - lastThreadMapAt > REFRESH_THREADS_MS) {
      try { await refreshThreads(); } catch (_) {}
      const fresh = threadIdMap.get(key);
      if (fresh) return fresh;
    }
    // The API accepts the internal id for sends but not for the detail read;
    // if it is all we have, use it and let processThread fail soft.
    return key;
  }

  function fbidToIgid(detail) {
    const map = {};
    for (const u of detail?.users || []) {
      if (u.interop_messaging_user_fbid) map[String(u.interop_messaging_user_fbid)] = String(u.id || u.pk);
    }
    const viewer = detail?.viewer;
    if (viewer && viewer.interop_messaging_user_fbid) map[String(viewer.interop_messaging_user_fbid)] = String(detail.viewer_id);
    return map;
  }

  async function processThread(threadID, cfg) {
    const detail = await api.api.thread.fetchDetail(threadID, 20);
    if (!detail) return;
    const nodes = (detail.slide_messages?.edges || []).map((e) => e.node || e);
    const map = fbidToIgid(detail);
    const emojis = new Set((cfg.emojis || []).map(normalizeEmoji));
    const admins = (global.InstaBot.config.adminBot || []).map(String);
    const onlyAdmin = cfg.onlyAdmin !== false;
    const prev = seen.get(threadID) || new Map();
    const self = String(api.getCurrentUserID ? api.getCurrentUserID() : "");
    const liveIds = new Set();

    for (const msg of nodes) {
      const id = String(msg.id);
      liveIds.add(id);
      const cur = new Map();
      const reactorIgid = new Map(); // sender_fbid -> sender_igid (from msg_reactions)
      for (const m of msg.msg_reactions || []) {
        if (m.sender_fbid != null && m.sender_igid != null) reactorIgid.set(String(m.sender_fbid), String(m.sender_igid));
      }
      for (const r of msg.reactions || []) {
        const fbid = String(r.sender_fbid);
        const igid = map[fbid] || reactorIgid.get(fbid) || fbid;
        if (igid === self) continue; // never act on the bot's own reaction
        cur.set(igid, normalizeEmoji(r.reaction));
      }
      const old = prev.get(id);

      // reactUnsend: only on a reaction that is new since the previous tick, and
      // only while the feature is enabled. `old === undefined` is the first time
      // this message is observed — record it as the baseline instead of acting,
      // so reactions that predate startup are never unsent.
      if (old !== undefined && cfg.enable) {
        for (const [igid, emoji] of cur) {
          if (old.get(igid) === emoji) continue; // already acted on
          if (!emojis.has(emoji)) continue;
          if (onlyAdmin && !admins.includes(igid)) continue;
          try {
            const ok = await api.api.unsendMessage(threadID, id);
            logger.info("REACT UNSEND", `${threadID} | ${id} | ${igid} | ${emoji} | ${ok ? "unsent" : "failed"}`);
          } catch (error) {
            logger.error("REACT UNSEND", `${threadID} | ${id} | ${error.message}`);
          }
        }
      }

      // onReaction: a command registered this message id (e.g. cmd.js install
      // waiting for a react-to-confirm). Fire once, when the registered author —
      // or any user when the entry names none — reacts. This deliberately ignores
      // the baseline guard above: a fast reaction can arrive before the first
      // snapshot, and the prompt carries no reactions when the entry is created.
      const registration = global.InstaBot.onReaction.get(id);
      if (registration) {
        const wanted = registration.author != null ? String(registration.author) : null;
        for (const [igid, emoji] of cur) {
          if (wanted && igid !== wanted) continue;
          await dispatchOnReaction(threadID, id, igid, emoji);
          break; // one dispatch per message per tick
        }
      }

      prev.set(id, cur);
    }
    for (const id of [...prev.keys()]) if (!liveIds.has(id)) prev.delete(id);
    seen.set(threadID, prev);
  }

  // Feeds a synthetic `message_reaction` event through the normal handler, so a
  // command's onReaction runs with the same parameters, role gate and error
  // handling it would get on Facebook. The registration is one-shot (as
  // upstream), so it is always removed once dispatched — including on error —
  // otherwise the next tick would fire it again.
  async function dispatchOnReaction(threadID, messageID, reactorID, emoji) {
    const event = {
      type: "message_reaction",
      threadID: String(threadID),
      senderID: String(reactorID),
      userID: String(reactorID),
      author: String(reactorID),
      messageID: String(messageID),
      body: "",
      reaction: emoji,
      timestamp: Date.now()
    };
    try {
      await runHandler(event);
      logger.info("ON REACTION", `${messageID} | ${reactorID} | ${emoji}`);
    } catch (error) {
      logger.error("ON REACTION", `${messageID} | ${error.message}`);
    } finally {
      global.InstaBot.onReaction.delete(messageID);
    }
  }

  // ── realtime fast path ────────────────────────────────────────────────
  // A reaction patch is `/direct_v2/threads/<tid>/items/<iid>/reactions/likes/
  // <reactor>` with op "add"/"remove". Only "add" needs action: reactUnsend
  // reacts to a new matching emoji, and onReaction waits for a reaction to
  // appear. Debounce per thread so a burst of reactions is one detail read.
  function scheduleRealtime(threadID) {
    if (rtStopped || stopped) return;
    const key = String(threadID);
    if (rtDebounce.has(key)) return;
    const t = setTimeout(async () => {
      rtDebounce.delete(key);
      if (stopped || rtStopped) return;
      const cfg = config();
      // Nothing to act on: neither reactUnsend nor a pending onReaction. A new
      // item still matters while reactUnsend is on (it seeds the baseline).
      if (!cfg.enable && global.InstaBot.onReaction.size === 0) return;
      try {
        await processThread(key, cfg);
      } catch (error) {
        logger.warn("REACTION", getText("handlerEvents", "listenError", error.message || error));
      }
    }, rtDebounceMs);
    if (t.unref) t.unref();
    rtDebounce.set(key, t);
  }

  function onRealtimeDirect(event) {
    if (rtStopped || stopped) return;
    // Right after subscribing the broker replays the recent sync window; those
    // patches predate the connection, so skip them and let the poll baseline.
    if (Date.now() - rtSubscribedAt < replayGuardMs) return;
    const path = String((event && event.path) || "");
    // A new item or a reaction both mean "process this thread now". A new item
    // also seeds the reaction baseline, so reactUnsend works on the next tick.
    const isReaction = RT_PATH_RE.test(path);
    const isNewItem = !isReaction && RT_ITEM_RE.test(path) && String((event && event.op) || "add").toLowerCase() === "add";
    if (!isReaction && !isNewItem) return;
    if (isReaction && String((event && event.op) || "add").toLowerCase() !== "add") return;
    const internalThreadID = (event && event.threadID) || (path.match(/^\/direct_v2\/threads\/([^/]+)/) || [])[1];
    if (!internalThreadID) return;
    resolveThreadID(internalThreadID)
      .then((threadID) => scheduleRealtime(threadID))
      .catch(() => {});
  }

  let rtHandlersAttached = false;
  let rtSubscribedAt = 0;

  async function connectRealtime() {
    if (rtStopped || stopped) return;
    if (typeof api.realtimeConnect !== "function") return; // no realtime on this client
    try {
      const client = await api.realtimeConnect();
      rtClient = client;
      if (!rtHandlersAttached) {
        rtHandlersAttached = true;
        client.on("error", (error) => logger.warn("REACTION", `realtime: ${error.message || error}`));
        client.on("disconnected", () => { if (!rtStopped && !stopped) scheduleRealtimeReconnect(); });
        client.on("direct", onRealtimeDirect);
      }
      await api.realtimeSubscribe();
      rtSubscribedAt = Date.now();
      // Warm the internal->inbox thread id map now, so the first reaction is not
      // delayed by a cold inbox read on the critical path.
      refreshThreads().catch(() => {});
      logger.info("REACTION", "realtime reaction push connected");
    } catch (error) {
      logger.warn("REACTION", `realtime unavailable, polling only: ${error.message || error}`);
      scheduleRealtimeReconnect();
    }
  }

  function scheduleRealtimeReconnect() {
    if (rtStopped || rtReconnecting) return;
    rtReconnecting = true;
    if (rtTimer) clearTimeout(rtTimer);
    rtTimer = setTimeout(async () => {
      rtReconnecting = false;
      if (rtStopped || stopped) return;
      try { if (rtClient) rtClient.disconnect(); } catch (_) {}
      rtClient = null;
      await connectRealtime();
    }, RT_RECONNECT_MS);
    if (rtTimer.unref) rtTimer.unref();
  }

  async function tick() {
    if (stopped) return;
    const cfg = config();
    // Poll only when there is something to do: reactUnsend is enabled, or a
    // command is waiting on a reaction (onReaction). Otherwise stay idle.
    const hasPending = global.InstaBot.onReaction.size > 0;
    if (!cfg.enable && !hasPending) {
      backoff = tickMs;
      return schedule(tickMs);
    }
    if (!threadIDs.length || Date.now() - lastThreadsAt > REFRESH_THREADS_MS) {
      await refreshThreads();
    }
    // Warm the internal->inbox thread id map for the realtime fast path.
    if (!threadIdMap.size || Date.now() - lastThreadMapAt > REFRESH_THREADS_MS) {
      try { await refreshThreads(); } catch (_) {}
    }
    if (!threadIDs.length) return schedule(tickMs);

    const threadID = threadIDs[cursor % threadIDs.length];
    cursor += 1;
    try {
      await processThread(threadID, cfg);
      backoff = tickMs;
    } catch (error) {
      // A throttle or transient failure: back off so the watcher does not pile
      // requests on top of the poller's own backoff.
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      logger.warn("REACTION", getText("handlerEvents", "listenError", error.message || error));
    }
    schedule(backoff);
  }

  schedule(tickMs);
  // Realtime push is the fast path; the poll above stays as the fallback.
  connectRealtime();

  return () => {
    stopped = true;
    rtStopped = true;
    if (timer) clearTimeout(timer);
    if (rtTimer) clearTimeout(rtTimer);
    for (const t of rtDebounce.values()) clearTimeout(t);
    rtDebounce.clear();
    try { if (rtClient) rtClient.disconnect(); } catch (_) {}
  };
}

module.exports = startReactionWatcher;

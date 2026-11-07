// Inbound message helpers shared by the listener and the reaction watcher.
//
// A Direct message reaches the bot twice when both paths run: once on the fast
// realtime MQTT push and once on the polling safety net. The two name the same
// message differently —
//
//   poller  node.id  = "mid.$cAH8..."            (the mid)
//   push    item_id  = "3309347832583472221..."  (numeric item id)
//   push    message_id = "mid.$cAH8..."          (the same mid, when present)
//
// — so a naive id check treats the two copies as two messages and the bot replies
// twice. `messageKeys` returns every key a message can be recognised by and
// `Deduper` drops an arrival that matches a recent one.
//
// The canonical implementation ships in @eryxenx/insta-chat (>=2.2.0); the local
// fallbacks below keep the bot working against an older published package.

const pkg = require("@eryxenx/insta-chat");

const packageBridge = pkg.bridge || null;
const packageReconcile = pkg.reconcile || null;

const MID_RE = /^mid\./;
const ITEM_PATH_RE = /^\/direct_v2\/threads\/([^/]+)\/items\/([^/]+)/;

function toMillis(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e14 ? Math.round(n / 1000) : Math.round(n);
}

// Turns a realtime `direct` event into the raw event shape the normalizer and
// handler expect. Uses the package bridge when present so the two paths agree.
function rawFromPush(directEvent, selfId) {
  if (packageBridge && typeof packageBridge.rawEventFromMessageSync === "function") {
    const message = directEvent && directEvent.message ? directEvent.message : directEvent;
    const wrapped = { ...message, thread_id: (directEvent && directEvent.threadID) || message.thread_id };
    return packageBridge.rawEventFromMessageSync(wrapped, selfId);
  }
  const value = (directEvent && directEvent.value) || {};
  const path = String((directEvent && directEvent.path) || "");
  const m = path.match(ITEM_PATH_RE);
  if (!m) return null;
  const threadID = String((directEvent && directEvent.threadID) || m[1]);
  const itemID = String(value.item_id || m[2]);
  const mid = value.message_id != null ? String(value.message_id) : null;
  const senderID = value.user_id != null ? String(value.user_id) : null;
  if (senderID && selfId && senderID === String(selfId)) return null;
  const type = value.item_type != null ? String(value.item_type) : "";
  if (/reaction|action_log|like|video_call/.test(type)) return null;
  return {
    type: "message",
    threadID,
    senderID,
    messageID: mid || itemID,
    itemID,
    mid,
    body: value.text || value.text_body || "",
    attachments: [],
    itemType: "text",
    timestamp: Number(value.timestamp || value.timestamp_ms) || Date.now()
  };
}

function messageKeys(raw = {}) {
  if (packageReconcile && typeof packageReconcile.buildKeys === "function") {
    return packageReconcile.buildKeys(raw);
  }
  const keys = new Set();
  const threadID = raw.threadID != null ? String(raw.threadID) : "";
  const senderID = raw.senderID != null ? String(raw.senderID) : "";
  const mid = raw.mid || (MID_RE.test(String(raw.messageID || "")) ? String(raw.messageID) : null);
  if (mid) keys.add(`mid:${mid}`);
  if (raw.itemID != null) keys.add(`item:${raw.itemID}`);
  const body = raw.body == null ? "" : String(raw.body);
  if (threadID && senderID && body) {
    keys.add(`fp:${threadID}|${senderID}|${body}|${Math.floor(toMillis(raw.timestamp) / 1000)}`);
  }
  return keys;
}

class Deduper {
  constructor(options = {}) {
    if (packageReconcile && typeof packageReconcile.MessageDeduper === "function") {
      this._impl = new packageReconcile.MessageDeduper(options);
    } else {
      this._impl = null;
      this._ttlMs = options.ttlMs || 10 * 60 * 1000;
      this._max = options.max || 5000;
      this._seen = new Map();
    }
  }

  // true when the message is new (and records it), false when it is a duplicate.
  accept(keys) {
    if (this._impl) return this._impl.accept(keys);
    const now = Date.now();
    for (const [key, at] of this._seen) if (now - at > this._ttlMs) this._seen.delete(key);
    while (this._seen.size > this._max) this._seen.delete(this._seen.keys().next().value);
    for (const key of keys) if (this._seen.has(key)) return false;
    for (const key of keys) this._seen.set(key, now);
    return true;
  }

  clear() {
    if (this._impl) return this._impl.clear();
    this._seen.clear();
  }
}

module.exports = { rawFromPush, messageKeys, Deduper, toMillis };

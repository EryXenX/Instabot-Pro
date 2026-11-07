// Bot-side compatibility shim for a DM that contains a URL.
//
// Instagram types a URL-bearing DM as a link preview, not plain text: the
// realtime push carries `item_type: "xma_link"` and the inbox snapshot carries
// `content_type: "MESSAGE_INLINE_SHARE"`. @eryxenx/insta-chat 2.2.3 keeps these
// as text messages; older published versions treated "not text" as "media",
// found no attachment and dropped the message — so `/cmd install x.js <url>`
// and every other URL command produced no reply at all.
//
// The bot must keep working against an older published package (2.2.2 and
// below), so patch the two drop points here. Both wrappers are no-ops on a
// package that already fixes the paths (2.2.3+): the bridge wrapper defers
// whenever the original returns a non-null event, and the poller wrapper adds a
// throwaway attachment only to nodes the original would otherwise drop, then
// strips it from the emitted event.
//
// Drop points patched:
//   • src/realtime/bridge.js  rawEventFromMessageSync — the push path
//   • src/methods/inbox.js    _extractEvents          — the polling safety net
//
// The bridge export is destructured at require time by the package's listener,
// so install() also drops the cached listener module, the same way
// realtimeBridgeCompat does.

"use strict";

const path = require("path");

function log(message) {
  try {
    require("./utils").logger.info("BRIDGE", message);
  } catch (_) {}
}

const ITEM_PATH_RE = /^\/direct_v2\/threads\/([^/]+)\/items\/([^/]+)$/;

// `exports` exposes only ".", so neither package.json nor src/... can be
// required by subpath; the package root is derived from its main entry.
function packageRoot() {
  return path.dirname(require.resolve("@eryxenx/insta-chat"));
}

// The link-preview item a fixed bridge would emit, or null when the message is
// not a text-bearing non-text item (a pure share, a reaction, our own send).
function synthesizeLinkEvent(event, selfId, opts) {
  const message = event && event.message ? event.message : event;
  if (!message || typeof message !== "object") return null;

  const match = String(message.path || "").match(ITEM_PATH_RE);
  if (!match) return null;
  if (message.op && String(message.op).toLowerCase() !== "add") return null;

  const rawType = message.item_type != null ? message.item_type : message.content_type;
  const typeText = typeof rawType === "string" ? rawType.toLowerCase() : String(rawType ?? "");
  if (/reaction|action_log|like|video_call/.test(typeText)) return null;

  const body = message.text || message.text_body || "";
  if (String(body).trim() === "") return null;

  const selfListen = !!(opts && opts.selfListen);
  const senderID = message.user_id != null ? String(message.user_id) : null;
  if (!selfListen && senderID && selfId && senderID === String(selfId)) return null;

  const itemID = String(message.item_id || match[2]);
  const mid = message.message_id != null ? String(message.message_id) : null;
  return {
    type: "message",
    threadID: String(match[1]),
    senderID,
    messageID: mid || itemID,
    itemID,
    mid,
    body,
    attachments: [],
    itemType: "text",
    repliedToItemId: message.replied_to_item_id != null ? String(message.replied_to_item_id) : null,
    repliedToMessage: null,
    clientContext: message.client_context || null,
    offlineThreadingId: message.offline_threading_id != null ? String(message.offline_threading_id) : null,
    timestamp: Number(message.timestamp || message.timestamp_ms) || Date.now()
  };
}

function makePatchedBridge(original, selfListen) {
  return function rawEventFromMessageSync(event, selfId, opts) {
    const out = original(event, selfId, opts);
    if (out) return out;
    // An installed package older than 2.2.2 does not forward opts.selfListen to
    // the bridge, so the flag captured at install() time stands in for it.
    const listenToSelf = !!(opts && opts.selfListen) || selfListen;
    return synthesizeLinkEvent(event, selfId, { selfListen: listenToSelf });
  };
}

// The poller drops a node when `content_type !== "TEXT"` and it produced no
// attachment. Give a text-bearing non-text node a throwaway attachment so the
// original keeps it, then strip the sentinel from the emitted event.
const SENTINEL = { __linkPreview: true, type: "link", url: null };

function makePatchedExtract(original) {
  return async function _extractEvents(threads) {
    const hadOwn = Object.prototype.hasOwnProperty.call(this, "_contentToAttachments");
    const previous = this._contentToAttachments;
    const self = this;
    this._contentToAttachments = function (node) {
      const real = previous.call(this, node);
      if (Array.isArray(real) && real.length) return real;
      if (String(self._contentToText(node) || "").trim() !== "") return [SENTINEL];
      return real;
    };
    try {
      const events = await original.call(this, threads);
      for (const e of events) {
        if (!Array.isArray(e.attachments)) continue;
        const kept = e.attachments.filter((a) => a !== SENTINEL);
        if (kept.length !== e.attachments.length) {
          e.attachments = kept;
          if (String(e.body || "").trim() !== "") e.itemType = "text";
        }
      }
      return events;
    } finally {
      if (hadOwn) this._contentToAttachments = previous;
      else delete this._contentToAttachments;
    }
  };
}

function reloadListener() {
  const suffix = path.join("src", "realtime", "listener.js");
  for (const key of Object.keys(require.cache)) {
    if (key.endsWith(suffix)) delete require.cache[key];
  }
}

function install() {
  let pkg;
  try {
    pkg = require("@eryxenx/insta-chat");
  } catch (_) {
    return false;
  }
  const bridge = pkg.bridge;
  if (!bridge || typeof bridge.rawEventFromMessageSync !== "function") return false;
  if (bridge.__linkPatched) return false;

  // Probe the installed bridge with the exact live shape of a URL DM, purely to
  // report whether the shim was needed. The wrapper is applied regardless and is
  // a no-op when the original already decodes the message.
  const probe = bridge.rawEventFromMessageSync(
    {
      message: {
        path: "/direct_v2/threads/1/items/1",
        op: "add",
        item_id: "1",
        message_id: "mid.linkprobe",
        user_id: 2,
        item_type: "xma_link",
        text: "/cmd install x.js https://example.com/x.js"
      }
    },
    "999"
  );
  const native = !!(probe && String(probe.body || "").trim() !== "");

  const fca = (global.InstaBot && global.InstaBot.config && global.InstaBot.config.optionsFca) || {};
  const wantSelf = fca.selfListen === true;

  bridge.rawEventFromMessageSync = makePatchedBridge(bridge.rawEventFromMessageSync, wantSelf);
  bridge.__linkPatched = true;
  reloadListener();

  let InboxMethods = null;
  try {
    InboxMethods = require(path.join(packageRoot(), "src", "methods", "inbox.js"));
  } catch (_) {}
  if (InboxMethods && !InboxMethods.prototype.__linkPatched) {
    InboxMethods.prototype._extractEvents = makePatchedExtract(InboxMethods.prototype._extractEvents);
    InboxMethods.prototype.__linkPatched = true;
  }

  if (!native) log("applied link-message shim (installed package predates 2.2.3: URL DMs were being dropped)");
  return !native;
}

module.exports = { install, makePatchedBridge, makePatchedExtract, synthesizeLinkEvent, ITEM_PATH_RE };

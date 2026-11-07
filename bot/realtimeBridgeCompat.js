// Bot-side compatibility shim for a swipe-reply that arrives on the realtime
// push.
//
// The push carries a reply's target as a full `replied_to_message` object while
// the inbox poller uses a flat `replied_to_item_id`. @eryxenx/insta-chat 2.2.1
// normalises the object form, but the bot must keep answering immediately even
// when it runs against an older published package (2.2.0 or 2.1.x), so patch
// the bridge here when the installed version drops the linkage.
//
// The listener destructures the bridge's rawEventFromMessageSync at require time
// and the package's index.js eagerly requires the listener, so install() both
// replaces the bridge export and drops the cached listener, letting listen()
// re-require it against the patched function.

"use strict";

const path = require("path");

// Loaded lazily: the test harness requires this module without the bot's global
// state, and ../utils reads global.InstaBot at require time.
function log(message) {
  try {
    require("../utils").logger.info("BRIDGE", message);
  } catch (_) {}
}

const ITEM_PATH_RE = /^\/direct_v2\/threads\/([^/]+)\/items\/([^/]+)$/;

function normalizeReplyFromPush(replied) {
  if (!replied || typeof replied !== "object") return null;
  const itemId = replied.item_id != null ? String(replied.item_id) : null;
  const mid = replied.message_id != null ? String(replied.message_id) : null;
  return {
    repliedToItemId: itemId || mid,
    repliedToMessage: {
      messageID: mid || itemId || "",
      itemID: itemId,
      senderID: replied.user_id != null ? String(replied.user_id) : null,
      senderName: null,
      body: replied.text || replied.text_body || "",
      attachments: [],
      timestamp: Number(replied.timestamp || replied.timestamp_ms) || null
    }
  };
}

// The bridge as shipped, but with the `replied_to_message` object form mapped to
// the same { repliedToItemId, repliedToMessage } pair the poller produces.
//
// It also honours selfListen on a package that predates it: 2.2.0's bridge drops
// the session's own sends unconditionally, and its listener does not forward the
// option, so we carry the flag captured at install() time. Passing a null selfId
// to the original disables only its self filter (selfId is used for nothing
// else), letting a self-sent command through to the handler.
function makePatchedBridge(original, selfListen) {
  return function rawEventFromMessageSync(event, selfId, opts) {
    const listenToSelf = !!(opts && opts.selfListen) || selfListen;
    const message = event && event.message ? event.message : event;
    // Only intervene when the original would drop reply linkage on a real
    // inbound item; otherwise defer to it so behaviour stays identical.
    const match = message && String(message.path || "").match(ITEM_PATH_RE);
    if (!match || !message.replied_to_message || message.replied_to_item_id != null) {
      return original(event, listenToSelf ? null : selfId, opts);
    }
    const out = original(event, listenToSelf ? null : selfId, opts);
    if (!out) return out;
    const reply = normalizeReplyFromPush(message.replied_to_message);
    if (reply) {
      out.repliedToItemId = reply.repliedToItemId;
      out.repliedToMessage = reply.repliedToMessage;
    }
    return out;
  };
}

// The listener destructures rawEventFromMessageSync at require time and the
// package's index.js eagerly requires the listener, so replacing the bridge
// export is not enough — drop the cached listener so listen() re-requires it and
// re-reads the patched function.
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
  if (bridge.__replyPatched) return false;

  const fca = (global.InstaBot && global.InstaBot.config && global.InstaBot.config.optionsFca) || {};
  const wantSelf = fca.selfListen === true;

  // Detect whether the installed package already handles the push object form.
  const probe = bridge.rawEventFromMessageSync(
    {
      message: {
        path: "/direct_v2/threads/1/items/1",
        op: "add",
        item_id: "1",
        message_id: "mid.probe",
        user_id: 2,
        item_type: "text",
        text: "x",
        replied_to_message: { item_id: "9", message_id: "mid.target", user_id: 3, text: "y" }
      }
    },
    "999"
  );
  const replyHandled = !!(probe && probe.repliedToItemId);

  // Detect whether the installed package honours opts.selfListen: a self-sent
  // message (senderID === selfId) must come back non-null when it is requested.
  // 2.2.1 does not know the option and drops the message.
  const selfProbe = bridge.rawEventFromMessageSync(
    {
      message: {
        path: "/direct_v2/threads/1/items/2",
        op: "add",
        item_id: "2",
        message_id: "mid.selfprobe",
        user_id: "999",
        item_type: "text",
        text: "x"
      }
    },
    "999",
    { selfListen: true }
  );
  const selfHandled = !!selfProbe;

  if (replyHandled && (!wantSelf || selfHandled)) return false; // package already covers it

  // An older package drops self messages and does not forward the option to the
  // bridge, so the shim carries the flag itself. Passing a null selfId to the
  // original disables only its self filter (selfId is used for nothing else),
  // letting a self-sent command through to the handler.
  bridge.rawEventFromMessageSync = makePatchedBridge(bridge.rawEventFromMessageSync, wantSelf);
  bridge.__replyPatched = true;
  reloadListener();
  log(
    "applied compatibility shim (installed package predates 2.2.2: " +
      `${replyHandled ? "reply linkage ok" : "reply linkage patched"}, ` +
      `selfListen ${selfHandled ? "native" : "patched"})`
  );
  return true;
}

module.exports = { install, makePatchedBridge };

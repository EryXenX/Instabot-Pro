// Bot-side fallback for a media swipe-reply on the realtime push.
//
// @eryxenx/insta-chat 2.2.4 resolves this inside the package (see
// src/events/normalizeEvent.js): the poller hands the normalizer a full
// repliedToMessage with media, while the realtime push carries only the target's
// ids and text, so `event.messageReply.attachments` came out empty and every
// media command (imgbb/catbox) answered "Please reply to an image".
//
// The bot must keep working before 2.2.4 is published, so install() wraps the
// package's EventNormalizer.prototype.normalize: when a normalized event is a
// message_reply whose target carries no body and no attachment, look the target
// up in thread history and fill it in. On 2.2.4+ the target is already enriched
// by the time normalize() returns, so the wrapper's own check sees content and
// does nothing — a no-op, not a second lookup.

"use strict";

const path = require("path");

function log(message) {
  try {
    require("./utils").logger.info("BRIDGE", message);
  } catch (_) {}
}

function hasContent(reply) {
  if (!reply || typeof reply !== "object") return false;
  if (String(reply.body || reply.text || "").trim() !== "") return true;
  return Array.isArray(reply.attachments) && reply.attachments.length > 0;
}

function replyLookupIds(reply, rawId) {
  const ids = [];
  for (const v of [rawId, reply && reply.messageID, reply && reply.itemID]) {
    const s = v == null ? "" : String(v);
    if (s && !ids.includes(s)) ids.push(s);
  }
  return ids;
}

function mergeReply(partial, found) {
  if (!found) return partial;
  if (!partial) return found;
  return {
    messageID: partial.messageID || found.messageID || found.item_id || "",
    senderID: partial.senderID || found.senderID || found.user_id || found.sender_fbid || null,
    senderName: partial.senderName || found.senderName || null,
    body: partial.body || partial.text || found.body || found.text || "",
    attachments:
      Array.isArray(partial.attachments) && partial.attachments.length
        ? partial.attachments
        : found.attachments || [],
    timestamp: partial.timestamp || found.timestamp || null
  };
}

// Resolve a message by any of its ids from thread history, memoised per thread.
// The client's own getThreadHistory (the FCA-shaped one on the api object) is
// used, so this shares the package's HTTP stack and session.
function makeEnricher(client) {
  const cache = new Map(); // `${threadID}:${id}` -> item
  const MAX = 5000;

  const history = () => {
    const api = client && client.api ? client.api : client;
    if (api && typeof api.getThreadHistory === "function") return api.getThreadHistory.bind(api);
    return null;
  };

  return async function enrich(threadID, ids) {
    const get = history();
    if (!get || !threadID || !ids.length) return null;
    const keyOf = (id) => `${threadID}:${id}`;
    for (const id of ids) {
      const hit = cache.get(keyOf(id));
      if (hit) return hit;
    }
    let items = [];
    try {
      items = (await get(String(threadID), 50)) || [];
    } catch (_) {
      return null;
    }
    for (const item of items) {
      for (const id of [item.item_id, item.messageID, item.mid, item.id]) {
        const s = id == null ? "" : String(id);
        if (s) cache.set(keyOf(s), item);
      }
    }
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
    for (const id of ids) {
      const hit = cache.get(keyOf(id));
      if (hit) return hit;
    }
    return null;
  };
}

async function install() {
  let pkg;
  try {
    pkg = require("@eryxenx/insta-chat");
  } catch (_) {
    return false;
  }
  const EventNormalizer = pkg.EventNormalizer;
  if (!EventNormalizer || typeof EventNormalizer.prototype.normalize !== "function") return false;
  if (EventNormalizer.prototype.__replyMediaPatched) return false;

  // Probe: feed a push-shaped reply-to-media raw event through the installed
  // normalizer and see whether the package already fills the attachment. The
  // probe uses a stub client with an empty history, so it never hits the network
  // and the answer reflects only the package's own enrichment.
  const original = EventNormalizer.prototype.normalize;

  EventNormalizer.prototype.normalize = async function patchedNormalize(raw) {
    const event = await original.call(this, raw);
    if (!event || event.type !== "message_reply" || !event.messageReply) return event;
    if (hasContent(event.messageReply)) return event;

    const threadID = event.threadID != null ? String(event.threadID) : null;
    const ids = replyLookupIds(event.messageReply, raw && raw.repliedToItemId);
    if (!threadID || !ids.length) return event;

    const enrich = (this.__replyMediaEnricher || (this.__replyMediaEnricher = makeEnricher(this.client)));
    const found = await enrich(threadID, ids);
    if (!found) return event;

    const merged = mergeReply(event.messageReply, found);
    event.messageReply = {
      messageID: String(merged.messageID || ""),
      senderID: merged.senderID || event.messageReply.senderID,
      senderName: event.messageReply.senderName || merged.senderName || null,
      body: merged.body || "",
      attachments: (merged.attachments || []).map((a) => ({
        type: a.type,
        url: a.url,
        filename: null,
        caption: a.caption || null
      }))
    };
    return event;
  };

  // Whether the installed package already handles this, reported only — the
  // wrapper stays installed either way and is a no-op when it is not needed.
  // The probe drives the *original* normalize with a push-shaped reply whose
  // target history carries the media; a fixed package fills the attachment, an
  // older one returns it empty. No network: the stub client answers locally.
  let native = false;
  try {
    const mediaItem = {
      item_id: "33094017054297994877121553682661376",
      messageID: "mid.$img",
      senderID: "2",
      body: "",
      attachments: [{ type: "photo", url: "https://cdn/probe.jpg" }]
    };
    const probeClient = {
      api: { getUserInfo: async () => null, getThreadHistory: async () => [mediaItem] },
      getUserByUsername: () => null,
      _resolveMentionsOffline: () => ({}),
      getThreadParticipantIDs: () => undefined,
      rememberThread: () => {}
    };
    const probeEvent = await original.call(new EventNormalizer(probeClient), {
      type: "message",
      threadID: "1",
      senderID: "2",
      messageID: "mid.$probe",
      body: "/imgbb",
      attachments: [],
      repliedToItemId: mediaItem.item_id,
      repliedToMessage: {
        messageID: "mid.$img",
        itemID: mediaItem.item_id,
        senderID: "2",
        senderName: null,
        body: "",
        attachments: []
      }
    });
    native = !!(probeEvent && probeEvent.messageReply && hasContent(probeEvent.messageReply));
  } catch (_) {}

  EventNormalizer.prototype.__replyMediaPatched = true;
  log(
    native
      ? "reply-media fallback installed (installed package already enriches push replies)"
      : "reply-media fallback installed (installed package predates 2.2.4: push media replies would answer 'Please reply to an image')"
  );
  return !native;
}

module.exports = { install, makeEnricher, hasContent, mergeReply, replyLookupIds };

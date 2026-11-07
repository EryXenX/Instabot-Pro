// GoatBot-Pro's whiteListMode / whiteListModeThread gate, ported.
//
// The config blocks (config.json + /whitelist + /setting) existed, but nothing
// ever read them, so enabling "whitelist mode" had no effect: every sender and
// every thread could still drive the bot. This restores the upstream semantics:
//
//   whiteListMode.enable       → only whiteListIds may use the bot
//   whiteListModeThread.enable → only whiteListThreadIds may use the bot
//
// Bot admins (config.adminBot) always bypass, otherwise the owner would lock
// themselves out of their own bot. Both modes on → both must pass.

function toIdSet(list) {
  return new Set(
    (Array.isArray(list) ? list : [])
      .map((id) => String(id).trim())
      .filter(Boolean)
  );
}

// Returns { allowed, reason } where reason is "user" | "thread" | null. Callers
// decide what to do with a denial (the handler drops the event; the notice is
// opt-in via config.whiteListMode.notice / whiteListModeThread.notice).
function checkWhitelist(config, senderID, threadID) {
  const sender = senderID == null ? "" : String(senderID);
  const thread = threadID == null ? "" : String(threadID);

  if (sender && toIdSet(config.adminBot).has(sender)) {
    return { allowed: true, reason: null };
  }

  const user = config.whiteListMode || {};
  if (user.enable === true && !(sender && toIdSet(user.whiteListIds).has(sender))) {
    return { allowed: false, reason: "user" };
  }

  const threadWl = config.whiteListModeThread || {};
  if (threadWl.enable === true && !(thread && toIdSet(threadWl.whiteListThreadIds).has(thread))) {
    return { allowed: false, reason: "thread" };
  }

  return { allowed: true, reason: null };
}

// Thread-only variant for automatic event handlers (welcome, antileave, ...):
// those are not "used" by a sender, so only whiteListModeThread applies. Keeps
// the bot out of non-whitelisted threads without blocking a whitelisted thread
// just because the event's author is not a whitelisted user.
function checkThreadWhitelist(config, threadID) {
  const thread = threadID == null ? "" : String(threadID);
  const threadWl = config.whiteListModeThread || {};
  if (threadWl.enable === true && !(thread && toIdSet(threadWl.whiteListThreadIds).has(thread))) {
    return { allowed: false, reason: "thread" };
  }
  return { allowed: true, reason: null };
}

module.exports = { checkWhitelist, checkThreadWhitelist, toIdSet };

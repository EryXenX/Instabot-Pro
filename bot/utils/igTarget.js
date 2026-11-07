// Resolves the user a profile command should act on, from the same inputs the
// ported GoatBot-Pro commands accept: a replied message, an @mention, a bare
// @handle, an instagram.com profile link, a numeric id, or (when nothing is
// given) the sender themselves.
//
// Instagram only lets a web session look up users it has already seen in a chat
// (usernameinfo / web_profile_info rate-limit with 429), so an @handle is
// resolved from the client's inbox-learned index first. The numeric id is what
// the V2 profile methods take; a handle is passed through only as a last resort.

async function resolveTarget({ api, event, args }) {
  // 1) reply — the replied-to sender is unambiguous
  if (event.type === "message_reply" && event.messageReply?.senderID) {
    return String(event.messageReply.senderID);
  }

  // 2) @mention
  const mentions = event.mentions || {};
  if (Object.keys(mentions).length > 0) {
    return String(Object.keys(mentions)[0]);
  }

  const raw = (args && args[0] ? String(args[0]) : "").trim();

  // 3) instagram.com/<handle> link
  const link = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (link) return resolveHandle(api, link[1]);

  // 4) bare @handle or username (not all-digits)
  if (raw && !/^\d+$/.test(raw.replace(/^@/, ""))) {
    return resolveHandle(api, raw.replace(/^@/, ""));
  }

  // 5) numeric id
  if (raw) return raw;

  // 6) self
  return typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID()) : String(event.senderID);
}

// Returns the numeric id for a handle when the bot has seen it, otherwise the
// handle itself (the V2 resolver can still try it as a username).
function resolveHandle(api, handle) {
  if (typeof api.getUserByUsername === "function") {
    const known = api.getUserByUsername(handle);
    if (known) {
      const id = known.id || known.pk || known.interop_messaging_user_fbid;
      if (id != null) return String(id);
    }
  }
  return handle;
}

module.exports = { resolveTarget, resolveHandle };

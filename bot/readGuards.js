// Null-safe retries for the read APIs that frozen code destructures.
//
// Instagram throttles web reads (HTTP 429). The package's read wrappers catch
// that and resolve `null` instead of throwing, but the frozen GoatBot-Pro
// commands and event handlers read the result straight away:
//
//   const threadInfo_Fca = await api.getThreadInfo(threadID);   // -> null
//   const { userInfo } = threadInfo_Fca;                        // TypeError
//   (await api.getThreadInfo(threadID)).participantIDs          // TypeError
//
// So one throttled read turns into a crash reported in the chat ("An error
// occurred calling ..."), even though the session is fine. Wrap the read methods
// with a short bounded backoff: a transient 429 is retried until it clears, and
// the command answers normally instead of erroring out.

const READ_METHODS = ["getThreadInfo", "getUserInfo", "getUserInfoV2"];
const MAX_ATTEMPTS = 3;
const FIRST_WAIT_MS = 3000;
const MAX_WAIT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wrapRead(api, name) {
  const original = api[name];
  if (typeof original !== "function") return;
  api[name] = async function (...args) {
    // A callback-style call invokes its callback on every attempt, so a retry
    // would fire it more than once. Only the promise style is retried.
    if (args.some((a) => typeof a === "function")) return original.apply(this, args);
    let wait = FIRST_WAIT_MS;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let result;
      try {
        result = await original.apply(this, args);
      } catch (error) {
        // A real failure (bad id, dead session) should surface, not be retried
        // into a timeout — only a null (throttle) result is worth waiting for.
        if (attempt >= MAX_ATTEMPTS) throw error;
        lastError = error;
      }
      if (result !== null && result !== undefined) return result;
      if (attempt >= MAX_ATTEMPTS) {
        if (lastError) throw lastError;
        return result;
      }
      await sleep(wait);
      wait = Math.min(wait * 2, MAX_WAIT_MS);
    }
  };
}

function install(api) {
  for (const name of READ_METHODS) wrapRead(api, name);
  enrichThreadList(api);
  return api;
}

// The package's getThreadList (used by loadData's auto-sync) projects the inbox
// down to { threadID, name, snippet, timestamp, unreadCount } and drops the
// group flag, so `threadInfo.isGroup` is always undefined. Frozen commands that
// gate on groups (notification: "send to all boxes") then filter every thread
// out. Re-attach isGroup from the inbox payload, which carries `is_group`.
function enrichThreadList(api) {
  const original = api.getThreadList;
  if (typeof original !== "function") return;
  api.getThreadList = async function (...args) {
    if (args.some((a) => typeof a === "function")) return original.apply(this, args);
    const list = await original.apply(this, args);
    if (!Array.isArray(list) || !list.length) return list;
    const box = await api.getInbox().catch(() => null);
    const byId = new Map((box && box.threads ? box.threads : []).map((t) => [String(t.id || t.thread_id), t]));
    for (const item of list) {
      const t = byId.get(String(item.threadID));
      if (t) item.isGroup = typeof t.is_group === "boolean" ? t.is_group : (t.users || []).length > 2;
    }
    return list;
  };
}

module.exports = { install, READ_METHODS, enrichThreadList };

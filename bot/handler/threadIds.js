// internal thread_id -> inbox thread id, learned from every inbox snapshot.
//
// The realtime push names a thread by its internal thread_id (a 39-digit number
// like 340282366841710301244259277549563001902); the inbox poll, the thread
// detail read and every frozen command use the inbox id (e.g. 1102531985914926).
// A pushed event must be rewritten to the inbox id before it reaches the
// handler, or a reply would be addressed to the internal id.
//
// The map is learned by wrapping getInbox(), so it fills up from the reads the
// bot already makes; prime() forces one read at startup so the first pushed
// message already resolves.

const map = new Map();
let installed = false;

function learn(box) {
  for (const t of (box && box.threads) || []) {
    const internal = t.thread_id != null ? String(t.thread_id) : null;
    const inbox = t.id != null ? String(t.id) : (t.thread_fbid != null ? String(t.thread_fbid) : null);
    if (internal && inbox) map.set(internal, inbox);
  }
}

function install(api) {
  if (installed || !api || typeof api.getInbox !== "function") return;
  installed = true;
  const original = api.getInbox.bind(api);
  api.getInbox = async (...args) => {
    const box = await original(...args);
    learn(box);
    return box;
  };
}

// Prefer the client's own resolver (it also consults thread introspection); fall
// back to the map learned here. An unknown id is returned unchanged.
function resolve(api, threadID) {
  if (api && typeof api.resolveThreadID === "function") return String(api.resolveThreadID(threadID));
  const key = String(threadID);
  return map.get(key) || key;
}

function prime(api) {
  if (!api || typeof api.getInbox !== "function") return Promise.resolve();
  return Promise.resolve(api.getInbox()).then(learn).catch(() => {});
}

module.exports = { install, learn, resolve, prime };

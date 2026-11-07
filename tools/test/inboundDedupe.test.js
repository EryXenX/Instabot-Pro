// Regression guard for the push + safety-poll hybrid inbound pipeline.
//
// The bot runs realtime push as the primary path and an inbox poll as the safety
// net. Both deliver the same DM under different ids (poller: mid "mid.$...";
// push: numeric item id, plus the same mid when present), so a deduper must drop
// the second copy — otherwise the bot replies twice. This drives the real
// listener with a fake api and asserts: a push event is handled, its poller twin
// is deduped, and a genuinely new message still gets through.
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { pollInterval: 15000, language: "en", timeZone: "Asia/Dhaka" }, userID: "1" };

const handled = [];
const haPath = require.resolve("../../bot/handler/handlerAction");
require.cache[haPath] = {
  id: haPath, filename: haPath, loaded: true,
  exports: () => async (event) => handled.push(event)
};

// Pass raw events through; the dedupe is what this test exercises, not Instagram.
const pkgPath = require.resolve("@eryxenx/insta-chat");
const realPkg = require(pkgPath);
require.cache[pkgPath].exports = {
  ...realPkg,
  EventNormalizer: class { async normalize(raw) { return raw; } }
};

const startListening = require("../../bot/handler/listen");

const MID = "mid.$cAH8uMJUIPpGn5Bqaw2hstVSCODjb";
const ITEM = "33093489992230179623723335478673408";
const THREAD = "1102531985914926";

let pollCallback = null;
const api = {
  config: { pollInterval: 15000, latencyLog: false },
  api: { inbox: { realtimeOptions: { enabled: false } } }, // poll-only: api.listen is the poll
  resolveThreadID: (id) => String(id),
  listen: (callback) => { pollCallback = callback; return () => {}; }
};

startListening(api);

// The push copy: numeric item id, no mid (the broker omits it sometimes), so the
// poller copy must be recognised by the content fingerprint instead.
const pushCopy = {
  type: "message", threadID: THREAD, senderID: "55", messageID: ITEM, itemID: ITEM,
  body: "/help", timestamp: Date.now()
};
// The poller copy of the same message: the mid, same body and second.
const pollCopy = {
  type: "message", threadID: THREAD, senderID: "55", messageID: MID,
  body: "/help", timestamp: Date.now()
};
// A genuinely different message.
const fresh = {
  type: "message", threadID: THREAD, senderID: "55", messageID: "mid.$fresh",
  body: "/pp", timestamp: Date.now() + 5000
};

if (!pollCallback) {
  console.log("\u2716 listener did not arm");
  process.exit(1);
}
pollCallback(null, pushCopy);
pollCallback(null, pollCopy);
pollCallback(null, fresh);

setTimeout(() => {
  const bodies = handled.map((e) => e.body);
  const dupes = bodies.filter((b) => b === "/help").length;
  if (dupes !== 1) {
    console.log(`\u2716 dedupe FAILED \u2014 /help handled ${dupes} times: ${JSON.stringify(bodies)}`);
    process.exit(1);
  }
  if (!bodies.includes("/pp")) {
    console.log(`\u2716 dedupe FAILED \u2014 dropped a fresh message: ${JSON.stringify(bodies)}`);
    process.exit(1);
  }
  console.log("\u2714 inbound dedupe OK \u2014 push and poller copies collapsed to one reply");
  process.exit(0);
}, 1500);

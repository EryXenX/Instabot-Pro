// Regression guard for the "bot answers messages sent before it existed" bug.
//
// When the bot is added to a group, Instagram replays that thread's recent
// history on the first poll (and the realtime stream replays its sync window on
// subscribe). Those messages predate the run, so the bot must ignore them and
// only answer live ones. This asserts a backlog message is dropped while a
// message that arrives after startup is still handled.
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { pollInterval: 10000, language: "en", timeZone: "Asia/Dhaka" }, userID: "1" };

const handled = [];

// Stub the dispatch layer so the test exercises only the listener's guard.
const haPath = require.resolve("../../bot/handler/handlerAction");
require.cache[haPath] = {
  id: haPath,
  filename: haPath,
  loaded: true,
  exports: () => async (event) => handled.push(event)
};

// Pass raw events straight through instead of normalizing against Instagram.
const pkgPath = require.resolve("@eryxenx/insta-chat");
const realPkg = require(pkgPath);
require.cache[pkgPath].exports = {
  ...realPkg,
  EventNormalizer: class {
    async normalize(raw) {
      return raw;
    }
  }
};

const startListening = require("../../bot/handler/listen");

const HOUR_MS = 60 * 60 * 1000;
const backlog = {
  type: "message",
  threadID: "t1",
  senderID: "999",
  messageID: "backlog",
  body: "/help",
  timestamp: Date.now() - HOUR_MS
};
const live = { ...backlog, messageID: "live", timestamp: Date.now() };

startListening({
  listen: (callback) => {
    callback(null, backlog);
    callback(null, live);
    return () => {};
  }
});

setTimeout(() => {
  const ids = handled.map((e) => e.messageID);
  if (ids.includes("backlog")) {
    console.log(`\u2716 backlog guard FAILED \u2014 answered pre-startup messages: ${ids.join(", ")}`);
    process.exit(1);
  }
  if (!ids.includes("live")) {
    console.log(`\u2716 backlog guard FAILED \u2014 dropped a live message: ${ids.join(", ") || "(none)"}`);
    process.exit(1);
  }
  console.log("\u2714 backlog guard OK \u2014 dropped pre-startup message, handled the live one");
  process.exit(0);
}, 2000);

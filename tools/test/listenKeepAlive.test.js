// Regression guard for the "listening then silent exit" bug.
//
// The Instagram poller does not reliably hold the Node event loop open (its poll
// timer may be unref'd, and it pauses during a throttle). Without a keep-alive
// the bot logged "listening" and then exited with code 0 a second later, which
// the supervisor reads as a normal shutdown and never restarts. This asserts the
// listener keeps the process alive even when the poller never calls back.
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { pollInterval: 10000, language: "en", timeZone: "Asia/Dhaka" }, userID: "1" };

const startListening = require("../../bot/handler/listen");

// A poller that returns a cancel function but never invokes its callback.
const silentApi = { listen: () => function cancel() {} };
startListening(silentApi);

const ALIVE_AFTER_MS = 5000;
setTimeout(() => {
  console.log(`\u2714 keep-alive OK \u2014 process still alive after ${ALIVE_AFTER_MS / 1000}s with a silent poller`);
  process.exit(0);
}, ALIVE_AFTER_MS);

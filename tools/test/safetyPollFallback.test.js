// The safety poll is the fallback that keeps a quiet push from deafening the
// bot. It must arm on the package that ships startSafetyPoll(), and on an older
// published package that only has _startPolling() it must still arm rather than
// log "push-only" and leave the push as a single point of failure.
const path = require("path");
const assert = require("assert");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { pollInterval: 10000, language: "en", timeZone: "Asia/Dhaka" }, userID: "1" };

const startListening = require("../../bot/handler/listen");

let calls = 0;
const api = {
  listen: () => function cancel() {},
  api: {
    inbox: {
      realtimeOptions: { enabled: true },
      // No startSafetyPoll — the pre-2.2.0 shape.
      _startPolling: () => { calls += 1; return function cancel() {}; }
    }
  }
};

startListening(api);
setTimeout(() => {
  assert.strictEqual(calls, 1, "safety poll fallback should have armed exactly once");
  console.log("\u2714 safety poll fallback OK \u2014 armed via _startPolling on an older package");
  process.exit(0);
}, 300);

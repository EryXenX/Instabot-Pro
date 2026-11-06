// Regression guard for the realtime re-arm watchdog in bot/handler/listen.js.
//
// With realtime push enabled, the package's listen() does not poll at all, so a
// drop after the subscription was confirmed would leave the bot silent: the
// callback never fires again and the package only re-arms a *pre*-subscribe
// failure. The watchdog tears the dead listener down and re-arms it. This
// asserts that a post-subscribe drop results in a second api.listen() call.
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { pollInterval: 15000, language: "en", timeZone: "Asia/Dhaka" }, userID: "1" };

const startListening = require("../../bot/handler/listen");

let listenCalls = 0;
const api = {
  // Realtime configured but not alive: the watchdog must re-arm.
  api: { inbox: { realtimeOptions: { enabled: true }, _realtimeListener: { connected: false } } },
  listen: (callback) => {
    listenCalls += 1;
    if (listenCalls === 1) {
      // Emulate a push client that subscribed, then dropped. The package does
      // not re-arm this on its own.
      setTimeout(() => callback(new Error("Realtime MQTT connection closed"), null), 20);
    }
    return () => {};
  }
};

startListening(api);

// The first re-arm waits REARM_START_MS (3s).
const WAIT_MS = 3600;
setTimeout(() => {
  const ok = listenCalls >= 2;
  console.log((ok ? "\u2714" : "\u2716") + ` listen re-armed after a realtime drop (listen calls: ${listenCalls})`);
  process.exit(ok ? 0 : 1);
}, WAIT_MS);

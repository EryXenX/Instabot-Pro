// Regression guard for a lost reply: handlerAction invokes the async sub-handlers
// without awaiting them, so a rejection (e.g. a send that hits a 429 while
// Instagram throttles the session) used to escape as a process-level
// unhandledRejection and the reply vanished with only a stack trace. This asserts
// every sub-handler's rejection is caught and routed to the logger instead.
const path = require("path");
const assert = require("assert");

process.chdir(path.join(__dirname, "..", ".."));
global.InstaBot = { config: { prefix: "/" }, userID: "1" };

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

// Stub the event-handler factory with sub-handlers that reject. handlerAction
// destructures all of them and dispatches by event.type.
const hePath = require.resolve("../../bot/handler/handlerEvents");
const rejecting = (name) => async () => { throw new Error(`${name} boom`); };
require.cache[hePath] = {
  id: hePath,
  filename: hePath,
  loaded: true,
  exports: () => async () => ({
    onAnyEvent: rejecting("onAnyEvent"),
    onFirstChat: rejecting("onFirstChat"),
    onChat: rejecting("onChat"),
    onStart: rejecting("onStart"),
    onReply: rejecting("onReply"),
    onEvent: rejecting("onEvent"),
    handlerEvent: rejecting("handlerEvent"),
    onReaction: rejecting("onReaction"),
    typ: rejecting("typ"),
    presence: rejecting("presence"),
    read_receipt: rejecting("read_receipt")
  })
};

// Capture what handlerAction logs.
const logged = [];
const utils = require("../../bot/utils");
utils.logger.error = (tag, msg) => logged.push(`${tag}: ${msg}`);

const handlerAction = require("../../bot/handler/handlerAction");
const dispatch = handlerAction({ sendMessage: async () => ({}) });

(async () => {
  let unhandled = null;
  const onUnhandled = (e) => { unhandled = e; };
  process.on("unhandledRejection", onUnhandled);

  await dispatch({ type: "message", threadID: "t1", senderID: "9", messageID: "m1", body: "/ping" });

  // Give any stray rejection a tick to surface.
  await new Promise((r) => setTimeout(r, 50));
  process.removeListener("unhandledRejection", onUnhandled);

  ok("no unhandled rejection escaped", unhandled === null);
  ok("onStart rejection was logged", logged.some((l) => l.includes("onStart: onStart boom")));
  ok("onChat rejection was logged", logged.some((l) => l.includes("onChat: onChat boom")));
  ok("handlerEvent rejection was logged", logged.some((l) => l.includes("handlerEvent: handlerEvent boom")));

  console.log(`\u2714 ${checks} checks passed \u2014 handler rejections are caught, not unhandled`);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

// Guards whiteListMode / whiteListModeThread enforcement.
//
// The config blocks existed (and /whitelist + /setting wrote them) but nothing
// read them, so "whitelist mode" was a no-op: every sender and every thread
// could still drive the bot. This covers the gate directly and end-to-end
// through handlerEvents, including the admin bypass and the thread-only rule for
// automatic event handlers.
//
//   node tools/test/whitelist.test.js
const path = require("path");
const assert = require("assert");

process.chdir(path.join(__dirname, "..", ".."));

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

const { checkWhitelist, checkThreadWhitelist } = require("../../bot/handler/whitelist");

const ADMIN = "35009311397";
const USER = "68311189434";
const STRANGER = "99999999999";
const THREAD = "1102531985914926";
const OTHER_THREAD = "2202531985914000";

// ── unit: checkWhitelist ──────────────────────────────────────────────────
{
  const base = { adminBot: [ADMIN] };

  // both modes off → everyone allowed
  ok("off/off allows stranger", checkWhitelist(base, STRANGER, OTHER_THREAD).allowed === true);

  // user mode on
  const userOn = { ...base, whiteListMode: { enable: true, whiteListIds: [USER] } };
  ok("user mode allows listed user", checkWhitelist(userOn, USER, THREAD).allowed === true);
  ok("user mode blocks stranger", checkWhitelist(userOn, STRANGER, THREAD).allowed === false);
  ok("user mode blocks with reason=user", checkWhitelist(userOn, STRANGER, THREAD).reason === "user");
  ok("user mode lets admin bypass", checkWhitelist(userOn, ADMIN, THREAD).allowed === true);

  // thread mode on
  const threadOn = { ...base, whiteListModeThread: { enable: true, whiteListThreadIds: [THREAD] } };
  ok("thread mode allows listed thread", checkWhitelist(threadOn, STRANGER, THREAD).allowed === true);
  ok("thread mode blocks other thread", checkWhitelist(threadOn, STRANGER, OTHER_THREAD).allowed === false);
  ok("thread mode blocks with reason=thread", checkWhitelist(threadOn, STRANGER, OTHER_THREAD).reason === "thread");
  ok("thread mode lets admin bypass", checkWhitelist(threadOn, ADMIN, OTHER_THREAD).allowed === true);

  // both on → both must pass
  const both = { adminBot: [ADMIN], whiteListMode: { enable: true, whiteListIds: [USER] }, whiteListModeThread: { enable: true, whiteListThreadIds: [THREAD] } };
  ok("both: listed user in listed thread passes", checkWhitelist(both, USER, THREAD).allowed === true);
  ok("both: listed user in other thread blocked", checkWhitelist(both, USER, OTHER_THREAD).allowed === false);
  ok("both: stranger in listed thread blocked", checkWhitelist(both, STRANGER, THREAD).allowed === false);

  // numeric vs string ids must match (config stores strings, events may not)
  const numeric = { adminBot: [], whiteListMode: { enable: true, whiteListIds: [12345] } };
  ok("numeric whitelist id matches string sender", checkWhitelist(numeric, "12345", THREAD).allowed === true);

  // empty whitelist + enabled → blocks everyone but admins
  const empty = { adminBot: [ADMIN], whiteListMode: { enable: true, whiteListIds: [] } };
  ok("empty whitelist blocks stranger", checkWhitelist(empty, STRANGER, THREAD).allowed === false);
  ok("empty whitelist still lets admin in", checkWhitelist(empty, ADMIN, THREAD).allowed === true);
}

// ── unit: checkThreadWhitelist (events ignore the user list) ──────────────
{
  const cfg = { adminBot: [ADMIN], whiteListMode: { enable: true, whiteListIds: [USER] }, whiteListModeThread: { enable: true, whiteListThreadIds: [THREAD] } };
  ok("event in listed thread passes even for non-listed author", checkThreadWhitelist(cfg, THREAD).allowed === true);
  ok("event in other thread blocked", checkThreadWhitelist(cfg, OTHER_THREAD).allowed === false);
  const threadOff = { whiteListMode: { enable: true, whiteListIds: [USER] } };
  ok("user-only mode does not block events", checkThreadWhitelist(threadOff, OTHER_THREAD).allowed === true);
}

// ── end-to-end: handlerEvents.onStart drops a non-whitelisted sender ──────
async function e2e() {
  const calls = [];
  const replies = [];

  global.InstaBot = {
    config: { prefix: "/", adminBot: [ADMIN], whiteListMode: { enable: true, whiteListIds: [USER] } },
    commands: new Map([["pp", { config: { name: "pp", role: 0, countDown: 0 }, onStart: async () => { calls.push("pp"); } }]]),
    aliases: new Map(),
    onChat: [],
    onEvent: [],
    eventCommands: new Map(),
    onReply: new Map(),
    onReaction: new Map(),
    countDown: {},
    configCommands: {}
  };
  global.db = {
    usersData: { get: async () => null, create: async () => ({ data: {}, settings: {} }) },
    threadsData: { get: async () => null, create: async () => ({ data: {}, settings: {}, adminIDs: [], members: [] }) },
    globalData: {},
    dashBoardData: {}
  };
  global.client = {};

  const handlerEvents = require("../../bot/handler/handlerEvents");
  const handlerAction = require("../../bot/handler/handlerAction");

  const api = {
    markAsRead: async () => {},
    markAsDelivered: async () => {},
    sendMessage: async () => ({})
  };
  const dispatch = handlerAction(api);
  const mkEvent = (senderID) => ({ type: "message", threadID: THREAD, senderID, userID: senderID, messageID: "m" + Math.random(), body: "/pp" });

  // Override message.reply so the notice path is observable and never sends.
  const utilsMessage = require("../../bot/utils/message");

  // whitelisted user runs the command
  await dispatch(mkEvent(USER));
  await new Promise((r) => setTimeout(r, 30));
  ok("whitelisted sender runs /pp", calls.includes("pp"));

  // stranger is dropped
  calls.length = 0;
  await dispatch(mkEvent(STRANGER));
  await new Promise((r) => setTimeout(r, 30));
  ok("non-whitelisted sender is dropped", !calls.includes("pp"));

  // admin bypasses
  calls.length = 0;
  await dispatch(mkEvent(ADMIN));
  await new Promise((r) => setTimeout(r, 30));
  ok("admin bypasses whitelist", calls.includes("pp"));

  // notice path: stranger with notice:true gets one Restricted reply
  global.InstaBot.config.whiteListMode = { enable: true, whiteListIds: [USER], notice: true };
  global.InstaBot.userID = "1"; // sender is not the bot
  const sent = [];
  api.sendMessage = async (text) => { sent.push(text); return {}; };
  calls.length = 0;
  await dispatch(mkEvent(STRANGER));
  await new Promise((r) => setTimeout(r, 30));
  ok("notice:true replies Restricted to stranger", sent.some((t) => String(t).includes("not on the whitelist")));
  ok("notice path does not run the command", !calls.includes("pp"));

  // notice path: the bot must NOT notice its own echoed message (selfListen loop)
  sent.length = 0;
  global.InstaBot.userID = STRANGER; // sender is now the bot itself
  await dispatch(mkEvent(STRANGER));
  await new Promise((r) => setTimeout(r, 30));
  ok("notice is not sent to the bot's own account", sent.length === 0);
  global.InstaBot.userID = "1";

  console.log(`✔ ${checks} checks passed — whitelist mode enforced`);
}

e2e().catch((err) => { console.error(err); process.exit(1); });

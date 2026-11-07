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

  // silent: a blocked stranger gets NO reply at all
  const sent = [];
  api.sendMessage = async (text) => { sent.push(text); return {}; };
  global.InstaBot.userID = "1"; // sender is not the bot
  calls.length = 0;
  await dispatch(mkEvent(STRANGER));
  await new Promise((r) => setTimeout(r, 30));
  ok("blocked sender gets no reply (silent)", sent.length === 0);
  ok("blocked sender does not run the command", !calls.includes("pp"));

  console.log(`✔ ${checks} checks passed — whitelist mode enforced`);
}

// ── the /whitelist command must follow a reloaded config ──────────────────
// /loadconfig reassigns global.GoatBot.config to a fresh object. whitelist.js
// used to capture the config at require time, so after a reload it mutated the
// dead object: the toggle replied "ON", wrote config.json, yet the gate (which
// reads the live global) still saw the old value. Same for /setting, which
// wrote config.json without touching the in-memory object at all.
async function reloadedConfig() {
  const fs = require("fs-extra");
  const os = require("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-cmd-"));
  const cfgPath = path.join(dir, "config.json");
  fs.writeJsonSync(cfgPath, {
    prefix: "/",
    adminBot: ["111"],
    whiteListMode: { enable: false, whiteListIds: [] },
    whiteListModeThread: { enable: false, whiteListThreadIds: [] }
  });

  global.client = { dirConfig: cfgPath };
  global.db = { usersData: { getName: async (id) => String(id) } };
  global.GoatBot = global.InstaBot = { config: fs.readJsonSync(cfgPath) };

  const cmd = require("../../scripts/cmds/whitelist.js");
  const getLang = (key, ...a) => {
    let t = cmd.langs.en[key] || ("MISSING:" + key);
    for (let i = a.length - 1; i >= 0; i--) t = t.replace(new RegExp(`%${i + 1}`, "g"), a[i]);
    return t;
  };
  const run = async (args) => {
    let reply = null;
    await cmd.onStart({ message: { reply: async (t) => { reply = t; return { messageID: "m" }; } }, args, event: { mentions: {}, messageReply: null }, usersData: global.db.usersData, getLang });
    return reply;
  };

  await run(["on"]);
  ok("command turns mode on before reload", global.GoatBot.config.whiteListMode.enable === true);

  // /loadconfig: the global points at a brand-new object
  const reloaded = fs.readJsonSync(cfgPath);
  global.GoatBot.config = global.InstaBot.config = reloaded;

  await run(["add", "222"]);
  ok("add after reload mutates the live config", reloaded.whiteListMode.whiteListIds.includes("222"));
  ok("add after reload reaches the gate", checkWhitelist(reloaded, "222", "9001").allowed === true);

  await run(["off"]);
  ok("off after reload mutates the live config", reloaded.whiteListMode.enable === false);
  ok("off after reload reaches the gate (everyone allowed)", checkWhitelist(reloaded, "999", "9001").allowed === true);

  // status must report BOTH modes, else a thread-only setup shows a bare "OFF"
  reloaded.whiteListModeThread = { enable: true, whiteListThreadIds: ["9001"] };
  const status = await run(["status"]);
  ok("status shows the user mode", /User whitelist: OFF/.test(status));
  ok("status shows the thread mode", /Thread whitelist: ON/.test(status));

  fs.removeSync(dir);
}

reloadedConfig()
  .then(() => e2e())
  .catch((err) => { console.error(err.stack || err.message); process.exit(1); });

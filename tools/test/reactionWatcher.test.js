// Regression guard for the "react to continue" flow (cmd.js install overwrite).
//
// @eryxenx/insta-chat emits no inbound reaction event (the inbox poller drops
// REACTION_LOG items and the realtime bridge drops reaction/action_log/like), so
// `global.GoatBot.onReaction` entries never fired and reacting to the
// overwrite-confirm prompt did nothing. reactionWatcher now reads reaction state
// from the thread-detail query and dispatches a synthetic message_reaction event
// through the real handlerAction. This drives that loop end to end with a fake
// api, asserting the dispatch, the author guard, the one-shot cleanup, and that
// it coexists with reactUnsend.
const path = require("path");
process.chdir(path.join(__dirname, "..", ".."));

const BOT = "11111111111";
const ADMIN = "22485331480";
const OTHER = "99999999999";
const THREAD = "4312096032406629";

let detail = { slide_messages: { edges: [] }, users: [], viewer: { interop_messaging_user_fbid: "fbid-self" }, viewer_id: BOT };
function setMessages(list) {
  detail = {
    slide_messages: { edges: list.map((m) => ({ node: m })) },
    users: [
      { id: ADMIN, interop_messaging_user_fbid: "fbid-admin" },
      { id: OTHER, interop_messaging_user_fbid: "fbid-other" }
    ],
    viewer: { interop_messaging_user_fbid: "fbid-self" },
    viewer_id: BOT
  };
}

const calls = [];
const unsent = [];

const api = {
  getCurrentUserID: () => BOT,
  getInbox: async () => ({ threads: [{ id: THREAD }] }),
  sendMessage: async (form, threadID, cb) => {
    const info = { messageID: "mid.$sent" + Math.random(), threadID: String(threadID) };
    if (typeof cb === "function") cb(null, info);
    return info;
  },
  setMessageReaction: async () => true,
  api: {
    inbox: { _members: new Map([[THREAD, new Set()]]) },
    thread: { fetchDetail: async () => detail },
    unsendMessage: async (tid, id) => { unsent.push([tid, id]); return true; }
  }
};

const fakeCommand = {
  config: { name: "cmd", role: 0, countDown: 0 },
  onReaction: async (params) => {
    calls.push({
      commandName: params.commandName,
      data: params.Reaction && params.Reaction.data,
      reactor: params.event && params.event.userID,
      threadID: params.event && params.event.threadID
    });
  }
};

const threadData = { threadID: THREAD, settings: {}, data: {}, adminIDs: [], members: [], banned: { status: false } };
const userData = { userID: ADMIN, name: "admin", exp: 0, money: 0, banned: { status: false }, settings: {}, data: {} };

global.InstaBot = {
  config: {
    language: "en",
    prefix: "/",
    adminBot: [ADMIN],
    devUsers: [],
    premiumUsers: [],
    hideNotiMessage: {},
    reactUnsend: { enable: false, onlyAdmin: true, emojis: [] }
  },
  userID: BOT,
  api,
  commands: new Map([["cmd", fakeCommand]]),
  aliases: new Map(),
  eventCommands: new Map(),
  onChat: [],
  onFirstChat: [],
  onEvent: [],
  onAnyEvent: [],
  onReply: new Map(),
  onReaction: new Map(),
  countDown: {}
};
global.GoatBot = global.InstaBot;
global.utils = { log: () => {}, loading: () => {}, removeHomeDir: (s) => s };
global.client = {};
global.db = {
  threadsData: { get: async () => threadData, create: async () => threadData },
  usersData: { get: async () => userData, create: async () => userData },
  globalData: {}, dashBoardData: {},
  threadModel: null, userModel: null, dashBoardModel: null, globalModel: null
};

const { EventEmitter } = require("events");
const startReactionWatcher = require("../../bot/handler/reactionWatcher");

// A fake realtime client so the fast path can be driven without a network: the
// watcher calls api.realtimeConnect()/realtimeSubscribe() and listens for
// "direct" patches. It also serves the inbox with the internal->inbox thread
// id mapping the realtime path resolves through.
const rtClient = new EventEmitter();
rtClient.disconnect = () => {};
api.realtimeConnect = async () => rtClient;
api.realtimeSubscribe = async () => ({ seqId: 1, snapshotAtMs: Date.now() });
api.getInbox = async () => ({
  threads: [{ id: THREAD, thread_id: "340282366841710301281155975261028596837" }]
});

const keepAlive = setInterval(() => {}, 1000);
function assert(name, cond) {
  console.log((cond ? "\u2714" : "\u2716") + " " + name);
  if (!cond) process.exitCode = 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stop = startReactionWatcher(api, { tickMs: 150 });
  await sleep(50); // let the first tick run

  // reactUnsend disabled, registered author reacts → onReaction fires once.
  const P1 = "mid.$p1";
  global.InstaBot.onReaction.set(P1, { commandName: "cmd", messageID: P1, type: "install", author: ADMIN, data: { fileName: "pp.js", rawCode: "x" } });
  setMessages([{ id: P1, content_type: "TEXT", reactions: [{ reaction: "\u2764", sender_fbid: "fbid-admin" }], msg_reactions: [{ sender_fbid: "fbid-admin", sender_igid: ADMIN }] }]);
  await sleep(600);
  assert("onReaction dispatched once", calls.length === 1);
  assert("commandName is cmd", calls[0] && calls[0].commandName === "cmd");
  assert("Reaction.data carried (fileName)", calls[0] && calls[0].data && calls[0].data.fileName === "pp.js");
  assert("reactor is the registered author", calls[0] && calls[0].reactor === ADMIN);
  assert("threadID propagated", calls[0] && calls[0].threadID === THREAD);
  assert("registration removed after dispatch (one-shot)", !global.InstaBot.onReaction.has(P1));
  assert("reactUnsend did not run (disabled)", unsent.length === 0);

  // A reaction from someone other than the registered author is ignored.
  const P2 = "mid.$p2";
  global.InstaBot.onReaction.set(P2, { commandName: "cmd", messageID: P2, author: ADMIN });
  setMessages([{ id: P2, content_type: "TEXT", reactions: [{ reaction: "\u2764", sender_fbid: "fbid-other" }], msg_reactions: [{ sender_fbid: "fbid-other", sender_igid: OTHER }] }]);
  await sleep(600);
  assert("non-author reaction ignored", calls.length === 1);
  assert("non-author registration still pending", global.InstaBot.onReaction.has(P2));

  // With reactUnsend enabled both features fire on the author's reaction.
  global.InstaBot.config.reactUnsend = { enable: true, onlyAdmin: true, emojis: ["\u{1F525}"] };
  const P3 = "mid.$p3";
  global.InstaBot.onReaction.set(P3, { commandName: "cmd", messageID: P3, author: ADMIN });
  setMessages([{ id: P3, content_type: "TEXT", reactions: [], msg_reactions: [] }]);
  await sleep(600); // baseline tick (no reaction yet)
  setMessages([{ id: P3, content_type: "TEXT", reactions: [{ reaction: "\u{1F525}", sender_fbid: "fbid-admin" }], msg_reactions: [{ sender_fbid: "fbid-admin", sender_igid: ADMIN }] }]);
  await sleep(600);
  assert("onReaction also fires when reactUnsend is enabled", calls.length === 2 && calls[1].reactor === ADMIN);
  assert("reactUnsend unsent the reacted message", unsent.some(([, id]) => id === P3));

  // ── Phase 4: realtime fast path ─────────────────────────────────────────
  // A reaction patch on the MQTT stream should trigger a dispatch without
  // waiting for the round-robin poll. Stop the poller (huge tick) so only the
  // push can be responsible, and drive the patch through the fake client.
  const stopOld = stop;
  stopOld();
  calls.length = 0;
  global.InstaBot.config.reactUnsend = { enable: false, onlyAdmin: true, emojis: [] };
  const stopRt = startReactionWatcher(api, { tickMs: 600000, replayGuardMs: 0, rtDebounceMs: 20 });
  await sleep(100);

  const P4 = "mid.$p4";
  global.InstaBot.onReaction.set(P4, { commandName: "cmd", messageID: P4, author: ADMIN });
  setMessages([{ id: P4, content_type: "TEXT", reactions: [{ reaction: "\u2764", sender_fbid: "fbid-admin" }], msg_reactions: [{ sender_fbid: "fbid-admin", sender_igid: ADMIN }] }]);
  rtClient.emit("direct", {
    path: "/direct_v2/threads/340282366841710301281155975261028596837/items/123/reactions/likes/" + ADMIN,
    op: "add",
    value: { emoji: "\u2764" },
    threadID: "340282366841710301281155975261028596837"
  });
  await sleep(400);
  assert("realtime push dispatched onReaction", calls.length === 1 && calls[0].reactor === ADMIN);
  assert("realtime dispatch used the resolved inbox threadID", calls[0] && calls[0].threadID === THREAD);

  // A "remove" patch (un-react) must not dispatch.
  const P5 = "mid.$p5";
  global.InstaBot.onReaction.set(P5, { commandName: "cmd", messageID: P5, author: ADMIN });
  rtClient.emit("direct", {
    path: "/direct_v2/threads/340282366841710301281155975261028596837/items/124/reactions/likes/" + ADMIN,
    op: "remove",
    value: { emoji: "\u2764" },
    threadID: "340282366841710301281155975261028596837"
  });
  await sleep(400);
  assert("reaction remove patch ignored", calls.length === 1 && global.InstaBot.onReaction.has(P5));
  stopRt();

  clearInterval(keepAlive);
  console.log(process.exitCode ? "\n\u2716 reactionWatcher test FAILED" : "\n\u2714 reactionWatcher test passed");
  process.exit(process.exitCode || 0);
})();

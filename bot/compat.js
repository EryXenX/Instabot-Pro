// GoatBot-Pro compatibility surface.
//
// The ported GoatBot-Pro command/event files are used verbatim, so they expect
// the upstream globals (`global.GoatBot`, `global.utils`, `global.db`,
// `global.client`, `global.temp`, `global.language`, `global.data`). This module
// installs those globals backed by the InstaBot registry/adapters:
//
//   global.GoatBot === global.InstaBot
//
// with the upstream fields (commands/aliases/on*/countDown/config/...) merged in,
// so `global.GoatBot.config.prefix`, `global.GoatBot.onReply`, etc. resolve.

const fs = require("fs-extra");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// A Map keyed by id that also answers `.has(id)` truthily for arbitrary ids and
// never throws on unknown keys — the upstream collections are read defensively.
function idMap() {
  return new Map();
}

function defaultGoatConfig() {
  return {
    prefix: "/",
    language: "en",
    timeZone: "Asia/Dhaka",
    database: {
      type: "json",
      uriMongodb: "",
      autoSyncWhenStart: false,
      autoRefreshThreadInfoFirstTime: false
    },
    adminBot: [],
    premiumUsers: [],
    devUsers: [],
    adminOnly: { enable: false, ignoreCommand: [] },
    hideNotiMessage: {
      commandNotFound: true,
      adminOnly: true,
      threadBanned: true,
      userBanned: true,
      needRoleToUseCmd: true,
      needRoleToUseCmdOnReply: true,
      needRoleToUseCmdOnReaction: true
    },
    whiteListMode: { enable: false, whiteListIds: [] },
    whiteListModeThread: { enable: false, whiteListThreadIds: [] },
    noPrefix: { enable: true },
    reactUnsend: { enable: false, onlyAdmin: true, emojis: [] },
    enableTypingIndicator: false,
    logEvents: {
      disableAll: true,
      message: false,
      message_reaction: false,
      message_unsend: false,
      message_reply: false,
      event: false,
      read_receipt: false,
      typ: false,
      presence: false
    },
    // customrankcard/rules/setwelcome/setleave reach for drive; with no OAuth
    // credentials these stay disabled and the commands degrade instead of
    // crashing the whole bot at require-time.
    credentials: {
      gmailAccount: {
        email: "",
        clientId: "disabled",
        clientSecret: "disabled",
        refreshToken: "disabled",
        apiKey: ""
      },
      gRecaptcha: { siteKey: "", secretKey: "" }
    }
  };
}

function buildGoatGlobals(registry) {
  const configCommands = fs.existsSync(path.join(ROOT, "configCommands.json"))
    ? fs.readJsonSync(path.join(ROOT, "configCommands.json"))
    : { commandBanned: {}, envGlobal: {}, envCommands: {}, envEvents: {} };

  Object.assign(registry, {
    config: { ...defaultGoatConfig(), ...registry.config },
    configCommands,
    commandFilesPath: [],
    eventCommandsFilesPath: [],
    onFirstChat: [],
    onChat: [],
    onEvent: [],
    onAnyEvent: [],
    onReply: new Map(),
    onReaction: new Map(),
    countDown: {},
    reLoginBot() {},
    Listening: null,
    oldListening: [],
    callbackListenTime: {},
    storage5Message: [],
    fcaApi: null,
    botID: null,
    google: {},
    envCommands: configCommands.envCommands || {},
    envEvents: configCommands.envEvents || {},
    envGlobal: configCommands.envGlobal || {},
    Threads: idMap(),
    Users: idMap()
  });

  global.GoatBot = registry;
  global.InstaBot = registry;

  global.language = {};
  registry.temp = {
    createThreadData: [],
    createUserData: [],
    createThreadDataError: [],
    filesOfGoogleDrive: { arraybuffer: {}, stream: {}, fileNames: {} },
    contentScripts: { cmds: {}, events: {} }
  };
  global.temp = registry.temp;
  global.client = {
    dirConfig: path.join(ROOT, "config.json"),
    dirConfigCommands: path.join(ROOT, "configCommands.json"),
    dirAccount: path.join(ROOT, "account.txt"),
    countDown: registry.countDown,
    cache: {},
    database: {
      creatingThreadData: [],
      creatingUserData: [],
      creatingDashBoardData: [],
      creatingGlobalData: []
    },
    commandBanned: configCommands.commandBanned || {},
    makeRankCard: null,
    busyList: {}
  };
  global.data = {
    threadBanned: new Map(),
    userBanned: new Map()
  };
  // Builds global.db (threadsData/usersData/globalData/dashBoardData plus the
  // all*Data arrays and model placeholders) via the GoatBot-Pro database
  // controller port. See database/controller/index.js.
  require("../database")();

  try {
    global.utils = require("../utils.js");
  } catch (error) {
    // utils.js pulls in googleapis and checks credentials; keep the light
    // InstaBot utils as a fallback so the bot still boots.
    global.utils = require("./utils");
    global.utils._loadError = error;
  }

  // GoatBot-Pro command files call bare `getPrefix(...)`, `removeHomeDir(...)`,
  // `getTime(...)`, `getStreamFromURL(...)`, `findUid(...)` and `log(...)` on
  // the assumption they were destructured from global.utils. Mirror upstream by
  // exposing those helpers as globals too, so the verbatim files resolve them.
  for (const name of [
    "getPrefix",
    "removeHomeDir",
    "getTime",
    "getStreamFromURL",
    "getStreamsFromAttachment",
    "getStreamFromArrayBuffer",
    "findUid",
    "log",
    "loading",
    "createGetText"
  ]) {
    if (typeof global.utils[name] === "function" && typeof global[name] === "undefined") {
      global[name] = global.utils[name].bind(global.utils);
    }
  }

  // Upstream's client object carries getPrefix; scripts/events/checkwarn.js
  // destructures `client` and calls client.getPrefix(threadID) on the ban path.
  if (typeof global.client.getPrefix !== "function" && typeof global.utils.getPrefix === "function") {
    global.client.getPrefix = global.utils.getPrefix.bind(global.utils);
  }

  return registry;
}

module.exports = { buildGoatGlobals, idMap, defaultGoatConfig };

const loginBot = require("./bot/login/login");
const loadData = require("./bot/login/loadData");
const startListening = require("./bot/handler/listen");
const startReactionWatcher = require("./bot/handler/reactionWatcher");
const { initGlobal, loadCommands, loadEvents } = require("./bot/loader");
const { logger, getText } = require("./bot/utils");
const httpRetry = require("./bot/httpRetry");
const graphBridge = require("./bot/graphBridge");
const mediaBridge = require("./bot/mediaBridge");
const ttyCompat = require("./bot/ttyCompat");

// Install before commands require axios so their client shares the interceptor.
httpRetry.install();
// Rewrites frozen Facebook Graph picture URLs (pp.js, ...) to Instagram CDN
// avatars on the shared axios instance.
graphBridge.install();
// Commits a captioned media send's text and attachment together so the caption
// and the image land as one message (IG has no caption field on media sends).
mediaBridge.install();
// The bot runs with stdio redirected, where process.stderr.clearLine is absent;
// cmd.js's install spinner calls it and throws. Provide no-op fallbacks.
ttyCompat.install();

initGlobal(__dirname);

// A command that fires an async call without awaiting it (or without its own
// .catch) turns any rejection into a fatal crash: Node's default is to abort the
// process. Several ported commands do exactly this — translate.js calls
// translateAndSendMessage() un-awaited, and a 429 from translate.googleapis.com
// then kills the whole bot. The supervisor only restarts on exit code 2, so an
// unhandled rejection here means the bot stays down for good. Log and keep the
// process alive instead.
process.on("unhandledRejection", (reason) => {
  logger.error("UNCAUGHT", `Unhandled promise rejection: ${(reason && (reason.stack || reason.message)) || reason}`);
});
process.on("uncaughtException", (error) => {
  logger.error("UNCAUGHT", `Uncaught exception: ${(error && (error.stack || error.message)) || error}`);
});

async function start() {
  logger.master("BOT_STARTED", getText("InstaBot", "starting"));

  const api = await loginBot();
  global.InstaBot.api = api;
  global.InstaBot.userID = api.getCurrentUserID ? api.getCurrentUserID() : null;
  // Upstream commands nod to the fca handle (global.GoatBot.fcaApi) and the bot
  // id (global.GoatBot.botID); both are the login adapter here.
  global.GoatBot.fcaApi = api;
  global.GoatBot.botID = global.InstaBot.userID;

  // GoatBot-Pro prints the big-text banner + brings up the database (and runs
  // the auto-sync) from bot/login/loadData.js *after* login, then loads scripts.
  await loadData(api);

  loadCommands(__dirname);
  loadEvents(__dirname);

  logger.info("BOT", getText("InstaBot", "botIDLogged", global.InstaBot.userID || "unknown"));

  startListening(api);
  startReactionWatcher(api);
  logger.master("BOT_STARTED", getText("InstaBot", "listening"));
}

start().catch(async (error) => {
  if (error && error.code === "IG_SESSION_INVALID") {
    // The API reports every auth failure the same way; probe to name the real
    // cause (rate-limit / challenge / expired / suspended) before logging it.
    let langKey = "sessionInvalid";
    try {
      const diagnoseSession = require("./bot/login/diagnose");
      const result = await diagnoseSession();
      langKey = result.langKey || langKey;
    } catch (_) {}
    logger.error("BOT_STARTED", getText("login", langKey));
    process.exit(1);
  }
  logger.error("BOT_STARTED", getText("InstaBot", "fatal", error.message));
  process.exit(1);
});

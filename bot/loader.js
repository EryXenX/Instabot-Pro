// GoatBot-Pro style script loader. Builds the global.InstaBot registry
// (commands / aliases / eventCommands and the on* hook lists) from
// scripts/cmds and scripts/events. Shared by InstaBot.js and the test probes.

const fs = require("fs-extra");
const path = require("path");
const { logger, getText } = require("./utils");

function initGlobal(rootDir) {
  const registry = {
    config: fs.readJsonSync(path.join(rootDir, "config.json")),
    commands: new Map(),
    aliases: new Map(),
    primaryNames: new Set(),
    eventCommands: new Map(),
    events: new Map(),
    onChat: [],
    onFirstChat: [],
    onEvent: [],
    onAnyEvent: [],
    onReply: new Map(),
    onReaction: new Map(),
    countDown: {},
    api: null,
    userID: null
  };
  global.InstaBot = registry;
  // Install the GoatBot-Pro globals (global.GoatBot === global.InstaBot, plus
  // global.utils/db/client/temp/language/data) so upstream command files run
  // verbatim. See bot/compat.js.
  require("./compat").buildGoatGlobals(registry);
  // Idempotent: rewrite frozen Facebook Graph picture URLs to Instagram avatars
  // on the shared axios instance (also installed by InstaBot.js before login).
  require("./graphBridge").install();
  return global.InstaBot;
}

// GoatBot-Pro calls a script's `onLoad({ api, ...models })` once after login
// (restart.js/update.js use it to announce a completed restart). The port never
// invoked it, so those notices were silently lost.
function callOnLoad(item, kind) {
  if (typeof item.onLoad !== "function") return;
  const db = global.db || {};
  try {
    item.onLoad({
      api: global.InstaBot.api,
      threadModel: db.threadModel,
      userModel: db.userModel,
      dashBoardModel: db.dashBoardModel,
      globalModel: db.globalModel,
      threadsData: db.threadsData,
      usersData: db.usersData,
      dashBoardData: db.dashBoardData,
      globalData: db.globalData,
      config: global.InstaBot.config
    });
  } catch (error) {
    logger.error("LOADED", `onLoad of "${(item.config && item.config.name) || "?"}" (${kind}) failed: ${error.message}`);
  }
}

function loadCommands(rootDir) {
  const cmdPath = path.join(rootDir, "scripts", "cmds");
  fs.ensureDirSync(cmdPath);
  // Some frozen commands (autoseen.js) write a JSON state file under
  // scripts/cmds/cache and assume the dir exists; git can't track empty dirs and
  // the archive drops it, so create it here before a command touches it.
  fs.ensureDirSync(path.join(cmdPath, "cache"));
  // getfbstate.js writes scripts/cmds/tmp/<file> the same way; ensure it too.
  fs.ensureDirSync(path.join(cmdPath, "tmp"));
  // `.eg.js` (example) and `.dev.js` are upstream templates, not live commands.
  const files = fs.readdirSync(cmdPath).filter((f) => f.endsWith(".js") && !f.endsWith(".eg.js") && !f.endsWith(".dev.js"));

  logger.info("LOADED", getText("InstaBot", "loadingFolder", "commands", files.length));

  // Load in two passes so primary names always beat aliases regardless of file
  // order. GoatBot-Pro throws when a name or alias is claimed twice; the ported
  // set has collisions (up.js names "up" but aliases "uptime", and uptime.js
  // does the reverse; say.js/echo.js collide the same way). A single pass would
  // let an earlier alias shadow a later file's primary name, hiding real
  // commands and leaving on* hook lists pointing at a module without the hook.
  const loaded = [];
  const failed = [];
  const primaryNames = global.InstaBot.primaryNames;
  for (const file of files) {
    try {
      const filePath = path.join(cmdPath, file);
      delete require.cache[require.resolve(filePath)];
      const cmd = require(filePath);
      if (!cmd.config || !cmd.config.name) {
        failed.push({ file, message: getText("InstaBot", "skipped", file) });
        continue;
      }
      const commandName = cmd.config.name;
      if (primaryNames.has(commandName)) {
        failed.push({ file, message: `command name "${commandName}" already exists in another file; keeping the first` });
        continue;
      }
      primaryNames.add(commandName);
      global.InstaBot.commands.set(commandName, cmd);
      loaded.push({ cmd, commandName });
    } catch (error) {
      failed.push({ file, message: getText("InstaBot", "failedCommand", file, error.message) });
    }
  }

  for (const { cmd, commandName } of loaded) {
    const { onFirstChat, onChat, onEvent, onAnyEvent } = cmd;
    for (const alias of cmd.config.aliases || []) {
      if (alias === commandName || primaryNames.has(alias)) continue;
      if (global.InstaBot.aliases.has(alias)) continue;
      // GoatBot-Pro keeps aliases only in the `aliases` map, never in
      // `commands`; handler lookups already fall back via `aliases.get`.
      global.InstaBot.aliases.set(alias, commandName);
    }
    if (onChat) global.InstaBot.onChat.push(commandName);
    if (onFirstChat) global.InstaBot.onFirstChat.push({ commandName, threadIDsChattedFirstTime: [] });
    if (onEvent) global.InstaBot.onEvent.push(commandName);
    if (onAnyEvent) global.InstaBot.onAnyEvent.push(commandName);
    callOnLoad(cmd, "command");
    // Collect each file's env* overrides into configCommands, matching what
    // GoatBot-Pro's loadScripts does; the handler then passes them to the command
    // as `envGlobal`/`envCommands`/`envEvents`.
    const cc = global.InstaBot.configCommands;
    Object.assign(cc.envGlobal, cmd.config.envGlobal || {});
    Object.assign(cc.envCommands, cmd.config.envCommands || {});
    Object.assign(cc.envEvents, cmd.config.envEvents || {});
  }

  // GoatBot-Pro prints one line per file on success and a list only on failure.
  // InstaBot matches that: no per-command spam, a single count, and the failed
  // files (if any) printed beneath.
  if (failed.length) {
    logger.error("LOADED", `Failed to load ${failed.length} command(s):`);
    for (const { file, message } of failed) console.log(`   ✖ ${file}: ${message}`);
  }
  logger.info("LOADED", getText("InstaBot", "loadedFolder", "commands", loaded.length, files.length));
  return { ok: loaded.length, total: files.length, failed };
}

function loadEvents(rootDir) {
  const evtPath = path.join(rootDir, "scripts", "events");
  fs.ensureDirSync(evtPath);
  const files = fs.readdirSync(evtPath).filter((f) => f.endsWith(".js") && !f.endsWith(".eg.js") && !f.endsWith(".dev.js"));

  if (files.length) logger.info("LOADED", getText("InstaBot", "loadingFolder", "events", files.length));

  const failed = [];
  let ok = 0;
  for (const file of files) {
    try {
      const filePath = path.join(evtPath, file);
      delete require.cache[require.resolve(filePath)];
      const evt = require(filePath);
      if (!evt.config || !evt.config.name) {
        failed.push({ file, message: getText("InstaBot", "skipped", file) });
        continue;
      }
      global.InstaBot.eventCommands.set(evt.config.name, evt);
      global.InstaBot.events.set(evt.config.name, evt);
      callOnLoad(evt, "event");
      ok++;
    } catch (error) {
      failed.push({ file, message: getText("InstaBot", "failedEvent", file, error.message) });
    }
  }
  if (failed.length) {
    logger.error("LOADED", `Failed to load ${failed.length} event(s):`);
    for (const { file, message } of failed) console.log(`   ✖ ${file}: ${message}`);
  }
  if (files.length) logger.info("LOADED", getText("InstaBot", "loadedFolder", "events", ok, files.length));
  return { ok, total: files.length, failed };
}

module.exports = { initGlobal, loadCommands, loadEvents };

// GoatBot-Pro `bot/handler/handlerEvents.js`, ported for the Instagram adapter.
//
// Upstream exposes one factory that, per incoming event, returns the set of
// sub-handlers (onStart / onChat / onReply / onReaction / onEvent / onAnyEvent
// / onFirstChat / handlerEvent) plus lifecycle stubs; handlerAction then calls
// them in a fixed order based on event.type. We keep that exact shape so
// upstream command files that rely on onChat/onReply/onReaction/onAnyEvent port
// without modification.

const fs = require("fs-extra");
const path = require("path");
const { logger, getText } = require("../utils");
const getTime = require("../utils/getTime");
const createGetText2 = require("./createGetText2");

const nullAndUndefined = [undefined, null];

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

function removeHomeDir(text) {
  return String(text).split(process.cwd()).join(".");
}

// GoatBot-Pro ranks bot admins 2, box admins 1, everyone else 0. IG personal
// DMs have no box admins; utils.getRole additionally knows dev(4)/premium(3).
function getRole(senderID) {
  const config = global.InstaBot.config;
  if (!senderID) return 0;
  if ((config.devUsers || []).includes(String(senderID))) return 4;
  if ((config.premiumUsers || []).includes(String(senderID))) return 3;
  return (config.adminBot || []).includes(String(senderID)) ? 2 : 0;
}

function getRoleConfig(command) {
  let roleConfig;
  if (typeof command.config.role === "number") {
    roleConfig = { onStart: command.config.role };
  } else if (typeof command.config.role === "object" && !Array.isArray(command.config.role)) {
    if (!command.config.role.onStart) command.config.role.onStart = 0;
    roleConfig = command.config.role;
  } else {
    roleConfig = { onStart: 0 };
  }

  for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
    if (roleConfig[key] === undefined) roleConfig[key] = roleConfig.onStart;
  }
  return roleConfig;
}

function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode) {
  const config = global.InstaBot.config;
  const hideNotiMessage = config.hideNotiMessage || {};
  const adminBot = config.adminBot || [];

  if (userData?.banned?.status === true) {
    const { reason, date } = userData.banned;
    if (hideNotiMessage.userBanned === false) {
      message.reply(getText({ lang: langCode, head: "handlerEvents" }, "userBanned", reason, date, senderID));
    }
    return true;
  }

  if (config.adminOnly?.enable === true && !adminBot.includes(String(senderID)) && !(config.adminOnly.ignoreCommand || []).includes(commandName)) {
    if (hideNotiMessage.adminOnly === false) {
      message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot"));
    }
    return true;
  }

  if (isGroup === true) {
    if (threadData?.data?.onlyAdminBox === true && !(threadData.adminIDs || []).includes(senderID) && !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)) {
      if (!threadData.data.hideNotiMessageOnlyAdminBox) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBox"));
      }
      return true;
    }
    if (threadData?.banned?.status === true) {
      const { reason, date } = threadData.banned;
      if (hideNotiMessage.threadBanned === false) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "threadBanned", reason, date, threadID));
      }
      return true;
    }
  }

  return false;
}

module.exports = function (api) {
  return async function (event, message) {
    const config = global.InstaBot.config;
    const GoatBot = global.InstaBot;
    const configCommands = GoatBot.configCommands || {};
    let hideNotiMessage = config.hideNotiMessage || {};

    const { body, messageID, threadID } = event;
    if (!threadID) return;

    const senderID = event.userID || event.senderID || event.author;
    const isGroup = false; // IG personal DMs only — no box admin concept

    const { usersData, threadsData } = global.db;
    let threadData = await threadsData.get(threadID);
    let userData = await usersData.get(senderID);

    // GoatBot-Pro's handlerCheckData creates (and awaits) the thread/user row
    // before dispatching, so commands that read `threadData.members` /
    // `userData.money` never see an absent record. Learn the id here, awaited,
    // and use the created row when the store had none.
    if (!threadData && threadID) threadData = await threadsData.create(threadID).catch(() => null);
    if (!userData && senderID) userData = await usersData.create(senderID).catch(() => null);

    // The ported commands read `threadData.settings` / `userData.banned` without
    // guarding, so give a fresh record the upstream default shape until the
    // store has learned it.
    if (!threadData) threadData = { threadID: String(threadID), settings: {}, data: {}, adminIDs: [], members: [], banned: { status: false } };
    if (!userData) userData = { userID: String(senderID), name: "", exp: 0, money: 0, banned: { status: false }, settings: {}, data: {} };

    if (typeof threadData.settings?.hideNotiMessage === "object") {
      hideNotiMessage = threadData.settings.hideNotiMessage;
    }

    // A real client marks incoming messages as seen/delivered before replying;
    // a bot that never does is an obvious automation signal. Fire-and-forget.
    if (event.type !== "typ" && event.type !== "presence") {
      if (threadID && typeof api.markAsRead === "function") {
        try {
          const autoseenPath = path.join(__dirname, "..", "..", "scripts/cmds/cache/autoseen.json");
          // autoseen.js (frozen) reads this file per message but only creates it
          // on first require; if it goes missing the command throws on every
          // event. Self-heal the dir+default before that read.
          if (!fs.existsSync(autoseenPath)) fs.outputJsonSync(autoseenPath, { status: true }, { spaces: 2 });
          const autoseenOn = (fs.readJsonSync(autoseenPath, { throws: false }) || { status: true }).status !== false;
          if (autoseenOn) api.markAsRead(threadID).catch(() => {});
        } catch (_) {}
      }
      if (threadID && event.messageID && typeof api.markAsDelivered === "function") {
        try {
          Promise.resolve(api.markAsDelivered(threadID, event.messageID)).catch(() => {});
        } catch (_) {}
      }
    }

    const prefix = config.prefix || "/";
    const role = getRole(senderID);
    const parameters = {
      api,
      usersData,
      threadsData,
      globalData: global.db.globalData,
      dashBoardData: global.db.dashBoardData,
      // Model handles are null on the JSON backend, but upstream commands
      // destructure them (eval.js, event.js, json->db migrations), so pass the
      // names through to keep those call sites from crashing.
      threadModel: global.db.threadModel,
      userModel: global.db.userModel,
      dashBoardModel: global.db.dashBoardModel,
      globalModel: global.db.globalModel,
      message,
      event,
      prefix,
      role,
      config,
      // Upstream commands/events destructure `client` (cmd.js writes
      // client.dirConfigCommands, adminonly.js client.dirConfig, checkwarn.js
      // client.getPrefix); pass the global client object through.
      client: global.client,
      // GoatBot-Pro exposes per-command config overrides collected from each
      // file's top-level `envCommands`/`envEvents`/`envGlobal` via
      // configCommands; pass it through so commands like weather (envGlobal
      // .weatherApiKey) and rank (envCommands) resolve `envGlobal`/`envCommands`.
      envGlobal: configCommands.envGlobal || {},
      envCommands: configCommands.envCommands || {},
      envEvents: configCommands.envEvents || {},
      commands: GoatBot.commands,
      removeCommandNameFromBody: function (body_, prefix_, commandName_) {
        if ([body_, prefix_, commandName_].every((x) => nullAndUndefined.includes(x))) {
          throw new Error("Please provide body, prefix and commandName to use this function, this function without parameters only support for onStart");
        }
        for (let i = 0; i < arguments.length; i++) {
          if (typeof arguments[i] !== "string") {
            throw new Error(`The parameter "${i + 1}" must be a string, but got "${getType(arguments[i])}"`);
          }
        }
        return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
      }
    };
    const langCode = threadData.data.lang || config.language || "en";

    function createMessageSyntaxError(commandName) {
      message.SyntaxError = async function () {
        return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "commandSyntaxError", prefix, commandName));
      };
    }

    /* +------------------- WHEN CALL COMMAND -------------------+ */
    let isUserCallCommand = false;
    async function onStart() {
      if (!body) return;

      // ══════════ NO PREFIX SYSTEM ══════════
      const noPrefixEnable = config.noPrefix?.enable === true;
      const isAdminBot = (config.adminBot || []).includes(String(senderID));

      let usedPrefix = prefix;
      let bodyToParse = body;

      if (body.startsWith(prefix)) {
        bodyToParse = body;
        usedPrefix = prefix;
      } else if (noPrefixEnable && isAdminBot) {
        const possibleCmd = body.trim().split(/ +/)[0].toLowerCase();
        const cmdExists = GoatBot.commands.has(possibleCmd) || GoatBot.aliases.has(possibleCmd);
        if (!cmdExists) return;
        usedPrefix = "";
        bodyToParse = body;
      } else {
        return;
      }

      const dateNow = Date.now();
      const args = bodyToParse.slice(usedPrefix.length).trim().split(/ +/);
      let commandName = args.shift().toLowerCase();
      let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

      const aliasesData = threadData.data.aliases || {};
      for (const cmdName in aliasesData) {
        if (aliasesData[cmdName].includes(commandName)) {
          command = GoatBot.commands.get(cmdName);
          break;
        }
      }

      if (command) commandName = command.config.name;

      if (!command) {
        // Bare prefix (e.g. "/") → GoatBot-Pro's "I'm alive" ping.
        if (!hideNotiMessage.commandNotFound && (!commandName || commandName.trim() === "")) {
          return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "prefixOnly", prefix));
        }
        if (!hideNotiMessage.commandNotFound && commandName) {
          const input = commandName.toLowerCase();
          const allCommands = Array.from(GoatBot.commands.keys());
          function levenDist(a, b) {
            const m = a.length;
            const n = b.length;
            const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
            for (let i = 1; i <= m; i++) {
              for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
              }
            }
            return dp[m][n];
          }
          const scored = allCommands.map((cmd) => {
            const c = cmd.toLowerCase();
            const substringBonus = input.includes(c) || c.includes(input) ? -100 : 0;
            return { cmd, score: levenDist(input, c) + substringBonus };
          });
          scored.sort((a, b) => a.score - b.score);
          const bestScore = scored[0].score;
          const top = scored
            .filter((s) => s.score <= bestScore + 1)
            .slice(0, 3)
            .map((s) => `› ${prefix}${s.cmd}`);
          return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "commandNotFoundSuggestion", top.join("\n"), prefix));
        }
        return true;
      }

      // ————————————— CHECK PERMISSION ———————————— //
      const roleConfig = getRoleConfig(command);
      const needRole = roleConfig.onStart;
      if (needRole > role) {
        if (!hideNotiMessage.needRoleToUseCmd) {
          if (needRole === 1) return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
          else return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
        }
        return true;
      }

      // ———————————————— countDown ———————————————— //
      if (!GoatBot.countDown[commandName]) GoatBot.countDown[commandName] = {};
      const timestamps = GoatBot.countDown[commandName];
      let getCoolDown = command.config.countDown;
      if ((!getCoolDown && getCoolDown !== 0) || isNaN(getCoolDown)) getCoolDown = 1;
      const cooldownCommand = getCoolDown * 1000;
      if (timestamps[senderID]) {
        const expirationTime = timestamps[senderID] + cooldownCommand;
        if (dateNow < expirationTime) {
          return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "waitingForCommand", ((expirationTime - dateNow) / 1000).toString().slice(0, 3)));
        }
      }

      // ——————————————— RUN COMMAND ——————————————— //
      const time = getTime("DD/MM/YYYY HH:mm:ss");
      isUserCallCommand = true;
      try {
        createMessageSyntaxError(commandName);
        const getLang = createGetText2(langCode, prefix, command);
        await command.onStart({ ...parameters, args, commandName, getLang });
        timestamps[senderID] = dateNow;
        logger.info("CALL COMMAND", `${commandName} | ${senderID} | ${threadID} | ${args.join(" ")}`);
      } catch (err) {
        logger.error("CALL COMMAND", `An error occurred when calling "${commandName}": ${err.message}`);
        return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
      }
    }

    /* +----------------------- ON CHAT -----------------------+ */
    async function onChat() {
      const allOnChat = GoatBot.onChat || [];
      const args = body ? body.split(/ +/) : [];
      for (const key of allOnChat) {
        const command = GoatBot.commands.get(key);
        if (!command) continue;
        const commandName = command.config.name;

        if (getRoleConfig(command).onChat > role) continue;

        const getLang = createGetText2(langCode, prefix, command);
        const time = getTime("DD/MM/YYYY HH:mm:ss");
        createMessageSyntaxError(commandName);

        if (typeof command.onChat !== "function") {
          if (!GoatBot._onChatBrokenLogged) GoatBot._onChatBrokenLogged = new Set();
          if (!GoatBot._onChatBrokenLogged.has(commandName)) {
            GoatBot._onChatBrokenLogged.add(commandName);
            logger.error("ON CHAT", `"${commandName}" registered onChat but exports no onChat function — skipping`);
          }
          continue;
        }

        command
          .onChat({ ...parameters, isUserCallCommand, args, commandName, getLang })
          .then(async (handler) => {
            if (typeof handler === "function") {
              if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;
              try {
                await handler();
                logger.info("ON CHAT", `${commandName} | ${senderID} | ${threadID}`);
              } catch (err) {
                await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
              }
            }
          })
          .catch((err) => logger.error("ON CHAT", `An error occurred calling "${commandName}": ${err.message}`));
      }
    }

    /* +--------------------- ON ANY EVENT ---------------------+ */
    async function onAnyEvent() {
      const allOnAnyEvent = GoatBot.onAnyEvent || [];
      let args = [];
      if (typeof event.body === "string" && event.body.startsWith(prefix)) args = event.body.split(/ +/);

      for (const key of allOnAnyEvent) {
        if (typeof key !== "string") continue;
        const command = GoatBot.commands.get(key);
        if (!command) continue;
        const commandName = command.config.name;
        const time = getTime("DD/MM/YYYY HH:mm:ss");
        createMessageSyntaxError(commandName);

        const getLang = createGetText2(langCode, prefix, command);
        command
          .onAnyEvent({ ...parameters, args, commandName, getLang })
          .then(async (handler) => {
            if (typeof handler === "function") {
              try {
                await handler();
                logger.info("ON ANY EVENT", `${commandName} | ${senderID} | ${threadID}`);
              } catch (err) {
                message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred7", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
                logger.error("ON ANY EVENT", `An error occurred calling "${commandName}": ${err.message}`);
              }
            }
          })
          .catch((err) => logger.error("ON ANY EVENT", `An error occurred calling "${commandName}": ${err.message}`));
      }
    }

    /* +--------------------- ON FIRST CHAT --------------------+ */
    async function onFirstChat() {
      const allOnFirstChat = GoatBot.onFirstChat || [];
      const args = body ? body.split(/ +/) : [];

      for (const itemOnFirstChat of allOnFirstChat) {
        const { commandName, threadIDsChattedFirstTime } = itemOnFirstChat;
        if (threadIDsChattedFirstTime.includes(threadID)) continue;
        const command = GoatBot.commands.get(commandName);
        if (!command) continue;

        itemOnFirstChat.threadIDsChattedFirstTime.push(threadID);
        const getLang = createGetText2(langCode, prefix, command);
        const time = getTime("DD/MM/YYYY HH:mm:ss");
        createMessageSyntaxError(commandName);

        command
          .onFirstChat({ ...parameters, isUserCallCommand, args, commandName, getLang })
          .then(async (handler) => {
            if (typeof handler === "function") {
              if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;
              try {
                await handler();
                logger.info("ON FIRST CHAT", `${commandName} | ${senderID} | ${threadID}`);
              } catch (err) {
                await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
              }
            }
          })
          .catch((err) => logger.error("ON FIRST CHAT", `An error occurred calling "${commandName}": ${err.message}`));
      }
    }

    /* +----------------------- ON REPLY ----------------------+ */
    async function onReply() {
      if (!event.messageReply) return;
      const Reply = GoatBot.onReply.get(event.messageReply.messageID);
      if (!Reply) return;
      Reply.delete = () => GoatBot.onReply.delete(messageID);
      const commandName = Reply.commandName;
      if (!commandName) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
        return logger.error("ON REPLY", "Can't find command name to execute this reply!");
      }
      const command = GoatBot.commands.get(commandName);
      if (!command) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
        return logger.error("ON REPLY", `Command "${commandName}" not found`);
      }

      const needRole = getRoleConfig(command).onReply;
      if (needRole > role) {
        if (!hideNotiMessage.needRoleToUseCmdOnReply) {
          if (needRole === 1) return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReply", commandName));
          else return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReply", commandName));
        }
        return true;
      }

      const getLang = createGetText2(langCode, prefix, command);
      const time = getTime("DD/MM/YYYY HH:mm:ss");
      try {
        const args = body ? body.split(/ +/) : [];
        createMessageSyntaxError(commandName);
        if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;
        await command.onReply({ ...parameters, Reply, args, commandName, getLang });
        logger.info("ON REPLY", `${commandName} | ${senderID} | ${threadID}`);
      } catch (err) {
        logger.error("ON REPLY", `An error occurred calling "${commandName}": ${err.message}`);
        await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred3", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
      }
    }

    /* +---------------------- ON REACTION --------------------+ */
    async function onReaction() {
      const Reaction = GoatBot.onReaction.get(messageID);
      if (!Reaction) return;
      Reaction.delete = () => GoatBot.onReaction.delete(messageID);
      const commandName = Reaction.commandName;
      if (!commandName) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
        return logger.error("ON REACTION", "Can't find command name to execute this reaction!");
      }
      const command = GoatBot.commands.get(commandName);
      if (!command) {
        message.reply(getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
        return logger.error("ON REACTION", `Command "${commandName}" not found`);
      }

      const needRole = getRoleConfig(command).onReaction;
      if (needRole > role) {
        if (!hideNotiMessage.needRoleToUseCmdOnReaction) {
          if (needRole === 1) return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReaction", commandName));
          else return await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReaction", commandName));
        }
        return true;
      }

      const time = getTime("DD/MM/YYYY HH:mm:ss");
      try {
        const getLang = createGetText2(langCode, prefix, command);
        createMessageSyntaxError(commandName);
        if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;
        await command.onReaction({ ...parameters, Reaction, args: [], commandName, getLang });
        logger.info("ON REACTION", `${commandName} | ${senderID} | ${threadID} | ${event.reaction}`);
      } catch (err) {
        logger.error("ON REACTION", `An error occurred calling "${commandName}": ${err.message}`);
        await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred4", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
      }
    }

    /* +-------------------- EVENT COMMAND --------------------+ */
    async function handlerEvent() {
      const { author } = event;
      for (const [key] of GoatBot.eventCommands.entries()) {
        const getEvent = GoatBot.eventCommands.get(key);
        if (!getEvent) continue;
        const commandName = getEvent.config.name;
        const getLang = createGetText2(langCode, prefix, getEvent);
        const time = getTime("DD/MM/YYYY HH:mm:ss");
        try {
          const handler = await getEvent.onStart({ ...parameters, commandName, getLang });
          if (typeof handler === "function") {
            await handler();
            logger.info("EVENT COMMAND", `${commandName} | ${author} | ${senderID} | ${threadID}`);
          }
        } catch (err) {
          logger.error("EVENT COMMAND", `An error occurred calling "${commandName}": ${err.message}`);
          await message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred5", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
        }
      }
    }

    /* +----------------------- ON EVENT ----------------------+ */
    async function onEvent() {
      const allOnEvent = GoatBot.onEvent || [];
      const { author } = event;
      for (const key of allOnEvent) {
        if (typeof key !== "string") continue;
        const command = GoatBot.commands.get(key);
        if (!command) continue;
        const commandName = command.config.name;
        const time = getTime("DD/MM/YYYY HH:mm:ss");
        createMessageSyntaxError(commandName);

        const getLang = createGetText2(langCode, prefix, command);
        command
          .onEvent({ ...parameters, args: [], commandName, getLang })
          .then(async (handler) => {
            if (typeof handler === "function") {
              try {
                await handler();
                logger.info("ON EVENT", `${commandName} | ${author} | ${senderID} | ${threadID}`);
              } catch (err) {
                message.reply(getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred6", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
                logger.error("ON EVENT", `An error occurred calling "${commandName}": ${err.message}`);
              }
            }
          })
          .catch((err) => logger.error("ON EVENT", `An error occurred calling "${commandName}": ${err.message}`));
      }
    }

    async function presence() {}
    async function read_receipt() {}
    async function typ() {}

    return { onAnyEvent, onFirstChat, onChat, onStart, onReaction, onReply, onEvent, handlerEvent, presence, read_receipt, typ };
  };
};

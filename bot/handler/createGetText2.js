// GoatBot-Pro's createGetText2, split out so both handlerCommand.js and
// handlerEvents.js can use it without a circular require.
//
// getLang(key, ...args) resolves text from command.langs[langCode] first, then
// languages/cmds/<langCode>.js, expands {pn}/{p}/{n} shortcuts, substitutes
// %1..%n, and finally falls back to the upstream "Can't find text" notice.

const fs = require("fs-extra");
const path = require("path");
const { getText } = require("../utils");

function createGetText2(langCode, prefix, command) {
  const commandType = command.config.countDown ? "command" : "command event";
  const commandName = command.config.name;
  const customFile = path.join(__dirname, "..", "..", "languages", "cmds", `${langCode}.js`);
  let customLang = {};
  try {
    if (fs.existsSync(customFile)) customLang = require(customFile)[commandName]?.text || {};
  } catch (_) {}

  return function getText2(key, ...args) {
    let text = command.langs?.[langCode]?.[key] || customLang[key] || "";
    text = getText.replaceShortcutInLang(text, prefix, commandName);
    for (let i = args.length - 1; i >= 0; i--) {
      text = text.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
    }
    return text || `❌ Can't find text on language "${langCode}" for ${commandType} "${commandName}" with key "${key}"`;
  };
}

module.exports = createGetText2;

// Language loader in the GoatBot-Pro style.
//
// A `.lang` file holds one `head.key=value` per line (blank lines and lines
// starting with # or // are ignored). `getText(head, key, ...args)` looks the
// text up in the active language (global.InstaBot.config.language) and replaces
// %1, %2 ... with the given args. Passing an object as `head`
// ({ lang, head }) reads a specific language file instead of the active one,
// which is what per-command and per-event text uses.
const fs = require("fs-extra");
const path = require("path");

const DIR = __dirname;

function activeLangCode() {
  return global.InstaBot?.config?.language || "en";
}

function readLangFile(code) {
  let file = path.join(DIR, `${code}.lang`);
  if (!fs.existsSync(file)) {
    file = path.join(DIR, "en.lang");
  }
  const lines = fs
    .readFileSync(file, "utf-8")
    .split(/\r?\n|\r/)
    .filter((line) => line && !line.trim().startsWith("#") && !line.trim().startsWith("//"));
  return convertLangObj(lines);
}

function convertLangObj(lines) {
  const obj = {};
  for (const line of lines) {
    const sep = line.indexOf("=");
    if (sep === -1) continue;
    const itemKey = line.slice(0, sep).trim();
    const itemValue = line.slice(sep + 1).trim();
    const head = itemKey.slice(0, itemKey.indexOf("."));
    const key = itemKey.replace(head + ".", "");
    const value = itemValue.replace(/\\n/gi, "\n");
    if (!obj[head]) obj[head] = {};
    obj[head][key] = value;
  }
  return obj;
}

// {p} -> prefix, {n} -> command name, {pn} -> prefix + name
function replaceShortcutInLang(text, prefix, commandName) {
  return String(text)
    .replace(/\{(?:p|prefix)\}/g, prefix || "")
    .replace(/\{(?:n|name)\}/g, commandName || "")
    .replace(/\{pn\}/g, `${prefix || ""}${commandName || ""}`);
}

function getText(head, key, ...args) {
  let langObj;
  if (typeof head === "object") {
    const code = head.lang || activeLangCode();
    langObj = readLangFile(code);
    head = head.head;
  } else {
    langObj = readLangFile(activeLangCode());
  }

  if (!langObj[head] || !Object.prototype.hasOwnProperty.call(langObj[head], key)) {
    return `Can't find text: "${head}.${key}"`;
  }

  let text = langObj[head][key];
  for (let i = args.length - 1; i >= 0; i--) {
    text = text.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
  }
  return text;
}

getText.readLangFile = readLangFile;
getText.convertLangObj = convertLangObj;
getText.replaceShortcutInLang = replaceShortcutInLang;

module.exports = getText;

// GoatBot-Pro style logger, ported for InstaBot.
//
// Same look as upstream logger/log.js: a dim timestamp, a colored level badge,
// a fixed-width tag and a dim separator, then the message:
//
//   19:20:33 [ INFO ] LOADED    │ Loaded command: help
//
// Tag-aware helpers keep the console readable: use a short uppercase tag as the
// first argument ("LOADED", "LOGIN FACEBOOK", "BOT_STARTED", "CALL COMMAND", ...).
// `log(type, message)` (the legacy InstaBot signature) is still understood so the
// handler can keep calling it while we migrate call sites.

const moment = require("moment-timezone");

const HARD_TZ = "Asia/Dhaka";
function timeZone() {
  try {
    return global.InstaBot?.config?.timeZone || require("../../config.json").timeZone || HARD_TZ;
  } catch (_) {
    return HARD_TZ;
  }
}

const esc = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const dim = (s) => esc("90", s);
const bold = (s) => esc("1", s);
const TAG_WIDTH = 16;

// White text on a colored background so a scan of the log finds the level fast.
const badge = (label, bg) => `\x1b[1;97;${bg}m ${label.padEnd(5)} \x1b[0m`;
const BADGES = {
  info: badge("INFO", 44),
  success: badge("OK", 42),
  warn: badge("WARN", 43),
  error: badge("ERROR", 41),
  master: badge("BOT", 45)
};

const now = () => dim(moment().tz(timeZone()).format("HH:mm:ss"));

function print(kind, tagColor, tag, message, extra) {
  const head = `${now()} ${BADGES[kind]} ${esc(tagColor, bold(String(tag).padEnd(TAG_WIDTH)))}${dim("│")}`;
  console.log(head, message);
  for (let item of extra) {
    if (typeof item === "object" && item && !item.stack) item = JSON.stringify(item, null, 2);
    console.log(head, item);
  }
}

function make(kind, color, defaultTag) {
  return function (tag, message, ...extra) {
    if (message === undefined) {
      message = tag;
      tag = defaultTag;
    }
    print(kind, color, tag, message, extra);
  };
}

const info = make("info", "96", "INFO");
const warn = make("warn", "93", "WARN");
const error = make("error", "91", "ERROR");
const success = make("success", "92", "SUCCESS");
const master = make("master", "95", "MASTER");

// Legacy `log("info", "message")` entry point — maps the lowercase type to the
// matching level. Unknown types fall back to a plain informational line.
function log(type, message, ...extra) {
  const fn = { info, warn, error, success, succes: success, master }[String(type).toLowerCase()] || info;
  return fn(message, ...extra);
}

module.exports = {
  err: error,
  error,
  warn,
  info,
  success,
  succes: success,
  master,
  log
};

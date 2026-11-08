// Bot-side fallback for an array attachment on sendMessage.
//
// @eryxenx/insta-chat 2.2.5 resolves this inside the package
// (src/api/messaging/sendMessage.js): `attachment` / `attachments` is flattened
// into a list and one media message is committed per entry. Before 2.2.5 the
// send path read `attachment || attachments[0]` and handed that raw value to
// `_sendAttachment`, so a ported GoatBot-Pro command that passes an array
// (pinterest's page of pins, backupdata's exports, appstore, poli, ...) threw
// "Unsupported attachment".
//
// The bot must keep working before 2.2.5 is published, so install() wraps the
// live client's sendMessage: when the form carries more than one attachment it
// sends them one at a time through the original send, with the body on the first
// so the caption renders above the images. On 2.2.5+ the package has already
// flattened the list, so the wrapper sees a single attachment and delegates —
// a no-op, not a second send.

"use strict";

const fs = require("fs");
const path = require("path");

function log(message) {
  try {
    require("./utils").logger.info("BRIDGE", message);
  } catch (_) {}
}

// Flattens `form.attachment` and `form.attachments` into a list, dropping
// null/undefined entries and one level of nesting.
function attachmentList(form) {
  if (!form || typeof form !== "object") return [];
  const list = [];
  const add = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) add(entry);
      return;
    }
    list.push(value);
  };
  add(form.attachment);
  add(form.attachments);
  return list;
}

// The installed package version, read from its package.json. `exports` exposes
// only ".", so the root is derived from the resolved main entry.
function installedVersion() {
  try {
    const root = path.dirname(require.resolve("@eryxenx/insta-chat"));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return pkg.version || null;
  } catch (_) {
    return null;
  }
}

function atLeast(version, major, minor, patch) {
  const parts = String(version || "").split(".").map((n) => parseInt(n, 10) || 0);
  const [maj = 0, min = 0, pat = 0] = parts;
  if (maj !== major) return maj > major;
  if (min !== minor) return min > minor;
  return pat >= patch;
}

function install(api) {
  if (!api || typeof api.sendMessage !== "function") return false;
  if (api.__attachmentArrayPatched) return false;

  const version = installedVersion();
  if (version && atLeast(version, 2, 2, 5)) {
    api.__attachmentArrayPatched = true;
    log(`attachment-array fallback skipped (installed package ${version} handles arrays natively)`);
    return false;
  }

  wrapSendMessage(api);
  api.__attachmentArrayPatched = true;
  log(
    version
      ? `attachment-array fallback installed (installed package ${version} predates 2.2.5: array sends would throw "Unsupported attachment")`
      : "attachment-array fallback installed (installed package predates 2.2.5)"
  );
  return true;
}

// Wraps api.sendMessage so a form carrying more than one attachment is sent one
// message per entry. Exposed so the fallback can be exercised without depending
// on the installed package's version.
function wrapSendMessage(api) {
  const original = api.sendMessage.bind(api);

  api.sendMessage = async function (form, threadID, callback, replyToMessage) {
    const list = attachmentList(form);
    if (list.length <= 1) return original(form, threadID, callback, replyToMessage);

    const base = typeof form === "object" && form ? form : { body: form };
    let info = null;
    for (let i = 0; i < list.length; i++) {
      const one = Object.assign({}, base, { attachment: list[i] });
      delete one.attachments;
      if (i > 0) one.body = "";
      // The callback reports the last message, matching a single send's shape.
      info = await original(one, threadID, i === list.length - 1 ? callback : undefined, replyToMessage);
    }
    return info;
  };

  return api;
}

module.exports = { install, wrapSendMessage, attachmentList, atLeast, installedVersion };


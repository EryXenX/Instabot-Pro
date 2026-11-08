// Verifies bot/attachmentArrayCompat.js sends one media message per entry when a
// command passes `attachment: [..]` to an installed @eryxenx/insta-chat that
// predates 2.2.5 (where the array reached _attachmentToBuffer and threw
// "Unsupported attachment"). No network.
//   node tools/test/attachmentArrayCompat.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const compat = require(path.join(__dirname, "..", "..", "bot", "attachmentArrayCompat.js"));

let checks = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  checks += 1;
};

// A stub client whose sendMessage records each call. It mimics the pre-2.2.5
// behaviour: a single attachment is accepted, an array throws.
function makeApi() {
  const calls = [];
  const api = {
    async sendMessage(form, threadID, callback, replyToMessage) {
      calls.push({ form, threadID, replyToMessage });
      if (form && typeof form === "object" && Array.isArray(form.attachment)) {
        throw new Error("Unsupported attachment");
      }
      const info = { messageID: "mid." + calls.length, threadID: String(threadID) };
      if (typeof callback === "function") callback(null, info);
      return info;
    }
  };
  return { api, calls };
}

(async () => {
  // --- an array is split into one send per entry, body on the first ---------
  {
    const { api, calls } = makeApi();
    compat.wrapSendMessage(api);
    const info = await api.sendMessage({ body: "cat", attachment: ["s1", "s2", "s3"] }, "t1");
    ok(calls.length === 3, "one send per entry");
    ok(calls[0].form.attachment === "s1", "first entry sent alone");
    ok(calls[1].form.attachment === "s2" && calls[2].form.attachment === "s3", "later entries sent alone");
    ok(calls[0].form.body === "cat", "body on the first entry");
    ok(calls[1].form.body === "" && calls[2].form.body === "", "no body on later entries");
    ok(calls[0].threadID === "t1", "thread id forwarded");
    ok(info.messageID === "mid.3", "returns the last message");
  }

  // --- a single attachment passes straight through -------------------------
  {
    const { api, calls } = makeApi();
    compat.wrapSendMessage(api);
    await api.sendMessage({ body: "hi", attachment: "only" }, "t2");
    ok(calls.length === 1, "single attachment sends once");
    ok(calls[0].form.attachment === "only", "single attachment unchanged");
    ok(calls[0].form.body === "hi", "single attachment keeps its body");
  }

  // --- a text-only send passes straight through ----------------------------
  {
    const { api, calls } = makeApi();
    compat.wrapSendMessage(api);
    await api.sendMessage("plain", "t3");
    ok(calls.length === 1 && calls[0].form === "plain", "text-only untouched");
  }

  // --- the callback fires once, with the last message ----------------------
  {
    const { api } = makeApi();
    compat.wrapSendMessage(api);
    let cbCount = 0;
    let cbInfo = null;
    await api.sendMessage({ attachment: ["a", "b"] }, "t4", (err, info) => {
      cbCount += 1;
      cbInfo = info;
    });
    ok(cbCount === 1, "callback fires once");
    ok(cbInfo && cbInfo.messageID === "mid.2", "callback reports the last message");
  }

  // --- plural `attachments` is honoured; nested arrays flatten -------------
  {
    const { api, calls } = makeApi();
    compat.wrapSendMessage(api);
    await api.sendMessage({ attachments: [["a", "b"], null, "c"] }, "t5");
    ok(calls.length === 3, "nested array flattened, null dropped");
    ok(calls.map((c) => c.form.attachment).join(",") === "a,b,c", "entries in order");
    ok(calls.every((c) => c.form.attachments === undefined), "plural field removed on each send");
  }

  // --- replyToMessage is forwarded to every entry --------------------------
  {
    const { api, calls } = makeApi();
    compat.wrapSendMessage(api);
    await api.sendMessage({ attachment: ["a", "b"] }, "t6", undefined, "mid.target");
    ok(calls.every((c) => c.replyToMessage === "mid.target"), "reply target forwarded to every entry");
  }

  // --- attachmentList is the shared flattener ------------------------------
  {
    ok(compat.attachmentList({ attachment: "x" }).join() === "x", "list: single");
    ok(compat.attachmentList({ attachment: ["x", "y"] }).join() === "x,y", "list: array");
    ok(compat.attachmentList({}).length === 0, "list: empty");
    ok(compat.attachmentList(null).length === 0, "list: null form");
  }

  // --- version gate --------------------------------------------------------
  {
    ok(compat.atLeast("2.2.5", 2, 2, 5) === true, "2.2.5 is at least 2.2.5");
    ok(compat.atLeast("2.2.4", 2, 2, 5) === false, "2.2.4 is below 2.2.5");
    ok(compat.atLeast("2.3.0", 2, 2, 5) === true, "2.3.0 is above 2.2.5");
    ok(compat.atLeast("3.0.0", 2, 2, 5) === true, "3.0.0 is above 2.2.5");
  }

  console.log("attachmentArrayCompat: " + checks + " checks passed");
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});

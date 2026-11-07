// Guards the `/uid` command: it must reply with just the numeric Instagram id,
// threaded as a reply to the invoking message, without any live user lookup.
//
// The old implementation built a "name / profile link / id" card and called
// api.getUserInfo() first — a live REST round-trip that added seconds to a
// command that only needs the id already carried on the event. This drives the
// real command through the real message facade and asserts:
//   - reply body is exactly the id (digits only, no name, no link, no emoji)
//   - the reply is threaded to the invoking message (event.messageID)
//   - api.getUserInfo is never called
//   - reply target: replied sender / mention key / plain sender
//
//   node tools/test/uidCommand.test.js
const assert = require("assert");
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));

const uid = require("../../scripts/cmds/uid.js");
const createFuncMessage = require("../../bot/utils/message");

const SELF = "35009311397";
const OTHER = "59605953590";
const MENTIONED = "68311189434";
const THREAD = "4312096032406629";

let checks = 0;
const ok = (cond, label) => { assert.ok(cond, "FAILED: " + label); checks++; };

// Records every send and deliberately throws if a live lookup is attempted.
function fakeApi() {
  const sent = [];
  return {
    sent,
    sendMessage: async (form, threadID, callback, replyToMessage) => {
      sent.push({ form, threadID, replyToMessage });
      return { messageID: "reply." + sent.length, threadID };
    },
    getUserInfo: async () => {
      throw new Error("uid.js must not call api.getUserInfo()");
    },
    getUserByUsername: () => {
      throw new Error("uid.js must not call api.getUserByUsername()");
    }
  };
}

async function run(event) {
  const api = fakeApi();
  const message = createFuncMessage(api, event);
  await uid.onStart({ api, message, event });
  return api.sent;
}

(async () => {
  // ── reply target: a message_reply uses the replied sender ──────────────
  {
    const sent = await run({
      type: "message_reply",
      senderID: SELF,
      threadID: THREAD,
      messageID: "mid.orig1",
      messageReply: { senderID: OTHER, messageID: "mid.target1" }
    });
    ok(sent.length === 1, "reply: exactly one message sent");
    ok(sent[0].form === OTHER, `reply: body is the bare id (got ${JSON.stringify(sent[0].form)})`);
    ok(!/\s|👤|🔗|🆔|instagram\.com/.test(String(sent[0].form)), "reply: no name/link/emoji");
    ok(sent[0].replyToMessage === "mid.orig1", "reply: threaded to the invoking message");
    ok(sent[0].threadID === THREAD, "reply: sent to the invoking thread");
  }

  // ── mention target ─────────────────────────────────────────────────────
  {
    const sent = await run({
      type: "message",
      senderID: SELF,
      threadID: THREAD,
      messageID: "mid.orig2",
      mentions: { [MENTIONED]: "someone" }
    });
    ok(sent[0].form === MENTIONED, "mention: body is the mentioned id");
  }

  // ── plain sender target ────────────────────────────────────────────────
  {
    const sent = await run({
      type: "message",
      senderID: SELF,
      threadID: THREAD,
      messageID: "mid.orig3"
    });
    ok(sent[0].form === SELF, "plain: body is the sender id");
    ok(sent[0].replyToMessage === "mid.orig3", "plain: threaded to the invoking message");
  }

  // ── unresolvable target degrades gracefully, still no lookup ────────────
  {
    const sent = await run({
      type: "message",
      senderID: "",
      threadID: THREAD,
      messageID: "mid.orig4"
    });
    ok(sent.length === 1, "empty: still replies once");
    ok(typeof sent[0].form === "string" && sent[0].form.length > 0, "empty: reply has a body");
    ok(!/👤|🔗|🆔/.test(sent[0].form), "empty: no card format");
  }

  console.log(`✔ ${checks} checks passed — /uid replies with the bare id, no live lookup`);
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});

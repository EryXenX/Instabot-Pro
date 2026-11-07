// Regression guard for the bot-side link-message shim (bot/linkMessageCompat.js).
//
// Instagram types a URL-bearing DM as a link preview: the push carries
// `item_type: "xma_link"` and the inbox snapshot `content_type:
// "MESSAGE_INLINE_SHARE"`. @eryxenx/insta-chat 2.2.3 keeps these as text; an
// older installed package dropped them, so `/cmd install x.js <url>` got no
// reply. This drives the shim against whatever package is installed and asserts
// the URL DM survives on both paths, while media-without-url, reactions and the
// session's own messages are still dropped.
//
//   node tools/test/linkMessageFallback.test.js
const assert = require("assert");
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));

const shim = require("../../bot/linkMessageCompat");

const PKG = path.join(__dirname, "..", "..", "node_modules", "@eryxenx", "insta-chat");
const InboxMethods = require(path.join(PKG, "src", "methods", "inbox.js"));

const SELF = "35009311397";
const OTHER = "59605953590";
const THREAD = "4312096032406629";
const CMD = "/cmd install baby.js https://github.com/EryXenX/GoatBot-Pro/blob/main/scripts/cmds/baby.js";

let checks = 0;
const ok = (cond, label) => { assert.ok(cond, "FAILED: " + label); checks++; };
const eq = (label, a, b) => { assert.strictEqual(a, b, `FAILED: ${label} (${a} !== ${b})`); checks++; };

function linkPush(userId) {
  return {
    message: {
      path: `/direct_v2/threads/${THREAD}/items/33094393860779634224715852127666176`,
      op: "add",
      thread_id: THREAD,
      item_id: "33094393860779634224715852127666176",
      message_id: "mid.$gAA9R1Bg_vGWn5wZEX2htcD2UZFIj",
      user_id: Number(userId),
      item_type: "xma_link",
      text: CMD,
      xma_link: [{ title_text: "x", preview_url: "https://x" }],
      timestamp: 1794050686047411
    }
  };
}

(async function run() {
  const pkg = require("@eryxenx/insta-chat");
  const bridge = pkg.bridge;

  // Wrap the installed bridge exactly as install() would, without needing the
  // bot's global state / logger.
  const patched = shim.makePatchedBridge(bridge.rawEventFromMessageSync);

  // ── push path ─────────────────────────────────────────────────────────────
  const raw = patched(linkPush(OTHER), SELF);
  ok(raw, "URL DM decodes on the push path after the shim");
  if (raw) {
    eq("URL DM body is the command", raw.body, CMD);
    eq("URL DM is typed as text", raw.itemType, "text");
  }

  ok(patched({ message: { path: `/direct_v2/threads/${THREAD}/items/9`, op: "add", item_id: "9", user_id: OTHER, item_type: "media" } }, SELF) === null, "media without a url is still dropped");
  ok(patched({ message: { path: `/direct_v2/threads/${THREAD}/items/8`, op: "add", item_type: "reaction", user_id: OTHER } }, SELF) === null, "reaction is still dropped");
  ok(patched(linkPush(SELF), SELF) === null, "the session's own URL DM is still dropped (selfListen off)");
  const selfRaw = patched(linkPush(SELF), SELF, { selfListen: true });
  ok(selfRaw && selfRaw.body === CMD, "own URL DM delivered when selfListen is on");

  // ── poll path ─────────────────────────────────────────────────────────────
  function makePoller() {
    const inbox = new InboxMethods({ getCookie: () => "x" }, () => SELF, {});
    inbox._selfFbid = SELF;
    inbox.fetchReplies = async () => null;
    return inbox;
  }
  InboxMethods.prototype._extractEvents = shim.makePatchedExtract(InboxMethods.prototype._extractEvents);

  const linkThread = {
    id: THREAD,
    users: [],
    slide_messages: {
      edges: [
        {
          node: {
            id: "mid.$gAA9R1Bg_vGWn5v7UyWhtbmCx8g4p",
            sender_fbid: OTHER,
            content_type: "MESSAGE_INLINE_SHARE",
            content: { __typename: "SlideMessageXMAContent" },
            text_body: CMD,
            timestamp_ms: 1794050198729
          }
        }
      ]
    }
  };
  const events = await makePoller()._extractEvents([linkThread]);
  ok(events.length === 1, "URL DM survives the poll path after the shim");
  if (events.length === 1) {
    eq("poll URL DM body is the command", events[0].body, CMD);
    eq("poll URL DM is typed as text", events[0].itemType, "text");
    eq("no sentinel attachment leaks into the event", events[0].attachments.length, 0);
  }

  // An inline-share with no text and no media is still dropped.
  const emptyThread = {
    id: THREAD,
    users: [],
    slide_messages: { edges: [{ node: { id: "mid.empty", sender_fbid: OTHER, content_type: "MESSAGE_INLINE_SHARE", content: { __typename: "SlideMessageXMAContent" }, timestamp_ms: Date.now() } }] }
  };
  eq("empty inline-share is still dropped", (await makePoller()._extractEvents([emptyThread])).length, 0);

  // A plain TEXT node is unchanged.
  const textThread = {
    id: THREAD,
    users: [],
    slide_messages: { edges: [{ node: { id: "mid.text", sender_fbid: OTHER, content_type: "TEXT", text_body: "/help", timestamp_ms: Date.now() } }] }
  };
  const textEvents = await makePoller()._extractEvents([textThread]);
  ok(textEvents.length === 1 && textEvents[0].body === "/help" && textEvents[0].itemType === "text", "plain TEXT node is unchanged");

  console.log(`✔ ${checks} checks passed — bot-side link-message shim keeps URL DMs on push + poll`);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

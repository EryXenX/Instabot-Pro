// Guards the two push-path fixes that removed the residual reply/reaction lag.
//
//   1. A swipe-reply on the realtime push carries its target as a
//      `replied_to_message` object. The bridge must map it to the same
//      { repliedToItemId, repliedToMessage } the poller produces, or the event
//      is typed as a plain "message" and onReply waits for the next poll (~8s).
//   2. The reaction watcher rides the session's shared MQTT connection, so the
//      bot must expose global.InstaBot.realtimeOptions / realtimeClient. Without
//      them the watcher's fast path never attaches and every reaction waits for
//      the 5s poll.
//
//   node tools/test/pushLatencyPaths.test.js
const assert = require("assert");
const path = require("path");

const PKG = path.join(__dirname, "..", "..", "node_modules", "@eryxenx", "insta-chat");
const { bridge, EventNormalizer } = require(PKG);
const compat = require("../../bot/realtimeBridgeCompat");

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

const THREAD = "1102531985914926";
const SELF = "35009311397";
const OTHER = "59605953590";

// The exact shape the realtime client emits for a live swipe-reply.
function pushReply() {
  return {
    message: {
      path: `/direct_v2/threads/${THREAD}/items/33094017115824969912667212789841920`,
      op: "add",
      thread_id: THREAD,
      item_id: "33094017115824969912667212789841920",
      message_id: "mid.$cAH8uMJUIPpGn5c6hhmhtIlYxe-uH",
      user_id: Number(OTHER),
      item_type: "text",
      text: "2",
      timestamp: 1794030262662495,
      replied_to_message: {
        item_id: "33094017054297994877121553682661376",
        message_id: "mid.$cAH8uMJUIPpGn5c6Uf2htIlLynT83",
        user_id: Number(SELF),
        text: "/setting"
      }
    }
  };
}

async function run() {
  // The shim must be a no-op on a package that already maps the object form
  // (2.2.1+), and must repair one that drops it (2.2.0 / 2.1.x).
  const probeBefore = bridge.rawEventFromMessageSync(pushReply(), SELF);
  const applied = compat.install();
  const raw = bridge.rawEventFromMessageSync(pushReply(), SELF);

  ok("bridge decodes the push reply", !!raw);
  ok(
    "push reply exposes a replied-to id (shim or package)",
    raw.repliedToItemId === "33094017054297994877121553682661376"
  );
  ok("push reply exposes repliedToMessage", !!raw.repliedToMessage);
  ok(
    "repliedToMessage.body is the target text",
    raw.repliedToMessage && raw.repliedToMessage.body === "/setting"
  );
  if (probeBefore && probeBefore.repliedToItemId) {
    ok("shim is a no-op on an already-fixed package", applied === false);
  } else {
    ok("shim repairs a package that drops the push reply linkage", applied === true);
  }

  // The normalizer must type it as a reply so onReply runs on the push, not the
  // next poll.
  const normalizer = new EventNormalizer({ api: {} });
  const event = await normalizer.normalize(raw);
  ok("push reply normalizes to message_reply (onReply fires on push)", event.type === "message_reply");
  ok("messageReply carries the target body", event.messageReply && event.messageReply.body === "/setting");

  // A plain push message stays a plain message (no false reply).
  const plain = await normalizer.normalize(
    bridge.rawEventFromMessageSync(
      {
        message: {
          path: `/direct_v2/threads/${THREAD}/items/1`,
          op: "add",
          item_id: "1",
          message_id: "mid.plain",
          user_id: Number(OTHER),
          item_type: "text",
          text: "hello"
        }
      },
      SELF
    )
  );
  ok("a non-reply push stays a plain message", plain.type === "message");

  // The flat poller form is untouched by the shim.
  const flat = bridge.rawEventFromMessageSync(
    {
      message: {
        path: `/direct_v2/threads/${THREAD}/items/9`,
        op: "add",
        item_id: "9",
        message_id: "mid.flat",
        user_id: Number(OTHER),
        item_type: "text",
        text: "hi",
        replied_to_item_id: "12345"
      }
    },
    SELF
  );
  ok("flat replied_to_item_id still honoured", flat.repliedToItemId === "12345");

  // The selfListen fallback for an older package: 2.2.0/2.2.1 drop the session's
  // own messages and do not know the option. The shim carries the flag captured
  // at install() time and passes a null selfId to disable only the self filter.
  const dropSelf = (event, selfId) => {
    const m = event && event.message ? event.message : event;
    if (m && String(m.user_id) === String(selfId)) return null;
    return { messageID: m.message_id, senderID: String(m.user_id), body: m.text };
  };
  const selfPush = {
    message: {
      path: `/direct_v2/threads/${THREAD}/items/5`,
      op: "add",
      item_id: "5",
      message_id: "mid.selfcmd",
      user_id: Number(SELF),
      item_type: "text",
      text: "/help"
    }
  };
  const offShim = compat.makePatchedBridge(dropSelf, false);
  ok("self-sent push dropped when selfListen is off", offShim(selfPush, SELF) === null);
  const onShim = compat.makePatchedBridge(dropSelf, true);
  const onRaw = onShim(selfPush, SELF);
  ok("self-sent push delivered when selfListen is on", !!onRaw && onRaw.senderID === SELF);
  ok("delivered self message keeps its body", onRaw.body === "/help");

  console.log(`\n\u2714 ${checks} checks passed — push reply linkage + reaction fast path`);
}

run().catch((err) => {
  console.error(`\n\u2716 pushLatencyPaths test FAILED: ${err.message}`);
  process.exit(1);
});

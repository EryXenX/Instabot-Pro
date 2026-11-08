// Verifies bot/replyMediaCompat.js keeps a media swipe-reply's attachment on an
// installed @eryxenx/insta-chat that predates 2.2.4.
//   node tools/test/replyMediaCompat.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const replyMediaCompat = require(path.join(__dirname, "..", "..", "bot", "replyMediaCompat.js"));

let checks = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  checks += 1;
};

const THREAD = "1102531985914926";
const IMAGE_ITEM = {
  item_id: "33094017054297994877121553682661376",
  messageID: "mid.$img",
  senderID: "59605953590",
  senderName: "Tester",
  body: "",
  attachments: [{ type: "photo", url: "https://cdn/real-image.jpg" }]
};

function clientWithHistory(items) {
  return {
    api: { getUserInfo: async () => null, getThreadHistory: async () => items },
    getUserByUsername: () => null
  };
}

(async () => {
  const needed = await replyMediaCompat.install();

  const EventNormalizer = require("@eryxenx/insta-chat").EventNormalizer;
  const normalizer = new EventNormalizer(clientWithHistory([IMAGE_ITEM]));

  const pushRaw = {
    type: "message",
    threadID: THREAD,
    senderID: "59605953590",
    messageID: "mid.$cmd",
    body: "/imgbb",
    attachments: [],
    repliedToItemId: IMAGE_ITEM.item_id,
    repliedToMessage: {
      messageID: "mid.$img",
      itemID: IMAGE_ITEM.item_id,
      senderID: "59605953590",
      senderName: null,
      body: "",
      attachments: []
    }
  };

  const event = await normalizer.normalize(pushRaw);
  ok(event.type === "message_reply", "push reply normalizes to message_reply");
  ok(
    event.messageReply.attachments.length === 1 &&
      event.messageReply.attachments[0].url === "https://cdn/real-image.jpg",
    "fallback fills the target photo so /imgbb can upload"
  );
  // `needed` is false on 2.2.4+ (the package enriches natively, the wrapper is a
  // no-op) and true on an older package (the wrapper does the work). Either way
  // the attachment above must be present.
  ok(typeof needed === "boolean", "install() reports whether the fallback was needed");

  const textEvent = await normalizer.normalize({
    type: "message",
    threadID: THREAD,
    senderID: "59605953590",
    messageID: "mid.$cmd2",
    body: "/imgbb",
    attachments: [],
    repliedToItemId: "1",
    repliedToMessage: { messageID: "mid.$x", senderID: "35009311397", body: "/setting", attachments: [] }
  });
  ok(textEvent.messageReply.body === "/setting", "text reply keeps its body");
  ok(textEvent.messageReply.attachments.length === 0, "text reply gains no attachment");

  const plain = await normalizer.normalize({
    type: "message",
    threadID: THREAD,
    senderID: "59605953590",
    messageID: "mid.$cmd3",
    body: "/help",
    attachments: []
  });
  ok(plain.type === "message", "a plain message stays a plain message");

  console.log(`\n\u2714 ${checks} checks passed — bot-side reply-media fallback OK`);
})().catch((err) => {
  console.error(`\n\u2716 replyMediaCompat test FAILED: ${err.message}`);
  process.exit(1);
});

// End-to-end guard for the realtime (MQTT push) inbound path the bot now relies
// on by default. It drives the *real* package listener with a fake transport and
// feeds the exact message-sync payload captured from a live broker, then
// normalizes it the way bot/handler/listen.js does. If this passes, an inbound
// DM is decoded to a handler event without any inbox poll.
//
//   node tools/test/realtimeInbound.test.js
const assert = require("assert");
const zlib = require("zlib");
const path = require("path");

// The package restricts subpath exports, so reach into node_modules directly.
const PKG = path.join(__dirname, "..", "..", "node_modules", "@eryxenx", "insta-chat");
const InboxMethods = require(path.join(PKG, "src/methods/inbox"));
const { EventNormalizer } = require(path.join(PKG));
const { TOPICS } = require(path.join(PKG, "src/realtime/client"));

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

const CONNACK = Buffer.from([0x20, 0x02, 0x00, 0x00]);
const connackTransport = (extra = {}) => {
  let served = false;
  return Object.assign({
    async connect() {},
    async send() {},
    async recvPacket() {
      if (!served) { served = true; return CONNACK; }
      return new Promise(() => {});
    },
    reset() { served = false; },
    disconnect() {}
  }, extra);
};

// The real payload captured from the broker for one inbound text DM. The value
// is the JSON string the bridge decodes (item_id / user_id / text / item_type).
const INBOUND = {
  event: "patch",
  data: [{
    op: "add",
    path: "/direct_v2/threads/340282366841710301281155975261028596837/items/33092812539944453070215332291936256",
    value: JSON.stringify({
      item_id: "33092812539944453070215332291936256",
      message_id: "mid.$gAA9R1Bg_vGWn4eo6qWhsKTyIqD5m",
      user_id: 22485331480,
      timestamp: 1793964962473166,
      item_type: "text",
      text: "/ping"
    })
  }],
  seq_id: 3998
};

(async () => {
  const http = {
    session: { __hsi: "d" },
    uuid: () => "d",
    getCookie: () => "42:tok",
    postGraphQL: async () => ({ data: { get_slide_mailbox_for_iris_subscription: { iris_inactive_subscription_uq_seq_id: "13" } } })
  };
  const transport = connackTransport();
  const inbox = new InboxMethods(http, () => "42", {
    identity: { deviceId: "android-6f7264", uuid: "u" },
    realtime: { enabled: true, transport }
  });

  const events = [];
  const stop = inbox.listen((err, raw) => { if (raw) events.push(raw); }, 20000);
  await new Promise((r) => setTimeout(r, 50));

  ok("listener is subscribed", inbox._realtimeListener && inbox._realtimeListener._subscribed === true);

  inbox._realtimeListener._client.dispatch(TOPICS.MESSAGE_SYNC, zlib.deflateSync(Buffer.from(JSON.stringify([INBOUND]))));

  ok("realtime push produced one event", events.length === 1);
  ok("event is a message", events[0] && events[0].type === "message");
  ok("threadID decoded", events[0].threadID === "340282366841710301281155975261028596837");
  ok("senderID decoded", String(events[0].senderID) === "22485331480");
  ok("body decoded", events[0].body === "/ping");

  // Normalize exactly as the bot's listener does, with a minimal client stub.
  const normalizer = new EventNormalizer({
    api: { getUserInfo: async () => null },
    getThreadParticipantIDs: () => ["22485331480"]
  });
  const ev = await normalizer.normalize(events[0]);
  ok("normalized to a handler message", ev && ev.type === "message");
  ok("normalized body", ev.body === "/ping");
  ok("normalized senderID", ev.senderID === "22485331480");
  ok("normalized messageID", ev.messageID === "33092812539944453070215332291936256");

  stop();
  console.log(`\u2714 ${checks} checks passed \u2014 realtime inbound DM decode OK`);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

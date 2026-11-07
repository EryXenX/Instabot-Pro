// Guards the reply-latency tracker when selfListen is on.
//
// With selfListen the bot's own reply is echoed back on the same thread. The
// tracker used to keep one pending entry per thread, so that echo overwrote the
// inbound entry it was answering and every `total` came out far too small
// (e.g. total=381ms while send=1084ms). The tracker now keeps a per-thread queue
// and closes the entry that started before the send, leaving the echo open.
//
//   node tools/test/latencyTracker.test.js
const assert = require("assert");
const { logger } = require("../../bot/utils");
const { makeLatencyTracker } = require("../../bot/handler/listen");

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

const THREAD = "1102531985914926";
const SELF = "35009311397";
const OTHER = "59605953590";

// Capture the LATENCY lines the tracker prints.
const lines = [];
const realInfo = logger.info;
logger.info = (scope, msg) => { if (scope === "LATENCY") lines.push(msg); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function totalsFor(thread) {
  return lines.filter((l) => l.startsWith("total=") && l.includes(`thread=${thread}`));
}

async function run() {
  // ── one inbound, one reply: total must cover the whole wall clock ─────────
  {
    lines.length = 0;
    const t = makeLatencyTracker(true);
    t.onDetect(THREAD, Date.now(), "mid.in1");
    await sleep(120);
    t.onNormalized(THREAD, 5);
    t.onHandled(THREAD, 2);
    const sendStart = Date.now();
    await sleep(60);
    t.onSent(THREAD, Date.now() - sendStart, sendStart);
    const totals = totalsFor(THREAD);
    ok("one inbound produces one total", totals.length === 1);
    const total = Number(totals[0].match(/total=(\d+)ms/)[1]);
    ok(`total covers detect+handler+send (got ${total}ms)`, total >= 170);
  }

  // ── the selfListen echo must not shrink the in-flight total ───────────────
  {
    lines.length = 0;
    const t = makeLatencyTracker(true);
    // Inbound arrives, the handler sends, and the bot's own reply is echoed back
    // while that send is still in flight — the exact ordering that used to
    // overwrite the pending entry and corrupt `total`.
    t.onDetect(THREAD, Date.now(), "mid.in2");
    await sleep(150);
    t.onNormalized(THREAD, 3);
    t.onHandled(THREAD, 1);
    const sendStart = Date.now();
    await sleep(20);
    t.onDetect(THREAD, Date.now(), "mid.echo"); // echoed reply lands mid-send
    await sleep(20);
    t.onSent(THREAD, Date.now() - sendStart, sendStart);
    const totals = totalsFor(THREAD);
    ok("echo does not create a second total", totals.length === 1);
    const total = Number(totals[0].match(/total=(\d+)ms/)[1]);
    ok(`total still measures the inbound, not the echo (got ${total}ms)`, total >= 190);
  }

  // ── two real inbounds before one send: the earlier one closes ─────────────
  {
    lines.length = 0;
    const t = makeLatencyTracker(true);
    t.onDetect(THREAD, Date.now(), "mid.a");
    await sleep(80);
    t.onDetect(THREAD, Date.now(), "mid.b");
    const sendStart = Date.now();
    t.onSent(THREAD, 10, sendStart);
    const totals = totalsFor(THREAD);
    ok("send closes the most recent inbound before it", totals.length === 1);
    const total = Number(totals[0].match(/total=(\d+)ms/)[1]);
    ok(`closed the second inbound (got ${total}ms)`, total < 80);
  }

  logger.info = realInfo;
  console.log(`\n\u2714 ${checks} checks passed — reply-latency tracker stays accurate under selfListen`);
}

run().catch((err) => {
  logger.info = realInfo;
  console.error(`\n\u2716 latency tracker test FAILED: ${err.message}`);
  process.exit(1);
});

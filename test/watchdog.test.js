// Behavioural tests for the stall watchdog and the auto-restart scheduler.
// Run with: node test/watchdog.test.js
//
// The watchdog runs its real code; only the two things that cannot exist offline
// are supplied: the clock and the session probe. The Instagram HTTP layer is a
// small stand-in because it is the network, and the socket timeouts it reproduces
// are the ones in the Railway log.

const assert = require("assert");

const watchdog = require("../bot/watchdog");
const { scheduleAutoRestart, resolveDelayMs } = require("../bot/autoRestart");

// A stand-in for the package's HttpClient. postGraphQL resolves for a healthy
// request and rejects with the exact timeout seen in the Railway log otherwise.
function fakeApi({ fail = false } = {}) {
  return {
    api: {
      http: {
        calls: 0,
        postGraphQL() {
          this.calls += 1;
          return fail
            ? Promise.reject(new Error("connect ETIMEDOUT 57.145.2.34:443"))
            : Promise.resolve({ data: {} });
        }
      }
    }
  };
}

// A clock the test moves by hand, so a 20-minute stall costs no real time.
function makeClock(startMs) {
  const clock = { now: startMs };
  clock.nowFn = () => clock.now;
  clock.advance = (ms) => { clock.now += ms; };
  return clock;
}

function startWatchdog({ clock, api, probe, onRevive, stallMs = 20 * 60 * 1000 }) {
  if (api) watchdog.attach(api);
  watchdog.start({
    stallMs,
    now: clock.nowFn,
    probe: probe || (async () => ({ status: "ok" })),
    onRevive
  });
}

async function testHealthyRequestClearsStall() {
  const clock = makeClock(1_700_000_000_000);
  const api = fakeApi();
  let revived = 0;
  startWatchdog({ clock, api, onRevive: () => { revived += 1; } });

  await api.api.http.postGraphQL();
  clock.advance(19 * 60 * 1000);
  await watchdog.tick();
  watchdog.stop();

  assert.strictEqual(revived, 0, "a healthy request must not trigger a revive");
  console.log("ok - a successful request keeps the watchdog quiet");
}

async function testStallRevives() {
  const clock = makeClock(1_700_000_000_000);
  let revived = 0;
  startWatchdog({
    clock,
    api: fakeApi({ fail: true }),
    probe: async () => ({ status: "ok" }),
    onRevive: () => { revived += 1; }
  });

  // Nothing succeeds; the poller is issuing requests that all time out.
  clock.advance(21 * 60 * 1000);
  await watchdog.tick();
  watchdog.stop();

  assert.strictEqual(revived, 1, "a stall must re-arm the listener once");
  console.log("ok - a stall re-arms the listener");
}

async function testStallEscalatesToRestart() {
  const clock = makeClock(1_700_000_000_000);
  const realExit = process.exit;
  let exited = null;
  process.exit = (code) => { exited = code; throw new Error(`__exit_${code}`); };
  let revived = 0;
  startWatchdog({
    clock,
    api: fakeApi({ fail: true }),
    probe: async () => ({ status: "ok" }),
    onRevive: () => { revived += 1; }
  });

  try {
    // Each tick is a fresh stall window that the re-arm did not fix.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(21 * 60 * 1000);
      await watchdog.tick().catch(() => {});
    }
  } finally {
    process.exit = realExit;
    watchdog.stop();
  }

  assert.strictEqual(revived, 2, "two re-arms happen before giving up");
  assert.strictEqual(exited, 2, "the third stall exits 2 so the supervisor restarts");
  console.log("ok - repeated stalls exit 2 so the supervisor restarts the bot");
}

async function testDeadSessionDoesNotRestart() {
  const clock = makeClock(1_700_000_000_000);
  const realExit = process.exit;
  let exited = null;
  let revived = 0;
  process.exit = (code) => { exited = code; throw new Error(`__exit_${code}`); };
  startWatchdog({
    clock,
    api: fakeApi({ fail: true }),
    probe: async () => ({ status: "expired", detail: "302 to login" }),
    onRevive: () => { revived += 1; }
  });

  try {
    clock.advance(21 * 60 * 1000);
    await watchdog.tick().catch(() => {});
    // A dead session stays halted: no further ticks do anything.
    clock.advance(21 * 60 * 1000);
    await watchdog.tick().catch(() => {});
  } finally {
    process.exit = realExit;
    watchdog.stop();
  }

  assert.strictEqual(revived, 0, "an expired cookie must not be re-armed");
  assert.strictEqual(exited, null, "an expired cookie must not restart-loop");
  console.log("ok - an expired session is reported, not restart-looped");
}

async function testRateLimitDoesNotRevive() {
  const clock = makeClock(1_700_000_000_000);
  let revived = 0;
  startWatchdog({
    clock,
    api: fakeApi({ fail: true }),
    probe: async () => ({ status: "rate_limited", httpStatus: 429 }),
    onRevive: () => { revived += 1; }
  });

  clock.advance(21 * 60 * 1000);
  await watchdog.tick();
  clock.advance(21 * 60 * 1000);
  await watchdog.tick();
  watchdog.stop();

  assert.strictEqual(revived, 0, "a 429 must not re-arm the listener");
  console.log("ok - a rate-limited account is left alone instead of re-armed");
}

function testAutoRestart() {
  // "1440" is a day in minutes; it must not be read as 1440 ms.
  assert.strictEqual(
    resolveDelayMs({ autoRestart: { enable: true, time: "1440" } }),
    1440 * 60000,
    "1440 must mean a day"
  );

  // Disabled, unset and null values schedule nothing.
  assert.strictEqual(resolveDelayMs({ autoRestart: { enable: false, time: "1440" } }), null);
  assert.strictEqual(resolveDelayMs({ autoRestart: { enable: true, time: null } }), null);
  assert.strictEqual(resolveDelayMs({}), null);

  // A cron string has no millisecond value and is skipped rather than misread.
  assert.strictEqual(resolveDelayMs({ autoRestart: { enable: true, time: "0 0 * * *" } }), null);
  assert.strictEqual(scheduleAutoRestart({ autoRestart: { enable: true, time: "0 0 * * *" } }), null);

  // A value over a minute is milliseconds, as upstream documents.
  assert.strictEqual(resolveDelayMs({ autoRestart: { enable: true, time: 3600000 } }), 3600000);

  // Firing the timer exits 2, which is the code the supervisor restarts on.
  const realSetTimeout = global.setTimeout;
  let captured = null;
  global.setTimeout = (fn) => { captured = fn; return { unref() {} }; };
  let exited = null;
  try {
    assert(scheduleAutoRestart({ autoRestart: { enable: true, time: "1440" } }, (code) => { exited = code; }), "a timer is scheduled");
  } finally {
    global.setTimeout = realSetTimeout;
  }
  captured();
  assert.strictEqual(exited, 2, "auto restart exits with code 2");
  console.log("ok - auto restart reads config.autoRestart.time correctly");
}

(async () => {
  await testHealthyRequestClearsStall();
  await testStallRevives();
  await testStallEscalatesToRestart();
  await testDeadSessionDoesNotRestart();
  await testRateLimitDoesNotRevive();
  testAutoRestart();
  console.log("\nall watchdog tests passed");
  process.exit(0);
})().catch((error) => {
  console.error("FAILED:", error.stack || error.message);
  process.exit(1);
});

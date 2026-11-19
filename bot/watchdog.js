// Stall watchdog.
//
// The bot does not crash when it goes deaf. On the Railway run the process stayed
// up for 19.9 hours with no log line at all while no DM was answered, and the
// memory graph stayed flat at 0.28 GB — nothing restarted it and nothing noticed.
// A manual restart fixed it, which is why the failure looked like "works for a
// day or two, then stops".
//
// The one signal that cannot lie is a successful Instagram request: the inbox
// poller issues one every few seconds whether or not a message arrives. This
// watchdog records those. When they stop, it re-arms the listener; if the stall
// comes back it exits with code 2 so the supervisor starts a fresh process. When
// the session itself is gone it says so and stays up, because restarting cannot
// fix an expired cookie.

const { logger, getText } = require("./utils");
const diagnoseSession = require("./login/diagnose");

const TICK_MS = 60 * 1000;
const HEARTBEAT_MS = 30 * 60 * 1000;
const DEFAULT_STALL_MS = 20 * 60 * 1000;
const MAX_REVIVES = 2;
const DEAD_STATUSES = ["expired", "suspended", "challenge"];

const state = {
  startedAt: 0,
  lastOkAt: 0,
  lastErr: "",
  lastInboundAt: 0,
  lastHeartbeatAt: 0,
  stallMs: DEFAULT_STALL_MS,
  // Revives since the last healthy request. A revive that actually fixes the
  // listener is followed by a successful poll, which clears this; a revive that
  // does not is followed by another stall, which counts up and ends in a restart.
  revivesSinceOk: 0,
  halted: false,
  timer: null,
  opts: {},
  now: Date.now,
  probe: diagnoseSession
};

const secs = (ms) => Math.round(ms / 1000);

function noteOk() {
  state.lastOkAt = state.now();
  state.revivesSinceOk = 0;
}

function noteErr(error) {
  state.lastErr = String((error && (error.message || error)) || "unknown");
}

function noteInbound() {
  state.lastInboundAt = state.now();
}

// Hooks the one HTTP entry point every Instagram read and write goes through, so
// the poller's traffic doubles as the liveness signal at no extra request cost.
// `api` is the InstaClient adapter: its `.api` is the native client, and both
// expose the same `.http`.
function attach(api) {
  const http = (api && api.api && api.api.http) || (api && api.http);
  if (!http || typeof http.postGraphQL !== "function" || http.__watchdogHooked) return;
  const original = http.postGraphQL.bind(http);
  http.postGraphQL = function (...args) {
    const result = original(...args);
    if (result && typeof result.then === "function") {
      return result.then(
        (value) => { noteOk(); return value; },
        (error) => { noteErr(error); throw error; }
      );
    }
    return result;
  };
  http.__watchdogHooked = true;
}

async function probeSession() {
  try {
    return await state.probe();
  } catch (error) {
    return { status: "unknown", detail: String((error && error.message) || error) };
  }
}

function heartbeat() {
  const now = state.now();
  const listener = typeof state.opts.getState === "function" ? state.opts.getState() : null;
  const parts = [
    `up ${Math.round((now - state.startedAt) / 60000)}m`,
    `last Instagram request ${secs(now - state.lastOkAt)}s ago`,
    `last DM ${state.lastInboundAt ? `${secs(now - state.lastInboundAt)}s ago` : "none"}`
  ];
  if (listener) parts.push(`realtime=${listener.realtimeAlive ? "up" : "down"} poll=${listener.armed ? "on" : "off"}`);
  logger.info("WATCHDOG", parts.join(" | "));
  state.lastHeartbeatAt = now;
}

async function tick() {
  if (state.halted) return;
  const now = state.now();
  if (now - state.lastHeartbeatAt >= HEARTBEAT_MS) heartbeat();
  if (now - state.lastOkAt < state.stallMs) return;

  const result = await probeSession();
  const status = (result && result.status) || "unknown";
  if (DEAD_STATUSES.includes(status)) {
    state.halted = true;
    logger.error("WATCHDOG", getText("watchdog", "dead", status, (result && result.detail) || ""));
    return;
  }
  // Instagram answered, so the network is fine and the session is alive: the
  // silence is our own throttle, not a wedged listener. Re-arming would only add
  // more requests to a rate-limited account, so wait it out.
  if (status === "rate_limited") {
    state.lastOkAt = now;
    return;
  }

  state.revivesSinceOk += 1;
  if (state.revivesSinceOk > MAX_REVIVES) {
    logger.error("WATCHDOG", getText("watchdog", "restart", MAX_REVIVES));
    process.exit(2);
  }
  logger.warn("WATCHDOG", getText("watchdog", "revive", Math.round((now - state.lastOkAt) / 60000), state.lastErr || "none"));
  // Give the re-arm a full stall window before judging it again.
  state.lastOkAt = now;
  try {
    if (typeof state.opts.onRevive === "function") state.opts.onRevive();
  } catch (error) {
    logger.error("WATCHDOG", `re-arm failed: ${(error && error.message) || error}`);
  }
}

function start(options = {}) {
  state.opts = options;
  state.now = typeof options.now === "function" ? options.now : Date.now;
  state.probe = typeof options.probe === "function" ? options.probe : diagnoseSession;
  state.startedAt = state.now();
  state.lastOkAt = state.startedAt;
  state.lastHeartbeatAt = state.startedAt;
  state.stallMs = Math.max(Number(options.stallMs) || DEFAULT_STALL_MS, 60000);
  state.revivesSinceOk = 0;
  state.halted = false;
  state.timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  logger.info("WATCHDOG", getText("watchdog", "started", Math.round(state.stallMs / 60000)));
  return module.exports;
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

module.exports = { attach, noteOk, noteErr, noteInbound, probeSession, start, stop, tick };

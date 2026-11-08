// The package paces every outbound send (antiSuspension) so a personal account
// does not look scripted: a per-thread gap plus jitter, serialized across all
// sends. That pacer is a single global queue, so once its warmup hourly cap is
// passed it adds overCapGapMs (20s by default) to *every* send — on a busy
// account replies then queue up and drift to minutes (a "/" reply measured at
// 102s, "/help" at 130s, with handler time under 3ms). The bot does not want
// that throttle, so the default here is off; config.sendPacing may turn it back
// on or set explicit gaps.
//
// This only produces the package's documented `sendPacing` option — no client
// internals are patched. The option is handed to the package at login.

// No-delay profile. `enabled: false` sends with no wait at all; the caps are
// raised so that, if pacing is switched back on, the over-cap gap is never
// reached unless config.sendPacing asks for it.
const DEFAULTS = Object.freeze({
  enabled: false,
  globalMinGapMs: 0,
  perThreadMinGapMs: 0,
  jitterMs: 0,
  warmupHourlyCap: 1e9,
  normalHourlyCap: 1e9,
  dailyCap: 1e9,
  overCapGapMs: 0
});

const NUMERIC_KEYS = [
  "globalMinGapMs",
  "perThreadMinGapMs",
  "jitterMs",
  "warmupWindowMs",
  "warmupHourlyCap",
  "normalHourlyCap",
  "dailyCap",
  "overCapGapMs"
];

// Build the sendPacing option the package expects. Any value the user sets in
// config.sendPacing wins; anything missing or invalid keeps the no-delay default.
function resolveSendPacing(config) {
  const cfg = (config && config.sendPacing) || {};
  const resolved = { ...DEFAULTS };
  if (Object.prototype.hasOwnProperty.call(cfg, "enabled")) {
    resolved.enabled = cfg.enabled !== false;
  }
  for (const key of NUMERIC_KEYS) {
    const value = Number(cfg[key]);
    if (Number.isFinite(value) && value >= 0) resolved[key] = value;
  }
  return resolved;
}

module.exports = { resolveSendPacing, NUMERIC_KEYS };

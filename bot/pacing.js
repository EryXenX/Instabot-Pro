// The package paces every outbound send (antiSuspension) so a personal account
// does not look scripted: a per-thread gap plus jitter, serialized across all
// sends. That wait is the largest single chunk of the reply latency a user
// notices — the send itself is only a ~1s GraphQL round trip — so it is worth
// tuning. Instagram documents no safe floor here, so config.sendPacing overrides
// the gaps and the defaults stay conservative enough to keep a human-like rhythm.

const { globalAntiSuspension } = require("@eryxenx/insta-chat").antiSuspension;

const PACING_KEYS = ["globalMinGapMs", "perThreadMinGapMs", "jitterMs"];

function applySendPacing(config) {
  const cfg = (config && config.sendPacing) || {};
  for (const key of PACING_KEYS) {
    const value = Number(cfg[key]);
    if (Number.isFinite(value) && value >= 0) globalAntiSuspension[key] = value;
  }
  return {
    globalMinGapMs: globalAntiSuspension.globalMinGapMs,
    perThreadMinGapMs: globalAntiSuspension.perThreadMinGapMs,
    jitterMs: globalAntiSuspension.jitterMs
  };
}

module.exports = { applySendPacing, PACING_KEYS };

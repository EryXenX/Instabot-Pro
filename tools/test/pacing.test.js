// Guards config.sendPacing -> antiSuspension wiring: the values reach the
// package's global pacer, an absent config leaves the conservative defaults in
// place, and a bad value (NaN/negative) is ignored rather than applied.
const path = require("path");
const assert = require("assert");

process.chdir(path.join(__dirname, "..", ".."));

const { globalAntiSuspension } = require("@eryxenx/insta-chat").antiSuspension;
const { applySendPacing } = require("../../bot/pacing");

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, "FAILED: " + label); checks++; };

const DEFAULTS = {
  globalMinGapMs: globalAntiSuspension.globalMinGapMs,
  perThreadMinGapMs: globalAntiSuspension.perThreadMinGapMs,
  jitterMs: globalAntiSuspension.jitterMs
};

// An absent section must not disturb the package defaults.
const untouched = applySendPacing({});
ok("no config keeps global default", untouched.globalMinGapMs === DEFAULTS.globalMinGapMs);
ok("no config keeps per-thread default", untouched.perThreadMinGapMs === DEFAULTS.perThreadMinGapMs);
ok("no config keeps jitter default", untouched.jitterMs === DEFAULTS.jitterMs);

// Config values reach the pacer.
const applied = applySendPacing({ sendPacing: { globalMinGapMs: 500, perThreadMinGapMs: 700, jitterMs: 300 } });
ok("global applied", applied.globalMinGapMs === 500 && globalAntiSuspension.globalMinGapMs === 500);
ok("per-thread applied", applied.perThreadMinGapMs === 700 && globalAntiSuspension.perThreadMinGapMs === 700);
ok("jitter applied", applied.jitterMs === 300 && globalAntiSuspension.jitterMs === 300);

// Bad values are ignored; the last good value survives.
applySendPacing({ sendPacing: { perThreadMinGapMs: -1, jitterMs: "abc" } });
ok("negative ignored", globalAntiSuspension.perThreadMinGapMs === 700);
ok("non-numeric ignored", globalAntiSuspension.jitterMs === 300);

// 0 is a valid value (disable the gap) and must not be treated as absent.
applySendPacing({ sendPacing: { globalMinGapMs: 0 } });
ok("zero applied", globalAntiSuspension.globalMinGapMs === 0);

console.log(`pacing.test.js: ${checks} checks passed`);

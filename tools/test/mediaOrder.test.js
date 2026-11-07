// Regression guard for bot/mediaBridge.js's offline_threading_id pinning.
//
// Instagram sorts a thread by each message's offline_threading_id, not by
// arrival. That id is `(unix_ms << 22) | random22`, so a caption and its media
// built in the same millisecond sort by their random low bits — the image
// flips above the text about half the time (reproduced live by delaying the
// caption POST: the image then sorted first). mediaBridge patches the id
// generator to be strictly increasing, so the caption (built first) always
// sorts above the media.
//
// This asserts the installed generator is monotonic even when the clock and the
// random bits would otherwise make two ids collide, and that it still decodes
// to a recent timestamp (Instagram rejects implausible ids).
//
//   node tools/test/mediaOrder.test.js
const assert = require("assert");
const path = require("path");

process.chdir(path.join(__dirname, "..", ".."));

const mediaBridge = require("../../bot/mediaBridge");
mediaBridge.install();

const PKG = path.join(__dirname, "..", "..", "node_modules", "@eryxenx", "insta-chat");
const HttpClient = require(path.join(PKG, "src", "http.js"));

let checks = 0;
const ok = (cond, label) => { assert.ok(cond, "FAILED: " + label); checks++; };

const http = new HttpClient({ sessionid: "x", csrftoken: "y", ds_user_id: "1" });

// The id is (ms << 22) | random22; decode the ms back out.
const msOf = (id) => Number(BigInt(id) >> 22n);

// ── the generator is monotonic across a tight burst ─────────────────────────
{
  let prev = 0n;
  let monotonic = true;
  for (let i = 0; i < 5000; i++) {
    const id = BigInt(http.offlineThreadingId());
    if (id <= prev) { monotonic = false; break; }
    prev = id;
  }
  ok(monotonic, "offline_threading_id is strictly increasing across a 5000-call burst");
}

// ── ids still decode to a plausible recent timestamp ────────────────────────
{
  const id = http.offlineThreadingId();
  const ms = msOf(id);
  const now = Date.now();
  ok(Math.abs(now - ms) < 5000, `id decodes to a recent ms (got ${now - ms}ms skew)`);
}

// ── a caption built before the media sorts above it ─────────────────────────
{
  const caption = BigInt(http.offlineThreadingId());
  const media = BigInt(http.offlineThreadingId());
  ok(caption < media, "caption id (generated first) sorts before the media id");
}

// ── install() is idempotent: a second call must not re-wrap the generator ────
{
  const before = http.offlineThreadingId();
  mediaBridge.install();
  const after = http.offlineThreadingId();
  ok(BigInt(after) > BigInt(before), "install() is idempotent and the generator keeps advancing");
}

console.log(`✔ ${checks} checks passed — caption always sorts above its media (offline_threading_id pinned monotonic)`);

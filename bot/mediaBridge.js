// Captioned-media send: commit the text and the attachment together, text first.
//
// Instagram's DM media mutation (IGDirectMediaSendMutation) has no caption
// field, so `sendMessage({ body, attachment })` is necessarily two messages —
// text then media. `@eryxenx/insta-chat` commits them sequentially, which on
// the wire leaves a ~0.6-0.8s gap (measured via the realtime stream), so the
// caption and the attachment visibly arrive apart. Waiting for the caption
// request to finish before starting the media commit buys nothing: both are
// independent POSTs and the media one carries no reply target, so this bridge
// commits them concurrently to collapse the gap.
//
// Which one renders on top is decided by Instagram from the message's
// `offline_threading_id`, NOT by arrival order. That id is
// `(unix_ms << 22) | random22`, so two sends built in the SAME millisecond sort
// by their random low bits — the caption and the media flip ~half the time when
// the commit is concurrent. We pin every id generated during this send to be
// strictly increasing, and build the caption first, so the caption always sorts
// above the media regardless of timing.
//
// The package pins its methods in `exports`, so `src/methods/media` cannot be
// required by subpath; the module is resolved through the package entry and its
// `_send` is wrapped on the live instance's prototype.

const path = require("path");

// `exports` exposes only ".", so neither `.../package.json` nor `src/...` can be
// required by subpath. The package root is derived from its main entry.
function packageRoot() {
  return path.dirname(require.resolve("@eryxenx/insta-chat"));
}

function resolveMediaModule() {
  return require(path.join(packageRoot(), "src", "methods", "media.js"));
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;

  let MediaMethods;
  try {
    MediaMethods = resolveMediaModule();
  } catch (_) {
    return;
  }

  const { globalAntiSuspension } = require(path.join(packageRoot(), "src", "utils", "antiSuspension.js"));
  const original = MediaMethods.prototype._send;
  if (typeof original !== "function") return;

  // Instagram sorts the thread by offline_threading_id, and ties within the same
  // millisecond break by its random low bits. Patching the id generator to be
  // strictly increasing means a caption built before the media always sorts
  // above it — the ordering a captioned send intends. Installed once per process
  // so the counter is shared across concurrent sends.
  const HttpClient = require(path.join(packageRoot(), "src", "http.js"));
  const httpProto = HttpClient.prototype;
  const originalOfflineThreadingId = httpProto.offlineThreadingId;
  if (typeof originalOfflineThreadingId !== "function") return;
  if (!httpProto.__monotonicOfflineThreadingId) {
    let next = 0n;
    httpProto.offlineThreadingId = function () {
      const id = BigInt(originalOfflineThreadingId.call(this));
      next = id > next ? id : next + 1n;
      return next.toString();
    };
    httpProto.__monotonicOfflineThreadingId = true;
  }

  MediaMethods.prototype._send = async function (threadID, uploadOptions, options = {}) {
    if (!options || !options.text) return original.call(this, threadID, uploadOptions, options);

    // The upload is the slow part; do it first so both commits can follow
    // immediately. (Unchanged from the package: a caption committed mid-upload
    // would render above an image that is still seconds away.)
    const metadata = await this._upload(threadID, uploadOptions);
    const fbid = metadata.fbid || metadata.video_id || metadata.audio_id;
    if (!fbid) throw new Error(`Upload returned no media id: ${JSON.stringify(metadata)}`);

    try {
      // The caption still takes a paced turn (it is a message send), but the
      // media commit joins it immediately instead of waiting for it to finish.
      await globalAntiSuspension.waitForTurn(threadID);
      // Build the caption — and therefore its offline_threading_id — before the
      // media's. With the id generator pinned monotonic the caption sorts first
      // even though both requests are in flight together.
      const caption = this._sendCaption(threadID, options.text);
      await globalAntiSuspension.waitForTurn(threadID, { immediate: true });
      const media = this._commitMedia(threadID, fbid, options);
      const [, mediaResult] = await Promise.all([caption, media]);
      return mediaResult;
    } catch (error) {
      globalAntiSuspension.noteSendError(error);
      throw error;
    }
  };
}

module.exports = { install };

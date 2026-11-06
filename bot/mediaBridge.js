// Captioned-media send: commit the text and the attachment together.
//
// Instagram's DM media mutation (IGDirectMediaSendMutation) has no caption
// field, so `sendMessage({ body, attachment })` is necessarily two messages —
// text then media. `@eryxenx/insta-chat` commits them sequentially, which on
// the wire leaves a ~0.6-0.8s gap (measured via the realtime stream), so the
// caption and the attachment visibly arrive apart.
//
// Waiting for the caption request to finish before starting the media commit
// buys nothing: both are independent POSTs and the media one carries no reply
// target. Committing them concurrently keeps the text first (its request is
// issued first and returns sooner) while collapsing the gap to ~0.3-0.5s.
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
      const caption = this._sendCaption(threadID, options.text);
      await globalAntiSuspension.waitForTurn(threadID, { immediate: true });
      const [, mediaResult] = await Promise.all([caption, this._commitMedia(threadID, fbid, options)]);
      return mediaResult;
    } catch (error) {
      globalAntiSuspension.noteSendError(error);
      throw error;
    }
  };
}

module.exports = { install };

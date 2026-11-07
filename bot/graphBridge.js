// Instagram stand-in for the Facebook Graph API.
//
// The frozen GoatBot-Pro commands (pp.js, fbcover.js, ...) build Facebook Graph
// URLs like `https://graph.facebook.com/<uid>/picture?...` and download them with
// axios. On Instagram that host is meaningless (it returns JSON, not an image),
// so a request interceptor rewrites those URLs to the user's real Instagram CDN
// profile picture. Commands stay byte-identical; only the transport changes.

const axios = require("axios");

// A direct `graph.facebook.com/<uid>/picture...` request, or the same URL
// embedded (raw or percent-encoded) inside another request's query string, e.g.
// popcat's `...?image=https%3A%2F%2Fgraph.facebook.com%2F<uid>%2Fpicture...`.
const GRAPH_PICTURE = /^https?:\/\/graph\.facebook\.com\/(\d+)\/picture/i;
const ENC_GRAPH_PICTURE = /https%3A%2F%2Fgraph\.facebook\.com%2F(\d+)%2Fpicture[^&\s"']*/gi;
// Raw (unencoded) embedding carries the graph URL's own query untouched, so the
// match must run to the next whitespace/quote rather than stopping at "&".
const RAW_GRAPH_PICTURE = /https?:\/\/graph\.facebook\.com\/(\d+)\/picture[^"'\s]*/gi;

function profileApi() {
  const api = global.InstaBot && global.InstaBot.api;
  return api && typeof api.getProfilePictureUrl === "function" ? api : null;
}

async function resolvePicture(uid) {
  const api = profileApi();
  return api ? api.getProfilePictureUrl(uid).catch(() => null) : null;
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;
  axios.interceptors.request.use(async (config) => {
    const url = config && config.url;
    if (!url || typeof url !== "string") return config;
    if (!profileApi()) return config;

    // Direct fetch — swap the whole URL.
    const direct = url.match(GRAPH_PICTURE);
    if (direct) {
      const picture = await resolvePicture(direct[1]);
      if (picture) config.url = picture;
      return config;
    }

    // Embedded fetch — replace each graph URL where it appears, keeping the
    // rest of the surrounding request (host, other params) intact.
    if (!/graph\.facebook\.com/i.test(url)) return config;
    let out = url;
    let changed = false;
    const swap = async (regex, encode) => {
      for (const m of [...out.matchAll(regex)]) {
        const picture = await resolvePicture(m[1]);
        if (!picture) continue;
        out = out.split(m[0]).join(encode ? encodeURIComponent(picture) : picture);
        changed = true;
      }
    };
    await swap(ENC_GRAPH_PICTURE, true);
    await swap(RAW_GRAPH_PICTURE, false);
    if (changed) config.url = out;
    return config;
  });
}

module.exports = { install, GRAPH_PICTURE, ENC_GRAPH_PICTURE, RAW_GRAPH_PICTURE };

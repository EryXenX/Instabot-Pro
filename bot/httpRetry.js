// Upstream commands call the EryXenX download API (`https://eryxenx.agi.bd`)
// directly with axios. That host fronts a free Render origin and intermittently
// answers 502 `extract_failure` for otherwise-good media URLs; commands like
// autolink have no retry, so a single blip silently drops the download. Retrying
// transient failures here fixes every caller at once without editing the
// (frozen, upstream-identical) command files.

const axios = require("axios");

const RETRY_HOST = /(^|\.)eryxenx\.agi\.bd$/i;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;
let installed = false;

function isTransient(error) {
  const status = error.response && error.response.status;
  if (status === undefined) return true; // network / socket / timeout
  return status === 429 || (status >= 500 && status < 600);
}

// Only idempotent reads are replayed; a streamed GET yields no body until it
// succeeds, so re-issuing the whole request is safe.
function createRetryInterceptor({ instance = axios, host = RETRY_HOST, maxRetries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS } = {}) {
  return async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);
    const method = (config.method || "get").toLowerCase();
    if (method !== "get" && method !== "head") return Promise.reject(error);
    let hostname;
    try {
      hostname = new URL(config.url, "https://x").hostname;
    } catch (_) {
      return Promise.reject(error);
    }
    if (!host.test(hostname)) return Promise.reject(error);

    const attempt = config.__hostRetry || 0;
    if (attempt >= maxRetries || !isTransient(error)) return Promise.reject(error);
    config.__hostRetry = attempt + 1;
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * config.__hostRetry));
    return instance(config);
  };
}

function install() {
  if (installed) return;
  installed = true;
  axios.interceptors.response.use(undefined, createRetryInterceptor());
}

module.exports = { install, createRetryInterceptor, isTransient, RETRY_HOST, MAX_RETRIES };

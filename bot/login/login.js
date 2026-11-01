const fs = require("fs-extra");
const path = require("path");
const { InstaAPI, InstaClient } = require("@eryxenx/insta-chat");
const { logger, getText } = require("../utils");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = process.env.INSTA_DATA_DIR || ROOT;
const DEVICE_FILE = path.join(DATA_DIR, "device.json");
const APPSTATE_FILE = path.join(DATA_DIR, "appstate.json");
const PLACEHOLDER_RE = /paste your json cookie here/i;
const TRANSIENT_RETRIES = 4;
const RETRY_MAX_WAIT_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  fs.ensureDirSync(DATA_DIR);
} catch (_) {}

// Instagram's web API runs from the cookie alone: the browser-session params
// (__dyn/__csr/__hs/...) are optional, so no Chromium is needed at runtime.
// They are still honoured when supplied via env or config.
function readSessionParams() {
  const rawEnv = (process.env.INSTAGRAM_SESSION_PARAMS || "").trim();
  if (rawEnv) {
    for (const text of [rawEnv, Buffer.from(rawEnv, "base64").toString("utf8")]) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length) return parsed;
      } catch (_) {}
    }
  }
  const fromConfig = global.InstaBot.config.instagramAccount?.sessionParams;
  if (fromConfig && typeof fromConfig === "object" && Object.keys(fromConfig).length) {
    return fromConfig;
  }
  return {};
}

function applyProxy() {
  const proxy = global.InstaBot.config.proxy;
  if (!proxy) return;
  const url = typeof proxy === "string" ? proxy : proxy.https || proxy.http || proxy.url;
  if (!url) return;
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    process.env[key] = url;
  }
  logger.info("SESSION", getText("login", "proxyEnabled", url.replace(/\/\/[^@]*@/, "//***@")));
}

function readCookie() {
  const fromEnv = (process.env.INSTAGRAM_COOKIE || "").trim();
  if (fromEnv) return fromEnv;

  const cookieFilePath = path.join(ROOT, "account.txt");
  if (fs.existsSync(cookieFilePath)) {
    const fromFile = fs.readFileSync(cookieFilePath, "utf8").trim();
    if (fromFile && !PLACEHOLDER_RE.test(fromFile)) return fromFile;
  }

  return (global.InstaBot.config.instagramAccount?.sessionCookie || "").trim();
}

async function connect(cookieData, sessionParams) {
  for (let attempt = 0; ; attempt += 1) {
    const native = new InstaAPI(cookieData, {
      sessionParams,
      deviceFile: DEVICE_FILE,
      appStateFile: APPSTATE_FILE,
      // MQTT push for inbound messages: Instagram has no DM webhook, so without
      // this a reply waits a full poll cycle. With it the listener is push and
      // the poll below is only the fallback for when the broker is unreachable
      // (some datacenter hosts drop it). Set config.realtime to false to force
      // polling only.
      realtime: { enabled: global.InstaBot.config.realtime !== false, fallback: true },
      // Keep the package's own poll floor in step with the bot's requested
      // interval, otherwise listen() silently raises a short cycle back up.
      minPollIntervalMs: global.InstaBot.config.pollInterval ?? 2000
    });
    try {
      const info = await native.init();
      return { native, info };
    } catch (error) {
      if (error.code !== "IG_TRANSIENT" || attempt >= TRANSIENT_RETRIES) throw error;
      const wait = Math.min(Math.max(error.retryAfterMs || 0, 30000 * 2 ** attempt), RETRY_MAX_WAIT_MS);
      logger.warn(
        "SESSION",
        getText("login", "transientRetry", error.state || "unknown", Math.round(wait / 1000), attempt + 1, TRANSIENT_RETRIES)
      );
      await sleep(wait);
    }
  }
}

async function loginBot() {
  applyProxy();

  const cookieData = readCookie();
  if (!cookieData) {
    throw new Error(getText("login", "noCookie"));
  }

  let sessionParams = readSessionParams();

  let result;
  try {
    result = await connect(cookieData, sessionParams);
  } catch (error) {
    if (error.code !== "IG_SESSION_INVALID" || !sessionParams) throw error;
    logger.warn("SESSION", getText("login", "staleSessionParams"));
    // Supplied params are static (env/config), so retrying just repeats the same
    // failed login. Retry once without them: the web API accepts the cookie alone.
    result = await connect(cookieData, {});
  }

  const { native, info } = result;
  const api = new InstaClient(native, { sessionGuardFile: APPSTATE_FILE });
  // A throttled read resolves null and frozen code destructures it into a crash;
  // retry transient nulls so commands answer instead of erroring.
  require("../readGuards").install(api);
  api.username = info.username || null;
  logger.success("LOGIN INSTAGRAM", getText("login", "loginSuccess", info.username || info.userID));
  return api;
}

module.exports = loginBot;

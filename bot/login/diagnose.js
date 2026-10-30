// Turns an opaque login failure into a specific, actionable reason.
//
// The API's init() collapses every auth failure into one generic error, so a
// transient HTTP 429 (rate-limit) or a security checkpoint reads the same as an
// actually expired/suspended session. We re-probe Instagram directly to tell
// those apart before reporting.
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { CookieUtils } = require("@eryxenx/insta-chat");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const APP_ID = "936619743392459";
// web_form_data 200s for a healthy session and 302s to the login page otherwise.
const PROBE_URL = "https://www.instagram.com/api/v1/accounts/edit/web_form_data/";

function readCookieJar() {
  const cookieFilePath = path.join(__dirname, "..", "..", "account.txt");
  let raw = (process.env.INSTAGRAM_COOKIE || "").trim();
  if (raw) return CookieUtils.parse(raw);
  try {
    if (fs.existsSync(cookieFilePath)) raw = fs.readFileSync(cookieFilePath, "utf8").trim();
  } catch (_) {}
  if (!raw) raw = global.InstaBot?.config?.instagramAccount?.sessionCookie || "";
  return raw ? CookieUtils.parse(raw) : null;
}

async function probe(jar) {
  const headers = {
    cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
    "user-agent": UA,
    "x-ig-app-id": APP_ID,
    "x-csrftoken": jar.csrftoken || "",
    "x-requested-with": "XMLHttpRequest"
  };
  const res = await axios.get(PROBE_URL, {
    headers,
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 20000
  });

  if (res.status === 200) return { status: "ok" };

  if (res.status === 429) return { status: "rate_limited", httpStatus: 429 };

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    // A redirect lands on the login or a challenge page. Read the destination to
    // tell a checkpoint apart from an outright logged-out session.
    const location = String(res.headers.location || "");
    if (/challenge|checkpoint/i.test(location)) return { status: "challenge", httpStatus: res.status };
    let landing = "";
    try {
      const page = await axios.get(location || "https://www.instagram.com/", {
        headers,
        validateStatus: () => true,
        timeout: 20000
      });
      landing = typeof page.data === "string" ? page.data : "";
    } catch (_) {}
    if (/has been (temporarily )?(suspended|disabled)|account_status.*disabled/i.test(landing)) {
      return { status: "suspended", httpStatus: res.status };
    }
    if (/challenge|checkpoint/i.test(landing)) return { status: "challenge", httpStatus: res.status };
    return { status: "expired", httpStatus: res.status };
  }

  // A JSON body sometimes names the reason even on a 400.
  const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data || {});
  if (/challenge|checkpoint/i.test(body)) return { status: "challenge", httpStatus: res.status };
  if (/suspended|disabled|deactivated/i.test(body)) return { status: "suspended", httpStatus: res.status };
  if (/login_required|not_logged_in/i.test(body)) return { status: "expired", httpStatus: res.status };
  return { status: "unknown", httpStatus: res.status };
}

// status -> [language key, args]
const MESSAGES = {
  // The session probe succeeded (cookie is valid) yet init() still failed. That
  // is a transient rejection (rate-limit or a one-off GraphQL hiccup), not a
  // dead session - do NOT tell the user to replace the cookie.
  ok: [
    "sessionRateLimited",
    "Instagram temporarily rejected a request (likely rate-limit) - your cookie is still valid. Wait a few minutes, then restart."
  ],
  rate_limited: [
    "sessionRateLimited",
    "Instagram is rate-limiting this account (HTTP 429). Your cookie is still valid - wait a few minutes and restart."
  ],
  challenge: [
    "sessionChallenge",
    "Instagram requires a security check (challenge/checkpoint). Open the Instagram app, complete the verification, then restart."
  ],
  expired: [
    "sessionExpired",
    "The Instagram session cookie is expired or logged out. Paste a fresh cookie in account.txt and restart."
  ],
  suspended: [
    "sessionSuspended",
    "This Instagram account appears to be suspended or disabled. Log in on instagram.com to review it."
  ],
  unknown: [
    "sessionInvalid",
    "Could not authenticate the Instagram session (reason unknown). Check account.txt and restart."
  ]
};

async function diagnoseSession() {
  let result;
  try {
    const jar = readCookieJar();
    if (!jar) return { status: "expired", langKey: "noCookie", detail: "" };
    result = await probe(jar);
  } catch (error) {
    result = { status: "unknown", httpStatus: error?.response?.status };
  }
  const [langKey, detail] = MESSAGES[result.status] || MESSAGES.unknown;
  return { ...result, langKey, detail };
}

module.exports = diagnoseSession;

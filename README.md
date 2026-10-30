<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://readme-typing-svg.herokuapp.com?font=JetBrains+Mono&weight=700&size=18&duration=3000&pause=800&color=00FFD1&background=00000000&center=true&vCenter=true&width=700&lines=Instabot-Pro;Instagram+DM+Bot+Framework;GoatBot-Pro+architecture+%E2%80%94+on+Instagram+Chat;Fast+%E2%80%A2+Smart+%E2%80%A2+Reliable+%E2%80%A2+Powerful" />
  <source media="(prefers-color-scheme: light)" srcset="https://readme-typing-svg.herokuapp.com?font=JetBrains+Mono&weight=700&size=18&duration=3000&pause=800&color=0E7C86&background=00000000&center=true&vCenter=true&width=700&lines=Instabot-Pro;Instagram+DM+Bot+Framework;GoatBot-Pro+architecture+%E2%80%94+on+Instagram+Chat;Fast+%E2%80%A2+Smart+%E2%80%A2+Reliable+%E2%80%A2+Powerful" />
  <img src="https://readme-typing-svg.herokuapp.com?font=JetBrains+Mono&weight=700&size=18&duration=3000&pause=800&color=0E7C86&background=00000000&center=true&vCenter=true&width=700&lines=Instabot-Pro;Instagram+DM+Bot+Framework;GoatBot-Pro+architecture+%E2%80%94+on+Instagram+Chat;Fast+%E2%80%A2+Smart+%E2%80%A2+Reliable+%E2%80%A2+Powerful" />
</picture>

<br/>

![Version](https://img.shields.io/badge/Version-1.0.0-0E7C86?style=for-the-badge&logo=github&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Base](https://img.shields.io/badge/Architecture-GoatBot--Pro-FF6B6B?style=for-the-badge&logo=github&logoColor=white)
![Fork](https://img.shields.io/badge/By-EryXenX-6E40C9?style=for-the-badge&logo=github&logoColor=white)
![API](https://img.shields.io/badge/Chat%20API-%40eryxenx%2Finsta--chat-0E7C86?style=for-the-badge&logoColor=white)

</div>

---

## ◈ About

Assalamu Alaikum! **Instabot-Pro** is an Instagram DM bot framework built on the
same architecture as **GoatBot-Pro** — the same command/event handler, the same
`config.json` shape, the same `scripts/cmds` and `scripts/events` layout — so
commands written for GoatBot-Pro run here unchanged. The Facebook client is
replaced by **`@eryxenx/insta-chat`**, a standalone Instagram Chat API.

| Feature | Description |
|---|---|
| 💬 **Instagram Chat API** | Uses `@eryxenx/insta-chat` — an FB Chat API–shaped surface over Instagram's web DM endpoints |
| ⚙️ **GoatBot-Pro Handler** | Same pipeline: `handlerAction` → `onFirstChat` / `onChat` / `onStart` / `onReply` / `onReaction` / `onEvent` |
| 🧩 **Drop-in Commands** | `scripts/cmds` files are byte-identical to GoatBot-Pro; the adapter supplies the Facebook API shape |
| 🗄️ **GoatBot-Pro Database** | JSON-backed `usersData` / `threadsData` / `globalData` / `dashBoardData` stores |
| 🌐 **Multi-Language** | `languages/` with `en.lang` + per-command strings (`getLang`, `setlang`) |
| 🎨 **Clean UI** | Redesigned message templates and a GoatBot-Pro style logger |
| 🔐 **Roles** | Bot admins, premium users and developers driven from `config.json` |

> ⚠️ For educational purposes only. Instagram's private web API is unofficial and
> can break or flag the session at any time. Any misuse is solely the user's
> responsibility.

---

## ◈ Support

<div align="center">

[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://facebook.com/EryXenX)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/EryXenX)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/@EryXenX)
[![Telegram](https://img.shields.io/badge/Telegram-0088CC?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/EryXenX_Official)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/EryXenX)

</div>

---

## ◈ Setup

Just four steps: clone → add cookie → add UID → deploy.

### 1. Clone

```bash
git clone https://github.com/EryXenX/Instabot-Pro.git
cd Instabot-Pro
npm install
```

### 2. Add your Instagram cookie

1. Log in to Instagram in your browser.
2. Open the **Cookie-Editor** extension → **Export** → **JSON**.
3. Paste the copied JSON into `account.txt` in the project root.

A raw `sessionid=...; csrftoken=...; ds_user_id=...; mid=...` string works too.
`account.txt` takes precedence over `config.json → instagramAccount.sessionCookie`.
Without a valid cookie the bot cannot log in. Never share or commit this file.

### 3. Add your UID

In `config.json`, add your Instagram user id to `adminBot`. This is the ID that
can control the bot from chat — admin-only commands, `{prefix}setting`, no-prefix
commands (when enabled), and so on. `devUsers` and `premiumUsers` unlock the
developer and premium command roles.

```json
"adminBot": [
  "your_instagram_uid",
  "another_instagram_uid"
],
"premiumUsers": [
  "your_instagram_uid",
  "another_instagram_uid"
],
"devUsers": [
  "your_instagram_uid",
  "another_instagram_uid"
],
```

### 4. Deploy

```bash
npm start
```

That's it — the bot logs in and starts listening. `index.js` supervises
`InstaBot.js` (restarts on exit code `2`) and serves the uptime page on `PORT`
(default `3000`).

**Docker** — a `Dockerfile` is included (plain `node:20`, no browser):

```bash
docker build -t instabot-pro .
docker run -d --name instabot-pro \
  -p 3000:3000 \
  -v "$PWD/account.txt:/app/account.txt:ro" \
  -v "$PWD/config.json:/app/config.json" \
  instabot-pro
```

Mount `account.txt` and `config.json` so your secrets are not baked into the
image. A persistent volume for `/app` keeps `device.json` and `appstate.json`
across restarts, but nothing breaks without one.

#### Hosting

![Railway](https://img.shields.io/badge/Railway-Works-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)
![VPS](https://img.shields.io/badge/VPS-Works-2EA44F?style=for-the-badge&logo=linux&logoColor=white)
![Render](https://img.shields.io/badge/Render-Works-0B0D0E?style=for-the-badge&logo=render&logoColor=white)

> [!TIP]
> **Railway / VPS — both work.** On a VPS run the bot under a process manager
> (`pm2 start index.js`, `screen`, `tmux`) so it keeps running after you disconnect.

> [!TIP]
> **Render — works, free plan included.** The bot is pure HTTP with no
> headless browser, so it fits inside 512 MB with room to spare.
>
> **Free-plan spin-down:** Render stops a free web service after ~15 minutes
> with no inbound traffic, which halts the DM poller. `index.js` pings its own
> public URL every 10 minutes (auto-detected from `RENDER_EXTERNAL_URL`) to
> keep it awake; override with `KEEP_ALIVE_URL`.

> **No browser needed.** Instagram's web DM API runs from the cookie alone: the
> browser-session params (`__dyn`, `__csr`, `__hs`, …) are optional, so
> `bot/login/login.js` logs in over plain HTTP. Supplying them is still
> supported and skipped by default — set `instagramAccount.sessionParams` in
> `config.json` or the `INSTAGRAM_SESSION_PARAMS` env var (JSON, or base64 of
> it) if you ever want to pin a specific set.

---

## ◈ Project Structure

```
Instabot-Pro/
├─ InstaBot.js            main entry: loads scripts, logs in, starts listener
├─ index.js               process spawner + uptime web server
├─ Dockerfile             plain node:20 image (no browser)
├─ account.txt            paste your JSON cookie here (from the Cookie-Editor extension)
├─ config.json            bot + database config (prefix, admins, database.type, timeZone)
├─ configCommands.json    per-command env (reward amounts, API keys)
├─ utils.js               global.utils (GoatBot-Pro helper set)
├─ bot/
│  ├─ handler/            handlerCommand / handlerEvents / handlerAction / listen
│  ├─ login/              login.js (cookie -> api client, pure HTTP)
│  ├─ utils/              logger, message, getTime, roles
│  ├─ compat.js           installs global.GoatBot / db / client / temp for ported scripts
│  ├─ loader.js           loads scripts/cmds and scripts/events
│  ├─ graphBridge.js      rewrites Facebook picture URLs to Instagram avatars
│  └─ httpRetry.js        axios retry interceptor
├─ database/              JSON-backed usersData / threadsData / globalData / dashBoardData
├─ func/                  colors.js, prism.js
├─ logger/                log.js, loading.js, logColor.js
├─ languages/             en.lang + cmds/ + events/ strings
├─ scripts/
│  ├─ cmds/               commands (module.exports.config + onStart)
│  └─ events/             passive event scripts
└─ tools/                 packageBot.js, packageInstaChat.js
```

`@eryxenx/insta-chat` is installed from npm — its source is not bundled into the
bot archive.

---

## ◈ Command Structure

Commands go in `scripts/cmds/yourcommand.js`.

```js
module.exports = {
  config: {
    name: "commandname",
    version: "1.0.0",
    author: "YourName",
    countDown: 5,
    role: 0,
    shortDescription: "...",
    longDescription: "...",
    category: "fun",
    guide: "{prefix}commandname [args]"
  },

  onStart: async function ({ api, event, args, message, getLang }) {
    message.reply("Hello!");
  },

  onReply: async function ({ api, event, Reply, message }) {
    if (event.senderID !== Reply.author) return;
    message.reply(`You replied: ${event.body}`);
  },

  onReaction: async function ({ api, event, Reaction, message }) {
    message.reply(`You reacted with: ${event.reaction}`);
  },

  onChat: async function ({ api, event, message }) {
    if (event.body === "hello") message.reply("hi!");
  },

  onEvent: async function ({ api, event, message }) {
    if (event.logMessageType === "log:subscribe") {
      message.reply("Welcome!");
    }
  }
};
```

---

## ◈ Permission Roles

| Value | Who can use |
|---|---|
| `0` | Everyone |
| `1` | Box (group) admins |
| `2` | Bot admins (`config.adminBot`) |
| `3` | Premium users (`config.premiumUsers`) |
| `4` | Developers (`config.devUsers`) |

---

## ◈ API Reference

```js
message.reply("text")
api.sendMessage("text", threadID)
api.sendMessage({ body: "text", attachment: stream }, threadID)
api.sendMessage({ body: "text", attachment: [stream1, stream2] }, threadID)
api.setMessageReaction("✅", event.messageID, () => {}, true)
api.unsendMessage(messageID)
api.getCurrentUserID()
await api.getThreadInfo(threadID)
await api.getUserInfo(userID)
await api.getThreadList(limit)          // inbox threads
```

### Sending media

Media is sent through Instagram's own web DM flow (upload → commit):

```js
api.sendPhotoFromUrl(threadID, url, { text: "optional" }); // also sendPhoto(path) / sendPhotoBuffer(buf)
api.sendVideoFromUrl(threadID, url);                        // sendVideo / sendVideoBuffer
api.sendVoiceFromUrl(threadID, url);                        // sendVoice / sendVoiceBuffer → voice message
```

### Profiles (V2, logout-safe)

`@eryxenx/insta-chat` 2.1.0 adds full-profile methods that never mistake a
rate-limited (429) or login-redirected (302) profile endpoint for a dead
session:

```js
await api.getUserInfoV2(userID)      // { <id>: { username, name, biography, followerCount, ... , profilePicUrlHd } }
await api.getProfilePictureV2(handle, { size: 640 }) // { url, hd, thumb, sizes }
await api.getUserProfile(handle)     // raw merged profile object
await api.getProfileBio(handle)      // { username, name, biography }
await api.getUserFriendship(userID)  // { blocking, isRestricted, isFollowedBy, follows }
await api.getUserID(handle)          // numeric id for an @handle / link
await api.getSelfInfo()              // the bot account's own profile
```

---

## ◈ Profile Commands

The V2 profile plugins ship with matching commands (all by **rX**):

| Command | What it shows |
|---|---|
| `igprofile` | Full profile of a user — name, bio, follower/following/media counts, verified/private/business flags, link, category, HD picture |
| `hdpp` | HD profile picture (optionally at a chosen square size: `hdpp @user 640`) |
| `igbio` | The profile biography ("about") text |
| `igfriend` | Friendship state — follows you, you follow, blocked, restricted, pending requests |
| `igid` | Resolve an `@handle` or profile link to a numeric id |
| `igself` | The bot account's own full profile |

Each accepts the same target forms as the ported commands: reply to a message,
`@mention`, a bare `@handle`, an `instagram.com/<handle>` link, or a numeric id
(with nothing given, they act on you).

> Instagram only lets a web session look up users it has **already seen in a
> chat**, so an `@handle` the bot has never encountered cannot be resolved
> (the username endpoints rate-limit with 429). Reply to or mention the user.

---

## ◈ onReply Pattern

```js
const sent = await message.reply("What's your name?");
global.GoatBot.onReply.set(sent.messageID, {
  commandName: this.config.name,
  messageID: sent.messageID,
  author: event.senderID
});
```

---

## ◈ Latency

Instagram DMs have no push/webhook channel, so the bot **polls the inbox** for
new messages. Reply latency is bounded by the poll interval:

```jsonc
// config.json
"pollInterval": 2000
```

Lower is snappier but sends more requests (rate-limit risk); `1500`–`3000` is a
good range. Default `15000`.

---

## ◈ Credits

**Instabot-Pro** (Instagram core, `@eryxenx/insta-chat` integration, handlers, login
and session handling) is by **EryXenX**.

The command/event architecture and many scripts under `scripts/` are ported from
**GoatBot-Pro**, which is based on **Goat-Bot-V2** by **NTKhang**
(https://github.com/ntkhang03/Goat-Bot-V2). Those files keep their original
`author` fields, and the upstream copyright and license terms continue to apply
to the code taken from them.

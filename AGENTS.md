# Instabot-Pro (workspace: EagleBot-run) — agent notes

Instagram DM bot (GoatBot-Pro port) in `/workspace/project/EagleBot-run`.
Repo: github.com/EryXenX/Eagle-Bot. `scripts/cmds/**` + `scripts/events/**` are
frozen / byte-identical to GoatBot-Pro; only `setting.js`, `pp.js`, `uid.js`,
`adduser.js` may differ.

## Run

```
cd /workspace/project/EagleBot-run
node index.js > run.log 2>&1 &      # supervisor + poller
```

Login comes from `account.txt` (a JSON cookie array). A raw `sessionid` is the
whole account.

## Test harnesses (all under /tmp, sends stubbed so no spam)

- `mockharness.js` — every hook with a mock api/event, captures real bugs.
- `liveprobe.js` — real login + read-only API probes.
- `methodcheck.js` — verifies every FCA method the commands call exists.
- `livecmd.js` — real login + real read APIs, all send methods stubbed, delay
  between commands (`CMD_DELAY` ms). Writes `/tmp/livecmd.json`.
- `liveevents.js` — invokes all 7 event scripts through realistic payloads.
- `eventmock.js` — **offline** (mock api, no network): real `EventNormalizer`
  -> real `handlerAction` -> frozen event files. `THROTTLE=1` makes the first
  `getThreadInfo` resolve null; `GUARD=1` installs `bot/readGuards`. This is the
  definitive "does each event actually do something" test — no rate limits.
- `liveevents2.js` / `pollertest.js` — real `EventNormalizer` + `handlerAction`
  against the live API (can hit 429 if run repeatedly; space them out).
- `dispatchall.js` — **offline** (mock api): drives every command through the
  REAL `handlerAction` (prefix parse -> lookup -> role gate -> onStart) with
  `SENDER=35009311397` (bot admin) so admin-gated commands are reached. Wraps
  each stored `onStart` to record "reached" (handlerAction does not await it).
  Writes `/tmp/dispatchall.json`.
- `livecheck.js` — **live end-to-end**: real login + real reads + real
  `handlerAction`, sends stubbed, small command set with `DELAY` (429-safe).
  `FILES=help.js,uid.js,... SENDER=59605953590`. Writes `/tmp/livecheck.json`.
- `onedebug.js` — one command via the real pipeline, prints its error stack.
- `onecmd.js` — single command (`FILE=`, `TO=`) with a timeout.
- `cmdargs.js` — one command with custom `ARGS=`/`MENTION=`, prints sent bodies.
- `sendorder.js` — mocks the HTTP layer to assert send order (text first, then
  upload, then media) and reply threading.

Run with `NODE_PATH=/workspace/project/EagleBot-run/node_modules`.

Permanent regression tests live in `tools/test/` and run via `npm test`:
`listenKeepAlive.test.js` (poller keeps the process alive) and
`reactionWatcher.test.js` (offline: `onReaction` dispatch, author guard,
one-shot cleanup, coexistence with `reactUnsend`).

`/tmp` is wiped when the container/session recycles, and the bot process does
NOT survive it either — recreate a harness if missing, and restart the bot
detached: `setsid nohup node index.js > run.log 2>&1 < /dev/null &`.

## Results (as of last run)

- 182 commands, 7 events.
- Dispatch (real handlerAction, offline, faithful mock api): **182/182 commands
  reached onStart**; 5 show an error, ALL benign:
  - `bondhu.js`, `tiktok.js` — ENOENT on `scripts/cmds/cache/*_out_*.png`. Mock
    artifact (the stub `sendMessage` drains the attachment stream, then the
    command's own `fs.unlink`/callback races the drain). Both pass in a fresh
    single-command process. Not a bug.
  - `restart.js` — calls `process.exit(2)` on purpose (supervisor relaunch).
  - `trash.js` — external HTTP 429 (rate limit), not code.
  - `emojimean.js` — **upstream/frozen bug**: emojiall.com changed its DOM; the
    old `.emoji_card_content.pointer` node is now the "Extended reading" header
    (no emoji), so `getWikiText.split(':').find(...).trim()` throws. The command
    swallows the throw and dies on the destructure. Fix belongs upstream; leave
    byte-identical unless the user approves a patch.
- 22 commands "reached but sent nothing" — ALL by design or input/attachment/
  external-API gated offline (toggles like `autolink`/`autoreact`/`badwords`
  are onChat/passive; `clear` needs history; `dog`/`meme`/`nokia`/`blur`/`hack`
  need image APIs/attachments; `adminmention`/`eval`/`group_refresh` are onChat).
  Not bugs.
- Faithful mock api: `getUserInfo`/`getUserInfoV2` must return a **keyed map**
  `{ <id>: {...} }` (commands read `userInfo[userID].name`); expose
  `getThreadParticipantIDs`/`getThreadMemberIDs` to fill `event.participantIDs`
  (all.js/ban.js). A mock returning a bare object makes `supportgc`/`all` look
  broken — they aren't.
- 7 events: 0 errors. `autoUpdateInfoThread.js` sends nothing by design (it only
  updates thread records). `antileave.js` needs `logMessageData.leftParticipantFbId
  === author` to fire.
- Removed (FB-only / dead): `acp.js` (#7), `goatstore.js` (#8), `pending.js` (#9).
- Audit config warnings (no `role`/`version`) are cosmetic: the loader defaults
  the role, and nothing reads `version`.

## Fixed during sweep

- `database/controller/usersData.js` `getAvatarUrl()` now falls back to the
  bundled `bot/assets/default-avatar.png` instead of `""`. Canvas commands
  (`rank.js`) call `Canvas.loadImage(avatar)` and crashed with `No such file or
  directory` whenever the profile pic couldn't be resolved (offline, private, or
  live rate-limit). Live impact: `rank` no longer crashes on such users.
- `bot/loader.js` now calls each script's `onLoad({ api, ...models })` once after
  load (GoatBot-Pro parity); `restart.js`/`update.js` rely on it to announce a
  completed restart.
- `bot/handler/reactionWatcher.js` now also dispatches `global.GoatBot.onReaction`
  from the polled thread-detail reaction state (see "Reactions: push, with a
  poll fallback"). Before this, `cmd.js install` on an existing file showed the
  overwrite prompt but reacting to it did nothing, because the adapter never
  emits a `message_reaction` event. It now uses the raw realtime MQTT reaction
  patch as a fast path (~2.5s vs 12s+ polled) with the poller as fallback.
  `tools/test/reactionWatcher.test.js` guards the flow offline, including the push path.

## Events — how they actually work

All 7 event files load AND act on their event (verified offline via eventmock):

| file | fires on | effect |
|---|---|---|
| `welcome.js` | log:subscribe | welcome card |
| `antileave.js` | log:unsubscribe | re-adds the leaver + notice |
| `autoUpdateInfoThread.js` | log:* | refreshes thread/user data |
| `checkwarn.js` | log:subscribe | enforces 3-warn ban |
| `logsbot.js` | log:subscribe/unsubscribe | logs bot add/kick |
| `logMessage.js` | message | console-logs every message (not user-facing) |
| `onEvent.js` | any event | runs the `onEvent` commands (warn/ban/protect/…) |

"Only welcome works" was a throttle artifact, not a dispatch bug: Instagram
429s a web read, the package's read wrapper resolves `null`, and frozen code
destructures it:

```
ERROR EVENT COMMAND | An error occurred calling "autoUpdateThreadInfo":
TypeError: Cannot destructure property 'userInfo' of 'threadInfo_Fca' as it is null.
```

`bot/readGuards.js` (installed in `bot/login/login.js`) retries a `null` result
from `getThreadInfo`/`getUserInfo`/`getUserInfoV2` with a short bounded backoff.
Callback-style calls pass through untouched (a retry would fire the cb twice).

Pitfall: hammering the live read API during testing gets the account
rate-limited (429) for minutes, which also blocks login. Prefer `eventmock.js`.

### Reactions: push, with a poll fallback

The adapter emits **no** `message_reaction` event through the normal path:
`methods/inbox.js` drops REACTION_LOG items (`SKIP_TYPES`) and
`realtime/bridge.js` only accepts bare new-item paths, so a reaction patch is
dropped there too.

But the raw realtime MQTT (Direct message-sync) stream **does** carry reactions,
and they are the fast path. A reaction patch is:

```
/direct_v2/threads/<internal_tid>/items/<iid>/reactions/likes/<reactor_igid>
op: "add" | "remove"   value: { emoji: "❤", ... }
```

`reactor_igid` is already the Instagram id (no fbid mapping needed), and the
patch lands **~1s** after the reaction. The bridge ignores it because the path is
not a bare item; `bot/handler/reactionWatcher.js` listens to the client's
`direct` event itself and processes the thread on an "add".

Two Instagram thread ids exist and must not be confused:
- **inbox / FCA id** — `thread.id` == `thread_fbid` (e.g. `4312096032406629`);
  this is what commands, the DB and `sendMessage` use.
- **internal `thread_id`** (e.g. `340282366841710301281155975261028596837`) —
  what the realtime path carries. `fetchDetail()` **only** accepts the inbox id,
  so the watcher builds a `thread_id -> id` map from the inbox and resolves
  through it.

Reaction state is then read from the thread-detail query, per message:

```
reactions:     [{ reaction: "❤", sender_fbid: "..." }]   // U+FE0F stripped
msg_reactions: [{ sender_fbid: "...", sender_igid: "..." }]
```

`reactionWatcher.js` serves **two** features from that one read:
1. `reactUnsend` — unsend a message when a new matching emoji reaction appears
   (only while `config.reactUnsend.enable` is true).
2. `onReaction` — dispatch commands that registered
   `global.GoatBot.onReaction.set(messageID, { commandName, author, ... })`
   (cmd.js/event.js/prefix/install/update/emojimean/…). Instagram's message ids
   match the thread-detail node ids, so a registration keyed by the id
   `sendMessage` returned resolves directly. When the registered message carries
   a reaction from the entry's `author` (or any user if it names none), the
   watcher feeds a synthetic `message_reaction` event through the real
   `handlerAction`, so the command's `onReaction` runs with the normal
   parameters/role gate. The entry is one-shot (deleted after dispatch).

A new-item patch also triggers a process, so a message is baselined the moment
it is sent — `reactUnsend` then fires on the first reaction, not a tick later.
The round-robin poll (one thread detail per `TICK_MS`, currently 5s) is the
fallback when realtime is unavailable; it also keeps the reactUnsend baseline
fresh. Polling only runs while `reactUnsend.enable` is true **or** an
`onReaction` entry is pending. `connectRealtime()` reconnects on
`disconnected`; a client without `realtimeConnect` (as in the offline test)
simply stays poll-only.

Measured live: reaction → dispatch ~2.5s (was 12s+ polled).

Note: the only reactor a test account can drive is itself, and the watcher
ignores the bot's own reaction — so a live self-test must present a different
`getCurrentUserID()` to the watcher (see the git history) to see the dispatch.
`tools/test/reactionWatcher.test.js` covers the loop offline with a fake api.

### adduser / @handle resolution

Instagram has **no working username lookup for a web session**: `USER_BY_USERNAME`
(302), `USER_SEARCH` (400), `TOPSEARCH` (404/429), `WEB_PROFILE_INFO` (429) all
fail. The only resolver is the offline index the API learns from the inbox and
thread views (`api.getUserByUsername`), which the poller fills on its first
cycle. So `adduser` resolves handles the bot has *seen* (threads it is in);
an unseen handle reports `Cannot get uid of this user (@handle)`. The success
reply names the user via thread roster → user store → offline index.

### Thread records need isGroup

`threadsData` records must carry a boolean `isGroup`. Many frozen commands gate
on it (`notification`: `(await threadsData.getAll()).filter(t => t.isGroup && …)`),
and a missing field silently makes the target list empty — the command answers
success with 0 recipients. `database/controller/threadsData.js` persists it on
create/refreshInfo and backfills old records on first read; `bot/readGuards.js`
re-attaches it to `getThreadList` (the package drops `is_group`, which loadData's
auto-sync consumes). Symptom to watch for in any group command: "0 groups".

### Captioned media sends are two messages

Instagram's DM media mutation (`IGDirectMediaSendMutation`) has **no caption
field** — sending `text`/`caption` is accepted but silently ignored (verified
live: the stored item keeps `body: ""` and `caption: null`). So
`sendMessage({ body, attachment })` is necessarily two messages: the text, then
the media. Text-first is the correct order (the text renders above the image).

The package commits them sequentially, which on the wire leaves a ~0.6-0.8s
gap. `bot/mediaBridge.js` wraps `MediaMethods.prototype._send` to commit the
caption and the media **concurrently** (the media request carries no reply
target, so ordering is not a dependency), keeping the text first while closing
the gap to ~0.3-0.5s. `MediaMethods` is resolved by absolute path because the
package's `exports` map exposes only `.` (no `package.json`, no `src/*`
subpaths). The wrapper lives outside `scripts/cmds/*` (which stay frozen) and is
installed from `InstaBot.js` before commands load.

## Secrets / git hygiene (IMPORTANT)

- `account.txt` is **tracked** but must hold only the placeholder. The working
  tree is where a real cookie gets pasted for testing — NEVER `git add -A` or
  `git commit -a` while it holds a live cookie (that leaks the whole account).
  Restore the placeholder (`git checkout -- account.txt`) before any commit, or
  commit with explicit paths.
- Ignored (safe): `appstate.json(.bak)`, `device.json`, `*.log`, `/database/data/`, `/scripts/cmds/cache/`.
- Untracked runtime dir: `scripts/cmds/tmp/` (JSON backend) — do not commit.

## Git

Embedded token in the remote URL works; `$GITHUB_TOKEN`/`gh` may be invalid.
Confirm before pushing to a protected branch.

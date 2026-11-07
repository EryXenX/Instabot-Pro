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

The poll is **not** skipped just because realtime reports connected: the MQTT
message-sync stream connects and subscribes but delivers nothing on some
datacenter IPs (see `revert(listen): MQTT push never delivered inbound DMs`), and
reactions ride that same stream. Set `reactUnsend.skipPollUnderRealtime: true`
only after confirming push actually delivers on the host; then the poll stops
while the client is up and falls back the moment it drops.

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

## Config is a mutable global, not a constant

`global.GoatBot.config` (`=== global.InstaBot.config`) is **reassigned** by
`/loadconfig` (`scripts/cmds/loadconfig.js`: `global.GoatBot.config =
fs.readJsonSync(dirConfig)`) and by `/setting`-style disk writes. So:

- Never capture it at module scope (`const cfg = global.GoatBot.config;` at the
  top of a command). After a reload the command mutates the **dead** object: it
  replies success and writes `config.json`, but `handlerEvents` — which resolves
  `global.InstaBot.config` **per event** — keeps reading the new object and the
  change has no effect until a restart. Resolve the config **inside** the
  handler (`scripts/cmds/whitelist.js` `liveConfig()`).
- A command that edits `config.json` directly (`scripts/cmds/setting.js`
  `saveConfig()`) must also sync the in-memory object in place, or the gate
  never sees the toggle.
- `bot/compat.js` `buildGoatGlobals` builds the *first* config as a merge of
  `defaultGoatConfig()` and `config.json` (`{ ...defaults, ...registry.config }`),
  so an unknown key added to `config.json` (e.g. `whiteListMode`) survives on
  disk but only reaches the running config after a `/loadconfig` (or restart)
  — `bot/loader.js` `initGlobal` sets `registry.config` to the raw `config.json`.

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

## Inbox 429 / reply latency (Instabot-Pro, `/workspace/instabot-pro`)

The `WARN LISTEN │ ...rate-limiting the inbox poll (HTTP 429)... poll every Nms`
line is **self-inflicted**: the inbox is polled on a fixed interval, so once
Instagram answers 429 every later poll piles another request on the throttle and
the inbox never recovers. Two independent pollers run:

1. the package's inbox poller (`minPollIntervalMs`, floor 15000), and
2. `bot/handler/reactionWatcher.js` — a 5s round-robin thread-detail poll.

The watcher's poll is redundant while its own MQTT push is up: the push carries a
reaction as `/direct_v2/threads/<tid>/items/<iid>/reactions/likes/<reactor>`
(op `add`, emoji in the value) — verified live. `reactUnsend.skipPollUnderRealtime`
stops it (default **true** as of PR #3); the watcher resumes polling whenever the
push drops.

**Realtime push is now the default, with a safety poll.** `config.realtime` is
`true`. The bot owns the session's **single** MQTT connection
(`bot/handler/listen.js`): it connects, subscribes, and exposes the client via
`global.InstaBot.realtimeClient()`. `bot/handler/reactionWatcher.js` only
attaches a `direct` listener to that same connection — it must never dial its
own. A second connection on the same device id makes Instagram route the Direct
stream to the newest subscriber only, which is what made the bot deaf ("connects
and subscribes, receives nothing"). The package enforces one shared connection
too (`sharedRealtimeClient()`, v2.2.0).

Under the push, the inbox poll runs only as a safety net on its own timer
(`config.realtimeSafetyPollMs`, floor 4000) via `InboxMethods.startSafetyPoll()`,
with its own 429 backoff. With `config.realtime: false` the poller is the
guaranteed path at the 15 s floor (`pollInterval`).

**Push and poller ids are reconciled** (`bot/handler/inbound.js`, and the
package's `reconcile`). The push names a message by numeric `item_id` (and the
same `mid` when present); the poller names it by `mid`. `Deduper` drops the
second copy by `mid` or by a `thread+sender+body+timestamp` fingerprint, so the
hybrid never double-replies. The push also names a thread by its internal
`thread_id`; `bot/handler/threadIds.js` (and `InstaClient.resolveThreadID()`)
rewrite it to the inbox id the rest of the bot uses.

`bot/login/login.js` passes `realtime: { enabled: config.realtime, fallback: true }`
and `minPollIntervalMs`; `bot/handler/listen.js` re-arms a push that drops after
subscribing (the package only re-arms a *pre*-subscribe failure).

`config.latencyLog` (default true) prints one `LATENCY` line per reply with
`detect/normalize/handler/send/total` ms, so slowness is measured, not guessed.

To prove inbound delivery on a host: run the listener and send a DM from another
account; the broker does **not** replay history, so an older `seq_id` shows
nothing. `tools/test/realtimeInbound.test.js` covers the decode path offline.

To capture the raw push shape, subscribe a `receive` handler and log topic 146
(message-sync): the `value` field is a JSON string with
`item_id/user_id/text/item_type/timestamp`.

The reaction watcher has its **own** `realtimeConnect()` client, independent of
`login`'s `options.realtime` — that is why `skipPollUnderRealtime` is safe even
with `config.realtime: false`.

`bot/login/login.js` also re-arms a realtime listener that drops *after* it
subscribed: the package only re-arms a *pre*-subscribe failure
(`bot/handler/listen.js`, `REARM_START_MS` 3s → `REARM_MAX_MS` 60s).

## Reply latency: where the 5–6s actually goes

The reply the user sees is `detect` (how late the listener learns of the DM) +
`send` (the outbound call). Measured live on this host:

- **send** — the package's `antiSuspension` pacer, not the network. An isolated
  probe of `waitForTurn()` gave 788 ms / 2839 ms / 3652 ms back-to-back, and
  lowering the gaps dropped it to 140 ms / 824 ms / 668 ms. `config.sendPacing`
  now sets `globalMinGapMs`/`perThreadMinGapMs`/`jitterMs` (`bot/pacing.js`,
  applied in `bot/login/login.js`; defaults were 1500/2500/1500).
- **detect** — the inbox poll interval, so a reply waits on average half of
  `pollInterval`. The package comment says it plainly: "IG has no DM push, so
  reply latency is bounded by one poll cycle".

**The MQTT push does deliver Direct items on this host.** A raw tap on topic 146
(message-sync) captured our own send echoed back in ~105 ms
(`op:add`, `/direct_v2/threads/<tid>/items/<iid>`, `value.item_id/user_id/text`),
which is exactly the shape `src/realtime/bridge.js` decodes. So the push is not
deaf — earlier "0 push events" runs simply had no DM sent during the window.

Enabling `config.realtime` is **still risky**, because when the subscription
succeeds the package does *not* poll at all (`src/methods/inbox.js` `listen()`:
fallback only runs while `!listener._subscribed`) — there is no push+poll safety
net. And the two sources key the same message differently: the push emits
`messageID = item_id` (numeric), the poller emits `node.id` (`mid.$…`), so a
naive hybrid double-replies. A safe realtime mode needs a message-id
reconciliation (e.g. dedupe on `offline_threading_id`) before it can be the
default. Until then the guaranteed path is the poller, and `pollInterval` is the
detect-latency knob.

## A lost reply is a lost command (handler dispatch)

`bot/handler/handlerAction.js` fires the async sub-handlers (`onStart`, `onChat`,
`onReaction`, …) **without awaiting them** — that is upstream GoatBot-Pro order,
so it stays. But an un-awaited rejection (a send that hits a 429 while Instagram
throttles the session) used to escape as a process-level `unhandledRejection`,
so the reply vanished and only a stack trace was logged. Each sub-handler is now
wrapped in a `dispatch(name, fn)` that attaches `.catch()` and logs under
`HANDLER`. `tools/test/handlerDispatch.test.js` guards it (fails on the old code).

## A gate inside `.then(handler)` only covers handler-style commands

`handlerEvents` used to run `isBannedOrOnlyAdmin` (and therefore the whitelist
gate) **inside** the promise callback, only when the command returned a handler
function:

```js
command.onChat(...).then(async (handler) => {
  if (typeof handler === "function") {
    if (isBannedOrOnlyAdmin(...)) return;   // skipped for direct commands
    await handler();
  }
});
```

A command that does its work directly inside `onChat` and returns a value —
`baby.js` (the `baby`/`bby`/`Bot` AI chat) is exactly this — never reached the
check, so a non-whitelisted sender could still trigger it while `onStart`
commands (`/help`, `/pp`) were correctly blocked. The gate now runs **before**
the command is called, in `onChat`/`onFirstChat`, matching `onReply`/
`onReaction`; `onAnyEvent` (which had no gate at all) uses the thread whitelist.
`onFirstChat` gates before marking the thread "first chatted" so a blocked
sender cannot burn the one-shot. When adding a new hook, gate up front — never
inside the `.then(handler)` callback. `tools/test/whitelist.test.js` guards it
with an onChat command that answers directly (fails on the old code).

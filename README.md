# dev-notes-backup

Development notes and test backups for Instabot-Pro. No bot source, no secrets.

- `AGENTS.md` — agent/dev notes (architecture, gotchas, test harnesses,
  latency findings).
- `tools/test/` — the offline regression test suite, kept here as a backup.
  These were written while the bot was built; `main` no longer ships them.
  To run one, copy it into a checkout of `main` (it needs the bot modules)
  and call `node tools/test/<name>.test.js`.

Source lives on `main`.

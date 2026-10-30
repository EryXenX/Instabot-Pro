// Builds public/Instabot-Pro.zip: the bot source without secrets, runtime state,
// caches, logs or node_modules. Run with `npm run package`.
const fs = require("fs-extra");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const STAGE = path.join(ROOT, ".package-stage");
const OUT = path.join(ROOT, "public", "Instabot-Pro.zip");

const EXCLUDE = new Set([
  "node_modules", ".git", "public", ".package-stage", "data", ".cache",
  "account.txt", "device.json", "config.local.json",
  // The lock pins @eryxenx/insta-chat to the in-repo file: dependency, which is
  // not shipped; a fresh install resolves the published version instead.
  "package-lock.json"
]);
  const EXCLUDE_EXT = new Set([".log", ".xml"]);
  // Runtime scratch: welcome.js renders a card to scripts/events/temp_welcome_*.png
  // and unlinks it 5s after send. A crash between the two would otherwise leak
  // ~175 KB per leave into the archive.
  const EXCLUDE_PREFIX = ["temp_welcome_"];
  const EXCLUDE_PATH = new Set([
  "scripts/cmds/cache",
  "scripts/cmds/tmp",
  // Dev-only diagnostics / live test harnesses; not needed by the shipped bot.
  "scripts/probes",
  // Downloaded on demand by up.js's ensureFont(); shipping it adds 11 MB.
  "scripts/cmds/fonts/NotoColorEmoji.ttf",
  // Cookie template trips secret-scan heuristics on delivered archives; the
  // setup steps live in README.md instead.
  "account.txt.example",
  // The standalone @eryxenx/insta-chat package is published to npm and consumed
  // from there — the bot archive must not bundle its source.
  "packages/insta-chat"
]);

function copy(src, dest, rel = "") {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (EXCLUDE.has(entry.name) || entry.name.startsWith("account.txt") || EXCLUDE_PREFIX.some((p) => entry.name.startsWith(p)) || EXCLUDE_EXT.has(path.extname(entry.name)) || EXCLUDE_PATH.has(r)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) { fs.ensureDirSync(to); copy(from, to, r); if (fs.readdirSync(to).length === 0) fs.removeSync(to); }
    else fs.copyFileSync(from, to);
  }
}

fs.removeSync(STAGE);
fs.ensureDirSync(path.join(STAGE, "Instabot-Pro"));
copy(ROOT, path.join(STAGE, "Instabot-Pro"));

// The archive drops packages/insta-chat, so repoint the dependency at the
// published package and remove the (now dangling) packaging script. Honour the
// bot's own dependency spec so the shipped archive installs exactly what the
// bot runs (e.g. a pinned 1.0.5); fall back to the package source version.
const stagedPkgPath = path.join(STAGE, "Instabot-Pro", "package.json");
const stagedPkg = fs.readJsonSync(stagedPkgPath);
const rootPkg = fs.readJsonSync(path.join(ROOT, "package.json"));
const declaredDep = rootPkg.dependencies?.["@eryxenx/insta-chat"];
const pkgVersion = fs.readJsonSync(path.join(ROOT, "packages", "insta-chat", "package.json")).version;
stagedPkg.dependencies["@eryxenx/insta-chat"] = declaredDep && /^[\^~]?\d/.test(declaredDep) ? declaredDep : `^${pkgVersion}`;
if (stagedPkg.scripts) delete stagedPkg.scripts["package:insta-chat"];
fs.writeJsonSync(stagedPkgPath, stagedPkg, { spaces: 2 });

fs.ensureDirSync(path.dirname(OUT));
fs.removeSync(OUT);
execFileSync("python3", ["-c",
  `import shutil;shutil.make_archive(${JSON.stringify(OUT.replace(/\.zip$/, ""))},'zip',${JSON.stringify(STAGE)},'Instabot-Pro')`
], { stdio: "inherit" });
fs.removeSync(STAGE);
console.log("Wrote", path.relative(ROOT, OUT), fs.statSync(OUT).size, "bytes");

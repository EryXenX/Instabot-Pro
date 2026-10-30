// Builds public/insta-chat.zip (package source) and the ready-to-publish npm
// tarball public/eryxenx-insta-chat-<version>.tgz from packages/insta-chat.
// Run with `npm run package:insta-chat`.
const fs = require("fs-extra");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PKG_DIR = path.join(ROOT, "packages", "insta-chat");
const PUBLIC = path.join(ROOT, "public");
const STAGE = path.join(ROOT, ".package-stage-instachat");

const EXCLUDE = new Set([".git", "node_modules", ".package-stage-instachat"]);
const EXCLUDE_PATH = new Set([".github/workflows"]);

function copy(src, dest, rel = "") {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (EXCLUDE_PATH.has(r)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) { fs.ensureDirSync(to); copy(from, to, r); }
    else fs.copyFileSync(from, to);
  }
}

const version = fs.readJsonSync(path.join(PKG_DIR, "package.json")).version;
const zipPath = path.join(PUBLIC, "insta-chat.zip");
const tgzPath = path.join(PUBLIC, `eryxenx-insta-chat-${version}.tgz`);

fs.removeSync(STAGE);
fs.ensureDirSync(path.join(STAGE, "insta-chat"));
copy(PKG_DIR, path.join(STAGE, "insta-chat"));
fs.ensureDirSync(PUBLIC);
fs.removeSync(zipPath);
execFileSync("python3", ["-c",
  `import shutil;shutil.make_archive(${JSON.stringify(zipPath.replace(/\.zip$/, ""))},'zip',${JSON.stringify(STAGE)},'insta-chat')`
], { stdio: "inherit" });
fs.removeSync(STAGE);

// npm pack produces the publish tarball with the package.json `files` filter.
// `npm pack` writes exactly `eryxenx-insta-chat-<version>.tgz` into PUBLIC, so
// no rename is needed — and an older tarball for a different version must not
// be matched (a `startsWith` glob could move a stale 1.0.x over the new one).
for (const f of fs.readdirSync(PUBLIC)) {
  if (/^eryxenx-insta-chat-\d.*\.tgz$/.test(f) && f !== `eryxenx-insta-chat-${version}.tgz`) {
    fs.removeSync(path.join(PUBLIC, f));
  }
}
fs.removeSync(tgzPath);
execFileSync("npm", ["pack", "--pack-destination", PUBLIC], { cwd: PKG_DIR, stdio: "inherit" });
if (!fs.existsSync(tgzPath)) throw new Error(`npm pack did not produce ${tgzPath}`);

console.log("Wrote", path.relative(ROOT, zipPath), fs.statSync(zipPath).size, "bytes");
if (fs.existsSync(tgzPath)) console.log("Wrote", path.relative(ROOT, tgzPath), fs.statSync(tgzPath).size, "bytes");

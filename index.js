const { spawn } = require("child_process");

// Bot process state, surfaced on the health page so a dead/suspended session is
// visible without shell access.
const botState = { status: "starting", code: null, since: Date.now() };

let currentChild = null;
const restartLog = [];
const RESTART_WINDOW_MS = 10 * 60 * 1000;
const RESTART_LIMIT = 3;
const RESTART_DELAY_MS = 5000;

function startProject() {
  botState.status = "starting";
  // No shell wrapper: a shell would keep the real node process alive as an
  // orphan when this supervisor is signalled, and two live pollers on the same
  // account duplicate every inbox event.
  const child = spawn("node", ["InstaBot.js"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: false
  });
  currentChild = child;

  child.on("spawn", () => {
    botState.status = "running";
    botState.since = Date.now();
  });

  child.on("close", (code) => {
    if (currentChild === child) currentChild = null;
    botState.code = code;
    if (code == 2) {
      const now = Date.now();
      restartLog.push(now);
      while (restartLog.length && now - restartLog[0] > RESTART_WINDOW_MS) restartLog.shift();
      if (restartLog.length > RESTART_LIMIT) {
        console.log("Too many restarts in a short time; not restarting InstaBot.");
        botState.status = "stopped";
        return;
      }
      console.log("Restarting InstaBot...");
      botState.status = "restarting";
      setTimeout(startProject, RESTART_DELAY_MS);
    } else {
      // code 1 = fatal (e.g. session invalid / suspended); 0 = clean exit.
      botState.status = "stopped";
    }
  });
}

function stopChild() {
  if (currentChild && currentChild.exitCode === null) {
    try { currentChild.kill("SIGTERM"); } catch (_) {}
  }
}

process.on("SIGINT", () => { stopChild(); process.exit(0); });
process.on("SIGTERM", () => { stopChild(); process.exit(0); });

startProject();

// Render's free plan spins a web service down after ~15 minutes without inbound
// traffic, which stops the DM poller and makes the bot look "not running". Ping
// our own public URL on a timer so the instance stays awake. Set KEEP_ALIVE_URL
// to override; the value is auto-detected on Render. No-op elsewhere.
const keepAliveUrl = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
if (keepAliveUrl) {
  const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS || 10 * 60 * 1000);
  const target = keepAliveUrl.replace(/\/+$/, "") + "/";
  const transport = target.startsWith("https") ? require("https") : require("http");
  const ping = () => {
    transport.get(target, (res) => res.resume()).on("error", () => {});
  };
  setInterval(ping, intervalMs).unref();
  console.log(`Keep-alive pinging ${target} every ${Math.round(intervalMs / 1000)}s`);
}

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  const up = Math.floor((Date.now() - botState.since) / 1000);
  res.send(`InstaBot uptime server\nbot: ${botState.status}${botState.code !== null ? ` (exit ${botState.code})` : ""}\nsince: ${up}s ago`);
});

app.get("/status", (req, res) => {
  res.json(botState);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Uptime server running");
});

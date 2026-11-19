// Auto restart.
//
// config.json ships `autoRestart: { enable: true, time: "1440" }` and the setting
// command edits it, but nothing in the runtime ever read the value, so the
// configured restart never happened. GoatBot-Pro reads `time` as milliseconds, or
// as a cron expression when it is not a number (that needs node-cron, which is not
// a dependency here). A value under a minute is never a deliberate interval and
// would restart-loop, so it is read as minutes instead — "1440" then means a
// daily restart.

const { logger, getText } = require("./utils");

const MIN_AS_MS = 60000;

// Returns the restart delay in milliseconds, or null when no restart is wanted.
// A bare number is milliseconds, as upstream documents; anything under a minute
// would restart-loop, so it is read as minutes instead — which is how "1440"
// (shipped in config.json) means a daily restart rather than 1.4 seconds.
function resolveDelayMs(config) {
  const cfg = config && config.autoRestart;
  if (!cfg || cfg.enable === false) return null;

  const raw = cfg.time;
  if (raw == null || raw === "" || raw === 0 || raw === "0") return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < MIN_AS_MS ? value * MIN_AS_MS : value;
}

function scheduleAutoRestart(config, exit = process.exit) {
  const cfg = config && config.autoRestart;
  const ms = resolveDelayMs(config);
  if (ms == null) {
    if (cfg && cfg.enable !== false && cfg.time != null && Number.isNaN(Number(cfg.time))) {
      logger.warn("AUTO RESTART", getText("InstaBot", "autoRestartCron"));
    }
    return null;
  }
  logger.info("AUTO RESTART", getText("InstaBot", "autoRestart", Math.round(ms / 60000)));
  return setTimeout(() => {
    logger.info("AUTO RESTART", "Restarting...");
    exit(2);
  }, ms);
}

module.exports = { scheduleAutoRestart, resolveDelayMs };

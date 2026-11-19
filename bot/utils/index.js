function getRole(senderID) {
  const config = global.InstaBot.config;
  const adminBot = config.adminBot || [];
  const premiumUsers = config.premiumUsers || [];
  const devUsers = config.devUsers || [];

  if (devUsers.includes(String(senderID))) return 4;
  if (adminBot.includes(String(senderID))) return 2;
  if (premiumUsers.includes(String(senderID))) return 3;
  return 0;
}

function getRoleName(role) {
  const names = {
    0: "Normal User",
    1: "Group Admin",
    2: "Bot Admin",
    3: "Premium User",
    4: "Developer"
  };
  return names[role] || "Unknown";
}

const logger = require("./logger");

// Backwards-compatible `log(type, message)`. New code logs GoatBot-Pro style via
// `logger.info(tag, message)` etc.; both write through the same formatter.
function log(type, msg, ...extra) {
  return logger.log(type, msg, ...extra);
}

module.exports = {
  getRole,
  getRoleName,
  log,
  logger,
  getText: require("../../languages/makeFuncGetLangs.js")
};

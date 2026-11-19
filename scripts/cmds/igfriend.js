// igfriend — friendship state of an Instagram user via getUserFriendship.
//
// Answers from the participant records the bot already learned from the inbox
// (no extra request), so it exposes what Instagram puts in each user's
// friendship_status: blocking, restricted, follows / followed-by and pending
// follow requests.

const { resolveTarget } = require("../../bot/utils/igTarget");

function flag(value) {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

module.exports = {
  config: {
    name: "igfriend",
    aliases: ["igfriendship", "igfs"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "Friendship state of an Instagram user",
    longDescription:
      "Shows whether a user follows the bot, is followed back, is blocked, restricted, or has a pending follow request.",
    category: "info",
    guide: {
      en: "{pn} [reply / @mention / @handle / id]"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    if (typeof api.getUserFriendship !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    const target = await resolveTarget({ api, event, args });

    let fs = null;
    try {
      fs = await api.getUserFriendship(target);
    } catch (error) {
      return message.reply(`⚠️ Friendship lookup failed: ${error.message}`);
    }

    if (!fs || fs.id == null) {
      return message.reply(
        `⚠️ No friendship data for ${target} yet.\n` +
          "The bot only knows users it has seen in a chat — reply to their message or @mention them."
      );
    }

    const who = fs.username ? `@${fs.username}` : fs.id;
    return message.reply(
      `🤝 Friendship with ${who}\n\n` +
        `│ ➡️ Follows you: ${flag(fs.isFollowedBy)}\n` +
        `│ ⬅️ You follow: ${flag(fs.follows)}\n` +
        `│ 🚫 Blocking: ${flag(fs.blocking)}\n` +
        `│ ⛔ Restricted: ${flag(fs.isRestricted)}\n` +
        `│ 📥 Incoming request: ${flag(fs.incomingRequest)}\n` +
        `│ 📤 Outgoing request: ${flag(fs.outgoingRequest)}`
    );
  }
};

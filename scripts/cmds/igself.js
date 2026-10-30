// igself — the logged-in account's own full profile via getSelfInfo.
//
// Unlike another user's profile this always resolves: the session cookie
// carries the account id and the account's own page embeds its full profile.

const { formatProfileCard } = require("../../bot/utils/igProfile");

module.exports = {
  config: {
    name: "igself",
    aliases: ["igme", "igwhoami"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "The bot account's own Instagram profile",
    longDescription: "Shows the full profile of the Instagram account the bot is logged in as.",
    category: "info",
    guide: {
      en: "{pn}"
    }
  },

  onStart: async function ({ api, event, message }) {
    if (typeof api.getSelfInfo !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    let profile = null;
    try {
      profile = await api.getSelfInfo();
    } catch (error) {
      return message.reply(`⚠️ Could not read the bot profile: ${error.message}`);
    }

    if (!profile) {
      return message.reply("⚠️ Could not resolve the bot's own profile.");
    }

    return message.reply(formatProfileCard(profile));
  }
};

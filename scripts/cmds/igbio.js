// igbio — the biography ("about") text of an Instagram user via getProfileBio.

const { resolveTarget } = require("../../bot/utils/igTarget");

module.exports = {
  config: {
    name: "igbio",
    aliases: ["igabout"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "Instagram biography of a user",
    longDescription:
      "Shows the profile biography (about text) of a replied message, @mention, @handle, profile link or id.",
    category: "info",
    guide: {
      en: "{pn} [reply / @mention / @handle / profile link / id]"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    if (typeof api.getProfileBio !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    const target = await resolveTarget({ api, event, args });

    let bio = null;
    try {
      bio = await api.getProfileBio(target);
    } catch (error) {
      return message.reply(`⚠️ Bio lookup failed: ${error.message}`);
    }

    if (!bio || (!bio.username && !bio.id)) {
      return message.reply(
        `⚠️ Could not resolve ${target}.\n` +
          "Instagram only lets the bot look up users it has seen in a chat."
      );
    }

    const who = bio.username ? `@${bio.username}` : bio.name || target;
    const text = bio.biography && bio.biography.trim() ? bio.biography.trim() : "(empty bio)";
    return message.reply(`📝 Bio of ${who}\n\n${text}`);
  }
};

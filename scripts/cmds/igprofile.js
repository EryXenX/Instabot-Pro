// igprofile — full Instagram profile of a user via getUserInfoV2.
//
// V2 returns every field Instagram exposes (username, full name, biography,
// follower/following/media counts, verified/private/business flags, external
// url, category, business contact and the HD picture), and it is logout-safe:
// a rate-limited profile endpoint yields null fields, never a dead session.

const { resolveTarget } = require("../../bot/utils/igTarget");
const { formatProfileCard } = require("../../bot/utils/igProfile");

module.exports = {
  config: {
    name: "igprofile",
    aliases: ["igpfp", "iguser"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "Full Instagram profile of a user",
    longDescription:
      "Shows every profile detail Instagram exposes (name, bio, follower/following/media counts, verified/private/business flags, link, category, HD picture) for a replied message, @mention, @handle, profile link or id.",
    category: "info",
    guide: {
      en: "{pn} [reply / @mention / @handle / profile link / id]"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    if (typeof api.getUserInfoV2 !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    const target = await resolveTarget({ api, event, args });

    let profile = null;
    try {
      const info = await api.getUserInfoV2(target);
      profile = info && info[String(target)] ? info[String(target)] : null;
    } catch (error) {
      return message.reply(`⚠️ Profile lookup failed: ${error.message}`);
    }

    if (!profile) {
      return message.reply(
        `⚠️ Could not resolve a profile for ${target}.\n` +
          "Instagram only lets the bot look up users it has seen in a chat — reply to their message or @mention them."
      );
    }

    return message.reply(formatProfileCard(profile));
  }
};

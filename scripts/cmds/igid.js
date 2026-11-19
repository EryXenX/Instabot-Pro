// igid — resolve an Instagram @handle / profile link to a numeric user id via
// getUserID. Complements uid (which shows a user's handle from their id).

const { resolveTarget } = require("../../bot/utils/igTarget");

module.exports = {
  config: {
    name: "igid",
    aliases: ["igfindid"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "Resolve an Instagram @handle or link to a numeric id",
    longDescription:
      "Resolves a replied message, @mention, @handle, profile link or id to the numeric Instagram user id.",
    category: "utility",
    guide: {
      en: "{pn} [reply / @mention / @handle / profile link]"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    if (typeof api.getUserID !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    const target = await resolveTarget({ api, event, args });

    let id = null;
    try {
      id = await api.getUserID(target);
    } catch (error) {
      return message.reply(`⚠️ Could not resolve the id: ${error.message}`);
    }

    if (!id) {
      return message.reply(
        `⚠️ Could not resolve an id for ${target}.\n` +
          "Instagram only lets the bot look up users it has seen in a chat."
      );
    }

    const handle = /^\d+$/.test(String(target)) ? null : String(target).replace(/^@/, "");
    const link = handle ? `https://instagram.com/${handle}` : `https://instagram.com/${id}`;
    return message.reply(`🆔 ${handle ? "@" + handle : target}\n\n➤ ID: ${id}\n➤ Link: ${link}`);
  }
};

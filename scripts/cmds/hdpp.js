// hdpp — HD profile picture of a user via getProfilePictureV2.
//
// Unlike pp (which serves a small square), this resolves the full-resolution
// picture and can render any square size from the same CDN URL.

const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { resolveTarget } = require("../../bot/utils/igTarget");

module.exports = {
  config: {
    name: "hdpp",
    aliases: ["hdavatar", "igpp"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 0,
    shortDescription: "HD Instagram profile picture of a user",
    longDescription:
      "Fetches a user's profile picture at HD resolution (or a chosen square size) for a replied message, @mention, @handle, profile link or id.",
    category: "media",
    guide: {
      en: "{pn} [reply / @mention / @handle / profile link / id] [size]"
    }
  },

  onStart: async function ({ api, event, args, message, usersData }) {
    if (typeof api.getProfilePictureV2 !== "function") {
      return message.reply("⚠️ Update @eryxenx/insta-chat to 2.1.0+ to use this command.");
    }

    // A trailing all-digits arg is a requested square size, not the target.
    let size;
    if (args.length > 1 && /^\d{2,4}$/.test(args[args.length - 1])) {
      size = Number(args.pop());
    }
    const target = await resolveTarget({ api, event, args });

    let picture = null;
    try {
      picture = await api.getProfilePictureV2(target, size ? { size } : {});
    } catch (error) {
      return message.reply(`⚠️ Could not fetch the profile picture: ${error.message}`);
    }

    const url = picture && (picture.hd || picture.url);
    if (!url) {
      return message.reply(
        `⚠️ No profile picture found for ${target}.\n` +
          "Instagram only lets the bot look up users it has seen in a chat."
      );
    }

    const name = await usersData.getName(String(picture.id || target)).catch(() => String(target));
    const cacheDir = path.join(__dirname, "cache");
    const cachePath = path.join(cacheDir, `hdpp_${Date.now()}.png`);

    try {
      await fs.ensureDir(cacheDir);
      const response = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
      await fs.writeFile(cachePath, response.data);

      await api.sendMessage(
        {
          body: `📸 HD profile picture of ${name}`,
          attachment: fs.createReadStream(cachePath)
        },
        event.threadID,
        () => fs.remove(cachePath),
        event.messageID
      );
    } catch (error) {
      await fs.remove(cachePath).catch(() => {});
      return message.reply(`⚠️ Failed to download the profile picture: ${error.message}`);
    }
  }
};

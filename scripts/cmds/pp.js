const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "pp",
    version: "2.0.0",
    author: "EryXenX",
    countDown: 3,
    role: 0,
    shortDescription: "View Instagram profile picture 📸",
    longDescription: "View profile picture of any user via reply, mention, username, link, or id.",
    category: "media",
    guide: {
      en: "{pn} [reply / @mention / username / profile link / id]"
    }
  },

  onStart: async function ({ api, event, args, usersData }) {
    const cacheDir = path.join(__dirname, "cache");
    const cachePath = path.join(cacheDir, `profile_${Date.now()}.png`);

    try {
      await fs.ensureDir(cacheDir);

      let target;

      if (event.type === "message_reply") {
        target = event.messageReply.senderID;
      } else if (event.mentions && Object.keys(event.mentions).length > 0) {
        target = Object.keys(event.mentions)[0];
      } else if (args[0] && /instagram\.com\//i.test(args[0])) {
        // Frozen getUID extracts the trailing username; getProfilePictureUrl
        // accepts either a numeric id or a username.
        target = api.getUID(args[0]);
      } else if (args[0]) {
        target = args[0];
      } else {
        target = event.senderID;
      }

      // A username / @handle resolves to a numeric id from the users the bot
      // already knows (inbox / thread introspection). Instagram rate-limits
      // username lookups for web sessions, so there is no live fallback.
      if (target && !/^\d+$/.test(String(target))) {
        const handle = String(target).replace(/^@/, "");
        const known = typeof api.getUserByUsername === "function" ? api.getUserByUsername(handle) : null;
        if (known) {
          target = String(known.id || known.pk);
        } else if (args[0]) {
          return api.sendMessage(
            `⚠️ Could not resolve @${handle}. Instagram only lets the bot look up users it has seen in a chat.`,
            event.threadID, event.messageID
          );
        } else {
          target = event.senderID;
        }
      }

      const name = await usersData.getName(target).catch(() => target);

      let imageUrl = null;
      try {
        imageUrl = typeof api.getPictureUrl === "function" ? await api.getPictureUrl(target) : null;
      } catch (e) { imageUrl = null; }

      if (!imageUrl) {
        const info = await api.getUserInfo(String(target)).catch(() => null);
        imageUrl = info && info[String(target)] && (info[String(target)].profileUrl || info[String(target)].thumbSrc);
      }

      if (!imageUrl) {
        return api.sendMessage("⚠️ Could not find a profile picture for this user.", event.threadID, event.messageID);
      }

      const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
      await fs.writeFile(cachePath, response.data);

      await api.sendMessage(
        {
          body: `📸 Profile picture of ${name}`,
          attachment: fs.createReadStream(cachePath)
        },
        event.threadID,
        () => fs.remove(cachePath),
        event.messageID
      );

    } catch (err) {
      console.error("[pp]", err.message);
      api.sendMessage("⚠️ Failed to fetch profile picture. Please try again.", event.threadID, event.messageID);
    }
  }
};
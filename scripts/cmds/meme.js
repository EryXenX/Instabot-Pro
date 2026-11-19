const axios = require("axios");

module.exports = {
  config: {
    name: "meme",
    aliases: [],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "fun",
    guide: "meme",
    countDown: 5
  },

  onStart: async function ({ api, event }) {
    try {
      const { data } = await axios.get("https://meme-api.com/gimme", { timeout: 15000 });
      if (!data?.url) throw new Error("no image");
      return api.sendPhotoFromUrl(event.threadID, data.url, { text: `😂 ${data.title || "Meme"}` });
    } catch (_) {
      return api.sendMessage("❌ Could not fetch a meme.", event.threadID);
    }
  }
};

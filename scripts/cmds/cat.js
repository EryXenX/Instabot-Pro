const axios = require("axios");

module.exports = {
  config: {
    name: "cat",
    aliases: ["meow"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "fun",
    guide: "cat",
    countDown: 5
  },

  onStart: async function ({ api, event }) {
    try {
      const { data } = await axios.get("https://api.thecatapi.com/v1/images/search", { timeout: 15000 });
      const url = data?.[0]?.url;
      if (!url) throw new Error("no image");
      return api.sendPhotoFromUrl(event.threadID, url, { text: "🐱 Here's a cat!" });
    } catch (_) {
      return api.sendMessage("❌ Could not fetch a cat image.", event.threadID);
    }
  }
};

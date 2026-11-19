const axios = require("axios");

module.exports = {
  config: {
    name: "dog",
    aliases: ["doge"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "fun",
    guide: "dog",
    countDown: 5
  },

  onStart: async function ({ api, event }) {
    try {
      const { data } = await axios.get("https://dog.ceo/api/breeds/image/random", { timeout: 15000 });
      const url = data?.message;
      if (!url) throw new Error("no image");
      return api.sendPhotoFromUrl(event.threadID, url, { text: "🐶 Here's a dog!" });
    } catch (_) {
      return api.sendMessage("❌ Could not fetch a dog image.", event.threadID);
    }
  }
};

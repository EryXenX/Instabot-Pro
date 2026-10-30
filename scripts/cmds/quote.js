const axios = require("axios");

module.exports = {
  config: {
    name: "quote",
    aliases: ["qotd"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "fun",
    guide: "quote",
    countDown: 3
  },

  onStart: async function ({ api, event }) {
    const fallback = [
      "The best time to plant a tree was 20 years ago. The second best time is now.",
      "Everything you can imagine is real. - Pablo Picasso",
      "Do what you can, with what you have, where you are. - Theodore Roosevelt"
    ];
    try {
      const { data } = await axios.get("https://zenquotes.io/api/random", { timeout: 10000 });
      const q = data[0];
      if (!q || !q.q) throw new Error("empty");
      return api.sendMessage(`💬 ${q.q}\n- ${q.a}`, event.threadID);
    } catch (_) {
      return api.sendMessage(`💬 ${fallback[Math.floor(Math.random() * fallback.length)]}`, event.threadID);
    }
  }
};

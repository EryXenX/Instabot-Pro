const axios = require("axios");

module.exports = {
  config: {
    name: "joke",
    aliases: ["funny"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "fun",
    guide: "joke",
    countDown: 3
  },

  onStart: async function ({ api, event }) {
    const fallback = [
      "Why don't skeletons fight each other? They don't have the guts.",
      "I'm reading a book about anti-gravity. It's impossible to put down.",
      "Why did the scarecrow win an award? He was outstanding in his field."
    ];
    try {
      const { data } = await axios.get("https://official-joke-api.appspot.com/random_joke", {
        timeout: 10000
      });
      return api.sendMessage(`😂 ${data.setup}\n\n${data.punchline}`, event.threadID);
    } catch (_) {
      return api.sendMessage(`😂 ${fallback[Math.floor(Math.random() * fallback.length)]}`, event.threadID);
    }
  }
};

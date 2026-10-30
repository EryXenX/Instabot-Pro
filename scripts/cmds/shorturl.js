const axios = require("axios");

module.exports = {
  config: {
    name: "shorturl",
    aliases: ["short", "tinyurl"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "utility",
    guide: "shorturl <url>",
    countDown: 5
  },

  onStart: async function ({ api, event, args }) {
    let url = args[0];
    if (!url && event.messageReply) url = event.messageReply.body;
    if (!url || !/^https?:\/\//i.test(url)) {
      return api.sendMessage("⚠️ Usage: shorturl <http(s) url>", event.threadID);
    }

    try {
      const { data } = await axios.get("https://tinyurl.com/api-create.php", {
        params: { url },
        timeout: 15000
      });
      return api.sendMessage(`🔗 ${data}`, event.threadID);
    } catch (_) {
      return api.sendMessage("❌ Could not shorten that URL.", event.threadID);
    }
  }
};

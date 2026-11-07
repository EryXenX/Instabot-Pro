module.exports = {
  config: {
    name: "reverse",
    aliases: ["rev"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "utility",
    guide: "reverse <text>",
    countDown: 3
  },

  onStart: async function ({ api, event, args }) {
    const text = args.join(" ") || (event.messageReply && event.messageReply.body);
    if (!text) return api.sendMessage("⚠️ Usage: reverse <text>", event.threadID);
    const out = [...text].reverse().join("");
    return api.sendMessage(out, event.threadID);
  }
};

module.exports = {
  config: {
    name: "echo",
    aliases: ["say"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "utility",
    guide: "echo <text>",
    countDown: 3
  },

  onStart: async function ({ api, event, args }) {
    const text = args.join(" ") || (event.messageReply && event.messageReply.body);
    if (!text) return api.sendMessage("⚠️ Usage: echo <text>", event.threadID);
    return api.sendMessage(text, event.threadID);
  }
};

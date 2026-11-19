module.exports = {
  config: {
    name: "react",
    aliases: [],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "utility",
    guide: "react <emoji>  (reply to a message)",
    countDown: 3
  },

  onStart: async function ({ api, event, args }) {
    if (!event.messageReply) {
      return api.sendMessage("⚠️ Reply to a message with: react <emoji>", event.threadID);
    }
    const emoji = args[0] || "❤️";
    const res = await api.setMessageReaction(emoji, event.messageReply.messageID, null, event.threadID);
    return res
      ? api.sendMessage(`✅ Reacted with ${emoji}`, event.threadID)
      : api.sendMessage("❌ Could not react.", event.threadID);
  }
};

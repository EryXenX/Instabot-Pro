module.exports = {
  config: {
    name: "coinflip",
    aliases: ["flip", "coin"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "game",
    guide: "coinflip",
    countDown: 3
  },

  onStart: async function ({ api, event }) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    return api.sendMessage(`🪙 It's **${result}**!`, event.threadID);
  }
};

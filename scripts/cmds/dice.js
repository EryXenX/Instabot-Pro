module.exports = {
  config: {
    name: "dice",
    aliases: ["roll"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "game",
    guide: "dice [sides]",
    countDown: 3
  },

  onStart: async function ({ api, event, args }) {
    const sides = Math.min(Math.max(parseInt(args[0], 10) || 6, 2), 1000);
    const roll = Math.floor(Math.random() * sides) + 1;
    return api.sendMessage(`🎲 You rolled a ${roll} (1-${sides})`, event.threadID);
  }
};

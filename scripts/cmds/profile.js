module.exports = {
  config: {
    name: "profile",
    aliases: ["whoami"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "info",
    guide: "profile",
    countDown: 5
  },

  onStart: async function ({ api, event, usersData }) {
    const id = event.senderID;
    const rec = await usersData.get(id);
    const data = rec?.data || {};
    return api.sendMessage(
      `👤 Profile\n\n` +
        `🆔 ID: ${id}\n` +
        `📛 Name: ${event.senderName || id}\n` +
        `💰 Balance: ${data.money ?? 100}$\n` +
        `⭐ Exp: ${data.exp ?? 0}`,
      event.threadID
    );
  }
};

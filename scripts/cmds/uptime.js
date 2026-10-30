module.exports = {
  config: {
    name: "uptime",
    aliases: ["up"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "system",
    guide: "uptime",
    countDown: 3
  },

  onStart: async function ({ api, event }) {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    return api.sendMessage(
      `⏱️ Uptime: ${h}h ${m}m ${s}s\n🧠 RAM: ${mem} MB`,
      event.threadID
    );
  }
};

module.exports = {
  config: {
    name: "logMessage",
    type: "message"
  },

  onStart: async function ({ event }) {
    console.log(`[MSG] ${event.senderID}: ${event.body || ""}`);
  }
};

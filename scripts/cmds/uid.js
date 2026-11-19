module.exports = {
  config: {
    name: "uid",
    version: "2.1.0",
    author: "ArYAN",
    description: "Reply with the Instagram user id of a user",
    category: "utility",
    cooldowns: 5
  },

  onStart: async function ({ message, event }) {
    let target;

    if (event.type === "message_reply" && event.messageReply) {
      target = event.messageReply.senderID;
    } else if (event.mentions && Object.keys(event.mentions).length > 0) {
      target = Object.keys(event.mentions)[0];
    } else {
      target = event.senderID;
    }

    if (target == null || String(target).trim() === "") {
      return message.reply("Could not resolve a user id.");
    }

    // The id is already on the event (the reply's sender, the mention key, or
    // the sender), so reply with it straight away. The old code called
    // api.getUserInfo() first — a live REST lookup — which added seconds of
    // latency to a command that only needs the numeric id.
    return message.reply(String(target));
  }
};
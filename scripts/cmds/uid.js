module.exports = {
  config: {
    name: "uid",
    version: "2.0.0",
    author: "ArYAN",
    description: "Show the Instagram user id (and profile link) of a user",
    category: "utility",
    cooldowns: 5
  },

  onStart: async function ({ api, event }) {
    let target;

    if (event.type === "message_reply") {
      target = event.messageReply.senderID;
    } else if (event.mentions && Object.keys(event.mentions).length > 0) {
      target = Object.keys(event.mentions)[0];
    } else {
      target = event.senderID;
    }

    // Mentions resolve to a numeric id through the users the bot already knows
    // (inbox / thread introspection); Instagram rate-limits username lookups.
    if (target && !/^\d+$/.test(String(target)) && typeof api.getUserByUsername === "function") {
      const known = api.getUserByUsername(String(target).replace(/^@/, ""));
      if (known) target = String(known.id || known.pk);
    }

    try {
      const info = await api.getUserInfo(String(target)).catch(() => null);
      const u = (info && info[String(target)]) || {};
      const username = u.username || null;
      const name = u.name || username || String(target);
      const link = username ? `https://instagram.com/${username}` : `https://instagram.com/${target}`;

      await api.sendMessage(
        `👤 ${name}\n🔗 ${link}\n🆔 ${target}`,
        event.threadID,
        event.messageID
      );
    } catch (error) {
      console.error("Error in UID command:", error);
      api.sendMessage("Error fetching user info: " + error.message, event.threadID, event.messageID);
    }
  }
};
// Demonstrates the three media send methods the API exposes. Media sending
// uses Instagram's web upload flow (mercury/upload.php + IGDirectMediaSendMutation).
module.exports = {
  config: {
    name: "sendmedia",
    aliases: ["sm"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "media",
    guide: "sendmedia <photo|video|voice> <url>",
    countDown: 5
  },

  onStart: async function ({ api, event, args }) {
    const [kind, url] = args;
    const threadID = event.threadID;

    if (!kind || !url) {
      return api.sendMessage(
        "⚠️ Usage:\n" +
          "• sendmedia photo <image-url>\n" +
          "• sendmedia video <mp4-url>\n" +
          "• sendmedia voice <audio-url>",
        threadID
      );
    }

    try {
      if (kind === "photo") {
        // api.sendPhotoFromUrl(threadID, url, { text })
        // also: api.sendPhoto(threadID, filePath) / api.sendPhotoBuffer(threadID, buffer)
        await api.sendPhotoFromUrl(threadID, url, { text: "🖼️ Photo" });
      } else if (kind === "video") {
        // api.sendVideoFromUrl(threadID, url, { text })
        await api.sendVideoFromUrl(threadID, url, { text: "🎬 Video" });
      } else if (kind === "voice") {
        // api.sendVoiceFromUrl(threadID, url, { text })  → sends a voice message
        await api.sendVoiceFromUrl(threadID, url, { text: "🎤 Voice" });
      } else {
        return api.sendMessage("❌ Unknown type. Use photo | video | voice.", threadID);
      }
    } catch (error) {
      return api.sendMessage(`❌ Send failed: ${error.message}`, threadID);
    }
  }
};

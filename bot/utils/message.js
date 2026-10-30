// GoatBot-Pro `utils.message(api, event)` facade, ported for the Instagram
// client (@eryxenx/insta-chat InstaClient). Commands and the handler call
// message.reply / send / reaction / unsend / err / error instead of raw api.*,
// so upstream command files port unchanged. `reply`/`send` also accept a 4th
// `messageID` (or the whole event) so the handler can reply to a specific
// message; the client threads it through as Instagram's reply_to_message_id.

const { getText } = require("./index");

function message(api, event) {
  async function sendMessageError(err) {
    const text =
      typeof err === "object" && !err.stack
        ? JSON.stringify(err, null, 2)
        : `${(err && err.name) || (err && err.error) || "Error"}: ${err && err.message ? err.message : err}`;
    return api.sendMessage(getText("utils", "errorOccurred", text), event.threadID);
  }

  // GoatBot-Pro's handler registers `message.SyntaxError` right before each
  // command call so `message.SyntaxError()` reports the command's guide. The
  // command facade is built per event, so seed it here; the handler overrides it
  // with the real implementation once it knows the command name.
  const syntaxErrorText = () => getText("handlerEvents", "commandSyntaxError", global.InstaBot?.config?.prefix || "/", "");

  return {
    send: async (form, callback, messageID) => api.sendMessage(form, event.threadID, callback, messageID),
    reply: async (form, callback, messageID) =>
      api.sendMessage(form, event.threadID, callback, messageID || event.messageID),
    SyntaxError: async () => api.sendMessage(syntaxErrorText(), event.threadID, undefined, event.messageID),
    unsend: async (messageID, callback) => api.unsendMessage(messageID, callback, event.threadID),
    reaction: async (emoji, messageID, callback) =>
      api.setMessageReaction(emoji, messageID, callback, event.threadID),
    err: async (err) => sendMessageError(err),
    error: async (err) => sendMessageError(err)
  };
}

module.exports = message;

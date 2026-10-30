// GoatBot-Pro `bot/handler/handlerAction.js`, ported. Builds the message facade
// and the event sub-handlers, then invokes them in the upstream order based on
// event.type (message → onFirstChat/onChat/onStart/onReply, reaction →
// onReaction, event → handlerEvent/onEvent, plus onAnyEvent for everything).

const createFuncMessage = require("../utils/message");
const handlerEvents = require("./handlerEvents");

// Upstream signature is handlerAction(api)(event); some call sites (probes,
// older ported code) pass (api, event). Accept both.
module.exports = function handlerActionFactory(api) {
  return async function handlerAction(event) {
    const message = createFuncMessage(api, event);

    const handlerChat = await handlerEvents(api)(event, message);
    if (!handlerChat) return;

    const { onAnyEvent, onFirstChat, onStart, onChat, onReply, onEvent, handlerEvent, onReaction, typ, presence, read_receipt } = handlerChat;

    onAnyEvent();

    // Commands whose config.type matches the event type (e.g. a "message"
    // logger) run before the command dispatch, mirroring the event commands.
    handlerEvent();

    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend":
        onFirstChat();
        onChat();
        onStart();
        onReply();
        break;

      case "event":
        onEvent();
        break;

      case "message_reaction":
        onReaction();
        break;

      case "typ":
        typ();
        break;

      case "presence":
        presence();
        break;

      case "read_receipt":
        read_receipt();
        break;

      default:
        break;
    }
  };
};

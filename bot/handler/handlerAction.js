// GoatBot-Pro `bot/handler/handlerAction.js`, ported. Builds the message facade
// and the event sub-handlers, then invokes them in the upstream order based on
// event.type (message → onFirstChat/onChat/onStart/onReply, reaction →
// onReaction, event → handlerEvent/onEvent, plus onAnyEvent for everything).

const createFuncMessage = require("../utils/message");
const handlerEvents = require("./handlerEvents");
const { logger } = require("../utils");

// The sub-handlers are async and fire in parallel (upstream order), so their
// promises are not awaited here. An un-awaited rejection — e.g. a send that hits
// a 429 while Instagram throttles the session — would otherwise surface as a
// process-level unhandledRejection and the reply is lost with only a stack
// trace. Route every rejection through the logger instead.
function dispatch(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      result.catch((err) => {
        logger.error("HANDLER", `${name}: ${(err && (err.message || err)) || err}`);
      });
    }
  } catch (err) {
    logger.error("HANDLER", `${name}: ${(err && (err.message || err)) || err}`);
  }
}

// Upstream signature is handlerAction(api)(event); some call sites (probes,
// older ported code) pass (api, event). Accept both.
module.exports = function handlerActionFactory(api) {
  return async function handlerAction(event) {
    const message = createFuncMessage(api, event);

    const handlerChat = await handlerEvents(api)(event, message);
    if (!handlerChat) return;

    const { onAnyEvent, onFirstChat, onStart, onChat, onReply, onEvent, handlerEvent, onReaction, typ, presence, read_receipt } = handlerChat;

    dispatch("onAnyEvent", onAnyEvent);

    // Commands whose config.type matches the event type (e.g. a "message"
    // logger) run before the command dispatch, mirroring the event commands.
    dispatch("handlerEvent", handlerEvent);

    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend":
        dispatch("onFirstChat", onFirstChat);
        dispatch("onChat", onChat);
        dispatch("onStart", onStart);
        dispatch("onReply", onReply);
        break;

      case "event":
        dispatch("onEvent", onEvent);
        break;

      case "message_reaction":
        dispatch("onReaction", onReaction);
        break;

      case "typ":
        dispatch("typ", typ);
        break;

      case "presence":
        dispatch("presence", presence);
        break;

      case "read_receipt":
        dispatch("read_receipt", read_receipt);
        break;

      default:
        break;
    }
  };
};

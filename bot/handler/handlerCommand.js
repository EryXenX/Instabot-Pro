// Backwards-compatible entry point. The full GoatBot-Pro handler pipeline lives
// in handlerAction.js (which builds the message facade and calls the event
// sub-handlers). Test probes and older callers invoke handlerCommand(api, event)
// directly, so route that through handlerAction too.

const handlerAction = require("./handlerAction");
const createGetText2 = require("./createGetText2");

async function handlerCommand(api, event) {
  return handlerAction(api)(event);
}

module.exports = handlerCommand;
module.exports.createGetText2 = createGetText2;

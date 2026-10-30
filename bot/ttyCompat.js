// TTY compat for frozen commands.
//
// Upstream GoatBot-Pro ran with a TTY on stdio, so a ported command may call the
// readline cursor helpers unconditionally (cmd.js's install spinner calls
// process.stderr.clearLine()). When the bot runs with stdio redirected to a file
// or a pipe those methods are absent, and the call throws a TypeError that the
// command reports as its own failure. Install no-op fallbacks (real semantics are
// meaningless without a cursor) so the frozen command keeps working.

const METHODS = ["clearLine", "cursorTo", "moveCursor", "clearScreenDown"];

function patchStream(stream) {
  if (!stream) return;
  for (const name of METHODS) {
    if (typeof stream[name] !== "function") stream[name] = () => false;
  }
}

function install() {
  patchStream(process.stderr);
  patchStream(process.stdout);
}

module.exports = { install, patchStream, METHODS };

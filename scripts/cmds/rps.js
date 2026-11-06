const CHOICES = { rock: "🪨", paper: "📄", scissors: "✂️" };
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

module.exports = {
  config: {
    name: "rps",
    aliases: ["rockpaperscissors"],
    version: "1.0",
    author: "EryXenX",
    role: 0,
    category: "game",
    guide: "rps <rock|paper|scissors>",
    countDown: 3
  },

  onStart: async function ({ api, event, args }) {
    const player = (args[0] || "").toLowerCase();
    if (!CHOICES[player]) {
      return api.sendMessage("⚠️ Usage: rps <rock|paper|scissors>", event.threadID);
    }
    const options = Object.keys(CHOICES);
    const bot = options[Math.floor(Math.random() * options.length)];

    let result;
    if (player === bot) result = "🤝 It's a tie!";
    else if (BEATS[player] === bot) result = "🎉 You win!";
    else result = "🤖 I win!";

    return api.sendMessage(
      `You: ${CHOICES[player]}  vs  Me: ${CHOICES[bot]}\n${result}`,
      event.threadID
    );
  }
};

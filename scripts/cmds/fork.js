exports.config = {
  name: "fork",
  version: "1.0.1",
  author: "EryXenX",
  countDown: 0,
  role: 0,
  shortDescription: "Instagram Bot Fork Link",
  longDescription: "Responds with the Instagram bot GitHub repo link when 'fork' or 'repository' is mentioned. Cooldown: 10 seconds.",
  category: "system",
  guide: {
    en: "Type 'fork' or 'repository'"
  }
};

const last = {};
const cool = 10000;

exports.onStart = async function(){};

exports.onChat = async function({event: z, api: y}){
  const t = z.threadID;
  const n = Date.now();
  if(last[t] && n - last[t] < cool) return;

  const m = (z.body || "").toLowerCase().trim();
  if(!m) return;

  const fork = m.includes("fork") || m.includes("repository");

  if(fork){
    y.sendMessage(
`🔗𝗚𝗶𝘁𝗛𝘂𝗯 𝗙𝗼𝗿𝗸 𝗟𝗶𝗻𝗸:
https://github.com/EryXenX/Instabot-Pro.git`,
      t,
      z.messageID
    );

    last[t] = n;
  }
};

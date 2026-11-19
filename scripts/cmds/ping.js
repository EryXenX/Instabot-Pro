const { createCanvas } = require("@napi-rs/canvas");
const { getText } = require("../../bot/utils");

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderPingCard({ ms, uptimeText, username }) {
  const W = 700, H = 380;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1120");
  bg.addColorStop(1, "#161b2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  roundRect(ctx, 24, 24, W - 48, H - 48, 24);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textBaseline = "alphabetic";

  ctx.font = "bold 46px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("🏓 Pong!", 56, 110);

  ctx.font = "bold 64px sans-serif";
  const grad = ctx.createLinearGradient(56, 0, 400, 0);
  grad.addColorStop(0, "#8b5cf6");
  grad.addColorStop(1, "#38bdf8");
  ctx.fillStyle = grad;
  ctx.fillText(`${ms} ms`, 56, 190);

  ctx.font = "22px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(`Uptime: ${uptimeText}`, 56, 240);
  if (username) {
    ctx.fillText(`Bot: @${username}`, 56, 275);
  }

  roundRect(ctx, 56, H - 90, W - 112, 2, 1);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fillText("Instabot-Pro · Instagram", 56, H - 50);

  return canvas.toBuffer("image/png");
}

module.exports = {
  config: {
    name: "ping",
    aliases: ["p"],
    version: "3.0",
    author: "EryXenX",
    role: 0,
    category: "system",
    guide: "ping",
    countDown: 5
  },

  onStart: async function ({ api, event }) {
    const started = Date.now();
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    const ms = Date.now() - started;

    try {
      const buffer = renderPingCard({
        ms,
        uptimeText: `${h}h ${m}m ${s}s`,
        username: api.username
      });
      return await api.sendPhotoBuffer(event.threadID, buffer, {});
    } catch (error) {
      return api.sendMessage(
        getText("ping", "fallback", ms, `${h}h ${m}m ${s}s`, error.message),
        event.threadID
      );
    }
  }
};

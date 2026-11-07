const fs = require("fs-extra");

// Resolve the live config on every call. /loadconfig (and any future reload)
// reassigns global.GoatBot.config to a *fresh* object, so a reference captured
// at require time goes stale: the command would keep mutating the old object
// while the enforcement gate reads the new one — the toggle reports success and
// writes config.json, but nothing actually changes until a restart.
const liveConfig = () => global.GoatBot?.config || global.InstaBot?.config;

const store = (cfg) => {
  const wl = (cfg.whiteListMode ||= { enable: false, whiteListIds: [] });
  wl.whiteListIds = [...new Set((wl.whiteListIds || []).map(String).map(s => s.trim()).filter(Boolean))];
  return wl;
};

const persist = (cfg) =>
  fs.writeFileSync(global.client.dirConfig, JSON.stringify(cfg, null, 2));

const pickTargets = (event, args) => {
  const tagged = Object.keys(event.mentions || {});
  if (tagged.length) return tagged;
  if (event.messageReply) return [String(event.messageReply.senderID)];
  return args.filter(a => /^\d+$/.test(a));
};

const labelUsers = async (usersData, ids) => {
  const rows = await Promise.all(
    ids.map(async id => `  ◈ ${await usersData.getName(id).catch(() => "Unknown")} ➜ ${id}`)
  );
  return rows.join("\n");
};

module.exports = {
  config: {
    name: "whitelist",
    aliases: ["wl"],
    version: "1.7",
    author: "EryXenX",
    countDown: 5,
    role: 2,
    category: "owner",
    shortDescription: { en: "Manage whitelist mode and allowed users" },
    longDescription: { en: "Turn whitelist mode on/off and control which users are allowed to use the bot" },
    guide: {
      en:
        "{pn} on | off  ➜ switch whitelist mode\n" +
        "{pn} add <uid | @tag | reply>  ➜ allow user(s)\n" +
        "{pn} remove <uid | @tag | reply>  ➜ disallow user(s)\n" +
        "{pn} list  ➜ show allowed users"
    }
  },

  langs: {
    en: {
      on: "🟢 Whitelist mode is now ON",
      off: "🔴 Whitelist mode is now OFF",
      status: "📋 Whitelist mode: %1",
      statusBoth: "📋 User whitelist: %1\n📋 Thread whitelist: %2",
      noTarget: "⚠️ Give a UID, tag someone or reply to their message",
      added: "✅ Whitelisted %1 user(s):\n%2",
      existed: "ℹ️ Already whitelisted (%1):\n%2",
      removed: "🗑 Removed %1 user(s):\n%2",
      missing: "ℹ️ Not in whitelist (%1):\n%2",
      list: "👥 Whitelist (%1):\n%2",
      empty: "  (nobody yet)"
    },
    bn: {
      on: "🟢 হোয়াইটলিস্ট মোড এখন চালু",
      off: "🔴 হোয়াইটলিস্ট মোড এখন বন্ধ",
      status: "📋 হোয়াইটলিস্ট মোড: %1",
      statusBoth: "📋 ইউজার হোয়াইটলিস্ট: %1\n📋 থ্রেড হোয়াইটলিস্ট: %2",
      noTarget: "⚠️ UID দিন, কাউকে ট্যাগ করুন অথবা তার মেসেজে রিপ্লাই দিন",
      added: "✅ %1 জনকে হোয়াইটলিস্টে যোগ করা হয়েছে:\n%2",
      existed: "ℹ️ আগে থেকেই আছে (%1):\n%2",
      removed: "🗑 %1 জনকে সরানো হয়েছে:\n%2",
      missing: "ℹ️ লিস্টে নেই (%1):\n%2",
      list: "👥 হোয়াইটলিস্ট (%1):\n%2",
      empty: "  (এখনো কেউ নেই)"
    },
    vi: {
      on: "🟢 Chế độ whitelist đã BẬT",
      off: "🔴 Chế độ whitelist đã TẮT",
      status: "📋 Chế độ whitelist: %1",
      statusBoth: "📋 Whitelist người dùng: %1\n📋 Whitelist nhóm: %2",
      noTarget: "⚠️ Nhập UID, tag hoặc reply tin nhắn của người dùng",
      added: "✅ Đã thêm %1 người dùng:\n%2",
      existed: "ℹ️ Đã có sẵn (%1):\n%2",
      removed: "🗑 Đã xóa %1 người dùng:\n%2",
      missing: "ℹ️ Không có trong danh sách (%1):\n%2",
      list: "👥 Whitelist (%1):\n%2",
      empty: "  (chưa có ai)"
    },
    hi: {
      on: "🟢 Whitelist mode ON ho gaya",
      off: "🔴 Whitelist mode OFF ho gaya",
      status: "📋 Whitelist mode: %1",
      statusBoth: "📋 User whitelist: %1\n📋 Thread whitelist: %2",
      noTarget: "⚠️ UID dein, tag karein ya message par reply karein",
      added: "✅ %1 user(s) whitelist me add hue:\n%2",
      existed: "ℹ️ Pehle se hain (%1):\n%2",
      removed: "🗑 %1 user(s) hataye gaye:\n%2",
      missing: "ℹ️ List me nahi hain (%1):\n%2",
      list: "👥 Whitelist (%1):\n%2",
      empty: "  (abhi koi nahi)"
    }
  },

  onStart: async function ({ message, args, event, usersData, getLang }) {
    const cfg = liveConfig();
    const wl = store(cfg);
    const sub = (args[0] || "").toLowerCase();

    const actions = {
      on() {
        wl.enable = true;
        persist(cfg);
        return getLang("on");
      },

      off() {
        wl.enable = false;
        persist(cfg);
        return getLang("off");
      },

      async add() {
        const targets = [...new Set(pickTargets(event, args.slice(1)))];
        if (!targets.length) return getLang("noTarget");
        const fresh = targets.filter(id => !wl.whiteListIds.includes(id));
        const old = targets.filter(id => wl.whiteListIds.includes(id));
        wl.whiteListIds.push(...fresh);
        persist(cfg);
        const parts = [];
        if (fresh.length) parts.push(getLang("added", fresh.length, await labelUsers(usersData, fresh)));
        if (old.length) parts.push(getLang("existed", old.length, old.map(id => `  ◈ ${id}`).join("\n")));
        return parts.join("\n\n");
      },

      async remove() {
        const targets = [...new Set(pickTargets(event, args.slice(1)))];
        if (!targets.length) return getLang("noTarget");
        const found = targets.filter(id => wl.whiteListIds.includes(id));
        const absent = targets.filter(id => !wl.whiteListIds.includes(id));
        const shown = found.length ? await labelUsers(usersData, found) : "";
        wl.whiteListIds = wl.whiteListIds.filter(id => !found.includes(id));
        persist(cfg);
        const parts = [];
        if (found.length) parts.push(getLang("removed", found.length, shown));
        if (absent.length) parts.push(getLang("missing", absent.length, absent.map(id => `  ◈ ${id}`).join("\n")));
        return parts.join("\n\n");
      },

      async list() {
        const body = wl.whiteListIds.length ? await labelUsers(usersData, wl.whiteListIds) : getLang("empty");
        return getLang("list", wl.whiteListIds.length, body);
      }
    };

    const aliasMap = { "-a": "add", "+": "add", "-r": "remove", "-": "remove", "-l": "list" };
    const key = aliasMap[sub] || sub;

    if (Object.prototype.hasOwnProperty.call(actions, key))
      return message.reply(await actions[key]());

    // The gate enforces the user AND thread whitelists, so report both: with only
    // thread mode on a bare "OFF" would be misleading.
    const threadOn = cfg.whiteListModeThread?.enable === true;
    if (threadOn) {
      return message.reply(getLang("statusBoth", wl.enable ? "ON ✅" : "OFF ❌", "ON ✅"));
    }
    return message.reply(getLang("status", wl.enable ? "ON ✅" : "OFF ❌"));
  }
};

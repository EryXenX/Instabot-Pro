const fs = require("fs");
const path = require("path");

function getPath(obj, keys) {
	return keys.reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, keys, value) {
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		cur[keys[i]] = cur[keys[i]] || {};
		cur = cur[keys[i]];
	}
	cur[keys[keys.length - 1]] = value;
}

function status(val) {
	return val ? "ON ✦" : "OFF ◌";
}

function wrapItem(text, maxWidth) {
	const words = text.split(" ");
	const lines = [];
	let cur = "";
	for (const w of words) {
		const test = cur ? `${cur} ${w}` : w;
		if (test.length > maxWidth && cur) {
			lines.push(cur);
			cur = w;
		} else {
			cur = test;
		}
	}
	if (cur) lines.push(cur);
	return lines;
}

function renderBox(headerIcon, headerTitle, subtitleLines, boxLabel, itemLines, footer) {
	const lines = [`╭─ ${headerIcon} ${headerTitle.toUpperCase()}`];
	subtitleLines.forEach(l => lines.push(`├ ${l}`));
	lines.push("");
	lines.push(`┌─ ${boxLabel.toUpperCase()} ─┐`);
	itemLines.forEach(item => {
		wrapItem(item, 22).forEach(w => lines.push(`│ ${w}`));
	});
	lines.push("└─────────────┘");
	lines.push("");
	lines.push(`╰─ ${footer}`);
	return lines.join("\n");
}

function masked(val) {
	if (val === undefined || val === null || val === "" || val === " ") return "Not set ✕";
	return "Set ✦ (" + String(val).length + " chars)";
}

const BOOL_GROUPS = {
	hideNoti: {
		title: "🔕 Hide Notification Messages",
		path: ["hideNotiMessage"],
		items: [
			["commandNotFound", "Command Not Found"],
			["adminOnly", "Admin Only"],
			["threadBanned", "Thread Banned"],
			["userBanned", "User Banned"],
			["needRoleToUseCmd", "Need Role To Use Cmd"],
			["needRoleToUseCmdOnReply", "…On Reply"],
			["needRoleToUseCmdOnReaction", "…On Reaction"]
		]
	},
	logEvents: {
		title: "📝 Log Events",
		path: ["logEvents"],
		items: [
			["disableAll", "Disable All"],
			["message", "Message"],
			["message_reaction", "Message Reaction"],
			["message_unsend", "Message Unsend"],
			["message_reply", "Message Reply"],
			["event", "Event"],
			["read_receipt", "Read Receipt"],
			["typ", "Typing"],
			["presence", "Presence"]
		]
	}
};

function renderBoolGroupMenu(config, groupKey) {
	const group = BOOL_GROUPS[groupKey];
	const sub = getPath(config, group.path) || {};
	const itemLines = group.items.map(([key, label], i) => `${i + 1}. ${label} — ${status(sub[key])}`);
	return renderBox("⚙️", group.title.replace(/^[^\w]*/, "").trim(), [`Items : ${group.items.length}`], "toggles", itemLines, "Reply a number to toggle, or 0 to go back");
}

const CATEGORIES = [
	{
		title: "🔐 Account & Security",
		items: [
			{ num: 1, label: "Instagram Account" },
			{ num: 17, label: "Credentials (Gmail / reCAPTCHA)" }
		]
	},
	{
		title: "🤖 Bot Behavior",
		items: [
			{ num: 2, label: "Bot Behavior" },
			{ num: 5, label: "No Prefix" },
			{ num: 7, label: "Nickname" },
			{ num: 9, label: "Typing Indicator" }
		]
	},
	{
		title: "👥 Access Control",
		items: [
			{ num: 3, label: "Admin Manage" },
			{ num: 4, label: "Whitelist Manage" },
			{ num: 6, label: "React Unsend" }
		]
	},
	{
		title: "📝 Logging",
		items: [
			{ num: 15, label: "Hide Notification Messages" },
			{ num: 16, label: "Log Events" }
		]
	}
];

function renderCategoryList() {
	const itemLines = CATEGORIES.map((cat, i) => `${i + 1}. ${cat.title.replace(/^[^\w]*/, "").trim()}`);
	return renderBox("⚙️", "Bot Settings", [`Categories : ${CATEGORIES.length}`, "Author : EryXenX"], "categories", itemLines, `Reply 1-${CATEGORIES.length} to enter a category`);
}

function renderCategoryItems(catIndex) {
	const cat = CATEGORIES[catIndex];
	const itemLines = cat.items.map((item, i) => `${i + 1}. ${item.label}`);
	return renderBox("🧩", cat.title.replace(/^[^\w]*/, "").trim(), [`Items : ${cat.items.length}`], "items", itemLines, "Reply a number, or 0 to go back to categories");
}

module.exports = {
	config: {
		name: "setting",
		aliases: ["settings"],
		version: "9.0.0",
		author: "EryXenX",
		countDown: 5,
		role: 2,
		shortDescription: "Bot settings",
		longDescription: "Control every bot setting from chat, organized by category",
		category: "admin",
		guide: "{prefix}setting"
	},

	onStart: async function ({ event, message }) {
		const sent = await message.reply(renderCategoryList());
		global.GoatBot.onReply.set(sent.messageID, {
			commandName: "setting",
			messageID: sent.messageID,
			author: event.senderID,
			state: "categories"
		});
	},

	onReply: async function ({ api, event, Reply, message }) {
		const { author, state } = Reply;
		if (event.senderID !== author) return;

		const configPath = path.join(process.cwd(), "config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		const input = event.body.trim();
		let num = parseInt(input);

		function saveConfig() {
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
		}

		async function sendAndListen(text, newState, extra = {}) {
			const sent = await message.reply(text);
			global.GoatBot.onReply.set(sent.messageID, {
				commandName: "setting",
				messageID: sent.messageID,
				author,
				state: newState,
				...extra
			});
		}

		async function backToCategories() {
			return await sendAndListen(renderCategoryList(), "categories");
		}

		if (state === "categories") {
			const cat = CATEGORIES[num - 1];
			if (!cat) return message.reply(`𝗫 Invalid selection. Reply 1-${CATEGORIES.length}.`);
			return await sendAndListen(renderCategoryItems(num - 1), "categoryItems", { catIndex: num - 1 });
		}

		if (state === "categoryItems") {
			if (num === 0) return backToCategories();
			const cat = CATEGORIES[Reply.catIndex];
			const item = cat && cat.items[num - 1];
			if (!item) return message.reply("𝗫 Invalid selection.");
			num = item.num; // fall through to the existing item logic below
		}

		if (BOOL_GROUPS[state]) {
			const group = BOOL_GROUPS[state];
			if (num === 0) return backToCategories();
			const item = group.items[num - 1];
			if (!item) return message.reply("𝗫 Invalid selection. Reply a number from the list, or 0 to go back.");
			const [key] = item;
			const sub = getPath(config, group.path) || {};
			sub[key] = !sub[key];
			setPath(config, group.path, sub);
			saveConfig();
			if (group.afterToggle) group.afterToggle(api, key, sub[key]);
			return await sendAndListen(renderBoolGroupMenu(config, state), state);
		}

		if (state === "categoryItems" || state === "itemMenu") {
			if (num === 1) {
				const id = api.getCurrentUserID ? api.getCurrentUserID() : null;
				const cachedName = config.nickNameBot || null;
				let me = {};
				try {
					const info = id ? await api.getUserInfo(String(id)) : null;
					me = (info && info[String(id)]) || {};
				} catch (e) { me = {}; }
				const username = me.username || api.username || null;
				const name = me.name || cachedName || null;
				const link = username ? `https://instagram.com/${username}` : null;
				const menu = renderBox("📷", "Instagram Account", [], "account", [
					`1. ${"User ID"} — ${id || "Not logged in ✕"}`,
					`2. ${"Username"} — ${username ? "@" + username : "Not available"}`,
					`3. ${"Name"} — ${name || "Not available"}`,
					`4. ${"Profile"} — ${link || "Not available"}`,
					`5. ${"Session"} — ${config.instagramAccount?.sessionCookie ? "Set ✦" : "Not set ✕"}`
				], "Read-only · login comes from account.txt or instagramAccount.sessionCookie");
				return await sendAndListen(menu, "instagramAccount");
			}
			if (num === 2) {
				const menu = renderBox("🤖", "Bot Behavior", [], "fields", [
					`1. ${"Prefix"} — ${config.prefix || "/"}`,
					`2. ${"Language"} — ${config.language || "en"}`,
					`3. ${"Time Zone"} — ${config.timeZone || "Not set"}`,
					`4. ${"Admin Only"} — ${status(config.adminOnly?.enable)}`,
					`5. ${"Only Admin Box"} — ${status(config.onlyAdminBox)}`,
					`6. ${"Auto Restart Time (cron/ms)"} — ${config.autoRestart?.time ?? "Not set"}`
				], "Reply 1-6");
				return await sendAndListen(menu, "botBehavior");
			}
			if (num === 3) {
				const menu = renderBox("⚙️", "Admin Manage", [], "actions", [
					`1. ${"Add Admin"}`,
					`2. ${"Remove Admin"}`,
					`3. ${"List Admins"}`
				], "Reply 1-3");
				return await sendAndListen(menu, "adminManage");
			}
			if (num === 4) {
				const menu = renderBox("⚙️", "Whitelist Manage", [], "actions", [
					`1. ${"Thread Whitelist"} — ${status(config.whiteListModeThread?.enable)}`,
					`2. ${"Add Thread"}`,
					`3. ${"Remove Thread"}`,
					`4. ${"User Whitelist"} — ${status(config.whiteListMode?.enable)}`,
					`5. ${"Add User"}`,
					`6. ${"Remove User"}`
				], "Reply 1-6");
				return await sendAndListen(menu, "whitelist");
			}
			if (num === 5) {
				config.noPrefix = config.noPrefix || {};
				config.noPrefix.enable = !config.noPrefix.enable;
				saveConfig();
				return message.reply(`✦ No Prefix is now ${status(config.noPrefix.enable)}`);
			}
			if (num === 6) {
				const menu = renderBox("⚙️", "React Unsend", [], "fields", [
					`1. ${"Toggle"} — ${status(config.reactUnsend?.enable)}`,
					`2. ${"Only Admin"} — ${status(config.reactUnsend?.onlyAdmin)}`,
					`3. ${"Add Emoji"}`,
					`4. ${"Remove Emoji"}`,
					`5. ${"List Emojis"}`
				], "Reply 1-5");
				return await sendAndListen(menu, "reactUnsend");
			}
			if (num === 7) {
				const current = config.nickNameBot || "Not set";
				const menu = renderBox("⚙️", "Nickname", [`Current : ${current}`], "actions", [
					`1. ${"Set Nickname (this group)"}`,
					`2. ${"Set Nickname (all groups)"}`,
					`3. ${"Reset Nickname"}`
				], "Reply 1-3");
				return await sendAndListen(menu, "nickname");
			}
			if (num === 9) {
				const menu = renderBox("⚙️", "Typing Indicator", [], "fields", [
					`1. ${"Toggle"} — ${status(config.enableTypingIndicator)}`,
					`2. ${"Duration"} — ${config.typingDuration || 2000}ms`
				], "Reply 1-2");
				return await sendAndListen(menu, "typingIndicator");
			}
			if (num === 15) return await sendAndListen(renderBoolGroupMenu(config, "hideNoti"), "hideNoti");
			if (num === 16) return await sendAndListen(renderBoolGroupMenu(config, "logEvents"), "logEvents");
			if (num === 17) {
				const g = config.credentials?.gmailAccount || {};
				const r = config.credentials?.gRecaptcha || {};
				const menu = renderBox("🔑", "Credentials", [], "fields", [
					`1. ${"Gmail Email"} — ${g.email || "Not set ✕"}`,
					`2. ${"Gmail Client ID"} — ${masked(g.clientId)}`,
					`3. ${"Gmail Client Secret"} — ${masked(g.clientSecret)}`,
					`4. ${"Gmail Refresh Token"} — ${masked(g.refreshToken)}`,
					`5. ${"Gmail API Key"} — ${masked(g.apiKey)}`,
					`6. ${"reCAPTCHA Site Key"} — ${masked(r.siteKey)}`,
					`7. ${"reCAPTCHA Secret Key"} — ${masked(r.secretKey)}`
				], "Reply 1-7");
				return await sendAndListen(menu, "credentials");
			}
		}

		if (state === "instagramAccount") {
			if (num === 0) return backToCategories();
			return message.reply("𝗫 This panel is read-only. Reply 0 to go back.");
		}

		if (state === "botBehavior") {
			if (num === 1) return await sendAndListen("› Reply with new prefix:", "prefixSet");
			if (num === 2) return await sendAndListen("› Reply with new language code (e.g. en, bn):", "languageSet");
			if (num === 3) return await sendAndListen("› Reply with new time zone (e.g. Asia/Dhaka):", "timeZoneSet");
			if (num === 4) {
				config.adminOnly = config.adminOnly || {};
				config.adminOnly.enable = !config.adminOnly.enable;
				saveConfig();
				return message.reply(`✦ Admin Only — ${status(config.adminOnly.enable)}`);
			}
			if (num === 5) {
				config.onlyAdminBox = !config.onlyAdminBox;
				saveConfig();
				return message.reply(`✦ Only Admin Box — ${status(config.onlyAdminBox)}`);
			}
			if (num === 6) return await sendAndListen("› Reply with new Auto Restart time (ms, or cron string, or 'null' to disable):", "autoRestartTimeSet");
		}
		if (state === "prefixSet") {
			if (!input) return message.reply("𝗫 Invalid prefix.");
			config.prefix = input;
			saveConfig();
			return message.reply(`✦ Prefix set to: ${input}`);
		}
		if (state === "languageSet") {
			if (!input) return message.reply("𝗫 Invalid language code.");
			config.language = input;
			saveConfig();
			return message.reply(`✦ Language set to: ${input}`);
		}
		if (state === "timeZoneSet") {
			if (!input) return message.reply("𝗫 Invalid time zone.");
			config.timeZone = input;
			saveConfig();
			return message.reply(`✦ Time Zone set to: ${input}`);
		}
		if (state === "autoRestartTimeSet") {
			config.autoRestart = config.autoRestart || {};
			config.autoRestart.time = input === "null" ? null : (isNaN(num) ? input : num);
			saveConfig();
			return message.reply(`✦ Auto Restart time set to: ${config.autoRestart.time}`);
		}

		if (state === "adminManage") {
			if (num === 1) return await sendAndListen("› Reply with UID or tag user to add as admin:", "adminAdd");
			if (num === 2) {
				const admins = config.adminBot || [];
				if (!admins.length) return message.reply("𝗫 No admins found.");
				const list = admins.map((id, i) => `${i + 1}. ${id}`);
				await message.reply(renderBox("⚙️", "Remove Admin", [], "admins", list, "Reply number"));
				return await sendAndListen("› Waiting...", "adminRemoveSelect");
			}
			if (num === 3) {
				const admins = config.adminBot || [];
				if (!admins.length) return message.reply("𝗫 No admins found.");
				return message.reply(renderBox("⚙️", "Admins", [], "list", admins.map((id, i) => `${i + 1}. ${id}`), "Reply 1 to go back to categories"));
			}
		}

		if (state === "adminAdd") {
			let uid = input;
			if (event.mentions && Object.keys(event.mentions).length > 0) uid = Object.keys(event.mentions)[0];
			if (!uid || isNaN(uid)) return message.reply("𝗫 Invalid UID.");
			config.adminBot = config.adminBot || [];
			if (config.adminBot.includes(uid)) return message.reply("𝗫 Already an admin.");
			config.adminBot.push(uid);
			saveConfig();
			return message.reply(`✦ Added ${uid} as admin.`);
		}

		if (state === "adminRemoveSelect") {
			const admins = config.adminBot || [];
			const idx = num - 1;
			if (isNaN(num) || !admins[idx]) return message.reply("𝗫 Invalid selection.");
			const removed = admins.splice(idx, 1)[0];
			config.adminBot = admins;
			saveConfig();
			return message.reply(`✦ Removed ${removed} from admins.`);
		}

		if (state === "whitelist") {
			if (num === 1) {
				config.whiteListModeThread = config.whiteListModeThread || {};
				config.whiteListModeThread.enable = !config.whiteListModeThread.enable;
				saveConfig();
				return message.reply(`✦ Thread Whitelist is now ${status(config.whiteListModeThread.enable)}`);
			}
			if (num === 2) return await sendAndListen("› Reply with Thread ID to add:", "threadAdd");
			if (num === 3) {
				const threads = config.whiteListModeThread?.whiteListThreadIds || [];
				if (!threads.length) return message.reply("𝗫 No threads found.");
				const list = threads.map((id, i) => `${i + 1}. ${id}`);
				await message.reply(renderBox("⚙️", "Remove Thread", [], "threads", list, "Reply number"));
				return await sendAndListen("› Waiting...", "threadRemoveSelect");
			}
			if (num === 4) {
				config.whiteListMode = config.whiteListMode || {};
				config.whiteListMode.enable = !config.whiteListMode.enable;
				saveConfig();
				return message.reply(`✦ User Whitelist is now ${status(config.whiteListMode.enable)}`);
			}
			if (num === 5) return await sendAndListen("› Reply with UID or tag user to add:", "userAdd");
			if (num === 6) {
				const users = config.whiteListMode?.whiteListIds || [];
				if (!users.length) return message.reply("𝗫 No users found.");
				const list = users.map((id, i) => `${i + 1}. ${id}`);
				await message.reply(renderBox("⚙️", "Remove User", [], "users", list, "Reply number"));
				return await sendAndListen("› Waiting...", "userRemoveSelect");
			}
		}

		if (state === "threadAdd") {
			const tid = input;
			if (!tid || isNaN(tid)) return message.reply("𝗫 Invalid Thread ID.");
			config.whiteListModeThread = config.whiteListModeThread || {};
			config.whiteListModeThread.whiteListThreadIds = config.whiteListModeThread.whiteListThreadIds || [];
			if (config.whiteListModeThread.whiteListThreadIds.includes(tid)) return message.reply("𝗫 Already in whitelist.");
			config.whiteListModeThread.whiteListThreadIds.push(tid);
			saveConfig();
			return message.reply(`✦ Thread ${tid} added.`);
		}

		if (state === "threadRemoveSelect") {
			const threads = config.whiteListModeThread?.whiteListThreadIds || [];
			const idx = num - 1;
			if (isNaN(num) || !threads[idx]) return message.reply("𝗫 Invalid selection.");
			const removed = threads.splice(idx, 1)[0];
			config.whiteListModeThread.whiteListThreadIds = threads;
			saveConfig();
			return message.reply(`✦ Thread ${removed} removed.`);
		}

		if (state === "userAdd") {
			let uid = input;
			if (event.mentions && Object.keys(event.mentions).length > 0) uid = Object.keys(event.mentions)[0];
			if (!uid || isNaN(uid)) return message.reply("𝗫 Invalid UID.");
			config.whiteListMode = config.whiteListMode || {};
			config.whiteListMode.whiteListIds = config.whiteListMode.whiteListIds || [];
			if (config.whiteListMode.whiteListIds.includes(uid)) return message.reply("𝗫 Already in whitelist.");
			config.whiteListMode.whiteListIds.push(uid);
			saveConfig();
			return message.reply(`✦ User ${uid} added.`);
		}

		if (state === "userRemoveSelect") {
			const users = config.whiteListMode?.whiteListIds || [];
			const idx = num - 1;
			if (isNaN(num) || !users[idx]) return message.reply("𝗫 Invalid selection.");
			const removed = users.splice(idx, 1)[0];
			config.whiteListMode.whiteListIds = users;
			saveConfig();
			return message.reply(`✦ User ${removed} removed.`);
		}

		if (state === "reactUnsend") {
			if (num === 1) {
				config.reactUnsend = config.reactUnsend || {};
				config.reactUnsend.enable = !config.reactUnsend.enable;
				saveConfig();
				return message.reply(`✦ React Unsend — ${status(config.reactUnsend.enable)}`);
			}
			if (num === 2) {
				config.reactUnsend = config.reactUnsend || {};
				config.reactUnsend.onlyAdmin = !config.reactUnsend.onlyAdmin;
				saveConfig();
				return message.reply(`✦ Only Admin — ${status(config.reactUnsend.onlyAdmin)}`);
			}
			if (num === 3) return await sendAndListen("› Reply with emoji to add:", "emojiAdd");
			if (num === 4) {
				const emojis = config.reactUnsend?.emojis || [];
				if (!emojis.length) return message.reply("𝗫 No emojis found.");
				const list = emojis.map((e, i) => `${i + 1}. ${e}`);
				await message.reply(renderBox("⚙️", "Remove Emoji", [], "emojis", list, "Reply number"));
				return await sendAndListen("› Waiting...", "emojiRemoveSelect");
			}
			if (num === 5) {
				const emojis = config.reactUnsend?.emojis || [];
				if (!emojis.length) return message.reply("𝗫 No emojis.");
				return message.reply(renderBox("⚙️", "Emojis", [], "list", [emojis.join("  ")], "Reply 1 to go back to categories"));
			}
		}

		if (state === "emojiAdd") {
			const emoji = input.trim();
			if (!emoji) return message.reply("𝗫 Invalid emoji.");
			config.reactUnsend = config.reactUnsend || {};
			config.reactUnsend.emojis = config.reactUnsend.emojis || [];
			if (config.reactUnsend.emojis.includes(emoji)) return message.reply("𝗫 Already added.");
			config.reactUnsend.emojis.push(emoji);
			saveConfig();
			return message.reply(`✦ Emoji ${emoji} added.`);
		}

		if (state === "emojiRemoveSelect") {
			const emojis = config.reactUnsend?.emojis || [];
			const idx = num - 1;
			if (isNaN(num) || !emojis[idx]) return message.reply("𝗫 Invalid selection.");
			const removed = emojis.splice(idx, 1)[0];
			config.reactUnsend.emojis = emojis;
			saveConfig();
			return message.reply(`✦ Emoji ${removed} removed.`);
		}

		if (state === "nickname") {
			if (num === 1) return await sendAndListen("› Reply with new nickname:", "nicknameSet");
			if (num === 2) return await sendAndListen("› Reply with new nickname (will set in all groups):", "nicknameSetAll");
			if (num === 3) {
				config.nickNameBot = "";
				saveConfig();
				try { await api.changeNickname("", event.threadID, api.getCurrentUserID()); } catch (e) { }
				return message.reply("✦ Nickname reset.");
			}
		}

		if (state === "nicknameSet") {
			const nickname = input;
			if (!nickname) return message.reply("𝗫 Invalid nickname.");
			config.nickNameBot = nickname;
			saveConfig();
			try { await api.changeNickname(nickname, event.threadID, api.getCurrentUserID()); } catch (e) { }
			return message.reply(`✦ Nickname set to: ${nickname}`);
		}

		if (state === "nicknameSetAll") {
			const nickname = input;
			if (!nickname) return message.reply("𝗫 Invalid nickname.");
			config.nickNameBot = nickname;
			saveConfig();
			const threads = await api.getThreadList(100, null, ["INBOX"]);
			let success = 0;
			for (const thread of threads) {
				if (!thread.isGroup) continue;
				try { await api.changeNickname(nickname, thread.threadID, api.getCurrentUserID()); success++; } catch (e) { }
			}
			return message.reply(`✦ Nickname set to: ${nickname}\n› Updated in ${success} groups.`);
		}

		if (state === "typingIndicator") {
			if (num === 1) {
				config.enableTypingIndicator = !config.enableTypingIndicator;
				saveConfig();
				return message.reply(`✦ Typing Indicator — ${status(config.enableTypingIndicator)}`);
			}
			if (num === 2) return await sendAndListen("› Reply with duration in milliseconds (e.g. 2000 for 2s):", "typingDurationSet");
		}
		if (state === "typingDurationSet") {
			if (isNaN(num) || num < 500 || num > 15000) return message.reply("𝗫 Invalid duration. Use a value between 500 and 15000 ms.");
			config.typingDuration = num;
			saveConfig();
			return message.reply(`✦ Typing Duration set to: ${num}ms`);
		}

		if (state === "credentials") {
			config.credentials = config.credentials || {};
			config.credentials.gmailAccount = config.credentials.gmailAccount || {};
			config.credentials.gRecaptcha = config.credentials.gRecaptcha || {};
			const fields = [
				["gmailAccount", "email", "Gmail Email"],
				["gmailAccount", "clientId", "Gmail Client ID"],
				["gmailAccount", "clientSecret", "Gmail Client Secret"],
				["gmailAccount", "refreshToken", "Gmail Refresh Token"],
				["gmailAccount", "apiKey", "Gmail API Key"],
				["gRecaptcha", "siteKey", "reCAPTCHA Site Key"],
				["gRecaptcha", "secretKey", "reCAPTCHA Secret Key"]
			];
			const field = fields[num - 1];
			if (!field) return message.reply("𝗫 Invalid selection.");
			const [section, key, label] = field;
			return await sendAndListen(`› Reply with new value for ${label}:`, "credentialSet", { credSection: section, credKey: key });
		}
		if (state === "credentialSet") {
			const { credSection, credKey } = Reply;
			config.credentials[credSection][credKey] = input;
			saveConfig();
			return message.reply("✦ Updated.");
		}
	}
};

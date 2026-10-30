// Per-command language strings (GoatBot-Pro style).
// Keys match each command config.name. Edit here instead of in the command file.
// {pn} -> prefix+name, {p} -> prefix, {n} -> name; %1..%n are args.
module.exports = {
	admin: {
		description: "",
		guide: "admin <add|remove> <uid>",
		text: {
		}
	},
	age: {
		description: "",
		guide: "age <YYYY | DD/MM/YYYY | D Month YYYY | D/Month/YYYY>",
		text: {
		}
	},
	aniinfo: {
		description: "Get anime information using AniList",
		guide: "{pn} [anime name] — shows anime details",
		text: {
		}
	},
	balance: {
		description: "",
		guide: "balance [@mention | reply] | balance transfer <amount> [@mention | reply]",
		text: {
		}
	},
	bet: {
		description: "",
		guide: "bet <amount>",
		text: {
		}
	},
	cat: {
		description: "",
		guide: "cat",
		text: {
		}
	},
	coinflip: {
		description: "",
		guide: "coinflip",
		text: {
		}
	},
	creart: {
		description: "Generate AI image",
		guide: "{pn} <your prompt>",
		text: {
		}
	},
	daily: {
		description: "",
		guide: "daily",
		text: {
		}
	},
	dice: {
		description: "",
		guide: "dice [sides]",
		text: {
		}
	},
	dog: {
		description: "",
		guide: "dog",
		text: {
		}
	},
	echo: {
		description: "",
		guide: "echo <text>",
		text: {
		}
	},
	flux: {
		description: "Generate ultra-realistic AI images with advanced style options",
		guide: "{pn} <prompt> | [style]\n\n📌 Example:\n{pn} a lion in desert | realistic\n{pn} warrior girl with sword | anime\n{pn} cybernetic dragon flying | cyberpunk",
		text: {
			noPrompt: "❗ Please provide a prompt.\n\n📌 Example:\n• flux a lion in jungle | realistic\n• flux dragon on rooftop | fantasy",
			generating: "🖼️ Generating your premium AI image...",
			failed: "❌ Failed to generate image. Please try again later.",
			invalidStyle: "⚠️ Unknown style provided! Using your prompt as is."
		}
	},
	gan: {
		description: "",
		guide: "gan",
		text: {
		}
	},
	help: {
		description: "",
		guide: "help [command]",
		text: {
		}
	},
	joke: {
		description: "",
		guide: "joke",
		text: {
		}
	},
	leaderboard: {
		description: "",
		guide: "leaderboard [exp|money]",
		text: {
		}
	},
	manga: {
		description: "Search Manga info using AniList API",
		guide: "{pn} [manga name] — get manga info from AniList",
		text: {
		}
	},
	math: {
		description: "",
		guide: "math <expression>",
		text: {
		}
	},
	meme: {
		description: "",
		guide: "meme",
		text: {
		}
	},
	owner: {
		description: "",
		guide: "owner",
		text: {
		}
	},
	pet: {
		description: "Pet a user",
		guide: "{p}pet @user",
		text: {
		}
	},
	ping: {
		description: "",
		guide: "ping",
		text: {
		}
	},
	prefix: {
		description: "",
		guide: "prefix",
		text: {
		}
	},
	profile: {
		description: "",
		guide: "profile",
		text: {
		}
	},
	igprofile: {
		description: "Full Instagram profile of a user (all details)",
		guide: "{pn} [reply / @mention / @handle / profile link / id]",
		text: {
		}
	},
	hdpp: {
		description: "HD Instagram profile picture of a user",
		guide: "{pn} [reply / @mention / @handle / profile link / id] [size]",
		text: {
		}
	},
	igbio: {
		description: "Instagram biography (about) of a user",
		guide: "{pn} [reply / @mention / @handle / profile link / id]",
		text: {
		}
	},
	igfriend: {
		description: "Friendship state of an Instagram user",
		guide: "{pn} [reply / @mention / @handle / id]",
		text: {
		}
	},
	igid: {
		description: "Resolve an Instagram @handle or link to a numeric id",
		guide: "{pn} [reply / @mention / @handle / profile link]",
		text: {
		}
	},
	igself: {
		description: "The bot account's own Instagram profile",
		guide: "{pn}",
		text: {
		}
	},
	qrgen: {
		description: "",
		guide: "{pn} [text or link]",
		text: {
		}
	},
	quote: {
		description: "",
		guide: "quote",
		text: {
		}
	},
	react: {
		description: "",
		guide: "react <emoji>  (reply to a message)",
		text: {
		}
	},
	reverse: {
		description: "",
		guide: "reverse <text>",
		text: {
		}
	},
	rps: {
		description: "",
		guide: "rps <rock|paper|scissors>",
		text: {
		}
	},
	say: {
		description: "Google TTS দিয়ে ভয়েসে টেক্সট বলা",
		guide: "{p}say <text>",
		text: {
		}
	},
	sendmedia: {
		description: "",
		guide: "sendmedia <photo|video|voice> <url>",
		text: {
		}
	},
	setlang: {
		description: "Set the default language of the bot for the current chat or all chats",
		guide: "{pn} <language code ISO 639-1>\n   {pn} en\n   {pn} en all  (bot admin: set global default)",
		text: {
			setForAll: "Set default language of the bot to: %1",
			setForCurrent: "Set default language for this chat: %1",
			noPermission: "Only bot admin can use this command",
			langNotFound: "Can't find language: %1",
			currentLang: "🌐 Current language: %1\n📚 Available: %2"
		}
	},
	shorturl: {
		description: "",
		guide: "shorturl <url>",
		text: {
		}
	},
	sing: {
		description: "YouTube theke gaan download",
		guide: "{pn} <song name>\nExample: {pn} mann mera",
		text: {
		}
	},
	slot: {
		description: "",
		guide: "slot <amount>",
		text: {
		}
	},
	tempmail: {
		description: "Token-free tempmail inbox & OTP viewer",
		guide: "",
		text: {
		}
	},
	tid: {
		description: "",
		guide: "tid",
		text: {
		}
	},
	time: {
		description: "",
		guide: "time",
		text: {
		}
	},
	translate: {
		description: "",
		guide: "translate <lang> <text>  (or reply with: translate <lang>)",
		text: {
		}
	},
	uid: {
		description: "",
		guide: "uid",
		text: {
		}
	},
	unsend: {
		description: "",
		guide: "unsend  (reply to a message)",
		text: {
		}
	},
	uptime: {
		description: "",
		guide: "uptime",
		text: {
		}
	},
	video: {
		description: "Search and download a YouTube video",
		guide: "{pn} <video name>",
		text: {
		}
	},
	weather: {
		description: "",
		guide: "weather <city>",
		text: {
		}
	},
	webinfo: {
		description: "Get detailed information about any website",
		guide: "{p}webinfo <url>\nExample: {p}webinfo https://google.com",
		text: {
			missing: "⚠️  Pʟᴇᴀsᴇ Pʀᴏᴠɪᴅᴇ A Vᴀʟɪᴅ Uʀʟ\n📌  Eɢ : webinfo google.com",
			loading: "🔍  Aɴᴀʟʏᴢɪɴɢ Wᴇʙsɪᴛᴇ...\n🌐  %1",
			error: "❌  Fᴀɪʟᴇᴅ Tᴏ Fᴇᴛᴄʜ Wᴇʙ Iɴғᴏ"
		}
	}
};

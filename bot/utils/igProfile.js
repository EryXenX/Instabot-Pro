// Renders a normalized Instagram profile (see @eryxenx/insta-chat getUserInfoV2)
// as a compact monospace card for chat.

function num(value) {
  return value == null ? "—" : Number(value).toLocaleString("en-US");
}

function flag(value) {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function line(label, value) {
  if (value == null || value === "") return "";
  return `│ ${label}: ${value}\n`;
}

function formatProfileCard(profile) {
  if (!profile) return null;
  const handle = profile.username ? `@${profile.username}` : "—";
  let out = "╭─ 👤 𝐏𝐑𝐎𝐅𝐈𝐋𝐄 ─╮\n";
  out += line("📛 Name", profile.name);
  out += line("🏷️ Username", handle);
  out += line("🆔 ID", profile.id);
  out += line("📝 Bio", profile.biography);
  out += line("👥 Followers", num(profile.followerCount));
  out += line("➕ Following", num(profile.followingCount));
  out += line("🖼️ Posts", num(profile.mediaCount));
  out += line("✅ Verified", flag(profile.isVerified));
  out += line("🔒 Private", flag(profile.isPrivate));
  out += line("💼 Business", flag(profile.isBusinessAccount));
  out += line("🔗 Link", profile.externalUrl);
  out += line("🏷️ Category", profile.category);
  out += "╰────────────────╯";
  return out;
}

module.exports = { formatProfileCard };

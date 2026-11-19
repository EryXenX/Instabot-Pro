// Port of GoatBot-Pro database/controller/threadsData.js to the JSON backend.
//
// Thread records keep the upstream shape ({ threadID, threadName, userInfo,
// adminIDs, members, banned, settings, data, createdAt, updatedAt }). IG DMs are
// 1:1, so `create`/`refreshInfo` learn as much as the Chat API exposes and fall
// back gracefully when it exposes nothing.

const { JsonStore } = require("../backend/store");

function api() {
  return global.InstaBot && global.InstaBot.api;
}

// IG threads have no group admins, so every participant is a plain member.
// userInfo is fca-shaped (an array of { id, name, gender }).
function membersFrom(threadInfo) {
  const info = threadInfo.userInfo || [];
  const rows = Array.isArray(info)
    ? info.map((u) => [String(u.id), u])
    : Object.entries(info);
  return rows.map(([userID, u]) => ({
    userID: String(userID),
    name: u.name || null,
    gender: u.gender === undefined ? 0 : u.gender,
    nickname: (threadInfo.nicknames && threadInfo.nicknames[userID]) || null,
    inGroup: true
  }));
}

module.exports = function createThreadsData() {
  const store = new JsonStore("threadsData.json", { idKey: "threadID", nameKey: "threadName" });

  async function fetchThreadInfo(threadID) {
    try {
      const info = await api().getThreadInfo(threadID);
      return (info && (info[threadID] || info)) || {};
    } catch (_) {
      return {};
    }
  }

  async function create(threadID, threadInfo) {
    if (store.existsSync(threadID)) return store.get(threadID);
    const info = threadInfo || (await fetchThreadInfo(threadID));
    const members = membersFrom(info);
    return store.create(threadID, {
      threadID: String(threadID),
      threadName: info.threadName || info.name || null,
      userInfo: info.userInfo || {},
      adminIDs: info.adminIDs || [],
      members,
      // Persisted so group-only commands (notification, setname, …) can tell a
      // group from a 1:1 DM. The thread-info source computes it; the fallback
      // (more than the bot + one other participant) covers payloads that omit it.
      isGroup: typeof info.isGroup === "boolean" ? info.isGroup : members.length > 2,
      banned: {},
      // GoatBot-Pro's new-thread settings defaults; mirrored so ported event
      // scripts (welcome.js/setwelcome.js) behave the same out of the box.
      settings: {
        sendWelcomeMessage: true,
        sendLeaveMessage: true,
        sendRankupMessage: false,
        customCommand: true
      },
      data: {}
    });
  }

  async function refreshInfo(threadID, newThreadInfo) {
    const info = newThreadInfo || (await fetchThreadInfo(threadID));
    if (!store.existsSync(threadID)) await create(threadID, info);
    const patch = {};
    if (info.threadName || info.name) patch.threadName = info.threadName || info.name;
    if (info.userInfo) patch.userInfo = info.userInfo;
    if (info.adminIDs) patch.adminIDs = info.adminIDs;
    if (info.userInfo) patch.members = membersFrom(info);
    if (typeof info.isGroup === "boolean") patch.isGroup = info.isGroup;
    return store.set(threadID, patch);
  }

  // Records written before `isGroup` was persisted have no flag. Backfill it in
  // memory (and on disk) so group-gated frozen commands see a real boolean; the
  // stored participant list is enough to tell a group from a 1:1 DM.
  const isGroupOf = (t) => {
    if (typeof t.isGroup === "boolean") return t.isGroup;
    return Array.isArray(t.members) && t.members.length > 2;
  };
  let backfilled = false;
  async function backfill() {
    if (backfilled) return;
    backfilled = true;
    for (const t of await store.getAll()) {
      if (typeof t.isGroup === "boolean") continue;
      try { store.set(t.threadID, { isGroup: isGroupOf(t) }); } catch (_) {}
    }
  }

  return {
    existsSync: (threadID) => store.existsSync(threadID),
    create,
    refreshInfo,
    getAll: async (...args) => { await backfill(); return store.getAll(...args); },
    get: async (...args) => { await backfill(); return store.get(...args); },
    set: (...args) => store.set(...args),
    deleteKey: (...args) => store.deleteKey(...args),
    remove: (threadID) => store.remove(threadID),
    _store: store
  };
};

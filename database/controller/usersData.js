// Port of GoatBot-Pro database/controller/usersData.js to the JSON backend.
//
// Keeps the upstream user record shape ({ userID, name, gender, vanity, exp,
// money, banned, settings, data, createdAt, updatedAt }) and the promise-based
// interface the ported commands expect. Unlike upstream, `exp`/`money` live at
// the record root (upstream shape) while `data.*` is the per-user scratch bag.

const { JsonStore } = require("../backend/store");

function api() {
  return global.InstaBot && global.InstaBot.api;
}

module.exports = function createUsersData() {
  const store = new JsonStore("usersData.json", { idKey: "userID", nameKey: "name" });

  async function fetchUserInfo(userID) {
    try {
      const info = await api().getUserInfo(userID);
      return (info && (info[userID] || info)) || {};
    } catch (_) {
      return {};
    }
  }

  async function create(userID, userInfo) {
    if (store.existsSync(userID)) return store.get(userID);
    const info = userInfo || (await fetchUserInfo(userID));
    return store.create(userID, {
      userID: String(userID),
      name: info.name || null,
      gender: info.gender === undefined ? null : info.gender,
      vanity: info.vanity === undefined ? null : info.vanity,
      exp: typeof info.exp === "number" ? info.exp : 0,
      money: typeof info.money === "number" ? info.money : 0,
      banned: info.banned || {},
      settings: info.settings || {},
      data: info.data || {}
    });
  }

  async function refreshInfo(userID, newUserInfo) {
    const info = newUserInfo || (await fetchUserInfo(userID));
    if (!store.existsSync(userID)) await create(userID, info);
    const patch = {};
    if (info.name) patch.name = info.name;
    if (info.gender !== undefined) patch.gender = info.gender;
    if (info.vanity !== undefined) patch.vanity = info.vanity;
    return store.set(userID, patch);
  }

  // Canvas-based commands (rank/rankup) call Canvas.loadImage(avatar) and crash
  // when this returns "". A missing/rate-limited profile pic is normal, so fall
  // back to a bundled placeholder instead of an empty string.
  const DEFAULT_AVATAR_PATH = require("path").join(__dirname, "..", "..", "bot", "assets", "default-avatar.png");

  async function getAvatarUrl(userID) {
    const client = api();
    try {
      if (client && typeof client.getProfilePictureUrl === "function") {
        const url = await client.getProfilePictureUrl(userID);
        if (url) return url;
      }
      const info = await fetchUserInfo(userID);
      const url = info.profile_pic_url || info.profilePicUrl || info.avatar;
      if (url) return url;
    } catch (_) {}
    return DEFAULT_AVATAR_PATH;
  }

  const getMoney = async (userID) => Number(await store.get(userID, "money", 0)) || 0;
  const addMoney = async (userID, money) => store.set(userID, (await getMoney(userID)) + Number(money), "money");
  const subtractMoney = async (userID, money) => store.set(userID, (await getMoney(userID)) - Number(money), "money");

  return {
    existsSync: (userID) => store.existsSync(userID),
    getName: (userID) => store.getName(userID),
    getNameInDB: (userID) => store.getNameInDB(userID),
    getAvatarUrl,
    create,
    refreshInfo,
    getAll: (...args) => store.getAll(...args),
    get: (...args) => store.get(...args),
    set: (...args) => store.set(...args),
    deleteKey: (...args) => store.deleteKey(...args),
    getMoney,
    addMoney,
    subtractMoney,
    remove: (userID) => store.remove(userID),
    _store: store
  };
};

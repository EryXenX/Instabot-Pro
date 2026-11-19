// Port of GoatBot-Pro database/controller/globalData.js to the JSON backend.
//
// A keyed blob store used by setalias, guessnumber and the analytics counters.
// Records keep the upstream shape { key, data, createdAt, updatedAt }.

const { JsonStore } = require("../backend/store");

module.exports = function createGlobalData() {
  const store = new JsonStore("globalData.json", { idKey: "key", nameKey: "key" });

  return {
    existsSync: (key) => store.existsSync(key),
    create: (key, data = {}) => store.create(key, { key: String(key), ...data }),
    getAll: (...args) => store.getAll(...args),
    get: (...args) => store.get(...args),
    set: (...args) => store.set(...args),
    deleteKey: (...args) => store.deleteKey(...args),
    remove: (key) => store.remove(key),
    _store: store
  };
};

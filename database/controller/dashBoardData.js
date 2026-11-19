// Port of GoatBot-Pro database/controller/dashBoardData.js to the JSON backend.
//
// Dashboard accounts, keyed by email ({ email, ... }). The IG bot has no web
// dashboard, but the store is kept so backupdata and the json->db migration
// commands behave like upstream.

const { JsonStore } = require("../backend/store");

module.exports = function createDashBoardData() {
  const store = new JsonStore("dashBoardData.json", { idKey: "email", nameKey: "name" });

  return {
    existsSync: (email) => store.existsSync(email),
    create: (data = {}) => store.create(data.email, data),
    getAll: (...args) => store.getAll(...args),
    get: (...args) => store.get(...args),
    set: (...args) => store.set(...args),
    deleteKey: (...args) => store.deleteKey(...args),
    remove: (email) => store.remove(email),
    _store: store
  };
};

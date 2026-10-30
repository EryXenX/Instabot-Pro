// Port of GoatBot-Pro database/controller/index.js.
//
// Upstream switches on config.database.type between MongoDB and SQLite and
// builds Sequelize/Mongoose models. InstaBot ships a JSON backend only, so this
// always builds the JSON controllers and exposes the same `global.db` surface
// (threadsData/usersData/dashBoardData/globalData plus the all*Data arrays and
// model placeholders the ported commands destructure).

const createUsersData = require("./usersData");
const createThreadsData = require("./threadsData");
const createGlobalData = require("./globalData");
const createDashBoardData = require("./dashBoardData");

let cached = null;

module.exports = function connectDatabase() {
  // Idempotent: compat.js builds global.db once at startup, and
  // bot/login/loadData.js also asks for the controller. A second
  // instantiation would replace global.db with fresh empty stores and drop
  // any in-memory rows, so hand back the first handle instead.
  if (cached) return cached;

  const usersData = createUsersData();
  const threadsData = createThreadsData();
  const globalData = createGlobalData();
  const dashBoardData = createDashBoardData();

  global.db = {
    threadModel: null,
    userModel: null,
    dashBoardModel: null,
    globalModel: null,
    threadsData,
    usersData,
    globalData,
    dashBoardData,
    sequelize: null,
    receivedTheFirstMessage: {}
  };

  // Upstream exposes the in-memory rows as plain arrays; the ported commands
  // read them with Array methods (`.find`, `.findIndex`).
  for (const [prop, store] of [
    ["allThreadData", threadsData],
    ["allUserData", usersData],
    ["allDashBoardData", dashBoardData],
    ["allGlobalData", globalData]
  ]) {
    Object.defineProperty(global.db, prop, {
      enumerable: true,
      configurable: true,
      get: () => store._store.rows
    });
  }

  cached = {
    threadModel: null,
    userModel: null,
    dashBoardModel: null,
    globalModel: null,
    threadsData,
    usersData,
    globalData,
    dashBoardData,
    sequelize: null,
    databaseType: "json"
  };
  return cached;
};

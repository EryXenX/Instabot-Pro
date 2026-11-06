// JSON-file backed collection used by the GoatBot-Pro database controllers.
//
// GoatBot-Pro's controllers sit on MongoDB/SQLite models but expose the same
// promise-based interface regardless of backend. InstaBot ships a JSON backend
// only, so this class provides that interface (get/set/getAll/create/deleteKey/
// remove/existsSync plus the name lookups) over a single JSON file, keeping the
// upstream record shapes so ported commands see the fields they expect:
//
//   user   { userID, name, gender, vanity, exp, money, banned, settings, data }
//   thread { threadID, threadName, userInfo, adminIDs, members, banned,
//            settings, data, createdAt, updatedAt }
//   global { key, ... }        dashboard { email, ... }
//
// Writes are debounced so a burst of commands doesn't thrash the disk.

const fs = require("fs-extra");
const path = require("path");
const _ = require("lodash");

const DATA_DIR = path.join(__dirname, "..", "data");

// Database records in GoatBot-Pro carry timestamps formatted the same way.
function now() {
  return require("moment-timezone").tz().format();
}

// `get(id, path, default, query)` / `set(id, value, path, query)` accept the
// query as the last argument. Ported commands pass either a string, an object
// (a GraphQL-ish projection) or a function, so an object/function in the path
// slot is really the query, not a path.
function splitQuery(path, query) {
  if (typeof path === "object" || typeof path === "function") return { path: undefined, query: path };
  return { path, query };
}

// Emulate the upstream `fakeGraphql` projection: return only the requested keys
// (objects recurse; a truthy leaf means "keep"). Unknown shapes pass through.
function project(record, query) {
  if (!query || !record) return record;
  if (typeof query === "function") return query(record);
  if (typeof query !== "object") return record;
  const out = {};
  for (const key of Object.keys(query)) {
    const spec = query[key];
    if (spec && typeof spec === "object" && !Array.isArray(spec)) out[key] = project(record[key], spec);
    else out[key] = record[key];
  }
  return out;
}

class JsonStore {
  constructor(file, { nameKey = "name", idKey = "id", altNameKeys = [] } = {}) {
    this.file = path.join(DATA_DIR, file);
    this.nameKey = nameKey;
    this.idKey = idKey;
    this.altNameKeys = altNameKeys;
    this._timer = null;
    fs.ensureDirSync(DATA_DIR);
    this._load();
  }

  _load() {
    try {
      const raw = fs.readJsonSync(this.file);
      this.rows = Array.isArray(raw) ? raw : Object.values(raw || {});
    } catch (_) {
      this.rows = [];
    }
  }

  _flush() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      try {
        fs.writeJsonSync(this.file, this.rows, { spaces: 2 });
      } catch (error) {
        console.error(`[data] failed to save ${this.file}:`, error.message);
      }
    }, 500);
  }

  _find(id) {
    return this.rows.find((r) => String(r[this.idKey]) == String(id));
  }

  _nameOf(rec) {
    if (!rec) return null;
    return rec[this.nameKey] || this.altNameKeys.reduce((acc, k) => acc || rec[k], null) || null;
  }

  // Async to match GoatBot-Pro's sequelize-backed store, whose callers write
  // `await usersData.getName(id).catch(...)`; returning a promise keeps those
  // chains working.
  async getName(id) {
    const rec = this._find(id);
    return this._nameOf(rec) || String(id);
  }

  getNameInDB(id) {
    const rec = this._find(id);
    return this._nameOf(rec);
  }

  async getAvatarUrl() {
    return "";
  }

  async refreshInfo() {
    return true;
  }

  existsSync(id) {
    return Boolean(this._find(id));
  }

  getAll(path, defaultValue) {
    let rows = _.cloneDeep(this.rows);
    if (typeof path === "string") rows = rows.map((r) => _.get(r, path, defaultValue));
    return Promise.resolve(rows);
  }

  get(id, path, defaultValue, query) {
    ({ path, query } = splitQuery(path, query));
    const rec = this._find(id);
    if (!rec) return Promise.resolve(_.cloneDeep(defaultValue));
    const value = path === undefined ? rec : _.get(rec, path, defaultValue);
    return Promise.resolve(_.cloneDeep(value === undefined ? defaultValue : value));
  }

  create(id, value = {}) {
    const existing = this._find(id);
    if (existing) return Promise.resolve(_.cloneDeep(existing));
    const rec = { [this.idKey]: String(id), ...value };
    if (rec.createdAt === undefined) rec.createdAt = now();
    rec.updatedAt = now();
    this.rows.push(rec);
    this._flush();
    return Promise.resolve(_.cloneDeep(rec));
  }

  set(id, value, path, query) {
    ({ path, query } = splitQuery(path, query));
    let rec = this._find(id);
    if (!rec) {
      rec = { [this.idKey]: String(id), createdAt: now() };
      this.rows.push(rec);
    }
    if (path) {
      // Upstream merges into a copy of the changed root key's subtree rather
      // than replacing the whole key, so writing "data.money" keeps the rest of
      // `data` intact.
      const rootKey = String(path).split(".")[0];
      const patch = { [rootKey]: _.cloneDeep(rec[rootKey] ?? {}) };
      _.set(patch, path, value);
      Object.assign(rec, patch);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      _.merge(rec, value);
    }
    rec.updatedAt = now();
    this._flush();
    return Promise.resolve(_.cloneDeep(rec));
  }

  deleteKey(id, path) {
    const rec = this._find(id);
    if (!rec || !path) return Promise.resolve(false);
    _.unset(rec, path);
    this._flush();
    return Promise.resolve(true);
  }

  remove(id) {
    const index = this.rows.findIndex((r) => String(r[this.idKey]) == String(id));
    if (index !== -1) {
      this.rows.splice(index, 1);
      this._flush();
    }
    return Promise.resolve(true);
  }
}

module.exports = { JsonStore, project, now, DATA_DIR };
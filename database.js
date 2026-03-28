const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const dbPath = path.join(dataDir, 'deadzone.db');

// ── TRY NATIVE better-sqlite3, FALL BACK TO sql.js ──────
let db = null;
let useSqlJs = false;

try {
  const BetterSqlite3 = require('better-sqlite3');
  db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
} catch {
  useSqlJs = true;
}

// ── sql.js COMPAT LAYER (only used when better-sqlite3 unavailable) ──

class SqlJsStatement {
  constructor(rawDb, sql, saveFn) {
    this._rawDb = rawDb;
    this._sql = sql;
    this._save = saveFn;
  }
  run(...params) {
    this._rawDb.run(this._sql, params);
    this._save();
    const rowId = this._rawDb.exec("SELECT last_insert_rowid()");
    return {
      changes: this._rawDb.getRowsModified(),
      lastInsertRowid: rowId[0]?.values[0]?.[0],
    };
  }
  get(...params) {
    const stmt = this._rawDb.prepare(this._sql);
    try {
      if (params.length) stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally { stmt.free(); }
  }
  all(...params) {
    const stmt = this._rawDb.prepare(this._sql);
    try {
      if (params.length) stmt.bind(params);
      const res = [];
      while (stmt.step()) res.push(stmt.getAsObject());
      return res;
    } finally { stmt.free(); }
  }
}

class SqlJsDb {
  constructor(rawDb, filename) {
    this._rawDb = rawDb;
    this._filename = filename;
  }
  _save() {
    fs.writeFileSync(this._filename, Buffer.from(this._rawDb.export()));
  }
  pragma() {}
  exec(sql) {
    this._rawDb.exec(sql);
    this._save();
  }
  prepare(sql) {
    return new SqlJsStatement(this._rawDb, sql, () => this._save());
  }
  transaction(fn) {
    const self = this;
    return function(...args) {
      self._rawDb.exec('BEGIN');
      try {
        const result = fn(...args);
        self._rawDb.exec('COMMIT');
        self._save();
        return result;
      } catch(e) {
        self._rawDb.exec('ROLLBACK');
        throw e;
      }
    };
  }
}

// ── EXPORTED STATEMENT REFERENCES ────────────────────────
// These get populated in setupDb() and are used by server.js

const exp = module.exports = {};

function setupDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try { db.exec('ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN active_operator TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_normal_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_runner_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_tank_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_spitter_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_boss_kills INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_damage_dealt INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_damage_taken INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_healed INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_xp_earned INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_deaths INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_rescues INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN total_waves INTEGER DEFAULT 0'); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_skills (
      user_id INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, skill_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_weapons (
      user_id INTEGER NOT NULL,
      weapon_id TEXT NOT NULL,
      owned INTEGER NOT NULL DEFAULT 1,
      dmg_level INTEGER DEFAULT 0,
      range_level INTEGER DEFAULT 0,
      rate_level INTEGER DEFAULT 0,
      reload_level INTEGER DEFAULT 0,
      mag_level INTEGER DEFAULT 0,
      acc_level INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, weapon_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_perks (
      user_id INTEGER NOT NULL,
      perk_id TEXT NOT NULL,
      PRIMARY KEY (user_id, perk_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_operators (
      user_id INTEGER NOT NULL,
      operator_id TEXT NOT NULL,
      owned INTEGER NOT NULL DEFAULT 1,
      active_level INTEGER DEFAULT 0,
      passive_level INTEGER DEFAULT 0,
      buff_level INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, operator_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.prepare("DELETE FROM user_skills WHERE skill_id IN ('quick_reload', 'trigger_finger')").run();

  exp.createUser = db.prepare('INSERT INTO users (name, password_hash) VALUES (?, ?)');
  exp.findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
  exp.addXp = db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?');
  exp.getUser = db.prepare('SELECT id, name, xp, gold, diamonds, active_operator FROM users WHERE id = ?');
  exp.getUserSkills = db.prepare('SELECT skill_id, level FROM user_skills WHERE user_id = ?');
  exp.upsertSkill = db.prepare(`
    INSERT INTO user_skills (user_id, skill_id, level) VALUES (?, ?, 1)
    ON CONFLICT(user_id, skill_id) DO UPDATE SET level = level + 1
  `);
  exp.deleteUserSkills = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
  exp.setXp = db.prepare('UPDATE users SET xp = ? WHERE id = ?');

  exp.getUserWeapons = db.prepare('SELECT * FROM user_weapons WHERE user_id = ?');
  exp.getWeapon = db.prepare('SELECT * FROM user_weapons WHERE user_id = ? AND weapon_id = ?');
  exp.buyWeapon = db.prepare('INSERT INTO user_weapons (user_id, weapon_id) VALUES (?, ?)');
  exp.deleteUserWeapons = db.prepare('DELETE FROM user_weapons WHERE user_id = ?');

  exp.getUserPerks = db.prepare('SELECT perk_id FROM user_perks WHERE user_id = ?');
  exp.buyPerk = db.prepare('INSERT OR IGNORE INTO user_perks (user_id, perk_id) VALUES (?, ?)');
  exp.deleteUserPerks = db.prepare('DELETE FROM user_perks WHERE user_id = ?');

  exp.getUserOperators = db.prepare('SELECT * FROM user_operators WHERE user_id = ?');
  exp.getOperator = db.prepare('SELECT * FROM user_operators WHERE user_id = ? AND operator_id = ?');
  exp.buyOperator = db.prepare('INSERT OR IGNORE INTO user_operators (user_id, operator_id) VALUES (?, ?)');
  exp.setActiveOperator = db.prepare('UPDATE users SET active_operator = ? WHERE id = ?');
  exp.resetOperatorUpgrades = db.prepare('UPDATE user_operators SET active_level = 0, passive_level = 0, buff_level = 0 WHERE user_id = ?');

  exp.upgradeOperatorSlot = function(userId, operatorId, slot) {
    const validSlots = ['active', 'passive', 'buff'];
    if (!validSlots.includes(slot)) throw new Error('Invalid slot');
    db.prepare(`UPDATE user_operators SET ${slot}_level = ${slot}_level + 1 WHERE user_id = ? AND operator_id = ?`).run(userId, operatorId);
  };

  exp.addGold = db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?');
  exp.setGold = db.prepare('UPDATE users SET gold = ? WHERE id = ?');
  exp.addDiamonds = db.prepare('UPDATE users SET diamonds = diamonds + ? WHERE id = ?');

  exp.upgradeWeaponStat = function(userId, weaponId, stat) {
    const validStats = ['dmg', 'range', 'rate', 'reload', 'mag', 'acc'];
    if (!validStats.includes(stat)) throw new Error('Invalid stat');
    db.prepare(`UPDATE user_weapons SET ${stat}_level = ${stat}_level + 1 WHERE user_id = ? AND weapon_id = ?`).run(userId, weaponId);
  };

  exp.addStats = db.prepare(`UPDATE users SET
    total_kills = total_kills + ?,
    total_normal_kills = total_normal_kills + ?,
    total_runner_kills = total_runner_kills + ?,
    total_tank_kills = total_tank_kills + ?,
    total_spitter_kills = total_spitter_kills + ?,
    total_boss_kills = total_boss_kills + ?,
    total_damage_dealt = total_damage_dealt + ?,
    total_damage_taken = total_damage_taken + ?,
    total_healed = total_healed + ?,
    total_xp_earned = total_xp_earned + ?,
    total_waves = CASE WHEN ? > total_waves THEN ? ELSE total_waves END
    WHERE id = ?`);

  exp.getStats = db.prepare('SELECT total_kills, total_normal_kills, total_runner_kills, total_tank_kills, total_spitter_kills, total_boss_kills, total_damage_dealt, total_damage_taken, total_healed, total_xp_earned, total_deaths, total_rescues, total_waves FROM users WHERE id = ?');

  exp.incrementDeaths = db.prepare('UPDATE users SET total_deaths = total_deaths + 1 WHERE id = ?');
  exp.incrementRescues = db.prepare('UPDATE users SET total_rescues = total_rescues + 1 WHERE id = ?');
  exp.updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

  exp.applyDeath = db.transaction((userId) => {
    const user = exp.getUser.get(userId);
    if (!user) return null;
    const newXp = Math.floor(user.xp * 0.25);
    exp.setXp.run(newXp, userId);
    exp.setGold.run(0, userId);
    exp.deleteUserSkills.run(userId);
    exp.deleteUserWeapons.run(userId);
    exp.deleteUserPerks.run(userId);
    exp.resetOperatorUpgrades.run(userId);
    exp.incrementDeaths.run(userId);
    return { xp: newXp, gold: 0, diamonds: user.diamonds };
  });
}

// If better-sqlite3 loaded, set up immediately (zero-cost path)
if (!useSqlJs) {
  setupDb();
}

// Async init for sql.js fallback. No-op if better-sqlite3 works.
exp.init = async function() {
  if (!useSqlJs) return; // already set up
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  let rawDb;
  try {
    const buffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(buffer);
  } catch {
    rawDb = new SQL.Database();
  }
  db = new SqlJsDb(rawDb, dbPath);
  setupDb();
  console.log('[DB] Using sql.js (pure JS SQLite)');
};

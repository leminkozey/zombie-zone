const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'deadzone.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// safe migrations for gold/diamonds
try { db.exec('ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0'); } catch {}

// safe migrations for stats tracking
try { db.exec('ALTER TABLE users ADD COLUMN total_kills INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN total_normal_kills INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN total_runner_kills INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN total_tank_kills INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN total_spitter_kills INTEGER DEFAULT 0'); } catch {}
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

// remove deprecated skills
db.prepare("DELETE FROM user_skills WHERE skill_id IN ('quick_reload', 'trigger_finger')").run();

const createUser = db.prepare('INSERT INTO users (name, password_hash) VALUES (?, ?)');
const findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
const addXp = db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?');
const getUser = db.prepare('SELECT id, name, xp, gold, diamonds FROM users WHERE id = ?');
const getUserSkills = db.prepare('SELECT skill_id, level FROM user_skills WHERE user_id = ?');
const upsertSkill = db.prepare(`
  INSERT INTO user_skills (user_id, skill_id, level) VALUES (?, ?, 1)
  ON CONFLICT(user_id, skill_id) DO UPDATE SET level = level + 1
`);
const deleteUserSkills = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
const setXp = db.prepare('UPDATE users SET xp = ? WHERE id = ?');

// weapon statements
const getUserWeapons = db.prepare('SELECT * FROM user_weapons WHERE user_id = ?');
const getWeapon = db.prepare('SELECT * FROM user_weapons WHERE user_id = ? AND weapon_id = ?');
const buyWeapon = db.prepare('INSERT INTO user_weapons (user_id, weapon_id) VALUES (?, ?)');
const deleteUserWeapons = db.prepare('DELETE FROM user_weapons WHERE user_id = ?');

// currency statements
const addGold = db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?');
const setGold = db.prepare('UPDATE users SET gold = ? WHERE id = ?');
const addDiamonds = db.prepare('UPDATE users SET diamonds = diamonds + ? WHERE id = ?');

// helper for upgrading weapon stats (dynamic column name)
function upgradeWeaponStat(userId, weaponId, stat) {
  const validStats = ['dmg', 'range', 'rate', 'reload', 'mag', 'acc'];
  if (!validStats.includes(stat)) throw new Error('Invalid stat');
  db.prepare(`UPDATE user_weapons SET ${stat}_level = ${stat}_level + 1 WHERE user_id = ? AND weapon_id = ?`).run(userId, weaponId);
}

// stats statements
const addStats = db.prepare(`UPDATE users SET
  total_kills = total_kills + ?,
  total_normal_kills = total_normal_kills + ?,
  total_runner_kills = total_runner_kills + ?,
  total_tank_kills = total_tank_kills + ?,
  total_spitter_kills = total_spitter_kills + ?,
  total_damage_dealt = total_damage_dealt + ?,
  total_damage_taken = total_damage_taken + ?,
  total_healed = total_healed + ?,
  total_xp_earned = total_xp_earned + ?,
  total_waves = CASE WHEN ? > total_waves THEN ? ELSE total_waves END
  WHERE id = ?`);

const getStats = db.prepare('SELECT total_kills, total_normal_kills, total_runner_kills, total_tank_kills, total_spitter_kills, total_damage_dealt, total_damage_taken, total_healed, total_xp_earned, total_deaths, total_rescues, total_waves FROM users WHERE id = ?');

const incrementDeaths = db.prepare('UPDATE users SET total_deaths = total_deaths + 1 WHERE id = ?');
const incrementRescues = db.prepare('UPDATE users SET total_rescues = total_rescues + 1 WHERE id = ?');
const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

const applyDeath = db.transaction((userId) => {
  const user = getUser.get(userId);
  if (!user) return null;
  const newXp = Math.floor(user.xp * 0.25);
  setXp.run(newXp, userId);
  setGold.run(0, userId);
  deleteUserSkills.run(userId);
  deleteUserWeapons.run(userId);
  incrementDeaths.run(userId);
  return { xp: newXp, gold: 0, diamonds: user.diamonds };
});

module.exports = {
  createUser, findUserByName, addXp, getUser, getUserSkills, upsertSkill,
  deleteUserSkills, setXp, applyDeath,
  getUserWeapons, getWeapon, buyWeapon, deleteUserWeapons,
  addGold, setGold, addDiamonds, upgradeWeaponStat,
  addStats, getStats, incrementRescues, updatePassword,
};

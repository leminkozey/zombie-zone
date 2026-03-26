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

db.exec(`
  CREATE TABLE IF NOT EXISTS user_skills (
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, skill_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

const createUser = db.prepare('INSERT INTO users (name, password_hash) VALUES (?, ?)');
const findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
const addXp = db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?');
const getUser = db.prepare('SELECT id, name, xp FROM users WHERE id = ?');
const getUserSkills = db.prepare('SELECT skill_id, level FROM user_skills WHERE user_id = ?');
const upsertSkill = db.prepare(`
  INSERT INTO user_skills (user_id, skill_id, level) VALUES (?, ?, 1)
  ON CONFLICT(user_id, skill_id) DO UPDATE SET level = level + 1
`);
const deleteUserSkills = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
const setXp = db.prepare('UPDATE users SET xp = ? WHERE id = ?');

const applyDeath = db.transaction((userId) => {
  const user = getUser.get(userId);
  if (!user) return null;
  const newXp = Math.floor(user.xp * 0.25);
  setXp.run(newXp, userId);
  deleteUserSkills.run(userId);
  return { xp: newXp };
});

module.exports = { createUser, findUserByName, addXp, getUser, getUserSkills, upsertSkill, deleteUserSkills, setXp, applyDeath };

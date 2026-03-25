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

const createUser = db.prepare('INSERT INTO users (name, password_hash) VALUES (?, ?)');
const findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
const addXp = db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?');
const getUser = db.prepare('SELECT id, name, xp FROM users WHERE id = ?');

module.exports = { createUser, findUserByName, addXp, getUser };

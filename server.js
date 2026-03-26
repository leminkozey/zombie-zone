const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const {
  createUser, findUserByName, addXp, getUser, getUserSkills, upsertSkill, applyDeath,
  getUserWeapons, getWeapon, buyWeapon, addGold, setGold, addDiamonds, upgradeWeaponStat,
  addStats, getStats, incrementRescues, updatePassword,
} = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// jwt secret
const secretPath = path.join(__dirname, 'data', 'secret.key');
let JWT_SECRET;
if (fs.existsSync(secretPath)) {
  JWT_SECRET = fs.readFileSync(secretPath, 'utf8');
} else {
  JWT_SECRET = require('crypto').randomBytes(64).toString('hex');
  fs.writeFileSync(secretPath, JWT_SECRET);
}

// auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token required' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired' });
  }
}

// weapon definitions
const WEAPON_DEFS = {
  pistol: { unlockLevel: 0, cost: 0 },
  smg: { unlockLevel: 8, cost: 800 },
  shotgun: { unlockLevel: 20, cost: 4000 },
  assault_rifle: { unlockLevel: 35, cost: 12000 },
  sniper: { unlockLevel: 55, cost: 30000 },
  minigun: { unlockLevel: 75, cost: 60000 },
};
const UPGRADE_BASE_COSTS = { dmg: 100, range: 80, rate: 120, reload: 80, mag: 100, acc: 60 };
const MAX_UPGRADE_LEVEL = 10;

// register
app.post('/api/register', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
  if (findUserByName.get(name)) return res.status(409).json({ error: 'Name already taken' });
  const hash = bcrypt.hashSync(password, 10);
  const result = createUser.run(name, hash);
  const token = jwt.sign({ id: result.lastInsertRowid, name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, name });
});

// login
app.post('/api/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
  const user = findUserByName.get(name);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, name: user.name, xp: user.xp });
});

// profile
app.get('/api/profile', auth, (req, res) => {
  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, xp: user.xp, gold: user.gold, diamonds: user.diamonds });
});

// add xp
app.post('/api/xp', auth, (req, res) => {
  const { xp } = req.body;
  if (typeof xp !== 'number' || xp < 0) return res.status(400).json({ error: 'Invalid XP value' });
  addXp.run(xp, req.user.id);
  const user = getUser.get(req.user.id);
  res.json({ xp: user.xp });
});

// level helpers
function xpForLevel(n) {
  return Math.floor(50 * Math.pow(n, 1.5));
}

function getLevelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

// GET /api/skills
app.get('/api/skills', auth, (req, res) => {
  const skills = getUserSkills.all(req.user.id);
  res.json({ skills });
});

// POST /api/skills/invest
app.post('/api/skills/invest', auth, (req, res) => {
  const { skillId } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId required' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const currentSkills = getUserSkills.all(req.user.id);
  const totalInvested = currentSkills.reduce((sum, s) => sum + s.level, 0);
  const level = getLevelFromXp(user.xp);
  const availablePoints = level - 1;

  if (totalInvested >= availablePoints) {
    return res.status(400).json({ error: 'No skill points available' });
  }

  const SKILL_MAX_LEVELS = {
    vitality: 5, field_medic: 3, shield: 5, regen: 3, thick_skin: 3, vampirism: 3, adrenalin: 3, berserker: 3, fortress: 1, second_wind: 1, iron_skin: 1,
    swift: 5, kill_rush: 3, ghost: 3, dash: 1, dash_range: 3, dash_cd: 3, dash_charges: 2, phantom_dash: 1, bullet_time: 1,
    quick_call: 5, fast_extract: 4, survival_instinct: 5, rapid_redial: 3, ext_window: 3, safe_zone: 3, steady_hands: 3, last_stand: 1, evac_chopper: 1, fortified_lz: 1,
  };
  const maxLvl = SKILL_MAX_LEVELS[skillId];
  if (!maxLvl) return res.status(400).json({ error: 'Unknown skill' });
  const current = currentSkills.find(s => s.skill_id === skillId);
  if (current && current.level >= maxLvl) {
    return res.status(400).json({ error: 'Skill already at max level' });
  }

  upsertSkill.run(req.user.id, skillId);
  const skills = getUserSkills.all(req.user.id);
  res.json({ skills });
});

// GET /api/weapons
app.get('/api/weapons', auth, (req, res) => {
  const weapons = getUserWeapons.all(req.user.id);
  res.json({ weapons });
});

// POST /api/weapons/buy
app.post('/api/weapons/buy', auth, (req, res) => {
  const { weaponId } = req.body;
  if (!weaponId) return res.status(400).json({ error: 'weaponId required' });

  const def = WEAPON_DEFS[weaponId];
  if (!def) return res.status(400).json({ error: 'Unknown weapon' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const level = getLevelFromXp(user.xp);
  if (level < def.unlockLevel) {
    return res.status(400).json({ error: `Requires level ${def.unlockLevel}` });
  }

  const existing = getWeapon.get(req.user.id, weaponId);
  if (existing) return res.status(400).json({ error: 'Weapon already owned' });

  if (user.gold < def.cost) {
    return res.status(400).json({ error: 'Not enough gold' });
  }

  setGold.run(user.gold - def.cost, req.user.id);
  buyWeapon.run(req.user.id, weaponId);
  const weapons = getUserWeapons.all(req.user.id);
  const updated = getUser.get(req.user.id);
  res.json({ weapons, gold: updated.gold });
});

// POST /api/weapons/upgrade
app.post('/api/weapons/upgrade', auth, (req, res) => {
  const { weaponId, stat } = req.body;
  if (!weaponId || !stat) return res.status(400).json({ error: 'weaponId and stat required' });

  const baseCost = UPGRADE_BASE_COSTS[stat];
  if (!baseCost) return res.status(400).json({ error: 'Invalid stat' });

  let weapon = getWeapon.get(req.user.id, weaponId);
  // Pistol is always owned — create DB entry if missing
  if (!weapon && weaponId === 'pistol') {
    buyWeapon.run(req.user.id, 'pistol');
    weapon = getWeapon.get(req.user.id, weaponId);
  }
  if (!weapon) return res.status(400).json({ error: 'Weapon not owned' });

  const currentLevel = weapon[`${stat}_level`];
  if (currentLevel >= MAX_UPGRADE_LEVEL) {
    return res.status(400).json({ error: 'Stat already at max level' });
  }

  const cost = baseCost * (currentLevel + 1);
  const user = getUser.get(req.user.id);
  if (user.gold < cost) {
    return res.status(400).json({ error: 'Not enough gold' });
  }

  setGold.run(user.gold - cost, req.user.id);
  upgradeWeaponStat(req.user.id, weaponId, stat);
  const weapons = getUserWeapons.all(req.user.id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ weapons, gold: updatedUser.gold });
});

// POST /api/gold
app.post('/api/gold', auth, (req, res) => {
  const { gold, diamonds } = req.body;
  if (gold !== undefined) {
    if (typeof gold !== 'number' || gold < 0) return res.status(400).json({ error: 'Invalid gold value' });
    addGold.run(gold, req.user.id);
  }
  if (diamonds !== undefined) {
    if (typeof diamonds !== 'number' || diamonds < 0) return res.status(400).json({ error: 'Invalid diamonds value' });
    addDiamonds.run(diamonds, req.user.id);
  }
  const user = getUser.get(req.user.id);
  res.json({ gold: user.gold, diamonds: user.diamonds });
});

// POST /api/death
app.post('/api/death', auth, (req, res) => {
  const result = applyDeath(req.user.id);
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json(result);
});

// POST /api/rescue
app.post('/api/rescue', auth, (req, res) => {
  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  incrementRescues.run(req.user.id);
  res.json({ name: user.name, xp: user.xp });
});

// GET /api/stats
app.get('/api/stats', auth, (req, res) => {
  const stats = getStats.get(req.user.id);
  if (!stats) return res.status(404).json({ error: 'User not found' });
  res.json(stats);
});

// POST /api/stats — sync run stats
app.post('/api/stats', auth, (req, res) => {
  const { kills, normalKills, runnerKills, tankKills, spitterKills, damageDealt, damageTaken, healed, xpEarned, maxWave } = req.body;
  addStats.run(
    kills || 0, normalKills || 0, runnerKills || 0, tankKills || 0, spitterKills || 0,
    damageDealt || 0, damageTaken || 0, healed || 0, xpEarned || 0,
    maxWave || 0, maxWave || 0,
    req.user.id
  );
  res.json({ ok: true });
});

// POST /api/change-password
app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 3) return res.status(400).json({ error: 'Password too short' });

  const user = findUserByName.get(req.user.name);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  updatePassword.run(hash, req.user.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => console.log(`DEAD ZONE server running on http://localhost:${PORT}`));

const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const GameRoom = require('./game-server');
const database = require('./database');

// Async init needed for sql.js fallback (no-op when better-sqlite3 works)
(async () => {
await database.init();
const {
  createUser, findUserByName, addXp, getUser, getUserSkills, upsertSkill, applyDeath,
  getUserWeapons, getWeapon, buyWeapon, addGold, setGold, addDiamonds, upgradeWeaponStat,
  getUserPerks, buyPerk,
  addStats, getStats, incrementRescues, updatePassword,
  getUserOperators, getOperator, buyOperator, setActiveOperator,
  resetOperatorUpgrades, upgradeOperatorSlot,
} = database;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// rate limiting
const gameplayPaths = ['/api/skills', '/api/weapons', '/api/perks', '/api/operators', '/api/gold', '/api/xp', '/api/profile', '/api/stats', '/api/death', '/api/rescue'];
const apiLimiter = rateLimit({
  windowMs: 60000, max: 60,
  skip: (req) => gameplayPaths.some(p => req.originalUrl.startsWith(p))
});
const gameplayLimiter = rateLimit({ windowMs: 60000, max: 300 });
const authLimiter = rateLimit({ windowMs: 300000, max: 10 }); // 10 auth attempts per 5 min
app.use('/api/', apiLimiter);
for (const p of gameplayPaths) app.use(p, gameplayLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

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
  if (name.length > 30) return res.status(400).json({ error: 'Name too long' });
  if (password.length > 200) return res.status(400).json({ error: 'Password too long' });
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
  res.json({ name: user.name, xp: user.xp, gold: user.gold, diamonds: user.diamonds, active_operator: user.active_operator });
});

// add xp
app.post('/api/xp', auth, (req, res) => {
  const { xp } = req.body;
  if (typeof xp !== 'number' || xp < 0 || xp > 5000) return res.status(400).json({ error: 'Invalid XP value' });
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

  const cost = baseCost * (1 + currentLevel * 0.8);
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

// perk definitions
const PERK_DEFS = {
  // Pistol (Tier 1)
  pistol_akimbo:      { weaponId: 'pistol', type: 'active', name: 'Akimbo', diamonds: 3, gold: 1000 },
  pistol_hollow:      { weaponId: 'pistol', type: 'passive', name: 'Hollow Point', diamonds: 3, gold: 1000 },
  // SMG (Tier 2)
  smg_drum:           { weaponId: 'smg', type: 'active', name: 'Drum Mag', diamonds: 5, gold: 2000 },
  smg_incendiary:     { weaponId: 'smg', type: 'passive', name: 'Incendiary Rounds', diamonds: 5, gold: 2000 },
  // Shotgun (Tier 3)
  shotgun_dragon:     { weaponId: 'shotgun', type: 'active', name: "Dragon's Breath", diamonds: 7, gold: 3500 },
  shotgun_slug:       { weaponId: 'shotgun', type: 'active', name: 'Slug Round', diamonds: 7, gold: 3500 },
  // Assault Rifle (Tier 4)
  ar_grenade:         { weaponId: 'assault_rifle', type: 'active', name: 'Grenade Launcher', diamonds: 10, gold: 5000 },
  ar_fmj:             { weaponId: 'assault_rifle', type: 'passive', name: 'FMJ Rounds', diamonds: 10, gold: 5000 },
  // Sniper (Tier 5)
  sniper_wallpen:     { weaponId: 'sniper', type: 'active', name: 'Wall Penetration', diamonds: 12, gold: 7000 },
  sniper_explosive:   { weaponId: 'sniper', type: 'passive', name: 'Explosive Rounds', diamonds: 12, gold: 7000 },
  // Minigun (Tier 6)
  minigun_overdrive:  { weaponId: 'minigun', type: 'active', name: 'Overdrive', diamonds: 15, gold: 10000 },
  minigun_cryo:       { weaponId: 'minigun', type: 'passive', name: 'Cryo Rounds', diamonds: 15, gold: 10000 },
};

// operator definitions
const OPERATOR_DEFS = {
  soldier:       { unlockLevel: 15, goldCost: 5000, diamondCost: 30 },
  medic:         { unlockLevel: 25, goldCost: 12000, diamondCost: 50 },
  builder:       { unlockLevel: 35, goldCost: 25000, diamondCost: 75 },
  electrician:   { unlockLevel: 50, goldCost: 50000, diamondCost: 100 },
  time_traveler: { unlockLevel: 70, goldCost: 100000, diamondCost: 150 },
  juggernaut:    { unlockLevel: 90, goldCost: 200000, diamondCost: 200 },
};
const OP_UPGRADE_MAX = { active: 5, passive: 5, buff: 3 };
const OP_UPGRADE_BASE_COST = { active: { gold: 5000, sp: 3 }, passive: { gold: 3000, sp: 2 }, buff: { gold: 8000, sp: 5 } };

// GET /api/perk-defs
app.get('/api/perk-defs', (req, res) => {
  res.json(PERK_DEFS);
});

// GET /api/perks
app.get('/api/perks', auth, (req, res) => {
  const perks = getUserPerks.all(req.user.id).map(p => p.perk_id);
  res.json({ perks });
});

// POST /api/perks/buy
app.post('/api/perks/buy', auth, (req, res) => {
  const { perkId } = req.body;
  const def = PERK_DEFS[perkId];
  if (!def) return res.status(400).json({ error: 'Unknown perk' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check if weapon is owned
  const weapon = getWeapon.get(req.user.id, def.weaponId);
  if (!weapon && def.weaponId !== 'pistol') return res.status(400).json({ error: 'Weapon not owned' });

  // Check if already owned
  const existing = getUserPerks.all(req.user.id).map(p => p.perk_id);
  if (existing.includes(perkId)) return res.status(400).json({ error: 'Perk already owned' });

  // Check cost (needs BOTH diamonds AND gold)
  if (user.diamonds < def.diamonds) return res.status(400).json({ error: 'Not enough diamonds' });
  if (user.gold < def.gold) return res.status(400).json({ error: 'Not enough gold' });

  // Deduct both currencies
  addGold.run(-def.gold, req.user.id);
  addDiamonds.run(-def.diamonds, req.user.id);
  buyPerk.run(req.user.id, perkId);

  const perks = getUserPerks.all(req.user.id).map(p => p.perk_id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ perks, gold: updatedUser.gold, diamonds: updatedUser.diamonds });
});

// GET /api/operators
app.get('/api/operators', auth, (req, res) => {
  const operators = getUserOperators.all(req.user.id);
  const user = getUser.get(req.user.id);
  res.json({ operators, activeOperator: user ? user.active_operator : null });
});

// POST /api/operators/buy
app.post('/api/operators/buy', auth, (req, res) => {
  const { operatorId, currency } = req.body;
  if (!operatorId) return res.status(400).json({ error: 'operatorId required' });
  if (!currency || !['gold', 'diamonds'].includes(currency)) return res.status(400).json({ error: 'currency must be gold or diamonds' });

  const def = OPERATOR_DEFS[operatorId];
  if (!def) return res.status(400).json({ error: 'Unknown operator' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const level = getLevelFromXp(user.xp);
  if (level < def.unlockLevel) {
    return res.status(400).json({ error: `Requires level ${def.unlockLevel}` });
  }

  const existing = getOperator.get(req.user.id, operatorId);
  if (existing) return res.status(400).json({ error: 'Operator already owned' });

  if (currency === 'gold') {
    if (user.gold < def.goldCost) return res.status(400).json({ error: 'Not enough gold' });
    addGold.run(-def.goldCost, req.user.id);
  } else {
    if (user.diamonds < def.diamondCost) return res.status(400).json({ error: 'Not enough diamonds' });
    addDiamonds.run(-def.diamondCost, req.user.id);
  }

  buyOperator.run(req.user.id, operatorId);
  const operators = getUserOperators.all(req.user.id);
  const updated = getUser.get(req.user.id);
  res.json({ operators, gold: updated.gold, diamonds: updated.diamonds });
});

// POST /api/operators/select
app.post('/api/operators/select', auth, (req, res) => {
  const { operatorId } = req.body;

  // null = deselect
  if (operatorId === null || operatorId === undefined) {
    setActiveOperator.run(null, req.user.id);
    return res.json({ activeOperator: null });
  }

  if (!OPERATOR_DEFS[operatorId]) return res.status(400).json({ error: 'Unknown operator' });

  const existing = getOperator.get(req.user.id, operatorId);
  if (!existing) return res.status(400).json({ error: 'Operator not owned' });

  setActiveOperator.run(operatorId, req.user.id);
  res.json({ activeOperator: operatorId });
});

// POST /api/operators/upgrade
app.post('/api/operators/upgrade', auth, (req, res) => {
  const { operatorId, slot } = req.body;
  if (!operatorId || !slot) return res.status(400).json({ error: 'operatorId and slot required' });
  if (!['active', 'passive', 'buff'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });

  const op = getOperator.get(req.user.id, operatorId);
  if (!op) return res.status(400).json({ error: 'Operator not owned' });

  const currentLevel = op[`${slot}_level`];
  const maxLevel = OP_UPGRADE_MAX[slot];
  if (currentLevel >= maxLevel) return res.status(400).json({ error: 'Slot already at max level' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // gold cost: base * (currentLevel + 1)
  const goldCost = OP_UPGRADE_BASE_COST[slot].gold * (currentLevel + 1);
  if (user.gold < goldCost) return res.status(400).json({ error: 'Not enough gold' });

  // skill point cost check
  const totalLevel = getLevelFromXp(user.xp);
  const totalSP = totalLevel - 1;
  const usedSkillSP = getUserSkills.all(req.user.id).reduce((sum, s) => sum + s.level, 0);
  const allOps = getUserOperators.all(req.user.id);
  const usedOpSP = allOps.reduce((sum, o) => {
    let sp = 0;
    for (let i = 1; i <= o.active_level; i++) sp += i * OP_UPGRADE_BASE_COST.active.sp;
    for (let i = 1; i <= o.passive_level; i++) sp += i * OP_UPGRADE_BASE_COST.passive.sp;
    for (let i = 1; i <= o.buff_level; i++) sp += i * OP_UPGRADE_BASE_COST.buff.sp;
    return sum + sp;
  }, 0);
  const availableSP = totalSP - usedSkillSP - usedOpSP;

  const spCost = (currentLevel + 1) * OP_UPGRADE_BASE_COST[slot].sp;
  if (availableSP < spCost) return res.status(400).json({ error: 'Not enough skill points' });

  addGold.run(-goldCost, req.user.id);
  upgradeOperatorSlot(req.user.id, operatorId, slot);

  const operators = getUserOperators.all(req.user.id);
  const updated = getUser.get(req.user.id);
  res.json({ operators, gold: updated.gold });
});

// POST /api/gold
app.post('/api/gold', auth, (req, res) => {
  const { gold, diamonds } = req.body;
  if (typeof gold === 'number' && gold > 0 && gold <= 500000) addGold.run(gold, req.user.id);
  if (typeof diamonds === 'number' && diamonds > 0 && diamonds <= 20) addDiamonds.run(diamonds, req.user.id);
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
  const { kills, normalKills, runnerKills, tankKills, spitterKills, bossKills, damageDealt, damageTaken, healed, xpEarned, maxWave } = req.body;
  const safeNum = (v) => Math.max(0, Math.floor(Number(v) || 0));
  addStats.run(
    safeNum(kills), safeNum(normalKills), safeNum(runnerKills), safeNum(tankKills), safeNum(spitterKills), safeNum(bossKills),
    safeNum(damageDealt), safeNum(damageTaken), safeNum(healed), safeNum(xpEarned),
    safeNum(maxWave), safeNum(maxWave),
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
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── LOBBY SYSTEM ──────────────────────────────────────

const lobbies = new Map(); // code → { host, players[], state, gameRoom, gameInterval }
const lastSentState = new Map(); // socketId → previous full state (for delta compression)

function computeDelta(prev, curr) {
  const delta = { tick: curr.tick, _delta: true };

  // Wave data — only if changed
  if (prev.wave !== curr.wave || prev.waveKills !== curr.waveKills || prev.waveTotal !== curr.waveTotal) {
    delta.wave = curr.wave;
    delta.waveKills = curr.waveKills;
    delta.waveTotal = curr.waveTotal;
  }

  // Players — always send, but only changed fields per player
  delta.players = curr.players.map(cp => {
    const pp = prev.players.find(p => p.id === cp.id);
    if (!pp) return cp;
    const pd = { id: cp.id };
    for (const key of Object.keys(cp)) {
      if (key === 'id') continue;
      if (cp[key] !== pp[key]) pd[key] = cp[key];
    }
    return pd;
  });

  // Zombies — only changed + removed IDs
  const prevZMap = new Map(prev.zombies.map(z => [z.id, z]));
  const currZMap = new Map(curr.zombies.map(z => [z.id, z]));
  const zUpdates = [];
  for (const cz of curr.zombies) {
    const pz = prevZMap.get(cz.id);
    if (!pz) { zUpdates.push(cz); continue; }
    const zd = { id: cz.id };
    let changed = false;
    for (const key of Object.keys(cz)) {
      if (key === 'id') continue;
      if (cz[key] !== pz[key]) { zd[key] = cz[key]; changed = true; }
    }
    if (changed) zUpdates.push(zd);
  }
  const zRemoved = [];
  for (const [id] of prevZMap) { if (!currZMap.has(id)) zRemoved.push(id); }
  if (zUpdates.length > 0) delta.zombies = zUpdates;
  if (zRemoved.length > 0) delta.zombiesRemoved = zRemoved;

  // Bullets + spitter projectiles — short-lived, always send full
  delta.bullets = curr.bullets;
  delta.spitterProjectiles = curr.spitterProjectiles;

  // Hit trails — one-shot events, always send
  delta.hitTrails = curr.hitTrails;

  // Pickups — only if changed
  if (JSON.stringify(prev.pickups) !== JSON.stringify(curr.pickups)) {
    delta.pickups = curr.pickups;
  }

  // Events — one-shot, always send
  if (curr.events.length > 0) delta.events = curr.events;

  return delta;
}

function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = ''; for (let i = 0; i < 4; i++) code += c[Math.floor(Math.random() * c.length)]; } while (lobbies.has(code));
  return code;
}

io.on('connection', (socket) => {
  let currentLobby = null;
  let playerInfo = { id: socket.id, name: 'Unknown', level: 0, weapon: 'pistol' };

  socket.on('set-player-info', (data) => {
    playerInfo.name = String(data.name || 'Unknown').substring(0, 30);
    playerInfo.level = Math.max(0, Number(data.level) || 0);
    playerInfo.weapon = String(data.weapon || 'pistol').substring(0, 20);
    playerInfo.maxHp = Math.min(500, Math.max(100, Number(data.maxHp) || 100));
    playerInfo.speed = Math.min(5, Math.max(1, Number(data.speed) || 2.8));
    playerInfo.operator = data.operator ? String(data.operator).substring(0, 20) : null;
  });

  socket.on('create-lobby', (cb) => {
    if (currentLobby) return cb({ error: 'Already in lobby' });
    const code = generateCode();
    lobbies.set(code, { code, host: socket.id, players: [{ ...playerInfo, id: socket.id, slot: 0 }], state: 'waiting', gameRoom: null, gameInterval: null });
    currentLobby = code;
    socket.join(code);
    cb({ code, playerId: socket.id, slot: 0 });
  });

  socket.on('join-lobby', (code, cb) => {
    if (currentLobby) return cb({ error: 'Already in lobby' });
    code = String(code).toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) return cb({ error: 'Not found' });
    if (lobby.players.length >= 4) return cb({ error: 'Full' });
    if (lobby.state !== 'waiting') return cb({ error: 'In game' });
    const slot = [0,1,2,3].find(s => !lobby.players.some(p => p.slot === s));
    lobby.players.push({ ...playerInfo, id: socket.id, slot });
    currentLobby = code;
    socket.join(code);
    cb({ code, playerId: socket.id, slot, players: lobby.players, hostId: lobby.host });
    socket.to(code).emit('lobby-updated', { players: lobby.players, hostId: lobby.host });
  });

  socket.on('leave-lobby', () => {
    if (!currentLobby) return;
    lastSentState.delete(socket.id);
    const lobby = lobbies.get(currentLobby);
    if (!lobby) { currentLobby = null; return; }
    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    socket.leave(currentLobby);
    if (lobby.players.length === 0) {
      if (lobby.gameInterval) clearInterval(lobby.gameInterval);
      if (lobby.gameRoom) lobby.gameRoom.destroy();
      lobbies.delete(currentLobby);
    } else {
      if (lobby.host === socket.id) lobby.host = lobby.players[0].id;
      io.to(currentLobby).emit('lobby-updated', { players: lobby.players, hostId: lobby.host });
    }
    currentLobby = null;
  });

  socket.on('start-game', () => {
    if (!currentLobby) return;
    const lobby = lobbies.get(currentLobby);
    if (!lobby || lobby.host !== socket.id || lobby.players.length < 2) return;
    lobby.state = 'playing';
    // Create GameRoom
    lobby.gameRoom = new GameRoom(currentLobby, lobby.players.map(p => ({
      id: p.id, name: p.name, level: p.level, weapon: p.weapon,
      maxHp: p.maxHp, speed: p.speed, operator: p.operator,
    })));
    // Start game loop — 20 ticks/sec
    lobby.gameInterval = setInterval(() => {
      if (!lobby.gameRoom) return;
      lobby.gameRoom.tick();
      const fullState = lobby.gameRoom.getState();
      const isResync = (fullState.tick % 100 === 0); // full state every 5s

      for (const p of lobby.players) {
        const prev = lastSentState.get(p.id);
        if (prev && !isResync) {
          io.to(p.id).emit('game-state', computeDelta(prev, fullState));
        } else {
          io.to(p.id).emit('game-state', fullState);
        }
        lastSentState.set(p.id, JSON.parse(JSON.stringify(fullState)));
      }

      if (lobby.gameRoom.isGameOver()) {
        io.to(lobby.code).emit('game-over', {});
        clearInterval(lobby.gameInterval);
        for (const p of lobby.players) lastSentState.delete(p.id);
        lobby.gameRoom.destroy();
        lobby.gameRoom = null;
        lobby.gameInterval = null;
        lobby.state = 'waiting';
      }
    }, 50);
    io.to(currentLobby).emit('game-start', { players: lobby.players, map: lobby.gameRoom.getMapData() });
  });

  // Player input — just forward to GameRoom
  socket.on('input', (data) => {
    if (!currentLobby) return;
    const lobby = lobbies.get(currentLobby);
    if (!lobby || !lobby.gameRoom) return;
    lobby.gameRoom.addInput(socket.id, data);
  });

  // Revive interaction
  socket.on('revive', (targetId) => {
    if (!currentLobby) return;
    const lobby = lobbies.get(currentLobby);
    if (!lobby || !lobby.gameRoom) return;
    lobby.gameRoom.handleRevive(socket.id, targetId);
  });

  socket.on('disconnect', () => {
    lastSentState.delete(socket.id);
    if (currentLobby) {
      const lobby = lobbies.get(currentLobby);
      if (lobby) {
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        if (lobby.gameRoom) lobby.gameRoom.removePlayer(socket.id);
        if (lobby.players.length === 0) {
          if (lobby.gameInterval) clearInterval(lobby.gameInterval);
          if (lobby.gameRoom) lobby.gameRoom.destroy();
          lobbies.delete(currentLobby);
        } else {
          if (lobby.host === socket.id) lobby.host = lobby.players[0].id;
          io.to(currentLobby).emit('lobby-updated', { players: lobby.players, hostId: lobby.host });
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`DEAD ZONE server running on http://localhost:${PORT}`));
})();

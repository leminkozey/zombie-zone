const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { createUser, findUserByName, addXp, getUser, getUserSkills, upsertSkill, applyDeath } = require('./database');

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
  res.json({ name: user.name, xp: user.xp });
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
    vitality: 5, field_medic: 3, shield: 5, regen: 3, thick_skin: 3, fortress: 1, second_wind: 1,
    swift: 5, quick_reload: 3, dash: 1, dash_range: 3, dash_cd: 3, dash_charges: 2, trigger_finger: 3, phantom_dash: 1, bullet_time: 1,
    quick_call: 5, fast_extract: 4, survival_instinct: 5, rapid_redial: 3, ext_window: 3, safe_zone: 3, evac_chopper: 1, fortified_lz: 1,
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
  res.json({ name: user.name, xp: user.xp });
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => console.log(`DEAD ZONE server running on http://localhost:${PORT}`));

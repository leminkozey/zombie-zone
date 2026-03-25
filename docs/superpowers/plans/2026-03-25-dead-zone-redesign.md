# DEAD ZONE Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform a standalone HTML zombie shooter into a full-featured game with Node.js backend (accounts + XP), multiple zombie types, health pickups, improved sprites/animations, and better zombie AI.

**Architecture:** Express server serves static frontend and exposes REST API for auth + XP persistence. SQLite stores user accounts. Frontend remains a single HTML file with inline JS, communicating with the API via fetch. Game logic runs entirely client-side; only XP totals are synced to the backend.

**Tech Stack:** Node.js, Express, better-sqlite3, bcryptjs, jsonwebtoken, HTML5 Canvas

**Spec:** `docs/superpowers/specs/2026-03-25-dead-zone-redesign-design.md`

**Existing code:** `public/index.html` (809 lines) — single-file top-down shooter with WASD movement, mouse aim, wave system, ammo/reload, minimap, particles.

---

## File Structure

```
zombie-shooter/
├── server.js              # Express server, API routes, JWT middleware, static file serving
├── database.js            # SQLite setup, user CRUD, XP queries
├── package.json           # Dependencies and scripts
├── .gitignore             # data/, node_modules/
├── data/                  # SQLite DB + JWT secret (gitignored)
└── public/
    └── index.html         # The game (Canvas + all game logic + auth UI)
```

- `server.js` — all API routes in one file (4 endpoints, not worth splitting)
- `database.js` — DB init + query functions, separated so server.js stays focused on HTTP
- `public/index.html` — single file game, stays inline (no bundler needed for a game this size)

---

### Task 1: Project Setup + Backend Skeleton

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `server.js`
- Create: `database.js`
- Move: `index.html` → `public/index.html`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd C:/Users/m.kluss/ai/zombie-shooter
npm init -y
npm install express better-sqlite3 bcryptjs jsonwebtoken
```

Update `package.json` scripts:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
data/
```

- [ ] **Step 3: Move index.html to public/**

```bash
mkdir -p public
mv index.html public/index.html
```

- [ ] **Step 4: Create database.js**

```js
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
```

- [ ] **Step 5: Create server.js**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { createUser, findUserByName, addXp, getUser } = require('./database');

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

app.listen(3000, () => console.log('DEAD ZONE server running on http://localhost:3000'));
```

- [ ] **Step 6: Test the server**

```bash
cd C:/Users/m.kluss/ai/zombie-shooter
node server.js &
# Test register
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" -d '{"name":"test","password":"test123"}'
# Should return {"token":"...","name":"test"}
# Test login
curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"name":"test","password":"test123"}'
# Should return {"token":"...","name":"test","xp":0}
# Kill server
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore server.js database.js public/index.html
git rm index.html
git commit -m "Add Express backend with auth API and move game to public/"
```

---

### Task 2: Login/Register UI in Frontend

**Files:**
- Modify: `public/index.html` (overlay section ~lines 149-157, CSS ~lines 57-90, and add JS auth functions)

- [ ] **Step 1: Add auth-related CSS styles**

Add after the existing `#reload-bar` styles (before `@keyframes pulse`):

```css
#auth-screen {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 30;
  gap: 12px;
}
#auth-screen h1 {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 60px;
  color: #cc2200;
  letter-spacing: 10px;
  text-shadow: 0 0 40px #cc220088;
  margin-bottom: 8px;
}
.auth-tabs {
  display: flex;
  gap: 0;
}
.auth-tab {
  padding: 8px 24px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  letter-spacing: 2px;
  background: transparent;
  border: 1px solid #333;
  color: #555;
  cursor: pointer;
}
.auth-tab.active {
  color: #cc2200;
  border-color: #cc2200;
  background: rgba(204,34,0,0.1);
}
.auth-input {
  background: #111;
  border: 1px solid #333;
  color: #ddd;
  padding: 10px 16px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  width: 260px;
  outline: none;
}
.auth-input:focus { border-color: #cc2200; }
#auth-error {
  color: #cc2200;
  font-size: 11px;
  letter-spacing: 1px;
  min-height: 16px;
}
#user-display {
  font-size: 10px;
  color: #555;
  letter-spacing: 2px;
}
```

- [ ] **Step 2: Add auth HTML**

Replace the `#overlay` div content with a login/register screen. Add a new `#auth-screen` div before the overlay:

```html
<div id="auth-screen">
  <div class="sub" style="color:#555;font-size:11px;letter-spacing:3px">TOP-DOWN SURVIVAL</div>
  <h1>DEAD ZONE</h1>
  <div class="auth-tabs">
    <button class="auth-tab active" onclick="switchAuthTab('login')">LOGIN</button>
    <button class="auth-tab" onclick="switchAuthTab('register')">REGISTRIEREN</button>
  </div>
  <input class="auth-input" id="auth-name" placeholder="Name" autocomplete="off">
  <input class="auth-input" id="auth-pass" type="password" placeholder="Passwort">
  <div id="auth-error"></div>
  <button class="start-btn" id="auth-btn" onclick="doAuth()">LOGIN</button>
  <div id="logout-hint" style="color:#333;font-size:10px;margin-top:20px;letter-spacing:1px;display:none">
    Eingeloggt als <span id="logged-name"></span> — <a href="#" onclick="doLogout();return false" style="color:#cc2200">Abmelden</a>
  </div>
</div>
```

Modify the overlay to show the player name:

```html
<div id="overlay" style="display:none">
  <div class="sub">TOP-DOWN SURVIVAL</div>
  <h1>DEAD ZONE</h1>
  <div id="user-display"></div>
  <div class="hint">
    WASD — Bewegen &nbsp;|&nbsp; MAUS — Zielen &nbsp;|&nbsp; LINKSKLICK — Schießen<br>
    R — Nachladen &nbsp;|&nbsp; Überlebe so lange wie möglich
  </div>
  <button class="start-btn" id="start-btn">STARTEN</button>
</div>
```

- [ ] **Step 3: Add auth JavaScript**

Add at the top of the `<script>` block, before the existing game code:

```js
// auth state
let authToken = localStorage.getItem('dz_token');
let currentUser = localStorage.getItem('dz_user');
let authMode = 'login';

function switchAuthTab(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.auth-tab:${mode === 'login' ? 'first' : 'last'}-child`).classList.add('active');
  document.getElementById('auth-btn').textContent = mode === 'login' ? 'LOGIN' : 'REGISTRIEREN';
  document.getElementById('auth-error').textContent = '';
}

async function doAuth() {
  const name = document.getElementById('auth-name').value.trim();
  const password = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  if (!name || !password) { errEl.textContent = 'Name und Passwort eingeben'; return; }

  const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken = data.token;
    currentUser = data.name;
    localStorage.setItem('dz_token', authToken);
    localStorage.setItem('dz_user', currentUser);
    showGameMenu();
  } catch (e) {
    errEl.textContent = 'Server nicht erreichbar';
  }
}

function doLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('dz_token');
  localStorage.removeItem('dz_user');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('overlay').style.display = 'none';
}

function showGameMenu() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('overlay').style.display = 'flex';
  document.getElementById('user-display').textContent = currentUser.toUpperCase();
}

// auto-login if token exists
async function checkToken() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.name;
      showGameMenu();
      return;
    }
  } catch {}
  // token invalid
  doLogout();
}

checkToken();
```

- [ ] **Step 4: Update game-over to send XP**

In the `gameOver()` function, after setting `running = false`, add the XP submit:

```js
// send xp to backend
if (authToken && sessionXp > 0) {
  fetch('/api/xp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({ xp: sessionXp })
  }).catch(() => {});
}
```

Add `let sessionXp = 0;` to the state variables, and reset it in `init()`.

Update the game-over overlay to show XP earned and add a "Nochmal" button that goes to game menu (not `location.reload()`):

```js
ov.innerHTML = `
  <div class="sub">GAME OVER</div>
  <h1>YOU DIED</h1>
  <p style="color:#666;font-size:13px;letter-spacing:2px">Wave ${wave} &nbsp;|&nbsp; +${sessionXp} XP</p>
  <button class="start-btn" onclick="showGameMenu()">NOCHMAL</button>
`;
```

- [ ] **Step 5: Test auth flow in browser**

```bash
cd C:/Users/m.kluss/ai/zombie-shooter
node server.js
```

Open `http://localhost:3000`, verify: register works, login works, game starts after login, game-over sends XP, logout works, page refresh auto-logs back in.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "Add login/register UI with JWT auth and XP submission"
```

---

### Task 3: Fix Sprite Perspective (Player + Zombie)

**Files:**
- Modify: `public/index.html` — `drawPlayer()` (~line 643) and `drawZombie()` (~line 555)

The core issue: sprites are drawn with body parts going top-to-bottom as if viewed from the side, then rotated by `angle + Math.PI/2`. This means "forward" is drawn as negative-Y, but the +PI/2 offset compensates badly. Fix: redraw sprites so that "forward" = positive-X direction (angle=0 points right), no offset needed.

- [ ] **Step 1: Rewrite drawPlayer()**

Replace the entire `drawPlayer()` function. New approach: all body parts drawn so the character faces RIGHT (positive X). Rotation is just `player.angle` — no offset.

```js
function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  // shadow (before rotation)
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.rotate(player.angle);

  // legs (behind body)
  const legSwing = Math.sin(frameCount * 0.15) * 4;
  ctx.fillStyle = '#445566';
  ctx.save();
  ctx.translate(-2, -5);
  ctx.rotate(legSwing * 0.08);
  ctx.fillRect(-3, 0, 5, 9);
  ctx.restore();
  ctx.save();
  ctx.translate(-2, 5);
  ctx.rotate(-legSwing * 0.08);
  ctx.fillRect(-3, 0, 5, 9);
  ctx.restore();

  // boots
  ctx.fillStyle = '#333';
  ctx.fillRect(-5, -6, 4, 4);
  ctx.fillRect(-5, 4, 4, 4);

  // torso
  ctx.fillStyle = '#556644';
  ctx.beginPath();
  ctx.roundRect(-6, -8, 12, 16, 2);
  ctx.fill();

  // gun arm + barrel
  ctx.fillStyle = '#445533';
  ctx.fillRect(4, -2, 12, 4);
  ctx.fillStyle = '#222';
  ctx.fillRect(14, -1.5, 8, 3);

  // head
  ctx.fillStyle = '#c8a070';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI*2);
  ctx.fill();

  // helmet
  ctx.fillStyle = '#445533';
  ctx.beginPath();
  ctx.arc(1, 0, 8, -Math.PI*0.45, Math.PI*0.45);
  ctx.fill();

  ctx.restore();
}
```

- [ ] **Step 2: Rewrite drawZombie() as type-based renderer**

Replace the entire `drawZombie()` function. Reads `z.type` for colors and size. Faces RIGHT (positive X), rotation is `z.angle` — no offset.

```js
// NOTE: zombie type visual config is used in Task 3, but z.type is not set until Task 4.
// To keep the game working between tasks, the fallback `|| ZOMBIE_TYPES.normal` handles this.
// z.deathTimer is checked with `&& z.deathTimer` so undefined is safe (falsy).
const ZOMBIE_TYPES = {
  normal:  { body: '#2d4a1e', skin: '#8aaa60', arm: '#3a5528', leg: '#2a3a1a', scale: 1.0 },
  runner:  { body: '#cc6600', skin: '#ffaa44', arm: '#aa5500', leg: '#884400', scale: 0.85 },
  tank:    { body: '#661111', skin: '#aa4444', arm: '#551111', leg: '#440000', scale: 1.5 },
  spitter: { body: '#663399', skin: '#9966cc', arm: '#552288', leg: '#441177', scale: 1.0 },
};

function drawZombie(z) {
  if (!z.alive && !z.deathTimer) return;

  const t = ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES.normal;
  const s = t.scale;

  ctx.save();
  ctx.translate(z.x, z.y);

  // death animation
  if (!z.alive && z.deathTimer > 0) {
    const prog = 1 - z.deathTimer / 30;
    ctx.globalAlpha = 1 - prog;
    ctx.rotate(prog * 1.5);
  }

  // shadow
  ctx.save();
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10*s, 6*s, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.rotate(z.angle);

  const wobble = Math.sin(z.wobble) * 0.1;
  ctx.rotate(wobble);

  // legs
  const legSwing = Math.sin(z.frame * 0.18) * 5;
  ctx.fillStyle = t.leg;
  ctx.save();
  ctx.translate(-3*s, -5*s);
  ctx.rotate(legSwing * 0.08);
  ctx.fillRect(-2*s, 0, 5*s, 8*s);
  ctx.restore();
  ctx.save();
  ctx.translate(-3*s, 5*s);
  ctx.rotate(-legSwing * 0.08);
  ctx.fillRect(-2*s, 0, 5*s, 8*s);
  ctx.restore();

  // body
  ctx.fillStyle = t.body;
  ctx.beginPath();
  ctx.roundRect(-6*s, -8*s, 12*s, 16*s, 2*s);
  ctx.fill();

  // arms (outstretched forward)
  ctx.fillStyle = t.arm;
  const armSwing = Math.sin(z.wobble * 0.5) * 3;
  ctx.save();
  ctx.translate(4*s, (-6 + armSwing)*s);
  ctx.fillRect(0, -2*s, 10*s, 4*s);
  ctx.restore();
  ctx.save();
  ctx.translate(4*s, (6 - armSwing)*s);
  ctx.fillRect(0, -2*s, 10*s, 4*s);
  ctx.restore();

  // head
  ctx.fillStyle = t.skin;
  ctx.beginPath();
  ctx.arc(0, 0, 7*s, 0, Math.PI*2);
  ctx.fill();

  // eyes
  ctx.save();
  ctx.shadowBlur = 6;
  ctx.shadowColor = '#ff2200';
  ctx.fillStyle = '#ff3300';
  ctx.beginPath();
  ctx.arc(4*s, -2.5*s, 2*s, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4*s, 2.5*s, 2*s, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // hp bar (only if damaged)
  if (z.hp < z.maxHp) {
    ctx.rotate(-z.angle - wobble); // undo rotation so bar is horizontal
    const bw = 20*s, bh = 3;
    ctx.fillStyle = '#400';
    ctx.fillRect(-bw/2, -14*s, bw, bh);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(-bw/2, -14*s, bw * (z.hp / z.maxHp), bh);
  }

  ctx.restore();
}
```

- [ ] **Step 3: Remove Math.PI/2 offsets**

In `drawPlayer()` — already handled in the rewrite (uses `player.angle` directly).
In `drawZombie()` — already handled (uses `z.angle` directly).

Verify no other code adds `Math.PI/2` to rotation.

- [ ] **Step 4: Test visually**

Start the server, open in browser. Verify:
- Player faces the mouse cursor correctly (gun arm points toward cursor)
- Zombies face the player correctly (arms outstretched toward player)
- No body parts "lying on the ground"
- Shadows are beneath the characters, not rotated with them

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Fix sprite perspective: redraw player and zombie facing right, remove PI/2 offset"
```

---

### Task 4: Zombie Types + Spawn System

**Files:**
- Modify: `public/index.html` — `spawnZombie()`, `updateZombies()`, CONFIG section

- [ ] **Step 1: Add zombie type config**

Add after the existing CONFIG section:

```js
const ZOMBIE_CONFIGS = {
  normal:  { hpBase: [2, 3], hpScale: 1, speedMult: 1.0, xp: 10, radius: ZOMBIE_R },
  runner:  { hpBase: [1, 2], hpScale: 0.5, speedMult: 2.0, xp: 25, radius: ZOMBIE_R * 0.85 },
  tank:    { hpBase: [8, 10], hpScale: 2, speedMult: 0.5, xp: 50, radius: ZOMBIE_R * 1.5 },
  spitter: { hpBase: [3, 4], hpScale: 1, speedMult: 0.7, xp: 40, radius: ZOMBIE_R },
};

function getSpawnWeights(wave) {
  if (wave <= 1) return { normal: 1 };
  if (wave <= 2) return { normal: 0.7, runner: 0.3 };
  if (wave <= 4) return { normal: 0.5, runner: 0.25, tank: 0.25 };
  return { normal: 0.4, runner: 0.25, tank: 0.2, spitter: 0.15 };
}

function pickZombieType(wave) {
  const weights = getSpawnWeights(wave);
  const roll = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll < cumulative) return type;
  }
  return 'normal';
}
```

- [ ] **Step 2: Update spawnZombie() to use types**

Replace `spawnZombie()`:

```js
function spawnZombie() {
  const edge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
  const type = pickZombieType(wave);
  const cfg = ZOMBIE_CONFIGS[type];
  const baseSpd = 0.7 + wave * 0.12 + Math.random() * 0.3;
  const baseHp = cfg.hpBase[0] + Math.floor(Math.random() * (cfg.hpBase[1] - cfg.hpBase[0] + 1));
  const hp = baseHp + Math.floor(wave / 3) * cfg.hpScale;

  zombies.push({
    x: edge.x, y: edge.y,
    type,
    hp, maxHp: hp,
    speed: Math.min(baseSpd * cfg.speedMult, 3.5),
    radius: cfg.radius,
    xp: cfg.xp,
    angle: 0,
    wobble: Math.random() * Math.PI * 2,
    frame: 0,
    alive: true,
    deathTimer: 0,
    // spitter-specific
    shootCooldown: type === 'spitter' ? 150 : 0,
  });
}
```

- [ ] **Step 3: Update collision detection to use per-zombie radius**

In `updateZombies()`, replace hardcoded `ZOMBIE_R` references:
- `PLAYER_R + ZOMBIE_R - 2` → `PLAYER_R + z.radius - 2`
- `ZOMBIE_R * 2` in separation → `z.radius + z2.radius`

In `updateBullets()`:
- `(BULLET_R + ZOMBIE_R)**2` → `(BULLET_R + z.radius)**2`

- [ ] **Step 4: Update kill XP to use zombie type XP**

In `updateBullets()`, when zombie dies, replace `score += 100 * wave` with:

```js
const xpGained = z.xp;
score += xpGained;
sessionXp += xpGained;
```

- [ ] **Step 5: Add zombie death animation**

In the main `loop()`, after `updateParticles()`, add:

```js
// death animations
for (let i = zombies.length - 1; i >= 0; i--) {
  const z = zombies[i];
  if (!z.alive && z.deathTimer > 0) {
    z.deathTimer--;
    if (z.deathTimer <= 0) zombies.splice(i, 1);
  }
}
```

When zombie dies in `updateBullets()`, instead of just `z.alive = false`, set:

```js
z.alive = false;
z.deathTimer = 30; // ~0.5s at 60fps
```

- [ ] **Step 6: Test zombie types**

Start server, play through waves 1-5. Verify:
- Wave 1: only green normal zombies
- Wave 2: orange runners appear, move faster
- Wave 3+: red tanks appear, big and slow
- Wave 5+: purple spitters appear
- Different XP values per type
- Death animation plays (rotation + fade)

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "Add 4 zombie types with wave-based spawn weights and death animation"
```

---

### Task 5: Spitter AI + Projectiles

**Files:**
- Modify: `public/index.html` — `updateZombies()`, add spitter projectile array and rendering

- [ ] **Step 1: Add spitter projectile state**

Add `let spitterProjectiles = [];` to the STATE section. Reset it in `init()`.

- [ ] **Step 2: Add spitter AI in updateZombies()**

Inside the zombie update loop, after the existing movement code, add a check for spitter type:

```js
if (z.type === 'spitter' && z.alive) {
  const dist = Math.sqrt((player.x-z.x)**2 + (player.y-z.y)**2);
  // keep distance
  if (dist < 150) {
    // move away from player
    const nx = z.x - (dx/dist) * z.speed;
    const ny = z.y - (dy/dist) * z.speed;
    if (!wallCollide(nx, z.y, z.radius - 2)) z.x = nx;
    if (!wallCollide(z.x, ny, z.radius - 2)) z.y = ny;
  } else if (dist > 200) {
    // approach (already handled by normal movement above)
  } else {
    // in range, stop moving (handled by skipping normal movement)
  }

  // shoot
  z.shootCooldown--;
  if (z.shootCooldown <= 0 && dist < 300) {
    z.shootCooldown = 150; // ~2.5s at 60fps
    const angle = Math.atan2(player.y - z.y, player.x - z.x);
    spitterProjectiles.push({
      x: z.x, y: z.y,
      dx: Math.cos(angle) * 5,
      dy: Math.sin(angle) * 5,
      life: 80,
    });
  }
}
```

Refactor the spitter movement: skip the normal "move toward player" code if the spitter is within 150-200px range.

- [ ] **Step 3: Update spitter projectiles**

Add `updateSpitterProjectiles()`:

```js
function updateSpitterProjectiles() {
  for (let i = spitterProjectiles.length - 1; i >= 0; i--) {
    const p = spitterProjectiles[i];
    p.x += p.dx; p.y += p.dy;
    p.life--;

    if (p.life <= 0 || wallCollide(p.x, p.y, 3)) {
      spitterProjectiles.splice(i, 1);
      continue;
    }

    // hit player
    const dx = p.x - player.x, dy = p.y - player.y;
    if (dx*dx + dy*dy < (6 + PLAYER_R)**2) {
      player.hp -= 10;
      hurtFlash = 18;
      spawnBlood(player.x, player.y, 4);
      spitterProjectiles.splice(i, 1);
      if (player.hp <= 0) { player.hp = 0; gameOver(); }
      updateHUD();
    }
  }
}
```

Call it in `loop()` after `updateBullets()`.

- [ ] **Step 4: Draw spitter projectiles**

Add `drawSpitterProjectiles()`:

```js
function drawSpitterProjectiles() {
  for (const p of spitterProjectiles) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#663399';
    ctx.fillStyle = '#99ff66';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}
```

Call it in `loop()` after `drawBullets()`.

- [ ] **Step 5: Test spitter**

Play to wave 5+. Verify:
- Spitters keep distance from player
- They shoot green/purple projectiles every ~2.5s
- Projectiles deal 10 damage
- Projectiles stop at walls
- Projectiles still fly after spitter dies

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "Add spitter AI with ranged projectile attacks"
```

---

### Task 6: Improved Zombie Wall Avoidance + Aggression

**Files:**
- Modify: `public/index.html` — `updateZombies()`

- [ ] **Step 1: Add wall avoidance logic**

Replace the simple movement in `updateZombies()`. **Important:** Keep the spitter distance-keeping logic from Task 5 — only apply this new movement to non-spitter zombies (or spitters outside their preferred range). Wrap the existing spitter check from Task 5 with this new wall-avoidance logic:

```js
if (dist > 1) {
  // spitters have their own movement logic (Task 5) — skip normal approach when in range
  const isSpitterInRange = z.type === 'spitter' && dist >= 120 && dist <= 220;

  let moveX = isSpitterInRange ? 0 : (dx/dist) * spd;
  let moveY = isSpitterInRange ? 0 : (dy/dist) * spd;

  // aggression: faster when player is low
  const aggroMult = player.hp < player.maxHp * 0.3 ? 1.2 : 1.0;
  moveX *= aggroMult;
  moveY *= aggroMult;

  const canX = !wallCollide(z.x + moveX, z.y, z.radius - 2);
  const canY = !wallCollide(z.x, z.y + moveY, z.radius - 2);

  if (canX) {
    z.x += moveX;
  } else {
    // wall ahead on X, try sliding on Y
    if (!z.avoidDir) z.avoidDir = Math.random() < 0.5 ? 1 : -1;
    const slideY = z.avoidDir * spd * aggroMult;
    if (!wallCollide(z.x, z.y + slideY, z.radius - 2)) z.y += slideY;
    else z.avoidDir = -z.avoidDir; // try other side
  }

  if (canY) {
    z.y += moveY;
  } else {
    if (!z.avoidDir) z.avoidDir = Math.random() < 0.5 ? 1 : -1;
    const slideX = z.avoidDir * spd * aggroMult;
    if (!wallCollide(z.x + slideX, z.y, z.radius - 2)) z.x += slideX;
    else z.avoidDir = -z.avoidDir;
  }

  // reset avoidDir when path is clear
  if (canX && canY) z.avoidDir = 0;
}
```

Add `avoidDir: 0` to the zombie spawn object in `spawnZombie()`.

- [ ] **Step 2: Test wall avoidance**

Verify zombies navigate around walls instead of getting stuck. Test with the map's center pillars and corner walls.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Add zombie wall avoidance and low-HP aggression boost"
```

---

### Task 7: XP System + HUD

**Files:**
- Modify: `public/index.html` — add XP bar CSS/HTML, XP calculation logic, level-up effect

- [ ] **Step 1: Add XP bar CSS**

```css
#xp-bar-wrap {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 8px;
  background: #111;
  border-top: 1px solid #1a1a1a;
  z-index: 5;
  pointer-events: none;
}
#xp-bar {
  height: 100%;
  background: #55cc33;
  width: 0%;
  transition: width 0.3s;
  box-shadow: 0 0 8px #55cc3366;
}
#xp-level {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  color: #55cc33;
  z-index: 6;
  pointer-events: none;
  text-shadow: 0 0 6px #55cc3344;
}
#level-up-banner {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 48px;
  color: #55cc33;
  letter-spacing: 8px;
  text-shadow: 0 0 30px #55cc3399;
  pointer-events: none;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.3s;
}
```

- [ ] **Step 2: Add XP bar HTML**

Inside `#wrapper`, after the reload bar:

```html
<div id="xp-bar-wrap"><div id="xp-bar"></div></div>
<div id="xp-level">LVL 1</div>
<div id="level-up-banner">LEVEL UP!</div>
```

- [ ] **Step 3: Add XP logic in JavaScript**

```js
const XP_THRESHOLDS = [0, 50, 150, 300, 500];
// after level 5: +250 per level
function getXpForLevel(level) {
  if (level <= 1) return 0;
  if (level <= XP_THRESHOLDS.length) return XP_THRESHOLDS[level - 1];
  return XP_THRESHOLDS[XP_THRESHOLDS.length - 1] + (level - XP_THRESHOLDS.length) * 250;
}

function getLevelFromXp(totalXp) {
  let level = 1;
  while (getXpForLevel(level + 1) <= totalXp) level++;
  return level;
}

function updateXpBar() {
  const level = getLevelFromXp(sessionXp);
  const currentThreshold = getXpForLevel(level);
  const nextThreshold = getXpForLevel(level + 1);
  const progress = (sessionXp - currentThreshold) / (nextThreshold - currentThreshold);

  document.getElementById('xp-bar').style.width = (progress * 100) + '%';
  document.getElementById('xp-level').textContent = `LVL ${level}`;

  // level up detection
  if (level > currentLevel) {
    currentLevel = level;
    showLevelUp();
  }
}

function showLevelUp() {
  const el = document.getElementById('level-up-banner');
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 2000);
  // green particles
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: player.x, y: player.y,
      dx: Math.cos(a) * (2 + Math.random()*3),
      dy: Math.sin(a) * (2 + Math.random()*3),
      life: 20 + Math.random()*15,
      maxLife: 35,
      color: '#55cc33',
      r: 3 + Math.random()*3,
    });
  }
}
```

Add `let currentLevel = 1;` to state. Reset in `init()`.

Call `updateXpBar()` wherever `sessionXp` changes (in the kill code).

- [ ] **Step 4: Test XP system**

Play and kill zombies. Verify:
- XP bar fills up at bottom
- Level displays correctly
- Level-up banner shows with particles
- Different zombie types give different XP

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Add Minecraft-style XP bar with level-up effects"
```

---

### Task 8: Health Pickups

**Files:**
- Modify: `public/index.html` — add healthpack spawning, rendering, pickup logic

- [ ] **Step 1: Add healthpack state and config**

```js
let healthpacks = [];
let lastHealthpackSpawn = 0;
const HEALTHPACK_HEAL = 25;
const HEALTHPACK_LIFETIME = 600; // 10s at 60fps
const HEALTHPACK_BLINK = 180; // blink last 3s
const HEALTHPACK_MAX = 3;
const HEALTHPACK_INTERVAL = [900, 1200]; // 15-20s at 60fps
```

Reset `healthpacks = []` and `lastHealthpackSpawn = 0` in `init()`.

- [ ] **Step 2: Add spawn logic**

```js
function findFreeSpawnTile() {
  const freeTiles = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (MAP[r][c] !== 0) continue;
      const tx = c * TILE + TILE/2;
      const ty = r * TILE + TILE/2;
      const dx = tx - player.x, dy = ty - player.y;
      if (Math.sqrt(dx*dx + dy*dy) < TILE * 3) continue; // min 3 tiles from player
      freeTiles.push({ x: tx, y: ty });
    }
  }
  return freeTiles.length > 0 ? freeTiles[Math.floor(Math.random() * freeTiles.length)] : null;
}

function spawnHealthpack() {
  if (healthpacks.length >= HEALTHPACK_MAX) return;
  const pos = findFreeSpawnTile();
  if (!pos) return;
  healthpacks.push({ x: pos.x, y: pos.y, life: HEALTHPACK_LIFETIME });
}

let nextHealthpackAt = HEALTHPACK_INTERVAL[0] + Math.random() * (HEALTHPACK_INTERVAL[1] - HEALTHPACK_INTERVAL[0]);

function tryTimerHealthpack() {
  lastHealthpackSpawn++;
  if (lastHealthpackSpawn >= nextHealthpackAt) {
    spawnHealthpack();
    lastHealthpackSpawn = 0;
    nextHealthpackAt = HEALTHPACK_INTERVAL[0] + Math.random() * (HEALTHPACK_INTERVAL[1] - HEALTHPACK_INTERVAL[0]);
  }
}

function tryDropHealthpack(x, y) {
  if (Math.random() < 0.15) { // 15% chance
    if (healthpacks.length >= HEALTHPACK_MAX) return;
    healthpacks.push({ x, y, life: HEALTHPACK_LIFETIME });
  }
}
```

- [ ] **Step 3: Add update + pickup logic**

```js
function updateHealthpacks() {
  for (let i = healthpacks.length - 1; i >= 0; i--) {
    const h = healthpacks[i];
    h.life--;
    if (h.life <= 0) { healthpacks.splice(i, 1); continue; }

    // pickup check
    const dx = h.x - player.x, dy = h.y - player.y;
    if (dx*dx + dy*dy < (PLAYER_R + 10)**2) {
      player.hp = Math.min(player.hp + HEALTHPACK_HEAL, player.maxHp);
      healthpacks.splice(i, 1);
      updateHUD();
      // heal particles
      for (let j = 0; j < 8; j++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: player.x, y: player.y,
          dx: Math.cos(a)*2, dy: Math.sin(a)*2 - 1,
          life: 15, maxLife: 15,
          color: '#33cc44', r: 3,
        });
      }
    }
  }
}
```

- [ ] **Step 4: Draw healthpacks**

```js
function drawHealthpacks() {
  for (const h of healthpacks) {
    // blink when about to despawn
    if (h.life < HEALTHPACK_BLINK && Math.floor(h.life / 8) % 2 === 0) continue;

    ctx.save();
    ctx.translate(h.x, h.y);

    // pulsing glow
    const pulse = 0.8 + Math.sin(frameCount * 0.1) * 0.2;
    ctx.globalAlpha = pulse;

    // green cross
    ctx.fillStyle = '#33cc44';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#33cc4488';
    ctx.fillRect(-3, -8, 6, 16); // vertical
    ctx.fillRect(-8, -3, 16, 6); // horizontal

    // white center
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulse * 0.6;
    ctx.fillRect(-1.5, -5, 3, 10);
    ctx.fillRect(-5, -1.5, 10, 3);

    ctx.restore();
  }
}
```

- [ ] **Step 5: Hook into game loop**

In `loop()`:
- Call `tryTimerHealthpack()` after `updateReload(now)`
- Call `updateHealthpacks()` after that
- Call `drawHealthpacks()` after `drawBloodDecals()` (before particles)

On zombie kill in `updateBullets()`:
- Call `tryDropHealthpack(z.x, z.y)` when a zombie dies

- [ ] **Step 6: Test healthpacks**

Verify:
- Healthpacks spawn every 15-20s
- Zombies drop them ~15% of the time
- Pickup heals 25 HP (capped at 100)
- Green particles on pickup
- Blink before despawn
- Max 3 on field

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "Add health pickup system with timer spawns and zombie drops"
```

---

### Task 9: Improved Animations

**Files:**
- Modify: `public/index.html` — `drawPlayer()`, `drawZombie()`, `tryShoot()`

- [ ] **Step 1: Add shoot recoil to player**

Add `player.recoil = 0` in `init()`. In `tryShoot()`, set `player.recoil = 4`.

In `drawPlayer()`, offset the gun arm:

```js
// gun arm + barrel (with recoil)
const recoil = player.recoil || 0;
ctx.fillStyle = '#445533';
ctx.fillRect(4 - recoil, -2, 12, 4);
ctx.fillStyle = '#222';
ctx.fillRect(14 - recoil, -1.5, 8, 3);
```

In `movePlayer()`, decay recoil: `if (player.recoil > 0) player.recoil -= 0.5;`

- [ ] **Step 2: Add zombie attack animation**

When a zombie is hitting the player, extend its arms further forward. In `drawZombie()`, check `z.hitting`:

```js
const armReach = z.hitting ? 14*s : 10*s;
// use armReach instead of 10*s in arm drawing
```

- [ ] **Step 3: Add spitter throw animation**

Track `z.throwAnim` (set to 8 when spitter shoots). In `drawZombie()`, if spitter has throwAnim > 0, rotate one arm upward.

- [ ] **Step 4: Test animations**

Verify recoil on shoot, zombie arm extension on attack, spitter throw animation.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Add shoot recoil, zombie attack arms, and spitter throw animation"
```

---

### Task 10: Minimap Update + Healthpack Markers

**Files:**
- Modify: `public/index.html` — `drawMinimap()`

- [ ] **Step 1: Add healthpack + zombie type colors to minimap**

Update `drawMinimap()`:

```js
// Zombies with type colors
for (const z of zombies) {
  if (!z.alive) continue;
  const colors = { normal: '#aa2200', runner: '#cc6600', tank: '#661111', spitter: '#663399' };
  ctx.fillStyle = colors[z.type] || '#aa2200';
  ctx.fillRect(ox + (z.x/TILE)*S - 1, oy + (z.y/TILE)*S - 1, 3, 3);
}

// Healthpacks
ctx.fillStyle = '#33cc44';
for (const h of healthpacks) {
  ctx.fillRect(ox + (h.x/TILE)*S - 1, oy + (h.y/TILE)*S - 1, 3, 3);
}
```

- [ ] **Step 2: Test minimap**

Verify different zombie types show in different colors and healthpacks appear as green dots.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Update minimap with zombie type colors and healthpack markers"
```

---

### Task 11: Final Integration + Polish

**Files:**
- Modify: `public/index.html` — wire everything together, final cleanup

- [ ] **Step 1: Add account name to HUD**

In the HUD section, add the player name display. Update `showGameMenu()` to also set the HUD name.

- [ ] **Step 2: Clean up dead zombie array**

Make sure dead zombies with expired death timers get properly cleaned up from the array to prevent memory leaks in long sessions. Cap blood decals at 200.

- [ ] **Step 3: Show total XP in menu, session XP in-game**

On login, fetch profile and show total XP + level in the game menu overlay (next to the player name). In-game, `sessionXp` starts at 0 and only tracks XP earned this round. The XP bar shows session progress. On game-over, `sessionXp` is sent to the backend and added to the total. The game-over screen shows "+{sessionXp} XP" earned this round.

- [ ] **Step 4: Full playtest**

Test complete flow:
1. Start server
2. Register new account
3. Play through 5+ waves
4. Die, verify XP sent to backend
5. Log out, log back in
6. Verify XP persisted
7. Switch account (register new), verify separate XP

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Final polish: HUD name, memory cleanup, XP persistence"
```

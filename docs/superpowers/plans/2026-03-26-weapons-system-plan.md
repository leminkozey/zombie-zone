# Weapons System, Menu Overhaul & Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 weapons with upgrades, Gold/Diamond currencies, zombie gold drops, revamped tab-based main menu, and clean up skill tree by removing reload/fire-rate skills.

**Architecture:** Single-file frontend (`index.html`) with all game code. Express+SQLite backend. New `user_weapons` table, Gold/Diamond columns on users. Weapons defined as data-driven config array. Menu system becomes tab-based overlay. Shooting/reload reads from active weapon config.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Express 5, better-sqlite3, JWT auth

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `database.js` | Modify | Add `user_weapons` table, gold/diamonds columns, weapon prepared statements, update death transaction |
| `server.js` | Modify | Add weapon API endpoints, gold endpoint, update death endpoint, remove old skill IDs |
| `public/index.html` | Modify | Weapon configs, menu tabs, arsenal UI, shooting overhaul, gold drops, skill tree cleanup |

---

### Task 1: Backend — Database Schema & Weapon API

**Files:**
- Modify: `database.js`
- Modify: `server.js`

- [ ] **Step 1: Add gold/diamonds columns and user_weapons table to database.js**

In `database.js`, after the `user_skills` table creation, add:

```js
// Add gold/diamonds to users (safe to run multiple times due to try/catch)
try { db.exec('ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0'); } catch {}

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
```

Add prepared statements:

```js
const getUserWeapons = db.prepare('SELECT * FROM user_weapons WHERE user_id = ?');
const getWeapon = db.prepare('SELECT * FROM user_weapons WHERE user_id = ? AND weapon_id = ?');
const buyWeapon = db.prepare('INSERT OR IGNORE INTO user_weapons (user_id, weapon_id) VALUES (?, ?)');
const upgradeWeaponStat = db.prepare('UPDATE user_weapons SET ${stat}_level = ${stat}_level + 1 WHERE user_id = ? AND weapon_id = ?');
const deleteUserWeapons = db.prepare('DELETE FROM user_weapons WHERE user_id = ?');
const addGold = db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?');
const setGold = db.prepare('UPDATE users SET gold = ? WHERE id = ?');
const addDiamonds = db.prepare('UPDATE users SET diamonds = diamonds + ? WHERE id = ?');
```

Note: `upgradeWeaponStat` can't use template literals in prepared statements. Instead create a helper function:

```js
function upgradeWeaponStat(userId, weaponId, stat) {
  const validStats = ['dmg', 'range', 'rate', 'reload', 'mag', 'acc'];
  if (!validStats.includes(stat)) throw new Error('Invalid stat');
  db.prepare(`UPDATE user_weapons SET ${stat}_level = ${stat}_level + 1 WHERE user_id = ? AND weapon_id = ?`).run(userId, weaponId);
}
```

Update `applyDeath` transaction:

```js
const applyDeath = db.transaction((userId) => {
  const user = getUser.get(userId);
  if (!user) return null;
  const newXp = Math.floor(user.xp * 0.25);
  setXp.run(newXp, userId);
  setGold.run(0, userId);
  deleteUserSkills.run(userId);
  deleteUserWeapons.run(userId);
  // Diamonds are kept — no change
  return { xp: newXp, gold: 0, diamonds: user.diamonds };
});
```

Also add a migration to clean up removed skills:

```js
// Remove deprecated skills
db.prepare("DELETE FROM user_skills WHERE skill_id IN ('quick_reload', 'trigger_finger')").run();
```

Update module.exports to include all new statements.

- [ ] **Step 2: Update getUser to include gold/diamonds**

Change the `getUser` prepared statement:

```js
const getUser = db.prepare('SELECT id, name, xp, gold, diamonds FROM users WHERE id = ?');
```

- [ ] **Step 3: Add weapon API endpoints to server.js**

Add weapon definitions map on the server (for validation):

```js
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
```

Add endpoints:

```js
// GET /api/weapons
app.get('/api/weapons', auth, (req, res) => {
  const weapons = getUserWeapons.all(req.user.id);
  res.json({ weapons });
});

// POST /api/weapons/buy
app.post('/api/weapons/buy', auth, (req, res) => {
  const { weaponId } = req.body;
  const def = WEAPON_DEFS[weaponId];
  if (!def) return res.status(400).json({ error: 'Unknown weapon' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const level = getLevelFromXp(user.xp);
  if (level < def.unlockLevel) return res.status(400).json({ error: 'Level too low' });
  if (user.gold < def.cost) return res.status(400).json({ error: 'Not enough gold' });

  const existing = getWeapon.get(req.user.id, weaponId);
  if (existing) return res.status(400).json({ error: 'Already owned' });

  if (def.cost > 0) {
    addGold.run(-def.cost, req.user.id);
  }
  buyWeapon.run(req.user.id, weaponId);
  const weapons = getUserWeapons.all(req.user.id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ weapons, gold: updatedUser.gold });
});

// POST /api/weapons/upgrade
app.post('/api/weapons/upgrade', auth, (req, res) => {
  const { weaponId, stat } = req.body;
  const validStats = ['dmg', 'range', 'rate', 'reload', 'mag', 'acc'];
  if (!validStats.includes(stat)) return res.status(400).json({ error: 'Invalid stat' });

  const weapon = getWeapon.get(req.user.id, weaponId);
  if (!weapon) return res.status(400).json({ error: 'Weapon not owned' });

  const currentLevel = weapon[stat + '_level'];
  if (currentLevel >= MAX_UPGRADE_LEVEL) return res.status(400).json({ error: 'Max level' });

  const baseCost = UPGRADE_BASE_COSTS[stat];
  const cost = Math.floor(baseCost * (1 + currentLevel * 0.8));

  const user = getUser.get(req.user.id);
  if (user.gold < cost) return res.status(400).json({ error: 'Not enough gold' });

  addGold.run(-cost, req.user.id);
  upgradeWeaponStat(req.user.id, weaponId, stat);

  const weapons = getUserWeapons.all(req.user.id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ weapons, gold: updatedUser.gold });
});

// POST /api/gold
app.post('/api/gold', auth, (req, res) => {
  const { gold, diamonds } = req.body;
  if (typeof gold === 'number' && gold > 0) addGold.run(gold, req.user.id);
  if (typeof diamonds === 'number' && diamonds > 0) addDiamonds.run(diamonds, req.user.id);
  const user = getUser.get(req.user.id);
  res.json({ gold: user.gold, diamonds: user.diamonds });
});
```

Update SKILL_MAX_LEVELS — remove `quick_reload` and `trigger_finger`:

```js
const SKILL_MAX_LEVELS = {
  vitality: 5, field_medic: 3, shield: 5, regen: 3, thick_skin: 3, fortress: 1, second_wind: 1,
  swift: 5, dash: 1, dash_range: 3, dash_cd: 3, dash_charges: 2, phantom_dash: 1, bullet_time: 1,
  quick_call: 5, fast_extract: 4, survival_instinct: 5, rapid_redial: 3, ext_window: 3, safe_zone: 3, steady_hands: 3, evac_chopper: 1, fortified_lz: 1,
};
```

Update `/api/profile` to return gold/diamonds:

```js
app.get('/api/profile', auth, (req, res) => {
  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, xp: user.xp, gold: user.gold, diamonds: user.diamonds });
});
```

Update `/api/death` response to include diamonds:

The `applyDeath` transaction already returns `{ xp, gold, diamonds }`.

- [ ] **Step 4: Test with curl**

```bash
# Login
curl -s -X POST http://localhost:4444/api/login -H "Content-Type: application/json" -d '{"name":"lemin","password":"admin"}'

# Add gold
curl -s -X POST http://localhost:4444/api/gold -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"gold":5000}'

# Buy SMG
curl -s -X POST http://localhost:4444/api/weapons/buy -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"weaponId":"smg"}'

# Upgrade SMG damage
curl -s -X POST http://localhost:4444/api/weapons/upgrade -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"weaponId":"smg","stat":"dmg"}'

# Get weapons
curl -s http://localhost:4444/api/weapons -H "Authorization: Bearer TOKEN"

# Death — verify weapons gone, gold 0
curl -s -X POST http://localhost:4444/api/death -H "Authorization: Bearer TOKEN"
```

- [ ] **Step 5: Commit**

```bash
git add database.js server.js
git commit -m "Add weapon DB schema, gold/diamonds, weapon buy/upgrade/gold API endpoints"
```

---

### Task 2: Weapon Definitions & Shooting Overhaul

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add weapon config array**

After the SKILL_DEFINITIONS section, add:

```js
// ── WEAPON DEFINITIONS ─────────────────────────────────
const WEAPONS = {
  pistol:         { id: 'pistol', name: 'PISTOL', type: 'Semi', unlockLevel: 0, cost: 0, damage: 1, range: 55, fireRate: 8, reloadMs: 1800, magSize: 12, spread: 0.06, special: null, icon: '🔫' },
  smg:            { id: 'smg', name: 'SMG', type: 'Auto', unlockLevel: 8, cost: 800, damage: 0.7, range: 45, fireRate: 3, reloadMs: 1500, magSize: 35, spread: 0.1, special: null, icon: '⚡' },
  shotgun:        { id: 'shotgun', name: 'SHOTGUN', type: 'Spread', unlockLevel: 20, cost: 4000, damage: 1.5, range: 30, fireRate: 20, reloadMs: 2200, magSize: 6, spread: 0.3, special: 'shotgun', icon: '💥' },
  assault_rifle:  { id: 'assault_rifle', name: 'ASSAULT RIFLE', type: 'Auto', unlockLevel: 35, cost: 12000, damage: 1.2, range: 65, fireRate: 5, reloadMs: 1600, magSize: 30, spread: 0.04, special: null, icon: '🎯' },
  sniper:         { id: 'sniper', name: 'SNIPER', type: 'Single', unlockLevel: 55, cost: 30000, damage: 4, range: 90, fireRate: 30, reloadMs: 2500, magSize: 5, spread: 0.01, special: 'pierce', icon: '🔭' },
  minigun:        { id: 'minigun', name: 'MINIGUN', type: 'Auto', unlockLevel: 75, cost: 60000, damage: 0.8, range: 55, fireRate: 2, reloadMs: 3000, magSize: 100, spread: 0.12, special: 'spinup', icon: '⚙' },
};

const UPGRADE_BASE_COSTS = { dmg: 100, range: 80, rate: 120, reload: 80, mag: 100, acc: 60 };

let playerWeapons = []; // from server: [{weapon_id, dmg_level, range_level, ...}]
let activeWeaponId = 'pistol';
let ownedWeaponIds = ['pistol']; // always own pistol

function getWeaponStat(weaponId, stat) {
  const base = WEAPONS[weaponId];
  if (!base) return 0;
  const owned = playerWeapons.find(w => w.weapon_id === weaponId);
  const lvl = owned ? (owned[stat + '_level'] || 0) : 0;

  switch (stat) {
    case 'dmg': return base.damage * (1 + lvl * 0.1);
    case 'range': return base.range + lvl * 5;
    case 'rate': return Math.max(1, base.fireRate - lvl * 0.5);
    case 'reload': return base.reloadMs * (1 - lvl * 0.08);
    case 'mag': return Math.round(base.magSize * (1 + lvl * 0.1));
    case 'acc': return base.spread * (1 - lvl * 0.08);
    default: return 0;
  }
}

function getUpgradeCost(stat, currentLevel) {
  return Math.floor(UPGRADE_BASE_COSTS[stat] * (1 + currentLevel * 0.8));
}
```

- [ ] **Step 2: Add gold/diamond tracking variables**

In the state section, add:

```js
let globalGold = 0;
let globalDiamonds = 0;
let pendingGold = 0;
let pendingDiamonds = 0;
let lastGoldSync = 0;
const GOLD_SYNC_INTERVAL = 10000;
let minigunSpinup = 0; // frames of continuous firing
```

- [ ] **Step 3: Overhaul tryShoot() to use active weapon**

Replace the existing `tryShoot()`:

```js
function tryShoot() {
  const wpn = WEAPONS[activeWeaponId];
  if (!wpn) return;
  const fireRate = Math.max(1, Math.round(getWeaponStat(activeWeaponId, 'rate')));
  const magSize = getWeaponStat(activeWeaponId, 'mag');
  const spread = getWeaponStat(activeWeaponId, 'acc');
  const dmg = getWeaponStat(activeWeaponId, 'dmg');
  const range = Math.round(getWeaponStat(activeWeaponId, 'range'));

  if (reloading || player.ammo <= 0 || player.shootCooldown > 0) return;

  // Minigun spin-up: first 30 frames of firing have reduced rate
  if (wpn.special === 'spinup') {
    minigunSpinup++;
    if (minigunSpinup < 30) {
      const spinFactor = minigunSpinup / 30;
      player.shootCooldown = Math.round(fireRate / spinFactor);
    } else {
      player.shootCooldown = fireRate;
    }
  } else {
    player.shootCooldown = fireRate;
  }

  player.ammo--;
  player.recoil = 4;
  updateHUD();

  const angle = Math.atan2(mouseY - player.y, mouseX - player.x);

  if (wpn.special === 'shotgun') {
    // 5 pellets in a spread
    for (let p = 0; p < 5; p++) {
      const pelletSpread = (p - 2) * 0.12 + (Math.random() - 0.5) * spread;
      bullets.push({
        x: player.x, y: player.y,
        dx: Math.cos(angle + pelletSpread) * BULLET_SPD,
        dy: Math.sin(angle + pelletSpread) * BULLET_SPD,
        life: range, damage: dmg, pierce: false,
      });
    }
  } else {
    const bulletSpread = (Math.random() - 0.5) * spread;
    bullets.push({
      x: player.x, y: player.y,
      dx: Math.cos(angle + bulletSpread) * BULLET_SPD,
      dy: Math.sin(angle + bulletSpread) * BULLET_SPD,
      life: range, damage: dmg, pierce: wpn.special === 'pierce',
    });
  }

  // Muzzle particles
  for (let i = 0; i < 4; i++) {
    const a = angle + (Math.random()-0.5)*0.4;
    particles.push({
      x: player.x, y: player.y,
      dx: Math.cos(a)*3*(Math.random()+0.5),
      dy: Math.sin(a)*3*(Math.random()+0.5),
      life: 8, maxLife: 8, color: '#ffcc00', r: 2,
    });
  }

  if (player.ammo === 0) startReload();
}
```

- [ ] **Step 4: Update init() to use weapon config**

In `init()`, replace hardcoded ammo/reload values:

```js
const wpn = WEAPONS[activeWeaponId];
player.ammo = getWeaponStat(activeWeaponId, 'mag');
player.maxAmmo = getWeaponStat(activeWeaponId, 'mag');
minigunSpinup = 0;
```

Remove `MAX_AMMO` usage in init — use `player.maxAmmo` instead.

- [ ] **Step 5: Update updateReload() to use weapon reload time**

```js
function updateReload(now) {
  if (!reloading) return;
  const reloadTime = getWeaponStat(activeWeaponId, 'reload');
  const prog = Math.min((now - reloadStart) / reloadTime, 1);
  document.getElementById('reload-bar').style.width = (prog * 100) + '%';
  if (prog >= 1) {
    reloading = false;
    player.ammo = getWeaponStat(activeWeaponId, 'mag');
    document.getElementById('reload-bar-wrap').style.display = 'none';
    updateHUD();
  }
}
```

- [ ] **Step 6: Update bullet collision for damage multiplier and pierce**

In `updateBullets()`, change the damage line:

```js
// Replace: z.hp--;
z.hp -= b.damage || 1;
```

For pierce: don't splice the bullet when hitting a zombie if `b.pierce`:

```js
if (z.hp <= 0) { /* kill logic */ }
if (!b.pierce) { bullets.splice(i, 1); hit = true; }
```

- [ ] **Step 7: Add minigun movement penalty**

In `movePlayer()`, after computing speed:

```js
// Minigun movement penalty while firing
if (activeWeaponId === 'minigun' && mouseDown && !reloading && player.ammo > 0) {
  speed *= 0.7;
}
```

Also reset minigun spinup when not firing:

```js
// In loop(), when mouseDown is false:
if (!mouseDown) minigunSpinup = 0;
```

- [ ] **Step 8: Add weapon switching with number keys**

In the keydown handler:

```js
// Weapon switching: 1-6
const weaponKeys = { 'Digit1': 'pistol', 'Digit2': 'smg', 'Digit3': 'shotgun', 'Digit4': 'assault_rifle', 'Digit5': 'sniper', 'Digit6': 'minigun' };
if (weaponKeys[e.code] && ownedWeaponIds.includes(weaponKeys[e.code])) {
  activeWeaponId = weaponKeys[e.code];
  player.ammo = getWeaponStat(activeWeaponId, 'mag');
  reloading = false;
  document.getElementById('reload-bar-wrap').style.display = 'none';
  minigunSpinup = 0;
  updateHUD();
}
```

- [ ] **Step 9: Update HUD for weapon ammo**

In `updateHUD()`, replace `MAX_AMMO` references with `player.maxAmmo` or `getWeaponStat(activeWeaponId, 'mag')`:

```js
document.getElementById('ammo-val').textContent = player.ammo;
const maxAmmo = getWeaponStat(activeWeaponId, 'mag');
const pips = document.getElementById('ammo-display');
pips.innerHTML = '';
const pipCount = Math.min(maxAmmo, 40); // cap visual pips at 40
for (let i = 0; i < pipCount; i++) {
  const d = document.createElement('div');
  d.className = 'bullet-pip' + (i < player.ammo ? '' : ' empty');
  pips.appendChild(d);
}
```

- [ ] **Step 10: Commit**

```bash
git add public/index.html
git commit -m "Add weapon definitions, shooting overhaul, pierce/shotgun/minigun mechanics"
```

---

### Task 3: Gold Drops & Currency System

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add gold drop on zombie kill**

In `updateBullets()`, where zombies die (the kill scoring section), add gold drop:

```js
// After: score += z.xp; pendingXp += z.xp;
const goldDef = { normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4] };
const gd = goldDef[z.type] || goldDef.normal;
let goldAmount = gd[0] + Math.floor(Math.random() * (gd[1] - gd[0] + 1)) + gd[2] * wave;
if (Math.random() < 0.05) goldAmount *= 3; // Gold Haufen
pendingGold += goldAmount;

// Diamond drop (wave 10+)
if (wave >= 10) {
  const diaChance = z.type === 'tank' ? 0.02 : z.type === 'spitter' ? 0.01 : 0;
  if (Math.random() < diaChance) {
    pendingDiamonds += 1;
    // Flash notification
    showWaveBanner('+1 DIAMANT!');
  }
}

// Floating gold text
floatingTexts.push({
  x: z.x, y: z.y - 10,
  text: '+' + goldAmount + 'G',
  life: 40, maxLife: 40,
  color: '#ddaa00',
});
```

- [ ] **Step 2: Add floating text system**

Add state variable:

```js
let floatingTexts = []; // { x, y, text, life, maxLife, color }
```

Reset in `init()`:

```js
floatingTexts = [];
```

Add update and draw functions:

```js
function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 0.5;
    ft.life--;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    ctx.save();
    ctx.globalAlpha = ft.life / ft.maxLife;
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}
```

Wire into `loop()`:
- After `updateParticles()`: `updateFloatingTexts();`
- After `drawParticles()`: `drawFloatingTexts();`

- [ ] **Step 3: Add gold sync (same pattern as XP)**

```js
function syncGold() {
  if (!authToken || (pendingGold <= 0 && pendingDiamonds <= 0)) return;
  const goldToSync = pendingGold;
  const diaToSync = pendingDiamonds;
  pendingGold = 0;
  pendingDiamonds = 0;
  globalGold += goldToSync;
  globalDiamonds += diaToSync;
  fetch('/api/gold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ gold: goldToSync, diamonds: diaToSync })
  }).catch(() => {
    pendingGold += goldToSync;
    pendingDiamonds += diaToSync;
    globalGold -= goldToSync;
    globalDiamonds -= diaToSync;
  });
}
```

In `loop()`, add gold sync alongside XP sync:

```js
if ((pendingGold > 0 || pendingDiamonds > 0) && now - lastGoldSync > GOLD_SYNC_INTERVAL) {
  syncGold();
  lastGoldSync = now;
}
```

- [ ] **Step 4: Add gold to HUD**

Add a small gold counter near the ammo display. In the HUD HTML area, add:

```html
<div id="gold-display" style="position:absolute;bottom:50px;right:16px;font-size:11px;color:#ddaa00;font-family:'JetBrains Mono',monospace;pointer-events:none;z-index:5;text-align:right"></div>
```

In `updateHUD()`:

```js
document.getElementById('gold-display').textContent = (globalGold + pendingGold) + 'G';
```

- [ ] **Step 5: Update gameOver() and quit to sync gold + clear**

In `gameOver()`, before calling death API, sync gold:

```js
if (pendingGold > 0 || pendingDiamonds > 0) {
  const g = pendingGold, d = pendingDiamonds;
  pendingGold = 0; pendingDiamonds = 0;
  globalGold += g; globalDiamonds += d;
  try { await fetch('/api/gold', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }, body: JSON.stringify({ gold: g, diamonds: d }) }); } catch {}
}
```

After death API response, set `globalGold = 0` (death clears gold).

Same in quit handler.

- [ ] **Step 6: Load gold/diamonds in showGameMenu()**

In `showGameMenu()`, after profile fetch, store gold/diamonds:

```js
globalGold = data.gold || 0;
globalDiamonds = data.diamonds || 0;
```

Also load weapons:

```js
try {
  const wpnRes = await fetch('/api/weapons', { headers: { 'Authorization': 'Bearer ' + authToken } });
  if (wpnRes.ok) {
    const wpnData = await wpnRes.json();
    playerWeapons = wpnData.weapons;
    ownedWeaponIds = ['pistol', ...wpnData.weapons.map(w => w.weapon_id)];
    if (!ownedWeaponIds.includes(activeWeaponId)) activeWeaponId = 'pistol';
  }
} catch {}
```

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "Add gold/diamond drops, floating text, gold sync, gold HUD"
```

---

### Task 4: Skill Tree Cleanup

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Remove quick_reload and trigger_finger from SKILLS array**

Find and delete these two skill definitions from the SKILLS array. Also change `bullet_time`'s req from `'trigger_finger'` to `'swift'`:

```js
// DELETE these two:
{ id: 'quick_reload', ... },
{ id: 'trigger_finger', ... },

// CHANGE bullet_time:
{ id: 'bullet_time', path: 'mobility', req: 'swift', tier: 3, maxLvl: 1, ... },
```

- [ ] **Step 2: Remove reloadMs and shootCooldown from BASE_STATS**

These are now handled by weapon config, not the stat system. Remove from BASE_STATS:

```js
// DELETE these lines from BASE_STATS:
shootCooldown: 8,
reloadMs: 1800,
```

Remove any `getPlayerStat('shootCooldown')` or `getPlayerStat('reloadMs')` calls — these now come from `getWeaponStat()`.

- [ ] **Step 3: Update bullet_time x/y position in skill tree**

Since trigger_finger is removed, bullet_time needs a new position. Change its coordinates to be near swift:

```js
{ id: 'bullet_time', path: 'mobility', req: 'swift', tier: 3, maxLvl: 1,
  icon: '🕶', name: 'BULLET TIME', desc: 'Nach Dash: 50% Zombie-Slow fuer 2s.',
  x: 100, y: -300, r: 28, effect: () => ({}) },
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "Remove quick_reload/trigger_finger skills, move bullet_time to swift"
```

---

### Task 5: Main Menu Tab System

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Replace overlay HTML with tab-based menu**

Replace the entire `<div id="overlay">...</div>` with a tabbed menu structure:

```html
<div id="overlay" style="display:none">
  <!-- Tab Navigation -->
  <div id="menu-tabs" style="position:absolute;top:0;left:0;right:0;display:flex;justify-content:center;background:rgba(6,8,10,0.9);border-bottom:1px solid #141a20;z-index:5">
    <button class="menu-tab active" data-tab="lobby" style="font-family:'Oswald',sans-serif;font-size:12px;font-weight:500;letter-spacing:3px;color:#3a4450;padding:12px 24px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer">LOBBY</button>
    <button class="menu-tab" data-tab="skilltree" style="font-family:'Oswald',sans-serif;font-size:12px;font-weight:500;letter-spacing:3px;color:#3a4450;padding:12px 24px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer">SKILL TREE</button>
    <button class="menu-tab" data-tab="arsenal" style="font-family:'Oswald',sans-serif;font-size:12px;font-weight:500;letter-spacing:3px;color:#3a4450;padding:12px 24px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer">ARSENAL</button>
    <button class="menu-tab" data-tab="shop" style="font-family:'Oswald',sans-serif;font-size:12px;font-weight:500;letter-spacing:3px;color:#3a4450;padding:12px 24px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer">SHOP <span style="font-size:7px;color:#ddaa00;border:1px solid #665500;padding:1px 4px;margin-left:4px;font-family:'JetBrains Mono',monospace;vertical-align:top">SOON</span></button>
    <button class="menu-tab" data-tab="skins" style="font-family:'Oswald',sans-serif;font-size:12px;font-weight:500;letter-spacing:3px;color:#3a4450;padding:12px 24px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer">SKINS <span style="font-size:7px;color:#ddaa00;border:1px solid #665500;padding:1px 4px;margin-left:4px;font-family:'JetBrains Mono',monospace;vertical-align:top">SOON</span></button>
  </div>

  <!-- Lobby Panel -->
  <div class="menu-panel active" id="panel-lobby" style="position:absolute;inset:0;top:44px;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="position:absolute;top:16px;left:20px;display:flex;align-items:center;gap:10px">
      <span id="user-display" style="font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;letter-spacing:3px;color:#c0ccd8"></span>
      <span id="player-level-badge" style="font-size:9px;letter-spacing:2px;color:#33cc44;padding:2px 8px;border:1px solid rgba(51,204,68,0.3);font-family:'JetBrains Mono',monospace"></span>
    </div>
    <div id="currency-bar" style="position:absolute;top:16px;right:20px;display:flex;gap:16px;font-family:'JetBrains Mono',monospace;font-size:11px">
      <span id="lobby-gold" style="color:#ddaa00"></span>
      <span id="lobby-diamonds" style="color:#44ddff"></span>
    </div>
    <div class="sub">TOP-DOWN SURVIVAL</div>
    <h1>DEAD ZONE</h1>
    <div id="lobby-stats" style="color:#606070;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:2px;margin:8px 0"></div>
    <div id="last-run" style="color:#ee2200;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:1px;min-height:18px"></div>
    <div class="hint">
      WASD — Bewegen &nbsp;|&nbsp; MAUS — Zielen &nbsp;|&nbsp; LINKSKLICK — Schie&szlig;en<br>
      R — Nachladen &nbsp;|&nbsp; SPACE — Dash &nbsp;|&nbsp; F halten — Rescue &nbsp;|&nbsp; 1-6 — Waffe<br>ESC — Pause
    </div>
    <div style="position:absolute;bottom:24px;left:24px">
      <div style="font-size:8px;letter-spacing:3px;color:#3a4450;margin-bottom:8px">KARTE WAEHLEN</div>
      <div style="display:flex;gap:8px">
        <div style="width:120px;height:60px;border:1px solid #ee2200;background:#0a0d10;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:2px;color:#8090a0">WAREHOUSE</div>
        </div>
        <div style="width:120px;height:60px;border:1px solid #141a20;background:#0a0d10;display:flex;align-items:center;justify-content:center;opacity:0.3">
          <div style="font-size:8px;letter-spacing:2px;color:#3a4450">COMING SOON</div>
        </div>
      </div>
    </div>
    <button class="start-btn" id="start-btn" style="position:absolute;bottom:24px;right:24px;font-size:24px;padding:14px 50px">STARTEN</button>
    <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%)"><a href="#" onclick="doLogout();return false" style="color:#404050;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px">ABMELDEN</a></div>
  </div>

  <!-- Skill Tree Panel -->
  <div class="menu-panel" id="panel-skilltree" style="position:absolute;inset:0;top:44px;display:none"></div>

  <!-- Arsenal Panel -->
  <div class="menu-panel" id="panel-arsenal" style="position:absolute;inset:0;top:44px;display:none"></div>

  <!-- Shop Panel -->
  <div class="menu-panel" id="panel-shop" style="position:absolute;inset:0;top:44px;display:none;align-items:center;justify-content:center">
    <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:12px;color:#3a4450">SHOP</div>
    <div style="font-size:10px;letter-spacing:4px;color:#1e2430">COMING SOON</div>
  </div>

  <!-- Skins Panel -->
  <div class="menu-panel" id="panel-skins" style="position:absolute;inset:0;top:44px;display:none;align-items:center;justify-content:center">
    <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:12px;color:#3a4450">SKINS</div>
    <div style="font-size:10px;letter-spacing:4px;color:#1e2430">COMING SOON</div>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for menu tabs**

```css
.menu-tab.active { color: #ee2200 !important; border-bottom-color: #ee2200 !important; }
.menu-tab:hover { color: #8090a0 !important; }
.menu-panel { flex-direction: column; }
```

- [ ] **Step 3: Add tab switching JavaScript**

```js
document.querySelectorAll('.menu-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu-panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    tab.classList.add('active');
    const panel = document.getElementById('panel-' + tab.dataset.tab);
    panel.style.display = 'flex';
    panel.classList.add('active');

    // Skill tree: move canvas into panel and activate
    if (tab.dataset.tab === 'skilltree') {
      const stPanel = document.getElementById('panel-skilltree');
      stPanel.appendChild(document.getElementById('skill-tree-canvas'));
      stPanel.appendChild(document.getElementById('st-scanline'));
      // Re-add the skill tree HUD elements
      stCanvas.width = window.innerWidth;
      stCanvas.height = window.innerHeight - 44;
      stActive = true;
      stSelectPath(stActivePath);
      requestAnimationFrame(drawSkillTree);
    } else {
      stActive = false;
    }
  });
});
```

- [ ] **Step 4: Move skill tree into tab system**

Remove the separate `#skill-tree-screen` div. The skill tree canvas and its controls now live inside `#panel-skilltree`. Move the st-hud-top, st-points, st-back, st-tooltip elements into the skilltree panel.

Remove the old `skilltree-btn` from the lobby — skill tree is now a tab.

- [ ] **Step 5: Update showGameMenu() to populate lobby data**

```js
// In showGameMenu(), update currency displays:
document.getElementById('lobby-gold').textContent = globalGold + 'G';
document.getElementById('lobby-diamonds').textContent = globalDiamonds + '💎';
document.getElementById('player-level-badge').textContent = 'LVL ' + getLevelFromXp(globalXp);
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "Replace overlay with tab-based menu: Lobby, Skill Tree, Arsenal, Shop, Skins"
```

---

### Task 6: Arsenal UI

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Build arsenal panel HTML**

Populate `#panel-arsenal` with the weapon list sidebar, center weapon display, and right stats panel. Follow the mockup structure from the brainstorming phase. This is DOM-based (not Canvas).

Key elements:
- Left: `.arsenal-sidebar` with weapon list items
- Center: `.arsenal-main` with weapon name, icon, cost/status
- Right: `.arsenal-stats` with 6 stat bars + upgrade buttons

- [ ] **Step 2: Add arsenal JavaScript**

```js
function renderArsenal() {
  // Populate weapon list
  // Highlight owned vs locked
  // Show selected weapon stats
  // Wire upgrade buttons to POST /api/weapons/upgrade
  // Wire buy button to POST /api/weapons/buy
}
```

Each weapon item click selects it and updates center/right panels. Upgrade buttons call the API, deduct gold locally, update the display.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Add arsenal UI: weapon list, stats display, upgrade buttons"
```

---

### Task 7: Integration & Polish

**Files:**
- Modify: `public/index.html`
- Modify: `README.md`

- [ ] **Step 1: Update death/quit to clear weapons**

After death API response, reset weapon state:

```js
playerWeapons = [];
ownedWeaponIds = ['pistol'];
activeWeaponId = 'pistol';
globalGold = 0;
```

- [ ] **Step 2: Update rescue to keep everything**

After rescue API, weapons/gold stay as-is.

- [ ] **Step 3: Remove MAX_AMMO and RELOAD_MS constants**

These are now per-weapon. Search and remove any remaining references.

- [ ] **Step 4: Update README**

Add weapon system, gold/diamonds, arsenal to features list and controls table.

- [ ] **Step 5: Full gameplay test**

1. Login, check lobby with gold/diamonds
2. Open Arsenal, verify pistol is only weapon
3. Start game, kill zombies, verify gold drops
4. Die, verify all gold/weapons lost
5. Earn gold again, buy SMG
6. Switch weapons with 1-2 keys
7. Upgrade SMG damage
8. Test shotgun spread, sniper pierce, minigun spinup
9. Rescue mission — verify everything kept

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Integration: death clears weapons, remove MAX_AMMO, update README"
```

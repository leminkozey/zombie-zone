# Skill Tree & Rescue Mission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a constellation-style skill tree with 3 paths (Survival, Mobility, Rescue), unified global XP, a rescue extraction mechanic, and fix the zombie-in-wall bug.

**Architecture:** Single-file frontend (`index.html`) with all game code. Express+SQLite backend for persistence. New `user_skills` table. Skill definitions as a data-driven array. All player stats read through `getPlayerStat()` function. Rescue mission as a state machine in the game loop.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Express 5, better-sqlite3, JWT auth

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `database.js` | Modify | Add `user_skills` table, new prepared statements, death transaction |
| `server.js` | Modify | Add 4 new API endpoints: `/api/skills`, `/api/skills/invest`, `/api/death`, `/api/rescue` |
| `public/index.html` | Modify | All frontend: skill data, stat system, skill tree UI, dash, shield, rescue, XP overhaul, HUD |

---

### Task 1: Backend — Database Schema & API Endpoints

**Files:**
- Modify: `database.js`
- Modify: `server.js`

- [ ] **Step 1: Add user_skills table and prepared statements to database.js**

In `database.js`, after the `users` table creation, add:

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS user_skills (
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, skill_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
```

Add these prepared statements and export them:

```js
const getUserSkills = db.prepare('SELECT skill_id, level FROM user_skills WHERE user_id = ?');
const upsertSkill = db.prepare(`
  INSERT INTO user_skills (user_id, skill_id, level) VALUES (?, ?, 1)
  ON CONFLICT(user_id, skill_id) DO UPDATE SET level = level + 1
`);
const deleteUserSkills = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
const setXp = db.prepare('UPDATE users SET xp = ? WHERE id = ?');
```

Update module.exports to include all new statements.

- [ ] **Step 2: Add death transaction function to database.js**

```js
const applyDeath = db.transaction((userId) => {
  const user = getUser.get(userId);
  if (!user) return null;
  const newXp = Math.floor(user.xp * 0.25);
  setXp.run(newXp, userId);
  deleteUserSkills.run(userId);
  return { xp: newXp };
});
```

Export `applyDeath`.

- [ ] **Step 3: Add new API routes to server.js**

Import the new exports from database.js. Add these routes after existing ones:

```js
// GET /api/skills — load user's skill allocations
app.get('/api/skills', auth, (req, res) => {
  const skills = getUserSkills.all(req.user.id);
  res.json({ skills });
});

// POST /api/skills/invest — invest 1 point in a skill
app.post('/api/skills/invest', auth, (req, res) => {
  const { skillId } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId required' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Server validates: enough points + maxLvl cap
  // Note: prerequisite validation is client-side only (would require duplicating
  // the full skill tree structure on the server — not worth it for a single-player game.
  // The server guards against point overflow and level caps.)
  const currentSkills = getUserSkills.all(req.user.id);
  const totalInvested = currentSkills.reduce((sum, s) => sum + s.level, 0);
  const level = getLevelFromXp(user.xp);
  const availablePoints = level - 1;

  if (totalInvested >= availablePoints) {
    return res.status(400).json({ error: 'No skill points available' });
  }

  // Check maxLvl (skill definitions known to server as a simple map)
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

// POST /api/death — apply death penalty
app.post('/api/death', auth, (req, res) => {
  const result = applyDeath(req.user.id);
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json(result);
});

// POST /api/rescue — rescue success (XP already synced, just confirm)
app.post('/api/rescue', auth, (req, res) => {
  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, xp: user.xp });
});
```

- [ ] **Step 4: Add getLevelFromXp to server.js**

The server needs this for skill point validation. Add before routes:

```js
function xpForLevel(n) {
  return Math.floor(50 * Math.pow(n, 1.5));
}

function getLevelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}
```

- [ ] **Step 5: Test manually**

Start server with `npm run dev`. Use curl:

```bash
# Register
curl -X POST http://localhost:4444/api/register -H "Content-Type: application/json" -d '{"name":"test","password":"test"}'
# Save the token from response

# Get skills (empty)
curl http://localhost:4444/api/skills -H "Authorization: Bearer TOKEN"

# Add some XP first
curl -X POST http://localhost:4444/api/xp -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"xp":500}'

# Invest a skill point
curl -X POST http://localhost:4444/api/skills/invest -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"skillId":"vitality"}'

# Apply death
curl -X POST http://localhost:4444/api/death -H "Authorization: Bearer TOKEN"

# Verify skills are gone and XP reduced
curl http://localhost:4444/api/skills -H "Authorization: Bearer TOKEN"
curl http://localhost:4444/api/profile -H "Authorization: Bearer TOKEN"
```

- [ ] **Step 6: Commit**

```bash
git add database.js server.js
git commit -m "Add user_skills table, skill invest/death/rescue API endpoints"
```

---

### Task 2: XP System Overhaul — Unified Global XP

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Replace XP curve with Minecraft-style formula**

Replace the existing `XP_THRESHOLDS` array and `getXpForLevel`/`getLevelFromXp` functions (~line 727-739) with:

```js
// ── XP SYSTEM ─────────────────────────────────────────
function xpForLevel(n) {
  return Math.floor(50 * Math.pow(n, 1.5));
}

function getLevelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}
```

- [ ] **Step 2: Add global XP tracking variables**

In the state section (~line 546), add:

```js
let globalXp = 0;        // total XP from server
let pendingXp = 0;       // XP earned this session, not yet synced
let lastXpSync = 0;      // timestamp of last sync
const XP_SYNC_INTERVAL = 10000; // 10 seconds
```

- [ ] **Step 3: Update init() to load global XP**

In the `init()` function, load the player's XP from server at run start. Add before `startNextWave()`:

```js
// Load global XP
if (authToken) {
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      globalXp = data.xp;
    }
  } catch {}
}
pendingXp = 0;
lastXpSync = performance.now();
```

Make `init()` async: change `function init()` to `async function init()`.

- [ ] **Step 4: Update XP bar to show global XP**

Replace `updateXpBar()` to use global + pending XP:

```js
function updateXpBar() {
  const totalXp = globalXp + pendingXp;
  const level = getLevelFromXp(totalXp);
  const currentThreshold = xpForLevel(level);
  const nextThreshold = xpForLevel(level + 1);
  const progress = (totalXp - currentThreshold) / (nextThreshold - currentThreshold);

  document.getElementById('xp-bar').style.width = (progress * 100) + '%';
  document.getElementById('xp-level').textContent = 'LVL ' + level;

  if (level > currentLevel) {
    currentLevel = level;
    showLevelUp();
  }
}
```

- [ ] **Step 5: Replace sessionXp accumulation with pendingXp**

In `updateBullets()` (~line 946-948), change:

```js
// Old:
score += z.xp;
sessionXp += z.xp;
updateXpBar();

// New:
score += z.xp;
pendingXp += z.xp;
updateXpBar();
```

- [ ] **Step 6: Add periodic XP sync to game loop**

In `loop()` function, after `updateReload(now)`, add:

```js
// Periodic XP sync
if (pendingXp > 0 && now - lastXpSync > XP_SYNC_INTERVAL) {
  syncXp();
  lastXpSync = now;
}
```

Add the sync function:

```js
function syncXp() {
  if (!authToken || pendingXp <= 0) return;
  const xpToSync = pendingXp;
  pendingXp = 0;
  globalXp += xpToSync;
  fetch('/api/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ xp: xpToSync })
  }).catch(() => {
    // If sync fails, add back to pending
    pendingXp += xpToSync;
    globalXp -= xpToSync;
  });
}
```

- [ ] **Step 7: Update gameOver() to use new death API**

Replace the existing `gameOver()` function:

```js
async function gameOver() {
  running = false;

  if (authToken) {
    // Final XP sync
    if (pendingXp > 0) {
      const xpToSync = pendingXp;
      pendingXp = 0;
      globalXp += xpToSync;
      try {
        await fetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ xp: xpToSync })
        });
      } catch {}
    }

    // Apply death penalty
    try {
      const res = await fetch('/api/death', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (res.ok) {
        const data = await res.json();
        globalXp = data.xp;
      }
    } catch {}
  }

  const totalEarned = score;
  lastRunText = 'GESTORBEN: Wave ' + wave + '  |  +' + totalEarned + ' XP  |  75% VERLOREN';
  showGameMenu();
}
```

- [ ] **Step 8: Update quit button to also apply death penalty**

Replace the quit button handler (~line 1560):

```js
document.getElementById('quit-btn').addEventListener('click', async () => {
  paused = false;
  running = false;
  document.getElementById('pause-screen').style.display = 'none';

  if (authToken) {
    if (pendingXp > 0) {
      const xpToSync = pendingXp;
      pendingXp = 0;
      globalXp += xpToSync;
      try {
        await fetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ xp: xpToSync })
        });
      } catch {}
    }
    try {
      const res = await fetch('/api/death', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (res.ok) {
        const data = await res.json();
        globalXp = data.xp;
      }
    } catch {}
  }

  lastRunText = 'VERLASSEN: Wave ' + wave + '  |  75% XP VERLOREN';
  showGameMenu();
});
```

- [ ] **Step 9: Add quit warning to pause screen**

In the HTML pause screen section (~line 304), add after the quit button:

```html
<div style="color:#cc2200;font-size:10px;letter-spacing:1px;margin-top:8px">ACHTUNG: VERLASSEN = TOD-STRAFE</div>
```

- [ ] **Step 10: Update lobby stats display**

In `showGameMenu()`, the stats already show global level/XP. Update to use `globalXp`:

```js
// In showGameMenu(), replace the profile fetch block:
if (authToken) {
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      globalXp = data.xp;
      const totalLevel = getLevelFromXp(globalXp);
      const skillPoints = totalLevel - 1;
      document.getElementById('lobby-stats').textContent =
        'LVL ' + totalLevel + '  |  ' + globalXp + ' XP  |  ' + skillPoints + ' SKILL PUNKTE';
    }
  } catch {}
}
```

- [ ] **Step 11: Initialize currentLevel from global XP in init()**

After loading global XP in init(), set:

```js
currentLevel = getLevelFromXp(globalXp);
```

- [ ] **Step 12: Test and commit**

Play a game, earn XP, die. Verify:
- XP bar shows global XP during run
- Death reduces XP by 75% in lobby
- Quit also applies penalty
- Warning shows on pause screen

```bash
git add public/index.html
git commit -m "Overhaul XP system: unified global XP, Minecraft curve, death penalty"
```

---

### Task 3: Stat System & Skill Definitions

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add BASE_STATS and getPlayerStat()**

Add after the CONFIG section (~line 427), before ZOMBIE_CONFIGS:

```js
// ── STAT SYSTEM ────────────────────────────────────────
const BASE_STATS = {
  maxHp: 100,
  moveSpeed: 2.8,
  shootCooldown: 8,
  reloadMs: 1800,
  healthpackHealPct: 0,    // percentage bonus
  damageReductionPct: 0,   // percentage reduction
  shieldHp: 0,
  shieldRegenDelay: 8,     // seconds without damage before shield regens
  shieldRegenRate: 5,
  regenHpPerSec: 0,
  // Note: percentage bonuses use the 'Pct' suffix convention in skill effects
  // e.g. moveSpeedPct is looked up automatically by getPlayerStat('moveSpeed')
  dashUnlocked: 0,
  dashDistance: 120,
  dashCooldown: 5,
  dashCharges: 1,
  rescueActivationTime: 240,
  rescueSurvivalTime: 90,
  rescueStandTime: 20,
  rescueCooldown: 30,
  rescueExpiryTime: 60,
  rescueCircleRadiusPct: 0,
};

let activeSkills = []; // { skillId, level } loaded from server

function getPlayerStat(stat) {
  const base = BASE_STATS[stat];
  if (base === undefined) return 0;
  let flat = 0;
  let pct = 0;

  for (const s of activeSkills) {
    const def = SKILL_MAP[s.skillId || s.skill_id];
    if (!def) continue;
    const fx = def.effect(s.level);
    if (fx[stat] !== undefined) flat += fx[stat];
    if (fx[stat + 'Pct'] !== undefined) pct += fx[stat + 'Pct'];
  }

  return base * (1 + pct) + flat;
}
```

- [ ] **Step 2: Add full skill definitions array**

Add after the stat system:

```js
// ── SKILL DEFINITIONS ──────────────────────────────────
const SKILLS = [
  // SURVIVAL — Start
  { id: 'surv_start', path: 'survival', req: null, tier: 0, maxLvl: 0,
    icon: '♥', name: 'SURVIVAL', desc: 'Startknoten des Survival-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },

  // SURVIVAL — Tier 1
  { id: 'vitality', path: 'survival', req: 'surv_start', tier: 1, maxLvl: 5,
    icon: '♥', name: 'VITALITY', desc: 'Erhoeht max. Lebenspunkte.',
    x: -120, y: -120, r: 22,
    effect: (lvl) => ({ maxHp: 15 * lvl }) },

  { id: 'field_medic', path: 'survival', req: 'surv_start', tier: 1, maxLvl: 3,
    icon: '✚', name: 'FIELD MEDIC', desc: 'Healthpacks heilen mehr.',
    x: 120, y: -120, r: 20,
    effect: (lvl) => ({ healthpackHealPct: 0.3 * lvl }) },

  // SURVIVAL — Tier 2
  { id: 'shield', path: 'survival', req: 'vitality', tier: 2, maxLvl: 5,
    icon: '🛡', name: 'SHIELD', desc: 'Schutzschild das Schaden absorbiert.',
    x: -220, y: -260, r: 26,
    effect: (lvl) => ({ shieldHp: 10 * lvl, shieldRegenDelay: -lvl }) },

  { id: 'regen', path: 'survival', req: 'vitality', tier: 2, maxLvl: 3,
    icon: '♻', name: 'REGENERATION', desc: 'Passive HP-Regen. Stoppt bei Schaden.',
    x: 0, y: -270, r: 20,
    effect: (lvl) => ({ regenHpPerSec: 0.5 * lvl }) },

  { id: 'thick_skin', path: 'survival', req: 'field_medic', tier: 2, maxLvl: 3,
    icon: '🧱', name: 'THICK SKIN', desc: 'Reduziert eingehenden Schaden.',
    x: 220, y: -260, r: 20,
    effect: (lvl) => ({ damageReductionPct: 0.05 * lvl }) },

  // SURVIVAL — Tier 3
  { id: 'fortress', path: 'survival', req: 'shield', tier: 3, maxLvl: 1,
    icon: '🏰', name: 'FORTRESS', desc: '2x Shield-Regen. +10% Speed bei vollem Shield.',
    x: -140, y: -420, r: 28,
    effect: () => ({}) },
    // Special: entirely handled in code — 2x regen multiplier + conditional speed boost checked in movePlayer() and shield regen loop

  { id: 'second_wind', path: 'survival', req: 'regen', tier: 3, maxLvl: 1,
    icon: '💀', name: 'SECOND WIND', desc: '1x pro Run: Ueberlebst toedlichen Treffer mit 30% HP.',
    x: 140, y: -420, r: 28,
    effect: () => ({}) },
    // Special: handled in damage code

  // MOBILITY — Start
  { id: 'mob_start', path: 'mobility', req: null, tier: 0, maxLvl: 0,
    icon: '⚡', name: 'MOBILITY', desc: 'Startknoten des Mobility-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },

  // MOBILITY — Tier 1
  { id: 'swift', path: 'mobility', req: 'mob_start', tier: 1, maxLvl: 5,
    icon: '👟', name: 'SWIFT', desc: 'Erhoehte Laufgeschwindigkeit.',
    x: -100, y: -130, r: 22,
    effect: (lvl) => ({ moveSpeedPct: 0.08 * lvl }) },

  { id: 'quick_reload', path: 'mobility', req: 'mob_start', tier: 1, maxLvl: 3,
    icon: '🔄', name: 'QUICK RELOAD', desc: 'Schnelleres Nachladen.',
    x: 130, y: -100, r: 20,
    effect: (lvl) => ({ reloadPct: -0.15 * lvl }) },

  // MOBILITY — Tier 2
  { id: 'dash', path: 'mobility', req: 'swift', tier: 2, maxLvl: 1,
    icon: '💨', name: 'DASH', desc: 'Schaltet Dash frei. Leertaste.',
    x: -40, y: -290, r: 26,
    effect: () => ({ dashUnlocked: 1 }) },

  { id: 'dash_range', path: 'mobility', req: 'dash', tier: 2, maxLvl: 3,
    icon: '📏', name: 'DASH RANGE', desc: 'Dash geht weiter.',
    x: -200, y: -370, r: 20,
    effect: (lvl) => ({ dashDistance: 40 * lvl }) },

  { id: 'dash_cd', path: 'mobility', req: 'dash', tier: 2, maxLvl: 3,
    icon: '⏱', name: 'DASH COOLDOWN', desc: 'Dash schneller wieder bereit.',
    x: -40, y: -420, r: 20,
    effect: (lvl) => ({ dashCooldown: -1 * lvl }) },

  { id: 'dash_charges', path: 'mobility', req: 'dash', tier: 2, maxLvl: 2,
    icon: '⚡', name: 'DASH CHARGES', desc: 'Mehrfach hintereinander dashen.',
    x: 130, y: -370, r: 20,
    effect: (lvl) => ({ dashCharges: 1 * lvl }) },

  { id: 'trigger_finger', path: 'mobility', req: 'quick_reload', tier: 2, maxLvl: 3,
    icon: '🔫', name: 'TRIGGER FINGER', desc: 'Erhoehte Feuerrate.',
    x: 250, y: -240, r: 20,
    effect: (lvl) => ({ shootCooldown: -1 * lvl }) },

  // MOBILITY — Tier 3
  { id: 'phantom_dash', path: 'mobility', req: 'dash_cd', tier: 3, maxLvl: 1,
    icon: '👻', name: 'PHANTOM DASH', desc: 'Unverwundbar beim Dash. Nachbild verwirrt Zombies.',
    x: -40, y: -560, r: 28,
    effect: () => ({}) },
    // Special: handled in dash code

  { id: 'bullet_time', path: 'mobility', req: 'trigger_finger', tier: 3, maxLvl: 1,
    icon: '🕶', name: 'BULLET TIME', desc: 'Nach Dash: 50% Zombie-Slow fuer 2s.',
    x: 200, y: -400, r: 28,
    effect: () => ({}) },
    // Special: handled in dash code

  // RESCUE — Start
  { id: 'resc_start', path: 'rescue', req: null, tier: 0, maxLvl: 0,
    icon: '📡', name: 'RESCUE', desc: 'Startknoten des Rescue-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },

  // RESCUE — Tier 1
  { id: 'quick_call', path: 'rescue', req: 'resc_start', tier: 1, maxLvl: 5,
    icon: '⏳', name: 'QUICK CALL', desc: 'Rescue frueher verfuegbar.',
    x: -140, y: -130, r: 22,
    effect: (lvl) => ({ rescueActivationTime: -20 * lvl }) },

  { id: 'fast_extract', path: 'rescue', req: 'resc_start', tier: 1, maxLvl: 4,
    icon: '🎯', name: 'FAST EXTRACT', desc: 'Weniger Stehzeit im Kreis.',
    x: 140, y: -130, r: 22,
    effect: (lvl) => ({ rescueStandTime: -3 * lvl }) },

  // RESCUE — Tier 2
  { id: 'survival_instinct', path: 'rescue', req: 'quick_call', tier: 2, maxLvl: 5,
    icon: '⚔', name: 'SURVIVAL INSTINCT', desc: 'Kuerzere Ueberlebensphase.',
    x: -260, y: -280, r: 22,
    effect: (lvl) => ({ rescueSurvivalTime: -10 * lvl }) },

  { id: 'rapid_redial', path: 'rescue', req: 'quick_call', tier: 2, maxLvl: 3,
    icon: '📻', name: 'RAPID REDIAL', desc: 'Schneller erneut anfragen.',
    x: -60, y: -300, r: 20,
    effect: (lvl) => ({ rescueCooldown: -5 * lvl }) },

  { id: 'ext_window', path: 'rescue', req: 'fast_extract', tier: 2, maxLvl: 3,
    icon: '🕐', name: 'EXTENDED WINDOW', desc: 'Mehr Zeit bis Rescue ablaeuft.',
    x: 60, y: -300, r: 20,
    effect: (lvl) => ({ rescueExpiryTime: 15 * lvl }) },

  { id: 'safe_zone', path: 'rescue', req: 'fast_extract', tier: 2, maxLvl: 3,
    icon: '🔵', name: 'SAFE ZONE', desc: 'Groesserer Rettungskreis.',
    x: 260, y: -280, r: 20,
    effect: (lvl) => ({ rescueCircleRadiusPct: 0.2 * lvl }) },

  // RESCUE — Tier 3
  { id: 'evac_chopper', path: 'rescue', req: 'rapid_redial', tier: 3, maxLvl: 1,
    icon: '🚁', name: 'EVAC CHOPPER', desc: 'Kreis folgt dir langsam.',
    x: -100, y: -460, r: 28,
    effect: () => ({}) },
    // Special: handled in rescue code

  { id: 'fortified_lz', path: 'rescue', req: 'ext_window', tier: 3, maxLvl: 1,
    icon: '🏗', name: 'FORTIFIED LZ', desc: '-50% Schaden im Rettungskreis.',
    x: 100, y: -460, r: 28,
    effect: () => ({}) },
    // Special: handled in rescue code
];

// Build lookup map
const SKILL_MAP = {};
SKILLS.forEach(s => SKILL_MAP[s.id] = s);

// Build connections from req fields
const SKILL_CONNECTIONS = SKILLS.filter(s => s.req).map(s => ({ from: s.req, to: s.id, path: s.path }));

// Helper: check if player has a specific skill
function hasSkill(skillId) {
  return activeSkills.some(s => s.skillId === skillId);
}

function getSkillLevel(skillId) {
  const found = activeSkills.find(s => s.skillId === skillId);
  return found ? found.level : 0;
}
```

- [ ] **Step 3: Wire existing game code to use getPlayerStat()**

Replace hardcoded values throughout the game code:

In `init()` — player creation:
```js
player = {
  x: mapW/2, y: mapH/2,
  hp: getPlayerStat('maxHp'),
  maxHp: getPlayerStat('maxHp'),
  ammo: MAX_AMMO,
  speed: getPlayerStat('moveSpeed'),
  angle: 0,
  shootCooldown: 0,
  recoil: 0,
  shield: getPlayerStat('shieldHp'),
  maxShield: getPlayerStat('shieldHp'),
  shieldRegenTimer: 0,
  secondWindUsed: false,
  dashCharges: [],       // initialized in dash setup
  dashInvulnerable: false,
};
```

In `movePlayer()` — use computed speed:
```js
// Replace: const nx = player.x + dx * player.speed;
const speed = getPlayerStat('moveSpeed') * (1 + getPlayerStat('moveSpeedPct'));
const nx = player.x + dx * speed;
const ny = player.y + dy * speed;
```

Wait — the stat system already handles pct. So just:
```js
const speed = getPlayerStat('moveSpeed');
```

In `tryShoot()` — use computed cooldown:
```js
// Replace: player.shootCooldown = 8;
player.shootCooldown = getPlayerStat('shootCooldown');
```

In `startReload()` / `updateReload()` — use computed reload time:
```js
// Replace RELOAD_MS usage:
const reloadTime = getPlayerStat('reloadMs');
// In updateReload: const prog = Math.min((now - reloadStart) / reloadTime, 1);
```

In `updateHealthpacks()` — use computed heal amount:
```js
// Replace: player.hp = Math.min(player.hp + HEALTHPACK_HEAL, player.maxHp);
const healAmount = Math.round(HEALTHPACK_HEAL * (1 + getPlayerStat('healthpackHealPct')));
player.hp = Math.min(player.hp + healAmount, getPlayerStat('maxHp'));
```

- [ ] **Step 4: Load skills from server on game start**

In `showGameMenu()`, after loading profile, also load skills:

```js
// After profile fetch:
try {
  const skillRes = await fetch('/api/skills', {
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  if (skillRes.ok) {
    const skillData = await skillRes.json();
    activeSkills = skillData.skills.map(s => ({ skillId: s.skill_id, level: s.level }));
  }
} catch {}
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Add stat system, skill definitions array, wire game code to getPlayerStat"
```

---

### Task 4: Zombie Wall Bugfix

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Fix spawn position validation**

In `spawnZombie()`, after calculating spawn position, validate it's not in a wall:

```js
function spawnZombie() {
  let edge, attempts = 0;
  do {
    edge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
    attempts++;
  } while (wallCollide(edge.x, edge.y, ZOMBIE_R * 1.5) && attempts < 20);

  if (attempts >= 20) return; // skip this zombie if no valid spawn found

  // ... rest of existing spawnZombie code
```

- [ ] **Step 2: Add push-out logic in updateZombies()**

At the start of the zombie loop in `updateZombies()`, add wall push-out:

```js
for (const z of zombies) {
  if (!z.alive) continue;

  // Push out of walls
  if (wallCollide(z.x, z.y, z.radius)) {
    // Find nearest free position
    const tx = Math.floor(z.x / TILE);
    const ty = Math.floor(z.y / TILE);
    const centerX = tx * TILE + TILE / 2;
    const centerY = ty * TILE + TILE / 2;

    // Try pushing toward tile center, or to adjacent free tiles
    const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx, dy] of dirs) {
      const nx = (tx + dx) * TILE + TILE / 2;
      const ny = (ty + dy) * TILE + TILE / 2;
      if (!wallCollide(nx, ny, z.radius)) {
        z.x = nx;
        z.y = ny;
        break;
      }
    }
  }

  // ... rest of existing zombie update code
```

- [ ] **Step 3: Test and commit**

Play until zombies spawn. Verify no zombies get stuck in walls.

```bash
git add public/index.html
git commit -m "Fix zombies getting stuck in walls: validate spawn + push-out logic"
```

---

### Task 5: Shield System

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add shield HUD element**

In the HTML, after `hp-bar-wrap` (~line 250):

```html
<div id="shield-bar-wrap" style="width:100%;height:3px;background:#111;margin-top:2px;display:none">
  <div id="shield-bar" style="height:3px;background:#3399ff;width:0%;transition:width 0.2s;box-shadow:0 0 6px #3399ff66"></div>
</div>
```

- [ ] **Step 2: Add shield logic to init()**

In `init()`, when creating the player object (already updated in Task 3):

```js
player.shield = getPlayerStat('shieldHp');
player.maxShield = getPlayerStat('shieldHp');
player.shieldRegenTimer = 0;
```

Also show/hide shield bar:

```js
const shieldWrap = document.getElementById('shield-bar-wrap');
shieldWrap.style.display = player.maxShield > 0 ? 'block' : 'none';
```

- [ ] **Step 3: Add damage pipeline function**

Replace all direct `player.hp -= X` with a centralized damage function:

```js
function damagePlayer(rawDamage) {
  // Thick Skin reduction
  const reduction = getPlayerStat('damageReductionPct');
  let damage = Math.round(rawDamage * (1 - reduction));

  // Fortified LZ reduction (if in rescue circle)
  if (rescueState === 'extracting' && hasSkill('fortified_lz')) {
    damage = Math.round(damage * 0.5);
  }

  // Dash invulnerability
  if (player.dashInvulnerable) return;

  // Shield absorb
  if (player.shield > 0) {
    if (damage <= player.shield) {
      player.shield -= damage;
      damage = 0;
    } else {
      damage -= player.shield;
      player.shield = 0;
    }
  }

  // HP damage
  player.hp -= damage;
  player.shieldRegenTimer = 0; // reset shield regen timer
  player.lastDamageTime = frameCount; // reset HP regen timer

  hurtFlash = 18;
  spawnBlood(player.x, player.y, 4);

  // Second Wind
  if (player.hp <= 0 && hasSkill('second_wind') && !player.secondWindUsed) {
    player.secondWindUsed = true;
    player.hp = Math.round(getPlayerStat('maxHp') * 0.3);
    // Visual feedback
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x: player.x, y: player.y,
        dx: Math.cos(a) * 3, dy: Math.sin(a) * 3,
        life: 25, maxLife: 25, color: '#ff4444', r: 4,
      });
    }
    showWaveBanner('SECOND WIND!');
    updateHUD();
    return;
  }

  if (player.hp <= 0) { player.hp = 0; gameOver(); }
  updateHUD();
}
```

- [ ] **Step 4: Replace all player damage calls**

In `updateZombies()` — zombie melee hit (~line 894):
```js
// Replace: player.hp -= 8; hurtFlash = 18; spawnBlood(...);
damagePlayer(8);
```

In `updateSpitterProjectiles()` — spitter hit (~line 989):
```js
// Replace: player.hp -= 10; hurtFlash = 18; spawnBlood(...);
damagePlayer(10);
```

Remove the `if (player.hp <= 0)` checks after those — `damagePlayer` handles it.

- [ ] **Step 5: Add shield regen to game loop**

In `loop()`, after `updateReload(now)`:

```js
// Shield regen (only if player has shield skill invested)
if (player.maxShield > 0) {
  if (player.shield < player.maxShield) {
    player.shieldRegenTimer += 1/60; // assuming 60fps
    const delay = getPlayerStat('shieldRegenDelay');
    if (player.shieldRegenTimer >= delay) {
      let rate = getPlayerStat('shieldRegenRate');
      if (hasSkill('fortress')) rate *= 2;
      player.shield = Math.min(player.shield + rate / 60, player.maxShield);
    }
  }
}

// HP Regen (uses its own damage timer, separate from shield)
if (!player.lastDamageTime) player.lastDamageTime = 0;
const regenRate = getPlayerStat('regenHpPerSec');
if (regenRate > 0 && player.hp < getPlayerStat('maxHp')) {
  const timeSinceDamage = (frameCount - player.lastDamageTime) / 60; // seconds
  if (timeSinceDamage > 3) { // 3s delay after taking damage
    player.hp = Math.min(player.hp + regenRate / 60, getPlayerStat('maxHp'));
  }
}
```

- [ ] **Step 6: Update HUD to show shield**

In `updateHUD()`, add:

```js
// Shield bar
if (player.maxShield > 0) {
  const shieldPct = player.shield / player.maxShield;
  document.getElementById('shield-bar').style.width = (shieldPct * 100) + '%';
}
```

- [ ] **Step 7: Update movePlayer() for Fortress speed bonus**

In `movePlayer()`:

```js
let speed = getPlayerStat('moveSpeed');
// Fortress bonus: +10% when shield is full
if (hasSkill('fortress') && player.shield >= player.maxShield && player.maxShield > 0) {
  speed *= 1.10;
}
```

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "Add shield system, damage pipeline, regen, Second Wind, Fortress"
```

---

### Task 6: Dash System

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add dash state variables**

In the state section, add:

```js
let dashCharges = [];       // array of { ready: true/false, cooldownStart: 0 }
let dashActive = false;
let dashStartX = 0, dashStartY = 0;
let dashTargetX = 0, dashTargetY = 0;
let dashProgress = 0;
let dashAfterimage = null;  // { x, y, angle, timer }
let bulletTimeTimer = 0;
let bulletTimeX = 0, bulletTimeY = 0;
```

- [ ] **Step 2: Initialize dash charges in init()**

In `init()`, after player creation:

```js
// Init dash charges
const numCharges = getPlayerStat('dashCharges');
dashCharges = [];
for (let i = 0; i < numCharges; i++) {
  dashCharges.push({ ready: true, cooldownStart: 0 });
}
dashActive = false;
dashAfterimage = null;
bulletTimeTimer = 0;
```

- [ ] **Step 3: Add dash execution function**

```js
function tryDash() {
  if (!getPlayerStat('dashUnlocked')) return;
  if (dashActive) return;

  // Find a ready charge
  const charge = dashCharges.find(c => c.ready);
  if (!charge) return;

  charge.ready = false;
  charge.cooldownStart = performance.now();

  dashActive = true;
  dashProgress = 0;
  dashStartX = player.x;
  dashStartY = player.y;

  const dist = getPlayerStat('dashDistance');
  dashTargetX = player.x + Math.cos(player.angle) * dist;
  dashTargetY = player.y + Math.sin(player.angle) * dist;

  // Phantom Dash: invulnerability
  if (hasSkill('phantom_dash')) {
    player.dashInvulnerable = true;
    dashAfterimage = { x: player.x, y: player.y, angle: player.angle, timer: 90 }; // 1.5s at 60fps
  }
}

function updateDash() {
  // Update charge cooldowns
  const cd = getPlayerStat('dashCooldown') * 1000; // seconds to ms
  const now = performance.now();
  for (const c of dashCharges) {
    if (!c.ready && now - c.cooldownStart >= cd) {
      c.ready = true;
    }
  }

  // Update active dash
  if (dashActive) {
    dashProgress += 0.15; // dash speed (completes in ~7 frames)
    if (dashProgress >= 1) {
      dashProgress = 1;
      dashActive = false;
      player.dashInvulnerable = false;

      // Bullet Time trigger
      if (hasSkill('bullet_time')) {
        bulletTimeTimer = 120; // 2s at 60fps
        bulletTimeX = player.x;
        bulletTimeY = player.y;
      }
    }

    // Interpolate position
    const t = dashProgress;
    const nx = dashStartX + (dashTargetX - dashStartX) * t;
    const ny = dashStartY + (dashTargetY - dashStartY) * t;

    // Wall collision during dash
    if (!wallCollide(nx, player.y, PLAYER_R - 2)) player.x = nx;
    if (!wallCollide(player.x, ny, PLAYER_R - 2)) player.y = ny;

    // Dash particles
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: player.x + (Math.random()-0.5)*10,
        y: player.y + (Math.random()-0.5)*10,
        dx: (Math.random()-0.5)*2, dy: (Math.random()-0.5)*2,
        life: 10, maxLife: 10, color: '#33aaff', r: 3,
      });
    }
  }

  // Update afterimage
  if (dashAfterimage) {
    dashAfterimage.timer--;
    if (dashAfterimage.timer <= 0) dashAfterimage = null;
  }

  // Update Bullet Time
  if (bulletTimeTimer > 0) bulletTimeTimer--;
}
```

- [ ] **Step 4: Add Spacebar input for dash**

In the keydown handler:

```js
if (e.code === 'Space') { tryDash(); e.preventDefault(); }
```

- [ ] **Step 5: Apply Bullet Time slow to zombies**

In `updateZombies()`, when calculating zombie speed:

```js
// After: const aggroMult = player.hp < player.maxHp * 0.3 ? 1.2 : 1.0;
let bulletTimeMult = 1.0;
if (bulletTimeTimer > 0) {
  const dx = z.x - bulletTimeX, dy = z.y - bulletTimeY;
  if (dx*dx + dy*dy < 200*200) {
    bulletTimeMult = 0.5;
  }
}
let moveX = (dx/dist) * spd * aggroMult * bulletTimeMult;
let moveY = (dy/dist) * spd * aggroMult * bulletTimeMult;
```

- [ ] **Step 6: Draw afterimage**

Add a draw function for the Phantom Dash afterimage:

```js
function drawDashAfterimage() {
  if (!dashAfterimage) return;
  ctx.save();
  ctx.globalAlpha = dashAfterimage.timer / 90 * 0.4;
  ctx.translate(dashAfterimage.x, dashAfterimage.y);
  ctx.rotate(dashAfterimage.angle);
  ctx.fillStyle = '#33aaff';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

Add `drawDashAfterimage()` to the draw section in `loop()`, before `drawPlayer()`.

Also make afterimage confuse zombies — in `updateZombies()`, if afterimage exists, nearby zombies target it instead:

```js
// At start of zombie loop, after push-out logic:
if (dashAfterimage && z.type !== 'spitter') {
  const adx = dashAfterimage.x - z.x, ady = dashAfterimage.y - z.y;
  const adist = Math.sqrt(adx*adx + ady*ady);
  if (adist < 150) {
    // Move toward afterimage instead of player
    const spd = z.speed;
    const mx = (adx/adist) * spd;
    const my = (ady/adist) * spd;
    if (!wallCollide(z.x + mx, z.y, z.radius - 2)) z.x += mx;
    if (!wallCollide(z.x, z.y + my, z.radius - 2)) z.y += my;
    continue; // skip normal movement
  }
}
```

- [ ] **Step 7: Add updateDash() to game loop**

In `loop()`, after `movePlayer()`:

```js
updateDash();
```

- [ ] **Step 8: Add dash HUD (charge indicators)**

In `updateHUD()`, add dash charge display. In the HTML, add a container in the HUD area:

```html
<div id="dash-display" style="position:absolute;bottom:16px;right:16px;display:none;z-index:5;pointer-events:none">
</div>
```

In `updateHUD()`:

```js
// Dash charges
const dashEl = document.getElementById('dash-display');
if (getPlayerStat('dashUnlocked')) {
  dashEl.style.display = 'flex';
  dashEl.innerHTML = '';
  for (const c of dashCharges) {
    const pip = document.createElement('div');
    pip.style.cssText = `width:8px;height:20px;margin:0 2px;border:1px solid ${c.ready ? '#33aaff' : '#333'};background:${c.ready ? '#33aaff44' : 'transparent'}`;
    dashEl.appendChild(pip);
  }
} else {
  dashEl.style.display = 'none';
}
```

- [ ] **Step 9: Commit**

```bash
git add public/index.html
git commit -m "Add dash system with charges, Phantom Dash, Bullet Time"
```

---

### Task 7: Rescue Mission

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add rescue state variables**

In the state section:

```js
// Rescue mission state
let rescueState = 'idle'; // idle, holding_f, survival_phase, circle_spawned, extracting, success, expired
let rescueHoldStart = 0;
let rescueSurvivalTimer = 0;
let rescueExpiryTimer = 0;
let rescueExtractProgress = 0;
let rescueCircle = null; // { x, y, radius }
let rescueCooldownUntil = 0;
let rescueRunTime = 0; // frames since run start
```

- [ ] **Step 2: Add rescue circle spawn function**

```js
function spawnRescueCircle() {
  const baseRadius = 60;
  const radius = baseRadius * (1 + getPlayerStat('rescueCircleRadiusPct'));
  const minWallDist = 3 * TILE;
  const minBorderDist = 5 * TILE;
  const mapW = COLS * TILE;
  const mapH = ROWS * TILE;

  let best = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = minBorderDist + Math.random() * (mapW - 2 * minBorderDist);
    const y = minBorderDist + Math.random() * (mapH - 2 * minBorderDist);

    // Check wall distance
    let tooClose = false;
    const checkRadius = Math.ceil(minWallDist / TILE);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (let r = -checkRadius; r <= checkRadius && !tooClose; r++) {
      for (let c = -checkRadius; c <= checkRadius && !tooClose; c++) {
        const cr = ty + r, cc = tx + c;
        if (cr >= 0 && cr < ROWS && cc >= 0 && cc < COLS && MAP[cr][cc] === 1) {
          const wx = cc * TILE + TILE/2, wy = cr * TILE + TILE/2;
          const dx = x - wx, dy = y - wy;
          if (Math.sqrt(dx*dx + dy*dy) < minWallDist) tooClose = true;
        }
      }
    }

    if (!tooClose) {
      best = { x, y, radius };
      break;
    }
  }

  // Fallback: relaxed constraints
  if (!best) {
    const x = 3*TILE + Math.random() * (mapW - 6*TILE);
    const y = 3*TILE + Math.random() * (mapH - 6*TILE);
    best = { x, y, radius };
  }

  rescueCircle = best;
}
```

- [ ] **Step 3: Add rescue update function**

```js
function updateRescue(now) {
  rescueRunTime++;

  switch (rescueState) {
    case 'idle':
      break;

    case 'holding_f':
      if (!keys['KeyF']) {
        rescueState = 'idle';
        break;
      }
      if (now - rescueHoldStart >= 3000) {
        rescueState = 'survival_phase';
        rescueSurvivalTimer = getPlayerStat('rescueSurvivalTime') * 60; // frames
        showWaveBanner('RESCUE ANGEFORDERT');
      }
      break;

    case 'survival_phase':
      rescueSurvivalTimer--;
      if (rescueSurvivalTimer <= 0) {
        rescueState = 'circle_spawned';
        spawnRescueCircle();
        rescueExpiryTimer = getPlayerStat('rescueExpiryTime') * 60;
        showWaveBanner('RETTUNGSZONE AKTIV');
      }
      break;

    case 'circle_spawned':
    case 'extracting': {
      rescueExpiryTimer--;

      // Check if player is in circle
      const dx = player.x - rescueCircle.x;
      const dy = player.y - rescueCircle.y;
      const inCircle = Math.sqrt(dx*dx + dy*dy) < rescueCircle.radius;

      if (rescueState === 'circle_spawned' && inCircle) {
        rescueState = 'extracting';
        rescueExtractProgress = 0;
      } else if (rescueState === 'extracting' && !inCircle) {
        rescueState = 'circle_spawned';
        rescueExtractProgress = 0;
      }

      if (rescueState === 'extracting') {
        const standFrames = getPlayerStat('rescueStandTime') * 60;
        rescueExtractProgress += 1 / standFrames;

        if (rescueExtractProgress >= 1) {
          rescueState = 'success';
          rescueSuccess();
          return;
        }
      }

      // Evac Chopper: circle follows player
      if (hasSkill('evac_chopper') && rescueCircle) {
        const speed = getPlayerStat('moveSpeed') * 0.5 / 60; // per frame
        const cdx = player.x - rescueCircle.x;
        const cdy = player.y - rescueCircle.y;
        const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
        if (cdist > 10) {
          rescueCircle.x += (cdx/cdist) * speed * 60;
          rescueCircle.y += (cdy/cdist) * speed * 60;
        }
      }

      // Expiry
      if (rescueExpiryTimer <= 0) {
        rescueState = 'idle';
        rescueCircle = null;
        rescueCooldownUntil = performance.now() + getPlayerStat('rescueCooldown') * 1000;
        showWaveBanner('RESCUE FEHLGESCHLAGEN');
      }
      break;
    }
  }
}
```

- [ ] **Step 4: Add rescue success function**

```js
async function rescueSuccess() {
  running = false;

  if (authToken) {
    // Final XP sync
    if (pendingXp > 0) {
      const xpToSync = pendingXp;
      pendingXp = 0;
      globalXp += xpToSync;
      try {
        await fetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ xp: xpToSync })
        });
      } catch {}
    }

    // Confirm rescue (skills stay)
    try {
      await fetch('/api/rescue', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
    } catch {}
  }

  lastRunText = 'GERETTET! Wave ' + wave + '  |  +' + score + ' XP  |  ALLES BEHALTEN';
  showGameMenu();
}
```

- [ ] **Step 5: Add F key handler for rescue activation**

In the keydown handler, add:

```js
if (e.code === 'KeyF' && rescueState === 'idle' && running && !paused) {
  const activationFrames = getPlayerStat('rescueActivationTime') * 60;
  if (rescueRunTime >= activationFrames && performance.now() >= rescueCooldownUntil) {
    rescueState = 'holding_f';
    rescueHoldStart = performance.now();
  }
}
```

- [ ] **Step 6: Add zombie spawn exclusion zone**

The circle spawns >= 5 tiles from the border, and zombies spawn at edges. So the exclusion zone is enforced by the circle's spawn rules (min distance from border). For edge cases where circle + Safe Zone skill radius extends close to edges, add a check in `spawnZombie()`:

```js
// After picking edge position, check rescue circle exclusion
if (rescueCircle) {
  const rdx = edge.x - rescueCircle.x;
  const rdy = edge.y - rescueCircle.y;
  if (Math.sqrt(rdx*rdx + rdy*rdy) < rescueCircle.radius + 6 * TILE) {
    // Too close to rescue circle + exclusion zone, try different spawn point
    const otherEdge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
    edge = otherEdge; // fallback to different edge
  }
}
```

- [ ] **Step 7: Draw rescue circle and HUD**

```js
function drawRescueCircle() {
  if (!rescueCircle) return;

  ctx.save();

  // Pulsing ring
  const pulse = 0.6 + Math.sin(frameCount * 0.08) * 0.4;
  ctx.strokeStyle = `rgba(100, 255, 150, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#66ff9988';
  ctx.beginPath();
  ctx.arc(rescueCircle.x, rescueCircle.y, rescueCircle.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner fill
  ctx.fillStyle = `rgba(100, 255, 150, ${pulse * 0.08})`;
  ctx.fill();

  // Progress bar above circle (when extracting)
  if (rescueState === 'extracting') {
    const barW = rescueCircle.radius * 2;
    const barH = 6;
    const barX = rescueCircle.x - barW/2;
    const barY = rescueCircle.y - rescueCircle.radius - 20;

    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#66ff99';
    ctx.fillRect(barX, barY, barW * rescueExtractProgress, barH);
  }

  ctx.restore();
}

function drawRescueHUD() {
  if (rescueState === 'idle') {
    // Show availability hint
    const activationFrames = getPlayerStat('rescueActivationTime') * 60;
    if (rescueRunTime < activationFrames) {
      const secsLeft = Math.ceil((activationFrames - rescueRunTime) / 60);
      ctx.save();
      ctx.font = "10px 'Share Tech Mono'";
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.fillText(`RESCUE IN ${secsLeft}s`, W/2, H - 20);
      ctx.restore();
    } else if (performance.now() < rescueCooldownUntil) {
      const secsLeft = Math.ceil((rescueCooldownUntil - performance.now()) / 1000);
      ctx.save();
      ctx.font = "10px 'Share Tech Mono'";
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.fillText(`RESCUE COOLDOWN ${secsLeft}s`, W/2, H - 20);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = "10px 'Share Tech Mono'";
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.fillText('F HALTEN — RESCUE ANFORDERN', W/2, H - 20);
      ctx.restore();
    }
    return;
  }

  if (rescueState === 'holding_f') {
    const prog = Math.min((performance.now() - rescueHoldStart) / 3000, 1);
    const barW = 200, barH = 8;
    ctx.save();
    ctx.fillStyle = '#222';
    ctx.fillRect(W/2 - barW/2, H/2 + 40, barW, barH);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(W/2 - barW/2, H/2 + 40, barW * prog, barH);
    ctx.font = "12px 'Share Tech Mono'";
    ctx.fillStyle = '#ffaa00';
    ctx.textAlign = 'center';
    ctx.fillText('RESCUE ANFRAGE...', W/2, H/2 + 35);
    ctx.restore();
    return;
  }

  if (rescueState === 'survival_phase') {
    const secs = Math.ceil(rescueSurvivalTimer / 60);
    ctx.save();
    ctx.font = "16px 'Bebas Neue'";
    ctx.fillStyle = '#ffaa00';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText(`UEBERLEBE: ${secs}s`, W/2, 60);
    ctx.restore();
    return;
  }

  if (rescueState === 'circle_spawned' || rescueState === 'extracting') {
    const secs = Math.ceil(rescueExpiryTimer / 60);
    ctx.save();
    ctx.font = "16px 'Bebas Neue'";
    ctx.fillStyle = secs < 15 ? '#cc2200' : '#ffaa00';
    ctx.textAlign = 'center';
    ctx.fillText(`RETTUNGSZONE: ${secs}s`, W/2, 60);
    ctx.restore();
  }
}
```

- [ ] **Step 8: Wire into game loop and draw pipeline**

In `loop()`, after `updateDash()`:
```js
updateRescue(performance.now());
```

In draw section, after `drawAmmopacks()`:
```js
drawRescueCircle();
```

After score display:
```js
drawRescueHUD();
```

Add rescue circle to minimap in `drawMinimap()`:
```js
// Rescue circle on minimap
if (rescueCircle) {
  ctx.save();
  ctx.strokeStyle = frameCount % 30 < 15 ? '#66ff99' : 'transparent'; // blink
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(
    ox + (rescueCircle.x/TILE)*S,
    oy + (rescueCircle.y/TILE)*S,
    (rescueCircle.radius/TILE)*S, 0, Math.PI*2
  );
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 9: Reset rescue state in init()**

In `init()`:
```js
rescueState = 'idle';
rescueHoldStart = 0;
rescueSurvivalTimer = 0;
rescueExpiryTimer = 0;
rescueExtractProgress = 0;
rescueCircle = null;
rescueCooldownUntil = 0;
rescueRunTime = 0;
```

- [ ] **Step 10: Commit**

```bash
git add public/index.html
git commit -m "Add rescue mission: state machine, circle spawn, extraction, HUD"
```

---

### Task 8: Skill Tree UI in Lobby

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add skill tree overlay HTML**

After the pause-screen div (~line 309), add:

```html
<div id="skill-tree-screen" style="display:none">
  <canvas id="skill-tree-canvas" style="position:absolute;inset:0;cursor:grab"></canvas>
  <div id="st-hud-top" style="position:absolute;top:12px;left:0;right:0;display:flex;justify-content:center;gap:0;z-index:10">
    <button class="start-btn" style="font-size:14px;padding:8px 24px;letter-spacing:3px;border-radius:4px 0 0 4px" id="st-survival">SURVIVAL</button>
    <button class="start-btn btn-secondary" style="font-size:14px;padding:8px 24px;letter-spacing:3px;border-radius:0" id="st-mobility">MOBILITY</button>
    <button class="start-btn btn-secondary" style="font-size:14px;padding:8px 24px;letter-spacing:3px;border-radius:0 4px 4px 0" id="st-rescue">RESCUE</button>
  </div>
  <div id="st-points" style="position:absolute;bottom:12px;left:20px;font-size:12px;color:#888;letter-spacing:2px;z-index:10"></div>
  <button class="start-btn btn-secondary" id="st-back" style="position:absolute;bottom:12px;right:20px;font-size:12px;padding:6px 20px;z-index:10">ZURUECK</button>
  <div id="st-tooltip" style="display:none;position:absolute;background:rgba(8,8,20,0.95);border:1px solid #333;padding:14px 18px;max-width:260px;z-index:200;pointer-events:none;font-family:'Share Tech Mono',monospace"></div>
</div>
```

- [ ] **Step 2: Add CSS for skill tree**

In the `<style>` block:

```css
#skill-tree-screen {
  position: absolute;
  inset: 0;
  background: #050510;
  z-index: 25;
}
#skill-tree-canvas {
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 3: Add SKILL TREE button to lobby**

In the overlay div (~line 300), after the start button:

```html
<button class="start-btn btn-secondary" id="skilltree-btn" style="margin-top:4px">SKILL TREE</button>
```

- [ ] **Step 4: Add skill tree rendering logic**

This is the largest code block. Add the entire skill tree canvas system as a self-contained section:

```js
// ── SKILL TREE UI ──────────────────────────────────────
const stCanvas = document.getElementById('skill-tree-canvas');
const stCtx = stCanvas.getContext('2d');
let stActive = false;
let stActivePath = 'survival';
let stCamX = 0, stCamY = 0, stZoom = 1;
let stTargetCamX = 0, stTargetCamY = 0, stTargetZoom = 1;
let stDragStart = null, stCamStart = null;
let stHovered = null;
let stTime = 0;

const ST_COLORS = {
  survival: { main: '#33cc44', dim: '#1a6622', glow: 'rgba(51,204,68,0.25)', bg: 'rgba(51,204,68,0.08)', nebula: 'rgba(51,204,68,0.03)' },
  mobility: { main: '#33aaff', dim: '#1a5580', glow: 'rgba(51,170,255,0.25)', bg: 'rgba(51,170,255,0.08)', nebula: 'rgba(51,170,255,0.03)' },
  rescue:   { main: '#ffaa00', dim: '#805500', glow: 'rgba(255,170,0,0.25)',  bg: 'rgba(255,170,0,0.08)',  nebula: 'rgba(255,170,0,0.03)' },
};

// Stars for skill tree background
const stStars = [];
for (let i = 0; i < 400; i++) {
  stStars.push({ x: (Math.random()-0.5)*2000, y: (Math.random()-0.5)*2000, r: Math.random()*1.2, a: 0.15+Math.random()*0.35, tw: Math.random()*Math.PI*2 });
}

function stWorldToScreen(wx, wy) {
  return { x: (wx - stCamX) * stZoom + stCanvas.width/2, y: (wy - stCamY) * stZoom + stCanvas.height/2 };
}

function stScreenToWorld(sx, sy) {
  return { x: (sx - stCanvas.width/2) / stZoom + stCamX, y: (sy - stCanvas.height/2) / stZoom + stCamY };
}

function getAvailableSkillPoints() {
  const totalXp = globalXp;
  const level = getLevelFromXp(totalXp);
  const total = level - 1;
  const used = activeSkills.reduce((sum, s) => sum + s.level, 0);
  return total - used;
}

function isSkillUnlockable(skill) {
  if (skill.tier === 0) return false; // start nodes aren't investable
  if (skill.maxLvl === 0) return false;
  const currentLvl = getSkillLevel(skill.id);
  if (currentLvl >= skill.maxLvl) return false;
  if (getAvailableSkillPoints() <= 0) return false;
  // Check prerequisite
  if (skill.req) {
    const reqSkill = SKILL_MAP[skill.req];
    if (reqSkill.tier > 0 && getSkillLevel(skill.req) <= 0) return false;
  }
  return true;
}

async function investSkillPoint(skillId) {
  if (!authToken) return;
  try {
    const res = await fetch('/api/skills/invest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ skillId })
    });
    if (res.ok) {
      const data = await res.json();
      activeSkills = data.skills.map(s => ({ skillId: s.skill_id, level: s.level }));
    }
  } catch {}
}

function drawSkillTree() {
  if (!stActive) return;
  stTime += 0.016;
  const sw = stCanvas.width, sh = stCanvas.height;

  // Smooth camera
  stCamX += (stTargetCamX - stCamX) * 0.08;
  stCamY += (stTargetCamY - stCamY) * 0.08;
  stZoom += (stTargetZoom - stZoom) * 0.08;

  stCtx.clearRect(0, 0, sw, sh);

  // Background
  const grad = stCtx.createRadialGradient(sw/2, sh/2, 0, sw/2, sh/2, sw*0.7);
  grad.addColorStop(0, '#0a0a18'); grad.addColorStop(1, '#040410');
  stCtx.fillStyle = grad;
  stCtx.fillRect(0, 0, sw, sh);

  // Stars
  for (const s of stStars) {
    const p = stWorldToScreen(s.x, s.y);
    if (p.x < -10 || p.x > sw+10 || p.y < -10 || p.y > sh+10) continue;
    stCtx.globalAlpha = s.a * (0.5 + 0.5 * Math.sin(stTime * 1.5 + s.tw));
    stCtx.fillStyle = '#fff';
    stCtx.beginPath();
    stCtx.arc(p.x, p.y, s.r * Math.min(stZoom, 1.5), 0, Math.PI * 2);
    stCtx.fill();
  }
  stCtx.globalAlpha = 1;

  const col = ST_COLORS[stActivePath];
  const activeSkillDefs = SKILLS.filter(s => s.path === stActivePath);
  const activeConns = SKILL_CONNECTIONS.filter(c => c.path === stActivePath);

  // Nebula
  const center = stWorldToScreen(0, -200);
  stCtx.beginPath();
  stCtx.ellipse(center.x, center.y, 350*stZoom, 300*stZoom, 0, 0, Math.PI*2);
  stCtx.fillStyle = col.nebula;
  stCtx.fill();

  // Connections
  for (const c of activeConns) {
    const from = SKILL_MAP[c.from], to = SKILL_MAP[c.to];
    const p1 = stWorldToScreen(from.x, from.y), p2 = stWorldToScreen(to.x, to.y);
    stCtx.save();
    stCtx.strokeStyle = col.glow; stCtx.lineWidth = 5 * stZoom;
    stCtx.beginPath(); stCtx.moveTo(p1.x, p1.y); stCtx.lineTo(p2.x, p2.y); stCtx.stroke();
    stCtx.strokeStyle = col.dim; stCtx.lineWidth = 1.5 * stZoom;
    stCtx.beginPath(); stCtx.moveTo(p1.x, p1.y); stCtx.lineTo(p2.x, p2.y); stCtx.stroke();
    // Animated dots
    for (let i = 0; i < 2; i++) {
      const t = ((stTime * 0.3 + i / 2) % 1);
      stCtx.beginPath();
      stCtx.arc(p1.x + (p2.x-p1.x)*t, p1.y + (p2.y-p1.y)*t, 1.5*stZoom, 0, Math.PI*2);
      stCtx.fillStyle = col.main; stCtx.globalAlpha = 0.4; stCtx.fill(); stCtx.globalAlpha = 1;
    }
    stCtx.restore();
  }

  // Nodes
  for (const s of activeSkillDefs) {
    const p = stWorldToScreen(s.x, s.y);
    const isHovered = stHovered === s;
    const r = s.r * stZoom;
    const invested = getSkillLevel(s.id);
    const unlockable = isSkillUnlockable(s);
    const hasInvestment = invested > 0;

    // Glow for invested or hovered
    if (isHovered || s.tier === 3 || hasInvestment) {
      stCtx.save();
      stCtx.shadowBlur = isHovered ? 35 : hasInvestment ? 20 : 15;
      stCtx.shadowColor = col.main;
      stCtx.beginPath(); stCtx.arc(p.x, p.y, r, 0, Math.PI*2);
      stCtx.fillStyle = 'rgba(0,0,0,0.01)'; stCtx.fill();
      stCtx.restore();
    }

    // Capstone pulsing ring
    if (s.tier === 3) {
      const pulseR = r + 6*stZoom + Math.sin(stTime*2)*3*stZoom;
      stCtx.save();
      stCtx.beginPath(); stCtx.arc(p.x, p.y, pulseR, 0, Math.PI*2);
      stCtx.strokeStyle = col.dim; stCtx.lineWidth = stZoom;
      stCtx.globalAlpha = 0.4 + Math.sin(stTime*2)*0.2;
      stCtx.setLineDash([4*stZoom, 4*stZoom]); stCtx.stroke();
      stCtx.restore();
    }

    // Node background
    stCtx.save();
    stCtx.beginPath(); stCtx.arc(p.x, p.y, r, 0, Math.PI*2);
    stCtx.fillStyle = hasInvestment ? col.bg : isHovered ? 'rgba(20,20,40,0.9)' : 'rgba(10,10,20,0.85)';
    stCtx.fill();
    stCtx.strokeStyle = hasInvestment ? col.main : unlockable ? col.dim : '#222';
    stCtx.lineWidth = (isHovered ? 2.5 : hasInvestment ? 2 : 1.5) * stZoom;
    stCtx.stroke();
    stCtx.restore();

    // Start node center dot
    if (s.tier === 0) {
      stCtx.save(); stCtx.beginPath(); stCtx.arc(p.x, p.y, r*0.5, 0, Math.PI*2);
      stCtx.fillStyle = col.main; stCtx.globalAlpha = 0.3; stCtx.fill(); stCtx.restore();
    }

    // Icon
    if (stZoom > 0.35) {
      stCtx.save();
      stCtx.font = `${Math.max(12, r*0.75)}px serif`;
      stCtx.textAlign = 'center'; stCtx.textBaseline = 'middle';
      stCtx.globalAlpha = hasInvestment || s.tier === 0 ? 1 : unlockable ? 0.7 : 0.3;
      stCtx.fillText(s.icon, p.x, p.y + 1);
      stCtx.restore();
    }

    // Name label
    if (stZoom > 0.55) {
      stCtx.save();
      stCtx.font = `${Math.max(8, 10*stZoom)}px 'Share Tech Mono', monospace`;
      stCtx.textAlign = 'center';
      stCtx.fillStyle = hasInvestment ? col.main : isHovered ? '#888' : '#444';
      stCtx.fillText(s.name, p.x, p.y + r + 14*stZoom);
      stCtx.restore();
    }

    // Level pips
    if (s.maxLvl > 0 && stZoom > 0.5) {
      const pipW = 6*stZoom, pipH = 3*stZoom, gap = 3*stZoom;
      const totalW = s.maxLvl * (pipW + gap) - gap;
      const startX = p.x - totalW/2;
      const pipY = p.y - r - 8*stZoom;
      for (let i = 0; i < s.maxLvl; i++) {
        stCtx.fillStyle = i < invested ? col.main : col.dim;
        stCtx.globalAlpha = i < invested ? 1 : 0.3;
        stCtx.fillRect(startX + i*(pipW+gap), pipY, pipW, pipH);
      }
      stCtx.globalAlpha = 1;
    }
  }

  // Points display
  document.getElementById('st-points').textContent =
    'VERFUEGBARE PUNKTE: ' + getAvailableSkillPoints();

  requestAnimationFrame(drawSkillTree);
}
```

- [ ] **Step 5: Add skill tree event handlers**

```js
// Skill tree input
stCanvas.addEventListener('mousedown', e => {
  stDragStart = { x: e.clientX, y: e.clientY };
  stCamStart = { x: stTargetCamX, y: stTargetCamY };
});

stCanvas.addEventListener('mousemove', e => {
  if (stDragStart) {
    stTargetCamX = stCamStart.x - (e.clientX - stDragStart.x) / stZoom;
    stTargetCamY = stCamStart.y - (e.clientY - stDragStart.y) / stZoom;
    document.getElementById('st-tooltip').style.display = 'none';
    stHovered = null;
    return;
  }

  const world = stScreenToWorld(e.clientX, e.clientY);
  stHovered = null;
  for (const s of SKILLS.filter(sk => sk.path === stActivePath)) {
    const dx = world.x - s.x, dy = world.y - s.y;
    if (dx*dx + dy*dy < (s.r+8)*(s.r+8)) { stHovered = s; break; }
  }

  const tt = document.getElementById('st-tooltip');
  if (stHovered) {
    const s = stHovered;
    const c = ST_COLORS[s.path];
    const lvl = getSkillLevel(s.id);
    let html = `<h3 style="font-family:'Bebas Neue';font-size:20px;letter-spacing:3px;color:${c.main};margin-bottom:4px">${s.name}</h3>`;
    html += `<div style="font-size:10px;color:#888;line-height:1.6;margin-bottom:8px">${s.desc}</div>`;
    if (s.maxLvl > 0) {
      html += `<div style="font-size:10px;color:#666;margin-bottom:4px">Level: ${lvl} / ${s.maxLvl}</div>`;
      if (s.effect && lvl > 0) {
        const fx = s.effect(lvl);
        const entries = Object.entries(fx).filter(([k,v]) => v !== 0);
        if (entries.length > 0) {
          html += '<div style="font-size:10px;color:#aaa;border-top:1px solid #222;padding-top:6px">';
          for (const [k, v] of entries) html += `${k}: <span style="color:#55cc33">${v > 0 ? '+' : ''}${v}</span><br>`;
          html += '</div>';
        }
      }
      if (s.req) html += `<div style="font-size:9px;color:#cc2200;margin-top:6px">Braucht: ${SKILL_MAP[s.req].name}</div>`;
    }
    tt.innerHTML = html;
    let tx = e.clientX + 16, ty = e.clientY - 10;
    if (tx + 270 > stCanvas.width) tx = e.clientX - 270;
    if (ty < 10) ty = 10;
    tt.style.left = tx + 'px'; tt.style.top = ty + 'px';
    tt.style.display = 'block';
    stCanvas.style.cursor = isSkillUnlockable(s) ? 'pointer' : 'default';
  } else {
    tt.style.display = 'none';
    stCanvas.style.cursor = 'grab';
  }
});

stCanvas.addEventListener('mouseup', e => {
  // Click to invest
  if (stDragStart && Math.abs(e.clientX - stDragStart.x) < 5 && Math.abs(e.clientY - stDragStart.y) < 5) {
    if (stHovered && isSkillUnlockable(stHovered)) {
      investSkillPoint(stHovered.id);
    }
  }
  stDragStart = null; stCamStart = null;
});

stCanvas.addEventListener('mouseleave', () => {
  stDragStart = null; stHovered = null;
  document.getElementById('st-tooltip').style.display = 'none';
});

stCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = -e.deltaY * 0.0008;
  stTargetZoom = Math.max(0.4, Math.min(2.5, stTargetZoom * (1 + delta)));
  const wx = (e.clientX - stCanvas.width/2) / stZoom + stCamX;
  const wy = (e.clientY - stCanvas.height/2) / stZoom + stCamY;
  stTargetCamX = wx - (e.clientX - stCanvas.width/2) / stTargetZoom;
  stTargetCamY = wy - (e.clientY - stCanvas.height/2) / stTargetZoom;
}, { passive: false });
```

- [ ] **Step 6: Add path toggle and navigation buttons**

```js
function stSelectPath(p) {
  stActivePath = p;
  document.getElementById('st-survival').className = 'start-btn' + (p === 'survival' ? '' : ' btn-secondary');
  document.getElementById('st-mobility').className = 'start-btn' + (p === 'mobility' ? '' : ' btn-secondary');
  document.getElementById('st-rescue').className = 'start-btn' + (p === 'rescue' ? '' : ' btn-secondary');
  stTargetCamX = 0; stTargetCamY = -200; stTargetZoom = 1;
}

document.getElementById('st-survival').addEventListener('click', () => stSelectPath('survival'));
document.getElementById('st-mobility').addEventListener('click', () => stSelectPath('mobility'));
document.getElementById('st-rescue').addEventListener('click', () => stSelectPath('rescue'));

document.getElementById('skilltree-btn').addEventListener('click', () => {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('skill-tree-screen').style.display = 'block';
  stCanvas.width = window.innerWidth;
  stCanvas.height = window.innerHeight;
  stActive = true;
  stSelectPath('survival');
  requestAnimationFrame(drawSkillTree);
});

document.getElementById('st-back').addEventListener('click', () => {
  stActive = false;
  document.getElementById('skill-tree-screen').style.display = 'none';
  showGameMenu();
});
```

- [ ] **Step 7: Style the path toggle buttons**

Add colors for active state in the toggle button styles. The `start-btn` class already has hover styles. For the active path, override via the class toggle in `stSelectPath()`. Add to CSS:

```css
#st-survival:not(.btn-secondary) { border-color: #33cc44; color: #33cc44; }
#st-mobility:not(.btn-secondary) { border-color: #33aaff; color: #33aaff; }
#st-rescue:not(.btn-secondary) { border-color: #ffaa00; color: #ffaa00; }
```

- [ ] **Step 8: Test and commit**

Open game, go to lobby, click SKILL TREE. Verify:
- Constellation map renders with pan/zoom
- Toggle between paths works
- Hover shows tooltips
- Click invests points (if earned enough XP)
- Back button returns to lobby

```bash
git add public/index.html
git commit -m "Add constellation-style skill tree UI in lobby with invest interaction"
```

---

### Task 9: Integration & Polish

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add F key hint to in-game controls display**

In the lobby hint text (~line 297):
```html
WASD — Bewegen &nbsp;|&nbsp; MAUS — Zielen &nbsp;|&nbsp; LINKSKLICK — Schie&szlig;en<br>
R — Nachladen &nbsp;|&nbsp; SPACE — Dash &nbsp;|&nbsp; F halten — Rescue &nbsp;|&nbsp; ESC — Pause
```

- [ ] **Step 2: Update .gitignore to include .superpowers/**

```bash
echo ".superpowers/" >> /Users/manu/Desktop/Coding/Personal/zombie-zone/.gitignore
```

- [ ] **Step 3: Verify full gameplay loop**

Play through this complete scenario:
1. Register/login
2. Open skill tree, verify 0 points at Level 1
3. Start run, earn XP by killing zombies
4. Die — verify 75% penalty, return to lobby
5. Open skill tree — verify points from reduced level
6. Invest points into Swift and Dash
7. Start new run — verify speed boost and dash works
8. Invest in Rescue path skills
9. Play past 240s, hold F for rescue
10. Complete extraction — verify everything kept
11. Verify quit also applies penalty

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add controls hint update, gitignore .superpowers"
```

- [ ] **Step 5: Final commit with updated README**

Update README.md to document new features:

Add to the Features section:
```markdown
- **Skill Tree** — 3 Pfade (Survival, Mobility, Rescue) mit 24 Skills
- **Dash** — Kurzer Sprint in Blickrichtung (Leertaste)
- **Shield** — Schutzschild das Schaden absorbiert
- **Rescue Mission** — Evakuierung anfordern um XP zu retten
- **Tod-Strafe** — 75% XP Verlust bei Tod, Skills resettet
```

Add to Steuerung table:
```markdown
| Leertaste | Dash (wenn freigeschaltet) |
| F halten | Rescue Mission anfordern |
```

```bash
git add README.md
git commit -m "Update README with skill tree, dash, rescue, death penalty docs"
```

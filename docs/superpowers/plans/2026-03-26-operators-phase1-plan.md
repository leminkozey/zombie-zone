# Operators Phase 1: Backend, UI, Buy/Select, Buffs/Debuffs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 operator classes that players can buy, select, and whose passive buffs/debuffs affect gameplay. Active abilities come in Phase 2.

**Architecture:** New `user_operators` table + `active_operator` column on users. Operator definitions as data-driven config. Buffs/Debuffs integrated into `getPlayerStat()`. OPERATORS tab replaces "Coming Soon". Active ability activation (Q key) wired up with placeholder "coming soon" for complex abilities.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Express 5, better-sqlite3

**Scope:** This plan covers buy/select/buffs/debuffs + simple active abilities (Soldat Kampfrausch, Juggernaut Unaufhaltsam). Complex entity-spawning abilities (Builder blocks, Elektriker turrets, Medic heal zone, Time Traveler slowmo) are Phase 2.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `database.js` | Modify | Add `user_operators` table, `active_operator` column, prepared statements, update death |
| `server.js` | Modify | Add 4 operator API endpoints, operator definitions |
| `public/index.html` | Modify | Operator configs, OPERATORS tab UI, buy/select, Q key ability, buff/debuff in getPlayerStat |

---

### Task 1: Backend — Database & API

**Files:**
- Modify: `database.js`
- Modify: `server.js`

- [ ] **Step 1: Add operator table and columns to database.js**

```js
try { db.exec('ALTER TABLE users ADD COLUMN active_operator TEXT DEFAULT NULL'); } catch {}

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
```

Add prepared statements:
```js
const getUserOperators = db.prepare('SELECT * FROM user_operators WHERE user_id = ?');
const getOperator = db.prepare('SELECT * FROM user_operators WHERE user_id = ? AND operator_id = ?');
const buyOperator = db.prepare('INSERT OR IGNORE INTO user_operators (user_id, operator_id) VALUES (?, ?)');
const setActiveOperator = db.prepare('UPDATE users SET active_operator = ? WHERE id = ?');
const resetOperatorUpgrades = db.prepare('UPDATE user_operators SET active_level = 0, passive_level = 0, buff_level = 0 WHERE user_id = ?');
const upgradeOperatorSlot = function(userId, operatorId, slot) {
  const validSlots = ['active', 'passive', 'buff'];
  if (!validSlots.includes(slot)) throw new Error('Invalid slot');
  db.prepare(`UPDATE user_operators SET ${slot}_level = ${slot}_level + 1 WHERE user_id = ? AND operator_id = ?`).run(userId, operatorId);
};
```

Update `applyDeath` transaction to reset operator upgrades (but NOT delete operators):
```js
resetOperatorUpgrades.run(userId);
```

Update `getUser` to include `active_operator`:
```js
const getUser = db.prepare('SELECT id, name, xp, gold, diamonds, active_operator FROM users WHERE id = ?');
```

Export all new items.

- [ ] **Step 2: Add operator API endpoints to server.js**

Import new exports. Add operator definitions:

```js
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
```

Add endpoints:

```js
// GET /api/operators
app.get('/api/operators', auth, (req, res) => {
  const operators = getUserOperators.all(req.user.id);
  const user = getUser.get(req.user.id);
  res.json({ operators, activeOperator: user.active_operator });
});

// POST /api/operators/buy
app.post('/api/operators/buy', auth, (req, res) => {
  const { operatorId, currency } = req.body;
  const def = OPERATOR_DEFS[operatorId];
  if (!def) return res.status(400).json({ error: 'Unknown operator' });

  const user = getUser.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const level = getLevelFromXp(user.xp);
  if (level < def.unlockLevel) return res.status(400).json({ error: 'Level too low' });

  const existing = getOperator.get(req.user.id, operatorId);
  if (existing) return res.status(400).json({ error: 'Already owned' });

  if (currency === 'gold') {
    if (user.gold < def.goldCost) return res.status(400).json({ error: 'Not enough gold' });
    addGold.run(-def.goldCost, req.user.id);
  } else if (currency === 'diamonds') {
    if (user.diamonds < def.diamondCost) return res.status(400).json({ error: 'Not enough diamonds' });
    addDiamonds.run(-def.diamondCost, req.user.id);
  } else {
    return res.status(400).json({ error: 'Invalid currency' });
  }

  buyOperator.run(req.user.id, operatorId);
  const operators = getUserOperators.all(req.user.id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ operators, gold: updatedUser.gold, diamonds: updatedUser.diamonds });
});

// POST /api/operators/select
app.post('/api/operators/select', auth, (req, res) => {
  const { operatorId } = req.body; // null = no operator
  if (operatorId !== null) {
    const def = OPERATOR_DEFS[operatorId];
    if (!def) return res.status(400).json({ error: 'Unknown operator' });
    const existing = getOperator.get(req.user.id, operatorId);
    if (!existing) return res.status(400).json({ error: 'Operator not owned' });
  }
  setActiveOperator.run(operatorId, req.user.id);
  res.json({ activeOperator: operatorId });
});

// POST /api/operators/upgrade
app.post('/api/operators/upgrade', auth, (req, res) => {
  const { operatorId, slot } = req.body;
  if (!['active', 'passive', 'buff'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });

  const op = getOperator.get(req.user.id, operatorId);
  if (!op) return res.status(400).json({ error: 'Operator not owned' });

  const currentLevel = op[slot + '_level'];
  const maxLevel = OP_UPGRADE_MAX[slot];
  if (currentLevel >= maxLevel) return res.status(400).json({ error: 'Max level' });

  const levelNum = currentLevel + 1;
  const baseCost = OP_UPGRADE_BASE_COST[slot];
  const goldCost = baseCost.gold * levelNum;
  const spCost = baseCost.sp * levelNum;

  const user = getUser.get(req.user.id);
  if (user.gold < goldCost) return res.status(400).json({ error: 'Not enough gold' });

  // SP check: total skill points - used in skill tree - used in operator upgrades
  const totalLevel = getLevelFromXp(user.xp);
  const totalSP = totalLevel - 1;
  const usedSkillSP = getUserSkills.all(req.user.id).reduce((sum, s) => sum + s.level, 0);
  const allOps = getUserOperators.all(req.user.id);
  const usedOpSP = allOps.reduce((sum, o) => {
    const aCost = Array.from({length: o.active_level}, (_, i) => (i+1) * OP_UPGRADE_BASE_COST.active.sp).reduce((a,b) => a+b, 0);
    const pCost = Array.from({length: o.passive_level}, (_, i) => (i+1) * OP_UPGRADE_BASE_COST.passive.sp).reduce((a,b) => a+b, 0);
    const bCost = Array.from({length: o.buff_level}, (_, i) => (i+1) * OP_UPGRADE_BASE_COST.buff.sp).reduce((a,b) => a+b, 0);
    return sum + aCost + pCost + bCost;
  }, 0);
  const availableSP = totalSP - usedSkillSP - usedOpSP;
  if (availableSP < spCost) return res.status(400).json({ error: 'Not enough skill points' });

  addGold.run(-goldCost, req.user.id);
  upgradeOperatorSlot(req.user.id, operatorId, slot);

  const operators = getUserOperators.all(req.user.id);
  const updatedUser = getUser.get(req.user.id);
  res.json({ operators, gold: updatedUser.gold });
});
```

Update `/api/profile` to return `active_operator`.

- [ ] **Step 3: Commit**

```bash
git add database.js server.js
git commit -m "Add operator DB schema, buy/select/upgrade API endpoints"
```

---

### Task 2: Operator Definitions & Buff/Debuff System (Frontend)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add operator config array**

After the PERK_DEFS section, add:

```js
// ── OPERATOR DEFINITIONS ───────────────────────────────
const OPERATORS = {
  soldier: {
    id: 'soldier', name: 'SOLDAT', icon: '🎖', unlockLevel: 15, goldCost: 5000, diamondCost: 30,
    desc: 'Kampferprobter Veteran. Mehr Schaden, staerkere Ammo-Versorgung.',
    active: { name: 'KAMPFRAUSCH', desc: '8s unendlich Ammo + 50% Feuerrate', cooldown: 2100, duration: 480 },
    passive: 'Ammo-Drops +50% haeufiger, Ammo-Packs geben doppelt',
    buffs: { weaponDamagePct: 0.15 },
    debuffs: { healingEffectivenessPct: -0.30 },
  },
  medic: {
    id: 'medic', name: 'MEDIC', icon: '⚕', unlockLevel: 25, goldCost: 12000, diamondCost: 50,
    desc: 'Sanitaeter mit Heilfaehigkeiten. Mehr HP, aber weniger Schaden.',
    active: { name: 'HEILFELD', desc: 'Heilzone: 5 HP/s fuer 8s', cooldown: 1800, duration: 480 },
    passive: 'Healthpack-Drops +50% haeufiger',
    buffs: { maxHp: 50, regenHpPerSec: 1 },
    debuffs: { weaponDamagePct: -0.20 },
  },
  builder: {
    id: 'builder', name: 'BUILDER', icon: '🧱', unlockLevel: 35, goldCost: 25000, diamondCost: 75,
    desc: 'Baut Barrikaden. Mehr HP, aber langsamer beim Schiessen.',
    active: { name: 'BLOCK SETZEN', desc: 'Setzt Wand-Block. Max 10.', cooldown: 480, duration: 0 },
    passive: 'Bloecke heilen sich nach 10s',
    buffs: { maxHpPct: 0.20 },
    debuffs: { fireRatePct: -0.15 },
  },
  electrician: {
    id: 'electrician', name: 'ELEKTRIKER', icon: '⚡', unlockLevel: 50, goldCost: 50000, diamondCost: 100,
    desc: 'Setzt automatische Geschuetztuerme. Mehr Reichweite, langsamer.',
    active: { name: 'TURRET', desc: 'Setzt Turret (2 DPS, 150px). Max 2.', cooldown: 1200, duration: 0 },
    passive: 'Turrets reparieren sich (2 HP/s)',
    buffs: { weaponRangePct: 0.25 },
    debuffs: { moveSpeedPct: -0.20 },
  },
  time_traveler: {
    id: 'time_traveler', name: 'TIME TRAVELER', icon: '⏳', unlockLevel: 70, goldCost: 100000, diamondCost: 150,
    desc: 'Manipuliert die Zeit. Schnell, aber fragil.',
    active: { name: 'ZEITRISS', desc: '5s Slowmo, dann Speedup', cooldown: 2700, duration: 300 },
    passive: 'Jeder 10. Kill: 1s Mini-Slowmo',
    buffs: { moveSpeedPct: 0.30 },
    debuffs: { maxHpPct: -0.25 },
  },
  juggernaut: {
    id: 'juggernaut', name: 'JUGGERNAUT', icon: '🛡', unlockLevel: 90, goldCost: 200000, diamondCost: 200,
    desc: 'Unaufhaltsame Festung. Massiv, aber langsam.',
    active: { name: 'UNAUFHALTSAM', desc: '10s +50% Schaden + Kontaktschaden', cooldown: 2400, duration: 600 },
    passive: 'Minigun kein Reload',
    buffs: { maxHp: 100, shieldHp: 30, damageReductionPct: 0.15 },
    debuffs: { moveSpeedPct: -0.40, fireRatePct: -0.30 },
  },
};

let ownedOperators = []; // from server: [{operator_id, active_level, passive_level, buff_level}]
let activeOperatorId = null; // from server
let operatorAbilityCooldown = 0; // frames remaining
let operatorAbilityActive = false;
let operatorAbilityTimer = 0;
```

- [ ] **Step 2: Integrate buffs/debuffs into getPlayerStat()**

In `getPlayerStat()`, after the skill loop, add operator buff/debuff application:

```js
// After the skill effects loop, before the return:
if (activeOperatorId && OPERATORS[activeOperatorId]) {
  const op = OPERATORS[activeOperatorId];
  // Apply buffs
  if (op.buffs[stat] !== undefined) flat += op.buffs[stat];
  if (op.buffs[stat + 'Pct'] !== undefined) pct += op.buffs[stat + 'Pct'];
  // Apply debuffs
  if (op.debuffs[stat] !== undefined) flat += op.debuffs[stat];
  if (op.debuffs[stat + 'Pct'] !== undefined) pct += op.debuffs[stat + 'Pct'];
}
```

- [ ] **Step 3: Add operator keybind (Q) and basic ability activation**

Add to DEFAULT_KEYBINDS:
```js
operatorAbility: 'KeyQ',
```

Add label in renderKeybinds:
```js
operatorAbility: 'OPERATOR FAEHIGKEIT',
```

In keydown handler, add Q ability:
```js
if (e.code === keybinds.operatorAbility && running && !paused && activeOperatorId) {
  if (operatorAbilityCooldown <= 0 && !operatorAbilityActive) {
    activateOperatorAbility();
  }
}
```

Add activation function:
```js
function activateOperatorAbility() {
  const op = OPERATORS[activeOperatorId];
  if (!op) return;
  operatorAbilityCooldown = op.active.cooldown;
  operatorAbilityActive = true;
  operatorAbilityTimer = op.active.duration;
  playSound('perk_activate');
  showWaveBanner(op.active.name + '!');

  // Soldat: Kampfrausch — set flags
  if (activeOperatorId === 'soldier') {
    player.soldierRush = true;
  }
  // Juggernaut: Unaufhaltsam — set flags
  if (activeOperatorId === 'juggernaut') {
    player.juggernautActive = true;
  }
}

function updateOperatorAbility() {
  if (operatorAbilityCooldown > 0) operatorAbilityCooldown--;
  if (operatorAbilityActive) {
    operatorAbilityTimer--;
    if (operatorAbilityTimer <= 0) {
      operatorAbilityActive = false;
      player.soldierRush = false;
      player.juggernautActive = false;
    }
  }
}
```

Wire `updateOperatorAbility()` into `loop()`.

- [ ] **Step 4: Implement Soldat Kampfrausch effect**

In `tryShoot()`: if `player.soldierRush`, skip ammo deduction, halve fire rate cooldown, skip reload.

In `startReload()`: if `player.soldierRush`, return (no reload needed).

- [ ] **Step 5: Implement Juggernaut effects**

Passive: In reload logic, if `activeOperatorId === 'juggernaut'` and weapon is minigun, skip reload need (infinite mag).

Active (Unaufhaltsam): In `damagePlayer()`, if `player.juggernautActive`, apply +50% damage buff. In `updateZombies()` melee section, if juggernaut active, damage zombie on contact (5 DPS).

Debuff: fireRatePct -0.30 is already handled by getPlayerStat. For "except minigun" — need special handling: don't apply fireRatePct debuff when activeWeaponId is minigun.

- [ ] **Step 6: Implement Soldat/Medic passive effects**

Soldat passive: In `tryDropAmmopack()`, double the drop chance if operator is soldier. In ammopack pickup, double the ammo given.

Medic passive: In `tryDropHealthpack()`, increase drop chance by 50% if operator is medic.

- [ ] **Step 7: Add operator ability cooldown HUD**

Draw on canvas — left side, below rescue indicator:
```js
function drawOperatorHUD() {
  if (!activeOperatorId) return;
  const op = OPERATORS[activeOperatorId];
  const lx = 16, ly = H/2 + 40;

  ctx.save();
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = 'left';

  // Operator name
  ctx.fillStyle = '#556070';
  ctx.fillText(op.icon + ' ' + op.name, lx, ly);

  // Ability status
  if (operatorAbilityActive) {
    ctx.fillStyle = '#33cc44';
    ctx.fillText('[Q] ' + op.active.name + ' AKTIV ' + Math.ceil(operatorAbilityTimer/60) + 's', lx, ly + 16);
  } else if (operatorAbilityCooldown > 0) {
    ctx.fillStyle = '#555';
    ctx.fillText('[Q] ' + op.active.name + ' ' + Math.ceil(operatorAbilityCooldown/60) + 's', lx, ly + 16);
  } else {
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('[Q] ' + op.active.name + ' BEREIT', lx, ly + 16);
  }
  ctx.restore();
}
```

Wire into draw section of `loop()`.

- [ ] **Step 8: Load operators in showGameMenu()**

After loading perks:
```js
try {
  const opRes = await fetch('/api/operators', { headers: { 'Authorization': 'Bearer ' + authToken } });
  if (opRes.ok) {
    const opData = await opRes.json();
    ownedOperators = opData.operators;
    activeOperatorId = opData.activeOperator;
  }
} catch {}
```

- [ ] **Step 9: Reset operator state in init()**

```js
operatorAbilityCooldown = 0;
operatorAbilityActive = false;
operatorAbilityTimer = 0;
player.soldierRush = false;
player.juggernautActive = false;
```

- [ ] **Step 10: Reset operator upgrades on death**

In gameOver/quit, after death API: `ownedOperators.forEach(o => { o.active_level = 0; o.passive_level = 0; o.buff_level = 0; });`

- [ ] **Step 11: Commit**

```bash
git add public/index.html
git commit -m "Add operator configs, buff/debuff integration, Soldat + Juggernaut abilities, Q key"
```

---

### Task 3: OPERATORS Tab UI

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Replace OPERATORS "Coming Soon" with functional tab**

Replace the `#panel-skins` content with a proper operator selection UI. Keep the panel ID as `panel-skins` (since the tab data-tab is 'skins').

Structure: Grid of 6 operator cards. Each card shows:
- Icon + Name
- Level requirement
- Cost (Gold or Diamonds)
- Short description
- Passiv/Aktiv/Buff/Debuff summary
- BUY button (if not owned, affordable)
- SELECT button (if owned)
- SELECTED badge (if active)
- Upgrade slots (if owned)

Build as `renderOperators()` function, called when the OPERATORS tab opens.

Each operator card:
```html
<div class="op-card" style="background:#0a0d10;border:1px solid #141a20;padding:16px;width:300px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <span style="font-size:24px">ICON</span>
    <span style="font-family:Oswald;font-size:18px;letter-spacing:3px;color:#c0ccd8">NAME</span>
  </div>
  <div style="font-size:10px;color:#556070;margin-bottom:12px">DESCRIPTION</div>
  <div style="font-size:9px;color:#33cc44;margin-bottom:4px">BUFF: +15% Schaden</div>
  <div style="font-size:9px;color:#ee2200;margin-bottom:4px">DEBUFF: -30% Heilung</div>
  <div style="font-size:9px;color:#8090a0;margin-bottom:4px">AKTIV: Kampfrausch (8s)</div>
  <div style="font-size:9px;color:#8090a0;margin-bottom:8px">PASSIV: Ammo +50%</div>
  <!-- Action buttons -->
</div>
```

- [ ] **Step 2: Add buy functionality with Gold OR Diamond choice**

Buy button shows two options: "5.000G" and "30💎". Clicking calls `/api/operators/buy` with the chosen currency.

- [ ] **Step 3: Add select functionality**

SELECT button calls `/api/operators/select`. Active operator gets highlighted border.

- [ ] **Step 4: Add upgrade slots (simplified)**

If owned, show 3 upgrade slots below the card: Aktiv (Lvl 0/5), Passiv (Lvl 0/5), Buff (Lvl 0/3). Each with upgrade cost and button.

- [ ] **Step 5: Tab switch integration**

In the tab switching code, call `renderOperators()` when skins tab is selected.

- [ ] **Step 6: Show active operator in lobby**

In the lobby panel, next to the player name/level, show the active operator icon + name if one is selected.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "Add OPERATORS tab: buy, select, upgrade UI for 6 operator classes"
```

---

### Task 4: Integration & Polish

**Files:**
- Modify: `public/index.html`
- Modify: `README.md`

- [ ] **Step 1: Profile loading includes operator**

In `/api/profile` response handling in showGameMenu, set `activeOperatorId`.

- [ ] **Step 2: Juggernaut special — fireRate debuff not for minigun**

In `getPlayerStat()`, the Juggernaut's fireRatePct debuff should not apply when the stat is being calculated for minigun. This requires checking `activeWeaponId` inside getPlayerStat — add special case:

```js
// After operator debuff application:
if (activeOperatorId === 'juggernaut' && stat === 'fireRatePct' && activeWeaponId === 'minigun') {
  // Remove the juggernaut fire rate penalty for minigun
  pct -= (OPERATORS.juggernaut.debuffs.fireRatePct || 0);
}
```

Actually simpler: in the operator debuff section, skip fireRatePct for juggernaut+minigun.

- [ ] **Step 3: Update README**

Add operators to features list.

- [ ] **Step 4: Commit**

```bash
git add public/index.html README.md
git commit -m "Integration: operator profile loading, Juggernaut minigun exception, README update"
```

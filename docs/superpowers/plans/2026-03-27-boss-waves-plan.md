# Boss Waves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add boss waves every 5th wave with 3 boss types (Brute, Necromancer, Abomination), scaling boss count, unique abilities, and generous rewards.

**Architecture:** Everything lives in `public/index.html` (single-file game). Boss zombies use the existing `zombies[]` array with `isBoss: true` flag and `bossType` property. Boss abilities run in `updateZombies()` or a new `updateBossAbilities()` called from the game loop. Screenshake is a new global system. Boss drawing extends `drawZombie()`.

**Tech Stack:** Vanilla JS, Canvas 2D, existing Express/SQLite backend (no backend changes needed)

---

### Task 1: Screenshake System + Boss Config Constants

**Files:**
- Modify: `public/index.html` — add globals near line ~1683 (timeScale area), add shake logic in game loop near line ~5026

- [ ] **Step 1: Add screenshake globals and boss config constants**

After line 1688 (`let miniSlowmoTimer = 0;`), add:

```js
// screenshake
let shakeTimer = 0;
let shakeMagnitude = 0;

// boss config
const BOSS_CONFIGS = {
  brute: {
    hp: (w) => 80 + w * 8,
    speed: 0.6,
    radius: ZOMBIE_R * 3,
    xp: 200,
    chargeCooldown: 480, // 8s
    chargeDuration: 90,  // 1.5s
    chargeSpeed: 3.0,
    chargeDmg: 15,
    chargeAoe: 60,
    stompCooldown: 300, // 5s
    stompRadius: 100,
    stompSlowDuration: 120, // 2s
  },
  necromancer: {
    hp: (w) => 50 + w * 5,
    speed: 0.8,
    radius: ZOMBIE_R * 2,
    xp: 200,
    summonCooldown: 360, // 6s
    summonCount: [3, 4],
    maxMinions: 8,
    blinkCooldown: 480, // 8s
    blinkMinDist: 100,
    blinkMaxDist: 300,
    shieldReduction: 0.5,
  },
  abomination: {
    hp: (w) => 100 + w * 10,
    speed: 0.4,
    radius: ZOMBIE_R * 3.5,
    xp: 200,
    toxicCooldown: 360, // 6s
    toxicRadius: 50,
    toxicDuration: 300, // 5s
    toxicDps: 3,
    maxPools: 3,
    splitCount: 3,
    splitHpPct: 0.2,
    splitSpeed: 1.5,
    splitRadius: ZOMBIE_R * 1.5,
  },
};

const BOSS_REWARDS = {
  early:  { gold: 2000, diamonds: 5, xp: 200 },   // wave 5-10
  mid:    { gold: 5000, diamonds: 15, xp: 500 },   // wave 15-20
  late:   { gold: 10000, diamonds: 30, xp: 1000 },  // wave 25+
};

let toxicPools = [];
let bossSlowTimer = 0; // player slow from Brute stomp
```

- [ ] **Step 2: Add screenshake trigger function and apply in draw**

After the globals, add the trigger function:

```js
function triggerScreenshake(magnitude, durationFrames) {
  shakeMagnitude = magnitude;
  shakeTimer = durationFrames;
}
```

In the game loop, right before `ctx.clearRect(0, 0, W, H);` (line ~5027), add shake application:

```js
  // screenshake
  if (shakeTimer > 0) {
    shakeTimer--;
    const sx = (Math.random() - 0.5) * 2 * shakeMagnitude;
    const sy = (Math.random() - 0.5) * 2 * shakeMagnitude;
    ctx.save();
    ctx.translate(sx, sy);
  }
```

And right after `drawOperatorHUD();` (line ~5111), before `requestAnimationFrame(loop);`, add:

```js
  if (shakeTimer >= 0) ctx.restore();
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "add screenshake system and boss config constants"
```

---

### Task 2: Boss Wave Detection + Spawning

**Files:**
- Modify: `public/index.html` — modify `startNextWave()` at line ~1790, add `getBossCount()`, `pickBossTypes()`, `spawnBoss()`

- [ ] **Step 1: Add boss wave helper functions**

Before `startNextWave()` (line ~1790), add:

```js
function isBossWave(w) {
  return w > 0 && w % 5 === 0;
}

function getBossCount(w) {
  if (w <= 10) return 1;
  if (w <= 20) return 2;
  return 3;
}

function getBossRewardTier(w) {
  if (w <= 10) return BOSS_REWARDS.early;
  if (w <= 20) return BOSS_REWARDS.mid;
  return BOSS_REWARDS.late;
}

function pickBossTypes(count) {
  const types = ['brute', 'necromancer', 'abomination'];
  // shuffle
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types.slice(0, count);
}

function spawnBoss(bossType) {
  let edge, attempts = 0;
  do {
    edge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
    attempts++;
  } while (wallCollide(edge.x, edge.y, BOSS_CONFIGS[bossType].radius * 1.2) && attempts < 30);
  if (attempts >= 30) {
    edge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
  }

  const cfg = BOSS_CONFIGS[bossType];
  const hp = cfg.hp(wave);
  const baseSpd = 0.7 + wave * 0.12;

  zombies.push({
    x: edge.x, y: edge.y,
    prevX: edge.x, prevY: edge.y,
    stuckFrames: 0,
    type: 'tank', // base type for movement/collision
    isBoss: true,
    bossType: bossType,
    hp, maxHp: hp,
    speed: Math.min(baseSpd * cfg.speed, 2.5),
    radius: cfg.radius,
    xp: cfg.xp,
    angle: 0,
    wobble: Math.random() * Math.PI * 2,
    frame: 0,
    alive: true,
    deathTimer: 0,
    avoidDir: 0,
    shootCooldown: 0,
    throwAnim: 0,
    burnTimer: 0, burnDps: 0,
    cryoTimer: 0,
    // boss-specific state
    chargeCooldown: cfg.chargeCooldown || 0,
    chargeTimer: 0,
    charging: false,
    chargeDx: 0, chargeDy: 0,
    stompCooldown: cfg.stompCooldown || 0,
    summonCooldown: cfg.summonCooldown || 0,
    blinkCooldown: cfg.blinkCooldown || 0,
    toxicCooldown: cfg.toxicCooldown || 0,
    minions: [],
    hasSplit: false,
  });
}
```

- [ ] **Step 2: Modify startNextWave() for boss waves**

Replace the current `startNextWave()` function (lines ~1790-1815) with:

```js
function startNextWave() {
  playSound('wave_start');
  wave++;
  runStats.maxWave = wave;
  waveKills = 0;
  waveActive = true;
  toxicPools = [];

  const boss = isBossWave(wave);
  let addCount;

  if (boss) {
    const bossCount = getBossCount(wave);
    const types = pickBossTypes(bossCount);
    for (const t of types) spawnBoss(t);

    // adds: reduced count
    const addMult = wave <= 10 ? 0.5 : wave <= 20 ? 0.75 : 1.0;
    addCount = Math.floor((4 + wave * 3) * addMult);
    waveTotal = bossCount + addCount;
  } else {
    addCount = 4 + wave * 3;
    waveTotal = addCount;
  }

  // spawn adds over time
  let spawned = 0;
  const spawnInterval = setInterval(() => {
    if (spawned >= addCount) { clearInterval(spawnInterval); return; }
    spawnZombie();
    spawned++;
  }, Math.max(200, 800 - wave * 40));
  if (addCount > 0) { spawnZombie(); spawned++; }

  // banner
  if (boss) {
    showWaveBanner('BOSS WAVE ' + wave);
  } else if (wave === 5) {
    showWaveBanner('WAVE 5 — GOLD BOOST AKTIV!');
  } else if (wave >= 5) {
    const mult = 1 + (wave - 5) * 0.5;
    showWaveBanner(`WAVE ${wave} — GOLD x${mult.toFixed(1)}`);
  } else {
    showWaveBanner(`WAVE ${wave}`);
  }
  updateHUD();
}
```

- [ ] **Step 3: Add toxicPools reset in game reset**

In the game reset section (near line ~1758 where `timeScale = 1; frozenBullets = [];` etc.), add:

```js
toxicPools = []; bossSlowTimer = 0;
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "add boss wave spawning with scaling boss count"
```

---

### Task 3: Boss Abilities — Brute (Charge + Stomp)

**Files:**
- Modify: `public/index.html` — add `updateBossAbilities()` function, integrate into game loop

- [ ] **Step 1: Add updateBossAbilities() with Brute logic**

After `updateZombies()` (line ~3268), add:

```js
function updateBossAbilities() {
  for (const z of zombies) {
    if (!z.alive || !z.isBoss) continue;

    if (z.bossType === 'brute') {
      const cfg = BOSS_CONFIGS.brute;
      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // charge
      if (z.charging) {
        z.chargeTimer--;
        z.x += z.chargeDx * cfg.chargeSpeed * 2;
        z.y += z.chargeDy * cfg.chargeSpeed * 2;
        // particles trail
        if (z.frame % 3 === 0) {
          particles.push({ x: z.x, y: z.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3, life: 15, maxLife: 15, color: '#cc2200', r: 4 });
        }
        // hit player during charge
        const cdx = player.x - z.x, cdy = player.y - z.y;
        const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
        if (cdist < cfg.chargeAoe) {
          damagePlayer(cfg.chargeDmg, 'boss_charge');
          triggerScreenshake(8, 18); // 300ms
          z.charging = false;
          z.chargeCooldown = cfg.chargeCooldown;
        }
        if (z.chargeTimer <= 0 || wallCollide(z.x, z.y, z.radius * 0.6)) {
          z.charging = false;
          z.chargeCooldown = cfg.chargeCooldown;
          triggerScreenshake(5, 12);
        }
      } else {
        z.chargeCooldown--;
        if (z.chargeCooldown <= 0 && dist > 80 && dist < 400) {
          z.charging = true;
          z.chargeTimer = cfg.chargeDuration;
          const len = dist || 1;
          z.chargeDx = dx / len;
          z.chargeDy = dy / len;
        }
      }

      // stomp
      z.stompCooldown--;
      if (z.stompCooldown <= 0 && dist < cfg.stompRadius) {
        z.stompCooldown = cfg.stompCooldown;
        bossSlowTimer = cfg.stompSlowDuration;
        triggerScreenshake(5, 12);
        // visual: ground crack particles
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          particles.push({
            x: z.x, y: z.y,
            dx: Math.cos(a) * 3, dy: Math.sin(a) * 3,
            life: 20, maxLife: 20, color: '#553322', r: 3,
          });
        }
        floatingTexts.push({ x: z.x, y: z.y - 20, text: 'STOMP!', life: 40, maxLife: 40, color: '#cc4422' });
      }
    }
  }

  // boss stomp slow effect on player
  if (bossSlowTimer > 0) bossSlowTimer--;
}
```

- [ ] **Step 2: Apply stomp slow to player movement**

In the player movement section (near line ~2879 `let speed = getPlayerStat('moveSpeed');`), after the minigun slow block and the Time Traveler speed boost, add:

```js
  // Boss stomp slow
  if (bossSlowTimer > 0) {
    speed *= 0.5;
  }
```

- [ ] **Step 3: Call updateBossAbilities() in game loop**

In the game loop, after `updateZombies();` (somewhere around line ~4958), add:

```js
  updateBossAbilities();
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "add Brute boss abilities: charge and stomp"
```

---

### Task 4: Boss Abilities — Necromancer (Summon + Blink + Shield)

**Files:**
- Modify: `public/index.html` — extend `updateBossAbilities()` with necromancer logic

- [ ] **Step 1: Add Necromancer logic in updateBossAbilities()**

Inside the `for (const z of zombies)` loop in `updateBossAbilities()`, after the brute block, add:

```js
    if (z.bossType === 'necromancer') {
      const cfg = BOSS_CONFIGS.necromancer;

      // clean dead minions from tracking
      z.minions = z.minions.filter(m => m.alive);

      // shield: 50% damage reduction while minions live
      z.shielded = z.minions.length > 0;

      // summon
      z.summonCooldown--;
      if (z.summonCooldown <= 0 && z.minions.length < cfg.maxMinions) {
        z.summonCooldown = cfg.summonCooldown;
        const count = cfg.summonCount[0] + Math.floor(Math.random() * (cfg.summonCount[1] - cfg.summonCount[0] + 1));
        for (let i = 0; i < count && z.minions.length < cfg.maxMinions; i++) {
          const angle = (i / count) * Math.PI * 2;
          const sx = z.x + Math.cos(angle) * 40;
          const sy = z.y + Math.sin(angle) * 40;
          const minionHp = 1 + Math.floor(wave / 5);
          const minion = {
            x: sx, y: sy, prevX: sx, prevY: sy, stuckFrames: 0,
            type: 'normal',
            isMinion: true,
            hp: minionHp, maxHp: minionHp,
            speed: Math.min(1.0 + wave * 0.08, 2.5),
            radius: ZOMBIE_R * 0.7,
            xp: 5,
            angle: 0, wobble: Math.random() * Math.PI * 2,
            frame: 0, alive: true, deathTimer: 0,
            avoidDir: 0, shootCooldown: 0, throwAnim: 0,
            burnTimer: 0, burnDps: 0, cryoTimer: 0,
          };
          zombies.push(minion);
          z.minions.push(minion);
          // summon particles
          for (let p = 0; p < 5; p++) {
            particles.push({ x: sx, y: sy, dx: (Math.random()-0.5)*4, dy: (Math.random()-0.5)*4, life: 15, maxLife: 15, color: '#8833cc', r: 3 });
          }
        }
        floatingTexts.push({ x: z.x, y: z.y - 20, text: 'SUMMON!', life: 40, maxLife: 40, color: '#9944dd' });
        waveTotal += count;
      }

      // blink
      z.blinkCooldown--;
      if (z.blinkCooldown <= 0) {
        z.blinkCooldown = cfg.blinkCooldown;
        // find random position
        const angle = Math.random() * Math.PI * 2;
        const dist = cfg.blinkMinDist + Math.random() * (cfg.blinkMaxDist - cfg.blinkMinDist);
        let nx = z.x + Math.cos(angle) * dist;
        let ny = z.y + Math.sin(angle) * dist;
        // clamp to map bounds
        nx = Math.max(TILE * 2, Math.min(nx, (COLS - 2) * TILE));
        ny = Math.max(TILE * 2, Math.min(ny, (ROWS - 2) * TILE));
        // avoid walls
        if (wallCollide(nx, ny, z.radius)) {
          const free = nearestFreeTileCenter(nx, ny);
          nx = free.x; ny = free.y;
        }
        // shadow trail at old pos
        for (let p = 0; p < 8; p++) {
          particles.push({ x: z.x, y: z.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3, life: 25, maxLife: 25, color: '#6622aa', r: 4 });
        }
        z.x = nx; z.y = ny;
        // arrival particles
        for (let p = 0; p < 6; p++) {
          particles.push({ x: nx, y: ny, dx: (Math.random()-0.5)*4, dy: (Math.random()-0.5)*4, life: 20, maxLife: 20, color: '#44ff88', r: 3 });
        }
      }
    }
```

- [ ] **Step 2: Apply Necromancer shield damage reduction**

In the bullet-hit damage section, find where zombie HP is reduced. This happens in multiple places. The simplest approach: modify `onZombieKill` is wrong — we need to intercept damage. Find the hitscan damage block (near line ~2656 in the `toHit` loop) and projectile damage.

The cleanest approach: add a helper function after `updateBossAbilities()`:

```js
function applyBossDamage(z, dmg) {
  if (z.isBoss && z.bossType === 'necromancer' && z.shielded) {
    return dmg * BOSS_CONFIGS.necromancer.shieldReduction;
  }
  return dmg;
}
```

Then in each place where `z.hp -= dmg` happens for zombies, wrap with `applyBossDamage(z, dmg)`. The key locations are:

1. Hitscan damage (line ~2658 area): change `z.hp -= totalDmg;` to `z.hp -= applyBossDamage(z, totalDmg);`
2. Projectile bullet damage (search for bullet-zombie collision in `updateBullets()`): change `z.hp -= dmg;` to `z.hp -= applyBossDamage(z, dmg);`
3. Burn DOT (line ~3034): change `z.hp -= z.burnDps / 60;` to `z.hp -= applyBossDamage(z, z.burnDps / 60);`

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "add Necromancer boss abilities: summon, blink, shield"
```

---

### Task 5: Boss Abilities — Abomination (Toxic Pools + Split)

**Files:**
- Modify: `public/index.html` — extend `updateBossAbilities()`, add toxic pool update/draw, add split on death

- [ ] **Step 1: Add Abomination logic in updateBossAbilities()**

Inside the boss loop in `updateBossAbilities()`, after the necromancer block, add:

```js
    if (z.bossType === 'abomination') {
      const cfg = BOSS_CONFIGS.abomination;

      // toxic pool spit
      z.toxicCooldown--;
      if (z.toxicCooldown <= 0 && toxicPools.length < cfg.maxPools) {
        z.toxicCooldown = cfg.toxicCooldown;
        // spit toward player
        const dx = player.x - z.x, dy = player.y - z.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const poolDist = Math.min(dist * 0.8, 200);
        const px = z.x + (dx / dist) * poolDist;
        const py = z.y + (dy / dist) * poolDist;
        toxicPools.push({
          x: px, y: py,
          radius: cfg.toxicRadius,
          dps: cfg.toxicDps,
          life: cfg.toxicDuration,
          maxLife: cfg.toxicDuration,
        });
        floatingTexts.push({ x: z.x, y: z.y - 20, text: 'TOXIC!', life: 40, maxLife: 40, color: '#66cc33' });
        // spit projectile particles
        for (let i = 0; i < 6; i++) {
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
          particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*5, dy: Math.sin(a)*5, life: 20, maxLife: 20, color: '#66cc33', r: 3 });
        }
      }
    }
```

- [ ] **Step 2: Add toxic pool update and player damage**

After `updateBossAbilities()`, add:

```js
function updateToxicPools() {
  for (let i = toxicPools.length - 1; i >= 0; i--) {
    const p = toxicPools[i];
    p.life--;
    if (p.life <= 0) { toxicPools.splice(i, 1); continue; }
    // damage player
    const dx = player.x - p.x, dy = player.y - p.y;
    if (Math.sqrt(dx*dx + dy*dy) < p.radius + PLAYER_R) {
      damagePlayer(p.dps / 60, 'toxic'); // per-frame DPS
    }
  }
}
```

Call `updateToxicPools();` in the game loop, right after `updateBossAbilities();`.

- [ ] **Step 3: Add toxic pool drawing**

After `updateToxicPools()`, add:

```js
function drawToxicPools() {
  for (const p of toxicPools) {
    const alpha = Math.min(p.life / 30, 1) * (0.2 + Math.sin(frameCount * 0.08) * 0.05);
    ctx.save();
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    grd.addColorStop(0, '#66cc33');
    grd.addColorStop(0.6, '#338811');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // bubbles
    if (frameCount % 10 === 0 && p.life > 30) {
      particles.push({
        x: p.x + (Math.random()-0.5) * p.radius,
        y: p.y + (Math.random()-0.5) * p.radius,
        dx: (Math.random()-0.5), dy: -0.5 - Math.random(),
        life: 15, maxLife: 15, color: '#88ee44', r: 2,
      });
    }
    ctx.restore();
  }
}
```

Call `drawToxicPools();` in the draw section, right after `drawHealZones();` (line ~5040).

- [ ] **Step 4: Add Abomination split on death**

In `onZombieKill(z)` (line ~3271), at the very top of the function (after `playSound('kill');`), add:

```js
  // Abomination split
  if (z.isBoss && z.bossType === 'abomination' && !z.hasSplit) {
    const cfg = BOSS_CONFIGS.abomination;
    triggerScreenshake(10, 24); // 400ms
    for (let i = 0; i < cfg.splitCount; i++) {
      const angle = (i / cfg.splitCount) * Math.PI * 2 + Math.random() * 0.5;
      const sx = z.x + Math.cos(angle) * 30;
      const sy = z.y + Math.sin(angle) * 30;
      const splitHp = Math.floor(z.maxHp * cfg.splitHpPct);
      zombies.push({
        x: sx, y: sy, prevX: sx, prevY: sy, stuckFrames: 0,
        type: 'tank',
        isBoss: true, bossType: 'abomination',
        hasSplit: true, // prevent infinite splits
        hp: splitHp, maxHp: splitHp,
        speed: z.speed * cfg.splitSpeed,
        radius: cfg.splitRadius,
        xp: Math.floor(z.xp * 0.25),
        angle: angle, wobble: Math.random() * Math.PI * 2,
        frame: 0, alive: true, deathTimer: 0,
        avoidDir: 0, shootCooldown: 0, throwAnim: 0,
        burnTimer: 0, burnDps: 0, cryoTimer: 0,
        chargeCooldown: 9999, stompCooldown: 9999,
        summonCooldown: 9999, blinkCooldown: 9999,
        toxicCooldown: 9999, // splits don't use abilities
        minions: [],
      });
      // split particles
      for (let p = 0; p < 6; p++) {
        particles.push({ x: sx, y: sy, dx: Math.cos(angle)*4 + (Math.random()-0.5)*2, dy: Math.sin(angle)*4 + (Math.random()-0.5)*2, life: 20, maxLife: 20, color: '#66cc33', r: 4 });
      }
    }
    waveTotal += cfg.splitCount;
    floatingTexts.push({ x: z.x, y: z.y - 30, text: 'SPLIT!', life: 50, maxLife: 50, color: '#88ee44' });
  }
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "add Abomination boss abilities: toxic pools and split on death"
```

---

### Task 6: Boss Rewards + Wave Clear Bonus

**Files:**
- Modify: `public/index.html` — extend `onZombieKill()` for boss rewards, add wave clear bonus check

- [ ] **Step 1: Add boss kill rewards in onZombieKill()**

In `onZombieKill(z)`, replace the existing gold drop section (lines ~3296-3318, from `const goldDef =` through the floating text push) with:

```js
  // Gold/Diamond/XP rewards
  let goldAmount, goldText, goldColor;

  if (z.isBoss && !z.hasSplit) {
    // Boss rewards — direct, no drops
    const tier = getBossRewardTier(wave);
    goldAmount = tier.gold;
    pendingGold += goldAmount;
    pendingDiamonds += tier.diamonds;
    pendingXp += tier.xp; // bonus XP on top of normal xp
    score += tier.xp;
    goldText = '+' + goldAmount + 'G +' + tier.diamonds + 'D';
    goldColor = '#ffdd44';
    floatingTexts.push({ x: z.x, y: z.y - 30, text: '+' + tier.xp + ' BOSS XP', life: 60, maxLife: 60, color: '#33ff88' });
  } else if (z.isBoss && z.hasSplit) {
    // Split rewards — smaller
    goldAmount = Math.floor(getBossRewardTier(wave).gold * 0.1);
    pendingGold += goldAmount;
    goldText = '+' + goldAmount + 'G';
    goldColor = '#ddaa00';
  } else {
    // Normal zombie gold drop with wave multiplier
    const goldDef = { normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4] };
    const gd = goldDef[z.type] || goldDef.normal;
    goldAmount = gd[0] + Math.floor(Math.random() * (gd[1] - gd[0] + 1)) + gd[2] * wave;
    const goldMultiplier = wave >= 5 ? 1 + (wave - 5) * 0.5 : 1;
    goldAmount = Math.round(goldAmount * goldMultiplier);
    const isGoldHaufen = Math.random() < 0.05;
    if (isGoldHaufen) goldAmount *= 3;
    pendingGold += goldAmount;

    // Diamond drop (wave 10+)
    if (wave >= 10) {
      const diaChance = z.type === 'tank' ? 0.02 : z.type === 'spitter' ? 0.01 : 0;
      if (Math.random() < diaChance) {
        pendingDiamonds += 1;
        showWaveBanner('+1 DIAMANT!');
      }
    }

    goldText = '+' + goldAmount + 'G';
    goldColor = '#ddaa00';
    if (isGoldHaufen) { goldText += ' x3!'; goldColor = '#ffdd44'; }
    else if (goldMultiplier > 1) { goldText += ' x' + goldMultiplier.toFixed(1); goldColor = '#eecc22'; }
  }
  floatingTexts.push({ x: z.x, y: z.y - 10, text: goldText, life: 45, maxLife: 45, color: goldColor });
  playSoundThrottled('pickup_gold', 100);
```

- [ ] **Step 2: Add boss wave clear bonus**

In the wave completion check (line ~3335: `if (waveKills >= waveTotal && zombies.filter(...)`), replace with:

```js
  if (waveKills >= waveTotal && zombies.filter(zz => zz.alive).length === 0) {
    // Boss wave clear bonus
    if (isBossWave(wave)) {
      const tier = getBossRewardTier(wave);
      const bossCount = getBossCount(wave);
      const bonusGold = Math.floor(tier.gold * bossCount * 0.5);
      const bonusDia = Math.floor(tier.diamonds * bossCount * 0.5);
      const bonusXp = Math.floor(tier.xp * bossCount * 0.5);
      pendingGold += bonusGold;
      pendingDiamonds += bonusDia;
      pendingXp += bonusXp;
      score += bonusXp;
      floatingTexts.push({ x: player.x, y: player.y - 40, text: 'BOSS WAVE CLEAR! +50% BONUS', life: 90, maxLife: 90, color: '#ffdd00' });
      floatingTexts.push({ x: player.x, y: player.y - 60, text: '+' + bonusGold + 'G +' + bonusDia + 'D +' + bonusXp + 'XP', life: 90, maxLife: 90, color: '#ffaa00' });
    }
    setTimeout(() => startNextWave(), 2000);
  }
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "add boss kill rewards and wave clear bonus"
```

---

### Task 7: Boss Drawing — Visual Appearance + HP Bar

**Files:**
- Modify: `public/index.html` — add boss types to ZOMBIE_TYPES, extend `drawZombie()` for boss rendering

- [ ] **Step 1: Add boss visual types**

In the `ZOMBIE_TYPES` object (line ~4079), add:

```js
  boss_brute:    { body: '#661515', skin: '#772218', arm: '#551111', outline: '#441008', scale: 3.0, eyeColor: '#ff3300', eyeGlow: '#ff2200' },
  boss_necro:    { body: '#3a1866', skin: '#5a2e88', arm: '#4a2277', outline: '#2a1144', scale: 2.0, eyeColor: '#44ff88', eyeGlow: '#33dd66' },
  boss_abom:     { body: '#448822', skin: '#55aa28', arm: '#3a7718', outline: '#336615', scale: 3.5, eyeColor: '#ccff44', eyeGlow: '#aadd22' },
  boss_abom_split: { body: '#448822', skin: '#55aa28', arm: '#3a7718', outline: '#336615', scale: 1.5, eyeColor: '#ccff44', eyeGlow: '#aadd22' },
```

- [ ] **Step 2: Override type lookup for bosses in drawZombie()**

At the top of `drawZombie(z)` (line ~4089), replace:

```js
  const t = ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES.normal;
  const s = t.scale;
```

with:

```js
  let typeKey = z.type;
  if (z.isBoss) {
    if (z.bossType === 'brute') typeKey = 'boss_brute';
    else if (z.bossType === 'necromancer') typeKey = 'boss_necro';
    else if (z.bossType === 'abomination') typeKey = z.hasSplit ? 'boss_abom_split' : 'boss_abom';
  }
  const t = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.normal;
  const s = t.scale;
```

- [ ] **Step 3: Add boss HP bar drawing**

At the end of `drawZombie(z)` — right before the final `ctx.restore();` — add a boss HP bar section. Find the end of drawZombie (it ends before `function drawMinimap()`). Just before the final `ctx.restore();`, but AFTER the existing zombie drawing code, add:

```js
  // Boss HP bar
  if (z.isBoss && z.alive) {
    ctx.restore(); // restore rotation
    ctx.save();
    ctx.translate(z.x, z.y);
    const barW = Math.max(40, z.radius * 2);
    const barH = 4;
    const barY = -z.radius - 14;
    // background
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(-barW/2, barY, barW, barH);
    // fill
    const hpPct = Math.max(0, z.hp / z.maxHp);
    const bossColors = { brute: '#cc2211', necromancer: '#8833cc', abomination: '#55bb33' };
    ctx.fillStyle = bossColors[z.bossType] || '#cc2211';
    ctx.fillRect(-barW/2, barY, barW * hpPct, barH);
    // border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-barW/2, barY, barW, barH);
    // name
    ctx.font = "bold 8px 'Oswald', sans-serif";
    ctx.fillStyle = bossColors[z.bossType] || '#cc2211';
    ctx.textAlign = 'center';
    const bossNames = { brute: 'BRUTE', necromancer: 'NECROMANCER', abomination: 'ABOMINATION' };
    ctx.fillText(bossNames[z.bossType] || 'BOSS', 0, barY - 3);
    // shield indicator for necromancer
    if (z.bossType === 'necromancer' && z.shielded) {
      ctx.globalAlpha = 0.2 + Math.sin(frameCount * 0.05) * 0.1;
      ctx.strokeStyle = '#8833cc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.save(); // re-save for the final restore
  }
```

- [ ] **Step 4: Extend boss death animation**

In the death animation section at the top of drawZombie (lines ~4097-4110), modify for bosses:

```js
  if (!z.alive && z.deathTimer > 0) {
    const maxTimer = z.isBoss ? 60 : 30;
    const prog = 1 - z.deathTimer / maxTimer;
    const fragmentCount = z.isBoss ? 12 : 6;
    for (let f = 0; f < fragmentCount; f++) {
      const a = (f / fragmentCount) * Math.PI * 2 + z.angle;
      const d = prog * (z.isBoss ? 35 : 22) * s;
      ctx.globalAlpha = (1 - prog) * 0.7;
      ctx.fillStyle = f % 2 === 0 ? t.body : t.skin;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, (z.isBoss ? 5 : 3) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
```

Also update `onZombieKill` to set longer death timer for bosses. In onZombieKill, where death is triggered elsewhere (e.g., the burn DOT check at line ~3039: `z.deathTimer = 30`), and everywhere that sets `z.deathTimer = 30` in the zombie kill path — for consistency, change the deathTimer assignment in `onZombieKill` itself. Actually, `deathTimer` is set before `onZombieKill` is called. Find all occurrences of `z.deathTimer = 30` and change them to:

```js
z.deathTimer = z.isBoss ? 60 : 30;
```

There are multiple locations: search for `z.deathTimer = 30` and replace all with `z.deathTimer = z.isBoss ? 60 : 30;`.

- [ ] **Step 5: Add boss flash on death**

At the top of `onZombieKill(z)`, after the split logic, add:

```js
  // Boss death flash
  if (z.isBoss) {
    hurtFlash = 6; // brief white flash reusing hurt flash system
  }
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "add boss visual rendering, HP bars, and death effects"
```

---

### Task 8: Boss Wave Banner + Minimap + Polish

**Files:**
- Modify: `public/index.html` — enhance banner for boss waves, add boss minimap dots, Brute charge visual indicator

- [ ] **Step 1: Enhance showWaveBanner for boss waves**

Replace `showWaveBanner()` (line ~1863) with:

```js
function showWaveBanner(txt, isBoss = false) {
  const el = document.getElementById('wave-banner');
  el.textContent = txt;
  el.style.opacity = 1;
  if (isBoss) {
    el.style.color = '#cc2200';
    el.style.textShadow = '0 0 20px rgba(204,34,0,0.5)';
    setTimeout(() => { el.style.opacity = 0; el.style.color = ''; el.style.textShadow = ''; }, 3000);
  } else {
    el.style.color = '';
    el.style.textShadow = '';
    setTimeout(() => { el.style.opacity = 0; }, 1800);
  }
}
```

Update the boss wave banner call in `startNextWave()` to use:

```js
    showWaveBanner('BOSS WAVE ' + wave, true);
```

- [ ] **Step 2: Add boss dots on minimap**

In `drawMinimap()` (line ~4580), where minimap zombie colors are defined:

```js
  const minimapColors = { normal: '#aa2200', runner: '#cc6600', tank: '#661111', spitter: '#663399' };
```

After the zombie minimap loop, add a separate boss pass:

```js
  // Boss markers (larger)
  for (const z of zombies) {
    if (!z.alive || !z.isBoss) continue;
    const bossMapColors = { brute: '#ff2200', necromancer: '#9944dd', abomination: '#55cc33' };
    ctx.fillStyle = bossMapColors[z.bossType] || '#ff0000';
    const size = z.hasSplit ? 4 : { brute: 6, necromancer: 5, abomination: 7 }[z.bossType] || 5;
    ctx.fillRect(ox + (z.x/TILE)*S - size/2, oy + (z.y/TILE)*S - size/2, size, size);
  }
```

- [ ] **Step 3: Add Brute charging visual trail**

In `drawZombie(z)`, right after the runner motion trail block (line ~4123), add:

```js
  // Brute charge trail
  if (z.isBoss && z.bossType === 'brute' && z.charging) {
    ctx.save();
    for (let tr = 1; tr <= 3; tr++) {
      ctx.globalAlpha = 0.15 / tr;
      ctx.fillStyle = '#cc2200';
      const bx = -Math.cos(z.angle) * 12 * s * tr * 0.3;
      const by = -Math.sin(z.angle) * 12 * s * tr * 0.3;
      ctx.beginPath(); ctx.arc(bx, by, r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
```

- [ ] **Step 4: Add toxic pool indicators on minimap**

After the boss minimap markers, add:

```js
  // Toxic pools on minimap
  ctx.fillStyle = '#44aa22';
  ctx.globalAlpha = 0.4;
  for (const tp of toxicPools) {
    ctx.beginPath();
    ctx.arc(ox + (tp.x/TILE)*S, oy + (tp.y/TILE)*S, (tp.radius/TILE)*S, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.6; // restore for rest of minimap
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "add boss wave banner, minimap markers, and visual polish"
```

---

### Task 9: Final Cleanup + Preview Removal

**Files:**
- Modify: `public/index.html` — ensure Brute charge skips normal movement
- Remove: `public/boss-preview.html`, `boss-preview.html`

- [ ] **Step 1: Skip normal movement for charging Brute**

In `updateZombies()`, at the very start of the movement section (before the spitter distance-keeping at line ~3124), add:

```js
    // Skip normal movement for charging brute
    if (z.isBoss && z.bossType === 'brute' && z.charging) continue;
```

This goes right after the stuck recovery block (after `continue; // skip normal movement this frame`), before the dashAfterimage check.

- [ ] **Step 2: Remove preview files**

```bash
rm public/boss-preview.html boss-preview.html
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "boss wave system: cleanup and finalize"
```

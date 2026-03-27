# New Zombie Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 new zombie types (Exploder, Screamer, Healer, Shielder, Broodmother, Burrower) with progressive spawn waves and unique mechanics.

**Architecture:** All code in `public/index.html`. New types extend existing `ZOMBIE_CONFIGS`, `ZOMBIE_TYPES`, `getSpawnWeights()`. Simple types (Exploder) just need on-death logic. Complex types (Screamer, Healer, Burrower) need a new `updateSpecialZombies()` function. Shielder needs a damage-interception helper `applyShieldDamage()`. Broodmother needs a `broodEggs[]` array.

**Tech Stack:** Vanilla JS, Canvas 2D

---

### Task 1: Config + Spawn Weights + Globals

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add new types to ZOMBIE_CONFIGS**

Find `const ZOMBIE_CONFIGS = {` (line ~1394). Add after the spitter entry:

```js
  exploder:     { hpBase: [3, 4], hpScale: 0.5, speedMult: 1.3, xp: 35, radius: ZOMBIE_R * 1.1 },
  screamer:     { hpBase: [4, 5], hpScale: 1, speedMult: 0.6, xp: 45, radius: ZOMBIE_R * 0.9 },
  healer:       { hpBase: [5, 6], hpScale: 1, speedMult: 0.7, xp: 50, radius: ZOMBIE_R },
  shielder:     { hpBase: [6, 8], hpScale: 1.5, speedMult: 0.8, xp: 55, radius: ZOMBIE_R * 1.2 },
  broodmother:  { hpBase: [10, 12], hpScale: 2, speedMult: 0.5, xp: 60, radius: ZOMBIE_R * 1.4 },
  burrower:     { hpBase: [5, 7], hpScale: 1, speedMult: 1.0, xp: 55, radius: ZOMBIE_R },
```

- [ ] **Step 2: Replace getSpawnWeights()**

Replace the entire `getSpawnWeights` function with:

```js
function getSpawnWeights(wave) {
  if (wave <= 1) return { normal: 1 };
  if (wave <= 2) return { normal: 0.7, runner: 0.3 };
  if (wave <= 4) return { normal: 0.5, runner: 0.25, tank: 0.25 };
  if (wave <= 6) return { normal: 0.4, runner: 0.25, tank: 0.2, spitter: 0.15 };
  if (wave <= 9) return { normal: 0.35, runner: 0.2, tank: 0.15, spitter: 0.12, exploder: 0.18 };
  if (wave <= 11) return { normal: 0.3, runner: 0.18, tank: 0.12, spitter: 0.1, exploder: 0.15, screamer: 0.15 };
  if (wave <= 14) return { normal: 0.28, runner: 0.15, tank: 0.1, spitter: 0.1, exploder: 0.12, screamer: 0.1, healer: 0.15 };
  if (wave <= 17) return { normal: 0.25, runner: 0.13, tank: 0.1, spitter: 0.1, exploder: 0.1, screamer: 0.08, healer: 0.08, shielder: 0.16 };
  if (wave <= 21) return { normal: 0.22, runner: 0.12, tank: 0.1, spitter: 0.08, exploder: 0.1, screamer: 0.07, healer: 0.06, shielder: 0.1, broodmother: 0.15 };
  return { normal: 0.2, runner: 0.1, tank: 0.1, spitter: 0.08, exploder: 0.1, screamer: 0.07, healer: 0.05, shielder: 0.08, broodmother: 0.08, burrower: 0.14 };
}
```

- [ ] **Step 3: Add new globals**

Find the boss globals area (near `let toxicPools = [];` and `let bossSlowTimer = 0;`). Add after them:

```js
let broodEggs = [];
let playerStunTimer = 0;
```

- [ ] **Step 4: Add to game reset**

Find the game reset line that has `toxicPools = []; bossSlowTimer = 0;` and extend it:

```js
toxicPools = []; bossSlowTimer = 0; broodEggs = []; playerStunTimer = 0;
```

- [ ] **Step 5: Add new zombie properties in spawnZombie()**

In `spawnZombie()`, the zombie object is pushed to `zombies[]`. Add new properties. After `cryoTimer: 0,` add:

```js
    screamBuff: 0,
    shieldHp: type === 'shielder' ? 15 : 0,
    shieldMaxHp: type === 'shielder' ? 15 : 0,
    shieldRegenTimer: 0,
    shieldBroken: false,
    burrowCooldown: type === 'burrower' ? 360 : 0,
    burrowed: false,
    burrowTimer: 0,
    eggCooldown: type === 'broodmother' ? 480 : 0,
    eggs: 0,
    screamCooldown: type === 'screamer' ? 300 : 0,
```

Also add healer spawn limit. Right after `const type = pickZombieType(wave);` add:

```js
  // healer spawn limit: max 1 alive at a time
  if (type === 'healer' && zombies.some(z => z.alive && z.type === 'healer')) {
    // re-roll to normal
    return spawnZombie(); // recursive retry (picks new random type)
  }
```

Wait — that could infinite-loop if healer weight is very high. Better approach: just change the type.

```js
  let type = pickZombieType(wave);
  if (type === 'healer' && zombies.some(z => z.alive && z.type === 'healer')) {
    type = 'normal';
  }
```

This means changing `const type` to `let type`.

- [ ] **Step 6: Add distance-keeping for screamer and healer**

Find the spitter distance-keeping block in `updateZombies()`:
```js
    if (z.type === 'spitter' && dist > 1) {
```

Change it to also apply to screamer and healer:
```js
    if ((z.type === 'spitter' || z.type === 'screamer' || z.type === 'healer') && dist > 1) {
```

The spitter keeps distance at 150px. This is fine for screamer/healer too.

- [ ] **Step 7: Fix kill stats for new types**

The current code does `runStats[z.type + 'Kills']++` which would create undefined properties for new types. Change:

```js
  if (z.isBoss) runStats.bossKills++;
  else runStats[z.type + 'Kills']++;
```

to:

```js
  if (z.isBoss) runStats.bossKills++;
  else if (runStats[z.type + 'Kills'] !== undefined) runStats[z.type + 'Kills']++;
```

- [ ] **Step 8: Add gold drops for new types**

Find the `goldDef` object in `onZombieKill()`:
```js
    const goldDef = { normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4] };
```

Replace with:
```js
    const goldDef = { normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4], exploder: [12,18,3], screamer: [18,28,4], healer: [20,30,5], shielder: [22,35,5], broodmother: [30,45,6], burrower: [18,28,4] };
```

- [ ] **Step 9: Add minimap colors**

Find `const minimapColors = {` in `drawMinimap()` and replace with:
```js
  const minimapColors = { normal: '#aa2200', runner: '#cc6600', tank: '#661111', spitter: '#663399', exploder: '#cc4400', screamer: '#cccccc', healer: '#44dd44', shielder: '#4466aa', broodmother: '#664455', burrower: '#887744' };
```

- [ ] **Step 10: Commit**

```bash
git add public/index.html
git commit -m "add configs, spawn weights, and globals for 6 new zombie types"
```

---

### Task 2: Visual Types + Drawing

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add ZOMBIE_TYPES entries**

Find `const ZOMBIE_TYPES = {` and add after the `spitter` entry (before the `boss_brute` entry):

```js
  exploder:    { body: '#cc4400', skin: '#ff6622', arm: '#aa3300', outline: '#883300', scale: 1.1, eyeColor: '#ffaa00', eyeGlow: '#ff8800' },
  screamer:    { body: '#cccccc', skin: '#eeeeee', arm: '#aaaaaa', outline: '#999999', scale: 0.9, eyeColor: '#ff2200', eyeGlow: '#dd0000' },
  healer:      { body: '#22aa44', skin: '#44dd66', arm: '#33bb55', outline: '#229944', scale: 1.0, eyeColor: '#aaffaa', eyeGlow: '#88ff88' },
  shielder:    { body: '#334466', skin: '#445577', arm: '#2a3a55', outline: '#556688', scale: 1.2, eyeColor: '#88aadd', eyeGlow: '#6688bb' },
  broodmother: { body: '#553344', skin: '#664455', arm: '#442233', outline: '#775566', scale: 1.4, eyeColor: '#ffaa66', eyeGlow: '#dd8844' },
  burrower:    { body: '#665533', skin: '#887744', arm: '#554422', outline: '#776644', scale: 1.0, eyeColor: '#ddaa55', eyeGlow: '#cc9944' },
```

- [ ] **Step 2: Add visual effects for special types in drawZombie()**

In `drawZombie(z)`, after the spitter toxic drip block (which starts with `if (z.type === 'spitter' && z.frame % 5 === 0)`), add visual effects for new types:

```js
  // Exploder: pulsing glow — faster as HP decreases
  if (z.type === 'exploder') {
    const hpPct = z.hp / z.maxHp;
    const pulseSpeed = 0.05 + (1 - hpPct) * 0.15;
    const pulseAlpha = 0.1 + Math.sin(z.frame * pulseSpeed) * 0.08;
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
    grd.addColorStop(0, '#ff6600');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Healer: heal aura
  if (z.type === 'healer') {
    ctx.save();
    ctx.globalAlpha = 0.08 + Math.sin(z.frame * 0.04) * 0.04;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 80 / s);
    grd.addColorStop(0, '#44ff44');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 80 / s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Burrower: underground particles when burrowed
  if (z.type === 'burrower' && z.burrowed) {
    if (z.frame % 4 === 0) {
      particles.push({ x: z.x + (Math.random()-0.5)*12, y: z.y + (Math.random()-0.5)*12, dx: (Math.random()-0.5)*2, dy: -1 - Math.random(), life: 12, maxLife: 12, color: '#886644', r: 2 });
    }
    ctx.restore();
    return; // don't draw the zombie body while burrowed
  }
```

- [ ] **Step 3: Add shielder shield drawing**

In `drawZombie(z)`, right before the boss HP bar section (search for `// Boss HP bar`), add:

```js
  // Shielder front shield
  if (z.type === 'shielder' && !z.shieldBroken && z.alive) {
    ctx.save();
    const shieldAlpha = 0.3 + (z.shieldHp / z.shieldMaxHp) * 0.4;
    ctx.globalAlpha = shieldAlpha;
    ctx.strokeStyle = '#6688aa';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(r * 0.7, 0, r * 0.9, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();
    ctx.fillStyle = 'rgba(100,136,170,0.15)';
    ctx.fill();
    ctx.restore();
  }
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "add visual types and drawing for 6 new zombie types"
```

---

### Task 3: Exploder — Death Explosion

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add exploder death logic in onZombieKill()**

Find `onZombieKill(z)`. After the Abomination split block and the boss death flash block, add:

```js
  // Exploder explosion
  if (z.type === 'exploder') {
    const explodeRadius = 40;
    const explodeDmg = 12;
    const dx = player.x - z.x, dy = player.y - z.y;
    if (Math.sqrt(dx*dx + dy*dy) < explodeRadius + PLAYER_R) {
      damagePlayer(explodeDmg, 'exploder');
    }
    triggerScreenshake(3, 8);
    // explosion particles
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*4, dy: Math.sin(a)*4, life: 18, maxLife: 18, color: '#ff6600', r: 4 });
    }
    // leave toxic pool
    toxicPools.push({ x: z.x, y: z.y, radius: 30, dps: 2, life: 120, maxLife: 120 });
  }
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "add Exploder death explosion with AoE damage and toxic pool"
```

---

### Task 4: Shielder — Front Shield Damage Reduction

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add applyShieldDamage() function**

Find `applyBossDamage()` and add after it:

```js
function applyShieldDamage(z, dmg, sourceX, sourceY) {
  if (z.type !== 'shielder' || z.shieldBroken || z.shieldHp <= 0) return dmg;
  // check if damage comes from the front (within ±60 degrees of z.angle)
  const angleToSource = Math.atan2(sourceY - z.y, sourceX - z.x);
  let angleDiff = angleToSource - z.angle;
  // normalize to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const fromFront = Math.abs(angleDiff) < Math.PI / 3; // ±60 degrees
  if (fromFront) {
    z.shieldHp -= dmg * 0.2; // shield absorbs but takes wear
    z.shieldRegenTimer = 300; // 5s regen delay
    if (z.shieldHp <= 0) {
      z.shieldHp = 0;
      z.shieldBroken = true;
      floatingTexts.push({ x: z.x, y: z.y - 15, text: 'SHIELD BROKEN', life: 40, maxLife: 40, color: '#6688aa' });
    }
    return dmg * 0.2; // only 20% gets through
  }
  return dmg;
}
```

- [ ] **Step 2: Integrate into damage pipeline**

Find `applyBossDamage()`:
```js
function applyBossDamage(z, dmg) {
  if (z.isBoss && z.bossType === 'necromancer' && z.shielded) {
    return dmg * BOSS_CONFIGS.necromancer.shieldReduction;
  }
  return dmg;
}
```

Change it to also apply shield damage. The problem is `applyBossDamage` doesn't know the damage source position. The cleanest approach: chain shield check AFTER boss check. Modify `applyBossDamage` to accept optional sourceX/sourceY:

```js
function applyBossDamage(z, dmg, sourceX, sourceY) {
  if (z.isBoss && z.bossType === 'necromancer' && z.shielded) {
    dmg = dmg * BOSS_CONFIGS.necromancer.shieldReduction;
  }
  if (sourceX !== undefined && sourceY !== undefined) {
    dmg = applyShieldDamage(z, dmg, sourceX, sourceY);
  }
  return dmg;
}
```

Then update the callers that have position info to pass it:
1. `applyPerkDamageEffects` — uses player position: change `applyBossDamage(z, effectiveDmg)` to `applyBossDamage(z, effectiveDmg, player.x, player.y)`
2. Hollow-point AoE: change `applyBossDamage(oz, effectiveDmg * 0.5)` to `applyBossDamage(oz, effectiveDmg * 0.5, player.x, player.y)`
3. Grenade AoE: change `applyBossDamage(z, b.grenadeDmg)` to `applyBossDamage(z, b.grenadeDmg, b.x, b.y)`
4. Bullet damage in updateBullets: find `applyPerkDamageEffects(z, b.damage || 1, bWpnId)` and note it already flows through applyBossDamage with player.x/y
5. Burn DOT, Juggernaut contact, Heal zone: these have no clear "direction" — leave without sourceX/sourceY (shield won't apply, which is correct — fire/contact bypasses shield)

- [ ] **Step 3: Add shield regen in updateSpecialZombies**

This will be created in Task 5. For now, add shield regen logic inline in `updateZombies()`. Find the burn DOT section at the top of the zombie loop. After `if (z.cryoTimer > 0) z.cryoTimer--;` add:

```js
    // Shielder shield regen
    if (z.type === 'shielder' && !z.shieldBroken && z.shieldHp < z.shieldMaxHp) {
      if (z.shieldRegenTimer > 0) {
        z.shieldRegenTimer--;
      } else {
        z.shieldHp = Math.min(z.shieldHp + 0.05, z.shieldMaxHp); // slow regen
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "add Shielder front shield with directional damage reduction"
```

---

### Task 5: Screamer + Healer + Burrower (updateSpecialZombies)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add updateSpecialZombies() function**

After `updateToxicPools()`, add:

```js
function updateSpecialZombies() {
  for (const z of zombies) {
    if (!z.alive) continue;

    // Screamer buff
    if (z.type === 'screamer') {
      z.screamCooldown--;
      if (z.screamCooldown <= 0) {
        z.screamCooldown = 300; // 5s
        // buff nearby zombies
        for (const oz of zombies) {
          if (!oz.alive || oz === z) continue;
          const dx = oz.x - z.x, dy = oz.y - z.y;
          if (Math.sqrt(dx*dx + dy*dy) < 120) {
            oz.screamBuff = 180; // 3s
          }
        }
        // visual: expanding ring
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          particles.push({ x: z.x + Math.cos(a)*20, y: z.y + Math.sin(a)*20, dx: Math.cos(a)*2, dy: Math.sin(a)*2, life: 20, maxLife: 20, color: '#ffffff', r: 2 });
        }
        floatingTexts.push({ x: z.x, y: z.y - 15, text: 'SCREAM!', life: 30, maxLife: 30, color: '#ffffff' });
      }
    }

    // Healer aura
    if (z.type === 'healer') {
      for (const oz of zombies) {
        if (!oz.alive || oz === z) continue;
        const dx = oz.x - z.x, dy = oz.y - z.y;
        if (Math.sqrt(dx*dx + dy*dy) < 80) {
          oz.hp = Math.min(oz.hp + 2 / 60, oz.maxHp);
        }
      }
      // heal pulse visual every 2s
      if (z.frame % 120 === 0) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          particles.push({ x: z.x + Math.cos(a)*15, y: z.y + Math.sin(a)*15, dx: Math.cos(a)*1.5, dy: Math.sin(a)*1.5, life: 15, maxLife: 15, color: '#44ff44', r: 2 });
        }
      }
    }

    // Burrower
    if (z.type === 'burrower') {
      if (z.burrowed) {
        z.burrowTimer--;
        // move underground toward player
        const dx = player.x - z.x, dy = player.y - z.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1) {
          const spd = z.speed * 1.5;
          z.x += (dx / dist) * spd;
          z.y += (dy / dist) * spd;
        }
        // emerge when close or timer runs out
        if (z.burrowTimer <= 0 || dist < 80) {
          z.burrowed = false;
          z.burrowCooldown = 360; // 6s
          // stun player
          const sdx = player.x - z.x, sdy = player.y - z.y;
          if (Math.sqrt(sdx*sdx + sdy*sdy) < 40) {
            playerStunTimer = 30; // 0.5s
          }
          // emerge particles
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*3, dy: Math.sin(a)*3 - 1, life: 18, maxLife: 18, color: '#886644', r: 3 });
          }
          floatingTexts.push({ x: z.x, y: z.y - 15, text: 'BURROW!', life: 30, maxLife: 30, color: '#887744' });
        }
      } else {
        z.burrowCooldown--;
        if (z.burrowCooldown <= 0) {
          z.burrowed = true;
          z.burrowTimer = 90; // 1.5s
          // burrow-down particles
          for (let i = 0; i < 6; i++) {
            particles.push({ x: z.x + (Math.random()-0.5)*10, y: z.y, dx: (Math.random()-0.5)*2, dy: 1 + Math.random(), life: 15, maxLife: 15, color: '#665533', r: 2 });
          }
        }
      }
    }

    // Decrement scream buff timer on all zombies
    if (z.screamBuff > 0) z.screamBuff--;
  }

  // Player stun timer
  if (playerStunTimer > 0) playerStunTimer--;
}
```

- [ ] **Step 2: Apply scream buff to zombie speed**

In `updateZombies()`, find where `finalSpeed` is calculated:
```js
      const finalSpeed = spd * aggroMult * bulletTimeMult * cryoMult * timeScale;
```

Change to:
```js
      const screamMult = z.screamBuff > 0 ? 1.3 : 1.0;
      const finalSpeed = spd * aggroMult * bulletTimeMult * cryoMult * timeScale * screamMult;
```

- [ ] **Step 3: Apply scream buff to zombie damage**

In `updateZombies()`, find where zombies hit the player:
```js
        damagePlayer(8, 'melee');
```

Change to:
```js
        damagePlayer(z.screamBuff > 0 ? 10 : 8, 'melee');
```

- [ ] **Step 4: Apply player stun to movement**

In the player movement section, find `let speed = getPlayerStat('moveSpeed');`. Right after it, add:

```js
  // Burrower stun
  if (playerStunTimer > 0) {
    speed = 0;
  }
```

- [ ] **Step 5: Skip burrowed zombies from taking damage and normal movement**

In `updateZombies()`, after the charging brute skip:
```js
    if (z.isBoss && z.bossType === 'brute' && z.charging) continue;
```

Add:
```js
    // Skip burrowed zombies
    if (z.burrowed) continue;
```

Also, burrowed zombies should not be hittable. In `applyBossDamage()`, at the very top add:
```js
  if (z.burrowed) return 0;
```

- [ ] **Step 6: Call updateSpecialZombies() in game loop**

In the game loop, after `updateToxicPools();`, add:
```js
  updateSpecialZombies();
```

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "add Screamer buff, Healer aura, and Burrower mechanics"
```

---

### Task 6: Broodmother — Eggs + Death Spawn

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add broodmother egg logic in updateSpecialZombies()**

In `updateSpecialZombies()`, inside the zombie loop, after the burrower block, add:

```js
    // Broodmother egg laying
    if (z.type === 'broodmother') {
      z.eggCooldown--;
      if (z.eggCooldown <= 0 && z.eggs < 3) {
        z.eggCooldown = 480; // 8s
        z.eggs++;
        broodEggs.push({
          x: z.x, y: z.y,
          hatchTimer: 180, // 3s
          hp: 3, maxHp: 3,
          alive: true,
          owner: z,
        });
        floatingTexts.push({ x: z.x, y: z.y - 10, text: 'EGG!', life: 30, maxLife: 30, color: '#aa8866' });
      }
    }
```

- [ ] **Step 2: Add egg update logic**

After `updateSpecialZombies()`, add:

```js
function updateBroodEggs() {
  for (let i = broodEggs.length - 1; i >= 0; i--) {
    const e = broodEggs[i];
    if (!e.alive) { broodEggs.splice(i, 1); continue; }
    e.hatchTimer--;
    if (e.hatchTimer <= 0) {
      // hatch mini-zombie
      const mhp = 1;
      zombies.push({
        x: e.x, y: e.y, prevX: e.x, prevY: e.y, stuckFrames: 0,
        type: 'normal', isMinion: true,
        hp: mhp, maxHp: mhp,
        speed: Math.min(1.8 + wave * 0.05, 3.0),
        radius: ZOMBIE_R * 0.6, xp: 3,
        angle: 0, wobble: Math.random() * Math.PI * 2,
        frame: 0, alive: true, deathTimer: 0,
        avoidDir: 0, shootCooldown: 0, throwAnim: 0,
        burnTimer: 0, burnDps: 0, cryoTimer: 0,
        screamBuff: 0, shieldHp: 0, shieldMaxHp: 0, shieldRegenTimer: 0, shieldBroken: false,
        burrowCooldown: 0, burrowed: false, burrowTimer: 0,
        eggCooldown: 0, eggs: 0, screamCooldown: 0,
      });
      waveTotal++;
      // hatch particles
      for (let p = 0; p < 6; p++) {
        particles.push({ x: e.x, y: e.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3 - 1, life: 15, maxLife: 15, color: '#aa8866', r: 2 });
      }
      if (e.owner && e.owner.alive) e.owner.eggs--;
      e.alive = false;
      broodEggs.splice(i, 1);
      continue;
    }
  }
}
```

- [ ] **Step 3: Add egg drawing**

After `updateBroodEggs()`, add:

```js
function drawBroodEggs() {
  for (const e of broodEggs) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    // egg body
    const pulse = 1 + Math.sin(e.hatchTimer * 0.1) * 0.05;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#aa8866';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#886644';
    ctx.lineWidth = 1;
    ctx.stroke();
    // crack when close to hatching
    if (e.hatchTimer < 60) {
      ctx.strokeStyle = '#553322';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(1, 0); ctx.lineTo(-1, 3); ctx.stroke();
    }
    ctx.restore();
  }
}
```

- [ ] **Step 4: Add broodmother death spawn in onZombieKill()**

In `onZombieKill(z)`, after the exploder block, add:

```js
  // Broodmother death spawn
  if (z.type === 'broodmother') {
    const spawnCount = 4 + Math.floor(Math.random() * 2); // 4-5
    for (let i = 0; i < spawnCount; i++) {
      const angle = (i / spawnCount) * Math.PI * 2;
      const sx = z.x + Math.cos(angle) * 20;
      const sy = z.y + Math.sin(angle) * 20;
      zombies.push({
        x: sx, y: sy, prevX: sx, prevY: sy, stuckFrames: 0,
        type: 'normal', isMinion: true,
        hp: 1, maxHp: 1,
        speed: Math.min(1.8 + wave * 0.05, 3.0),
        radius: ZOMBIE_R * 0.6, xp: 3,
        angle: angle, wobble: Math.random() * Math.PI * 2,
        frame: 0, alive: true, deathTimer: 0,
        avoidDir: 0, shootCooldown: 0, throwAnim: 0,
        burnTimer: 0, burnDps: 0, cryoTimer: 0,
        screamBuff: 0, shieldHp: 0, shieldMaxHp: 0, shieldRegenTimer: 0, shieldBroken: false,
        burrowCooldown: 0, burrowed: false, burrowTimer: 0,
        eggCooldown: 0, eggs: 0, screamCooldown: 0,
      });
      particles.push({ x: sx, y: sy, dx: Math.cos(angle)*2, dy: Math.sin(angle)*2, life: 12, maxLife: 12, color: '#775566', r: 3 });
    }
    waveTotal += spawnCount;
    // destroy remaining eggs
    for (const e of broodEggs) {
      if (e.owner === z) { e.alive = false; }
    }
  }
```

- [ ] **Step 5: Make eggs hittable by bullets**

In `updateBullets()`, find the bullet-zombie collision loop. After the zombie collision loop but before the bullet is removed, add egg collision. Actually, the simplest approach: add egg collision in the same function. Find where bullets are iterated (`for (let i = bullets.length - 1; i >= 0; i--)`) and after the zombie hit logic, add:

```js
    // bullet hits eggs
    for (const e of broodEggs) {
      if (!e.alive) continue;
      const edx = b.x - e.x, edy = b.y - e.y;
      if (Math.sqrt(edx*edx + edy*edy) < 8) {
        e.hp--;
        if (e.hp <= 0) {
          e.alive = false;
          if (e.owner && e.owner.alive) e.owner.eggs--;
          for (let p = 0; p < 4; p++) {
            particles.push({ x: e.x, y: e.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3, life: 10, maxLife: 10, color: '#aa8866', r: 2 });
          }
        }
        break;
      }
    }
```

This should go right before `bullets.splice(i, 1)` or the `continue` when a bullet hits something. Read the actual bullet update code to find the right spot — it may be complex. If bullets are consumed on zombie hit, eggs just need their own check somewhere in the loop for surviving bullets.

- [ ] **Step 6: Wire into game loop**

In the game loop, after `updateSpecialZombies();`:
```js
  updateBroodEggs();
```

In the draw section, after `drawToxicPools();`:
```js
  drawBroodEggs();
```

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "add Broodmother egg laying, hatching, death spawn, and egg destruction"
```

---

### Task 7: Polish — Screamer Ring Visual + Stun Visual + Spitter Behavior Fixes

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add stun visual overlay**

In the game loop draw section, after the time manipulation overlay, add:

```js
  // Stun visual
  if (playerStunTimer > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(200, 180, 100, 0.1)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 20px 'Oswald', sans-serif";
    ctx.fillStyle = '#ddaa44';
    ctx.textAlign = 'center';
    ctx.fillText('STUNNED', W/2, H/2 - 30);
    ctx.restore();
  }
```

- [ ] **Step 2: Fix spitter/screamer/healer shootCooldown**

In `spawnZombie()`, the shootCooldown is set only for spitters:
```js
    shootCooldown: type === 'spitter' ? 150 : 0,
```

Screamer and healer should NOT shoot. This is fine since shootCooldown 0 means they won't shoot (spitter shooting is gated by `z.type === 'spitter'`). No change needed here.

But make sure the spitter shooting block in `updateZombies()` doesn't accidentally match new types. Find:
```js
    if (z.type === 'spitter' && z.alive) {
```
Verify this is still only `'spitter'`. If it is, no change needed.

- [ ] **Step 3: Make burrowed zombies not block other zombies**

In `updateZombies()`, the zombie-zombie separation loop pushes zombies apart. Find:
```js
    for (const z2 of zombies) {
      if (z2 === z || !z2.alive) continue;
```

Add burrowed check:
```js
    for (const z2 of zombies) {
      if (z2 === z || !z2.alive || z.burrowed || z2.burrowed) continue;
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "add stun visual, fix zombie separation for burrowed zombies"
```

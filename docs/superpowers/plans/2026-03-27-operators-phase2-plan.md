# Operators Phase 2: Entity-Based Active Abilities

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 remaining operator active abilities that require spawning in-world entities: Builder blocks, Elektriker turrets, Medic heal zones, and Time Traveler slowmo/frozen bullets.

**Architecture:** Each ability spawns entities into dedicated arrays (builderBlocks[], turrets[], healZones[]). Entities are updated in the game loop, drawn on canvas, and interact with zombies/player. Time Traveler uses a global speed multiplier affecting all game entities.

**Tech Stack:** Vanilla JS, HTML5 Canvas

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/index.html` | Modify | All 4 abilities: entity arrays, spawn logic, update, draw, interaction |

---

### Task 1: Builder — Block Placement

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add builder entity array and state**

In the state section:
```js
let builderBlocks = []; // { x, y, hp, maxHp, placedAt }
```

Reset in `init()`:
```js
builderBlocks = [];
```

- [ ] **Step 2: Implement block placement in activateOperatorAbility()**

For builder, when Q is pressed:
```js
if (activeOperatorId === 'builder') {
  if (builderBlocks.length >= 10) {
    builderBlocks.shift(); // remove oldest
  }
  // Place block at tile under cursor
  const tx = Math.floor(mouseX / TILE);
  const ty = Math.floor(mouseY / TILE);
  // Don't place on existing walls or player position
  if (tx > 0 && tx < COLS-1 && ty > 0 && ty < ROWS-1 && MAP[ty][tx] === 0) {
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor(player.y / TILE);
    if (tx !== ptx || ty !== pty) {
      builderBlocks.push({ x: tx, y: ty, hp: 5, maxHp: 5, placedAt: frameCount });
      // Temporarily set as wall in MAP for pathfinding
      MAP[ty][tx] = 2; // 2 = builder block (treated as wall)
      mapCacheCanvas = null; // force map re-render
      _floorNoise = null;
      playSound('ui_click');
    }
  }
}
```

- [ ] **Step 3: Update builder blocks**

Add `updateBuilderBlocks()`:
```js
function updateBuilderBlocks() {
  for (let i = builderBlocks.length - 1; i >= 0; i--) {
    const b = builderBlocks[i];
    // Self-heal after 10s if damaged
    if (b.hp < b.maxHp && frameCount - b.placedAt > 600) {
      b.hp = Math.min(b.hp + 0.01, b.maxHp); // slow heal
    }
    // Remove if destroyed
    if (b.hp <= 0) {
      MAP[b.y][b.x] = 0;
      mapCacheCanvas = null;
      builderBlocks.splice(i, 1);
    }
  }
}
```

Wire into `loop()` after other updates.

- [ ] **Step 4: Zombie interaction with builder blocks**

In `updateZombies()`, when a zombie can't move (wall sliding fails), check if the wall is a builder block and damage it:

After the movement section, add:
```js
// Zombies attack builder blocks they're adjacent to
if (builderBlocks.length > 0) {
  const ztx = Math.floor(z.x / TILE);
  const zty = Math.floor(z.y / TILE);
  for (const b of builderBlocks) {
    if (Math.abs(b.x - ztx) <= 1 && Math.abs(b.y - zty) <= 1 && MAP[b.y][b.x] === 2) {
      if (z.frame % 40 === 0) { // attack every ~0.67s
        b.hp -= 1;
        b.placedAt = frameCount; // reset heal timer on damage
      }
    }
  }
}
```

- [ ] **Step 5: Draw builder blocks**

```js
function drawBuilderBlocks() {
  for (const b of builderBlocks) {
    const x = b.x * TILE, y = b.y * TILE;
    // Block body
    ctx.fillStyle = '#4a5540';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = '#6a7a55';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    // Cross-hatch pattern
    ctx.strokeStyle = '#3a4530';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + TILE - 4, y + TILE - 4);
    ctx.moveTo(x + TILE - 4, y + 4); ctx.lineTo(x + 4, y + TILE - 4);
    ctx.stroke();
    // HP bar if damaged
    if (b.hp < b.maxHp) {
      const bw = TILE - 8;
      ctx.fillStyle = '#400';
      ctx.fillRect(x + 4, y - 4, bw, 3);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(x + 4, y - 4, bw * (b.hp / b.maxHp), 3);
    }
  }
}
```

Wire into draw section after `drawMap()`.

- [ ] **Step 6: Clean up blocks on death/init**

In `init()` and death handlers, clear builderBlocks and reset any MAP tiles that were set to 2:
```js
for (const b of builderBlocks) { if (MAP[b.y] && MAP[b.y][b.x] === 2) MAP[b.y][b.x] = 0; }
builderBlocks = [];
```

- [ ] **Step 7: Update wallCollide/isWall to treat type 2 as wall**

Check `isWall()` — it currently checks `MAP[ty][tx] === 1`. Change to `MAP[ty][tx] >= 1` so builder blocks (type 2) also count as walls.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "Add Builder operator: placeable wall blocks with HP, zombie attacks, self-heal"
```

---

### Task 2: Elektriker — Turret System

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add turret entity array**

```js
let turrets = []; // { x, y, hp, maxHp, angle, shootCooldown, aggroTimer }
```

Reset in `init()`: `turrets = [];`

- [ ] **Step 2: Turret placement in activateOperatorAbility()**

For electrician:
```js
if (activeOperatorId === 'electrician') {
  if (turrets.length >= 2) {
    // Second activation on existing turrets: activate aggro mode
    turrets.forEach(t => { t.aggroTimer = 300; }); // 5s aggro
    showWaveBanner('TURRET AGGRO!');
    return; // don't use cooldown for aggro toggle
  }
  // Place turret at player position
  turrets.push({
    x: player.x, y: player.y,
    hp: 50, maxHp: 50,
    angle: 0, shootCooldown: 0,
    aggroTimer: 0,
  });
  playSound('ui_click');
}
```

- [ ] **Step 3: Update turrets**

```js
function updateTurrets() {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const t = turrets[i];
    // Self-repair (passive: 2 HP/s)
    if (activeOperatorId === 'electrician' && t.hp < t.maxHp) {
      t.hp = Math.min(t.hp + 2/60, t.maxHp);
    }
    // Find nearest zombie
    let nearest = null, nearestDist = 150; // 150px range
    for (const z of zombies) {
      if (!z.alive) continue;
      const dx = z.x - t.x, dy = z.y - t.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < nearestDist) { nearest = z; nearestDist = d; }
    }
    // Shoot at nearest
    if (nearest && t.shootCooldown <= 0) {
      t.angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
      nearest.hp -= 2/30; // 2 DPS, fires every 2 frames
      t.shootCooldown = 2;
      // Tracer visual
      hitTrails.push({ x1: t.x, y1: t.y, x2: nearest.x, y2: nearest.y, life: 2, maxLife: 2, style: 'minigun' });
      if (nearest.hp <= 0 && nearest.alive) {
        nearest.alive = false; nearest.deathTimer = 30; onZombieKill(nearest);
      }
    }
    if (t.shootCooldown > 0) t.shootCooldown--;
    // Aggro: make zombies target turret
    if (t.aggroTimer > 0) t.aggroTimer--;
    // Zombie damage to turret
    for (const z of zombies) {
      if (!z.alive) continue;
      const dx = z.x - t.x, dy = z.y - t.y;
      if (dx*dx + dy*dy < (z.radius + 15)**2) {
        if (z.frame % 40 === 0) t.hp -= 8;
      }
    }
    // Destroyed
    if (t.hp <= 0) {
      turrets.splice(i, 1);
      playSound('explosion');
    }
  }
}
```

- [ ] **Step 4: Zombie aggro toward turrets**

In `updateZombies()`, BEFORE the flowfield movement, check if any turret has aggroTimer > 0 and zombie is within 200px:
```js
// Turret aggro override
if (turrets.length > 0) {
  for (const t of turrets) {
    if (t.aggroTimer > 0) {
      const tdx = t.x - z.x, tdy = t.y - z.y;
      const tdist = Math.sqrt(tdx*tdx + tdy*tdy);
      if (tdist < 200 && tdist > 15) {
        // Move toward turret instead of player
        const spd = z.speed;
        z.x += (tdx/tdist) * spd;
        z.y += (tdy/tdist) * spd;
        z.angle = Math.atan2(tdy, tdx);
        continue; // skip normal movement
      }
    }
  }
}
```

- [ ] **Step 5: Draw turrets**

```js
function drawTurrets() {
  for (const t of turrets) {
    ctx.save();
    ctx.translate(t.x, t.y);
    // Base
    ctx.fillStyle = '#3a4440';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#5a6a55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Barrel
    ctx.rotate(t.angle);
    ctx.fillStyle = '#2a2e28';
    ctx.fillRect(8, -2, 12, 4);
    ctx.restore();
    // HP bar
    if (t.hp < t.maxHp) {
      ctx.fillStyle = '#400';
      ctx.fillRect(t.x - 12, t.y - 18, 24, 3);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(t.x - 12, t.y - 18, 24 * (t.hp / t.maxHp), 3);
    }
    // Aggro indicator
    if (t.aggroTimer > 0) {
      ctx.strokeStyle = 'rgba(255,100,50,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.x, t.y, 200, 0, Math.PI*2); ctx.stroke();
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "Add Elektriker operator: auto-turrets with aggro mode, self-repair, zombie targeting"
```

---

### Task 3: Medic — Heal Zone

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add heal zone entity**

```js
let healZones = []; // { x, y, radius, duration, dps, placedAt }
```

Reset in `init()`: `healZones = [];`

- [ ] **Step 2: Heal zone placement**

In activateOperatorAbility(), for medic:
```js
if (activeOperatorId === 'medic') {
  healZones.push({
    x: player.x, y: player.y,
    radius: 80, duration: 480, // 8s
    healPerSec: 5,
    dps: 0, // 0 by default, 1 with upgrade (Phase 2 upgrade check)
    placedAt: frameCount,
  });
  playSound('pickup_health');
}
```

- [ ] **Step 3: Update heal zones**

```js
function updateHealZones() {
  for (let i = healZones.length - 1; i >= 0; i--) {
    const hz = healZones[i];
    hz.duration--;
    if (hz.duration <= 0) { healZones.splice(i, 1); continue; }
    // Heal player if inside
    const dx = player.x - hz.x, dy = player.y - hz.y;
    if (Math.sqrt(dx*dx + dy*dy) < hz.radius) {
      player.hp = Math.min(player.hp + hz.healPerSec / 60, getPlayerStat('maxHp'));
      runStats.healed += hz.healPerSec / 60;
    }
    // Damage zombies if upgraded (dps > 0)
    if (hz.dps > 0) {
      for (const z of zombies) {
        if (!z.alive) continue;
        const zx = z.x - hz.x, zy = z.y - hz.y;
        if (zx*zx + zy*zy < hz.radius * hz.radius) {
          z.hp -= hz.dps / 60;
          if (z.hp <= 0 && z.alive) { z.alive = false; z.deathTimer = 30; onZombieKill(z); }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Draw heal zones**

```js
function drawHealZones() {
  for (const hz of healZones) {
    ctx.save();
    const pulse = 0.3 + Math.sin(frameCount * 0.06) * 0.15;
    // Outer ring
    ctx.strokeStyle = 'rgba(50, 200, 100, ' + pulse + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI*2); ctx.stroke();
    // Inner fill
    ctx.fillStyle = 'rgba(50, 200, 100, ' + (pulse * 0.08) + ')';
    ctx.fill();
    // Cross icon in center
    ctx.fillStyle = 'rgba(50, 200, 100, ' + pulse + ')';
    ctx.fillRect(hz.x - 4, hz.y - 1, 8, 2);
    ctx.fillRect(hz.x - 1, hz.y - 4, 2, 8);
    // Timer
    const secs = Math.ceil(hz.duration / 60);
    ctx.font = "9px 'JetBrains Mono'";
    ctx.fillStyle = '#33cc44';
    ctx.textAlign = 'center';
    ctx.fillText(secs + 's', hz.x, hz.y + hz.radius + 12);
    ctx.restore();
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Add Medic operator: placeable heal zone with HP regen and optional zombie damage"
```

---

### Task 4: Time Traveler — Slowmo + Frozen Bullets

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add time manipulation state**

```js
let timeScale = 1; // global speed multiplier (1 = normal, 0.2 = slowmo, 1.5 = speedup)
let frozenBullets = []; // bullets frozen during slowmo
let timeTravelerPhase = 'none'; // 'none', 'slow', 'fast'
let timeTravelerTimer = 0;
let timeTravelerKillCount = 0; // for passive
let miniSlowmoTimer = 0;
```

Reset in `init()`:
```js
timeScale = 1; frozenBullets = []; timeTravelerPhase = 'none'; timeTravelerTimer = 0; timeTravelerKillCount = 0; miniSlowmoTimer = 0;
```

- [ ] **Step 2: Activate Zeitriss**

In activateOperatorAbility(), for time_traveler:
```js
if (activeOperatorId === 'time_traveler') {
  timeTravelerPhase = 'slow';
  timeTravelerTimer = 300; // 5s at 60fps
  timeScale = 0.2;
  frozenBullets = [];
  playSound('perk_activate');
}
```

- [ ] **Step 3: Update time manipulation**

```js
function updateTimeManipulation() {
  // Mini-slowmo passive
  if (miniSlowmoTimer > 0) {
    miniSlowmoTimer--;
    timeScale = 0.5;
    if (miniSlowmoTimer <= 0 && timeTravelerPhase === 'none') timeScale = 1;
  }

  if (timeTravelerPhase === 'slow') {
    timeTravelerTimer--;
    if (timeTravelerTimer <= 0) {
      // Release frozen bullets
      for (const fb of frozenBullets) {
        bullets.push(fb);
      }
      frozenBullets = [];
      // Speed up phase
      timeTravelerPhase = 'fast';
      timeTravelerTimer = 180; // 3s
      timeScale = 1.5;
    }
  } else if (timeTravelerPhase === 'fast') {
    timeTravelerTimer--;
    if (timeTravelerTimer <= 0) {
      timeTravelerPhase = 'none';
      timeScale = 1;
      operatorAbilityActive = false;
    }
  }
}
```

Wire into `loop()`.

- [ ] **Step 4: Freeze bullets during slowmo**

In `tryShoot()`, when timeTravelerPhase === 'slow', instead of pushing to `bullets`, push to `frozenBullets`:

After creating the bullet object, before `bullets.push(...)`:
```js
if (timeTravelerPhase === 'slow') {
  frozenBullets.push(bulletObj);
} else {
  bullets.push(bulletObj);
}
```

This needs to work for both projectile and hitscan weapons. For hitscan: during slowmo, convert to projectile temporarily (so bullets are visible frozen in air).

- [ ] **Step 5: Apply timeScale to game entities**

In `updateZombies()`, multiply zombie speed by timeScale:
```js
const finalSpeed = spd * aggroMult * bulletTimeMult * timeScale;
```

In `updateBullets()`, multiply bullet movement:
```js
b.x += b.dx * timeScale; b.y += b.dy * timeScale;
```

In `updateSpitterProjectiles()`:
```js
p.x += p.dx * timeScale; p.y += p.dy * timeScale;
```

Note: Player movement is NOT affected by timeScale (time traveler moves at normal speed during slowmo).

- [ ] **Step 6: Draw frozen bullets**

```js
function drawFrozenBullets() {
  for (const b of frozenBullets) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#aaddff';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#44aaff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}
```

- [ ] **Step 7: Visual effects for slowmo**

In the draw section of loop(), when timeScale < 1:
```js
// Time manipulation visual
if (timeScale < 1) {
  ctx.save();
  ctx.fillStyle = 'rgba(50, 100, 200, 0.06)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
if (timeScale > 1) {
  ctx.save();
  ctx.fillStyle = 'rgba(200, 100, 50, 0.04)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
```

- [ ] **Step 8: Passive — mini-slowmo every 10 kills**

In `onZombieKill()`:
```js
if (activeOperatorId === 'time_traveler') {
  timeTravelerKillCount++;
  if (timeTravelerKillCount % 10 === 0 && timeTravelerPhase === 'none') {
    miniSlowmoTimer = 60; // 1s
    timeScale = 0.5;
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add public/index.html
git commit -m "Add Time Traveler operator: slowmo, frozen bullets, speed-up phase, mini-slowmo passive"
```

---

### Task 5: Wire All + Polish

- [ ] **Step 1: Wire all new update/draw functions into loop()**

Make sure `updateBuilderBlocks()`, `updateTurrets()`, `updateHealZones()`, `updateTimeManipulation()` are all in the update section of `loop()`.

Make sure `drawBuilderBlocks()`, `drawTurrets()`, `drawHealZones()`, `drawFrozenBullets()` are all in the draw section (after drawMap, before drawPlayer).

- [ ] **Step 2: Clean up all entities on death/init**

In `init()` and death handlers:
```js
for (const b of builderBlocks) { if (MAP[b.y] && MAP[b.y][b.x] === 2) MAP[b.y][b.x] = 0; }
builderBlocks = [];
turrets = [];
healZones = [];
frozenBullets = [];
timeScale = 1;
timeTravelerPhase = 'none';
```

- [ ] **Step 3: Minimap shows turrets and heal zones**

In drawMinimap(), add:
```js
// Turrets on minimap
ctx.fillStyle = '#5a6a55';
for (const t of turrets) {
  ctx.fillRect(ox + (t.x/TILE)*S - 2, oy + (t.y/TILE)*S - 2, 4, 4);
}
// Heal zones on minimap
ctx.strokeStyle = '#33cc44';
for (const hz of healZones) {
  ctx.beginPath(); ctx.arc(ox + (hz.x/TILE)*S, oy + (hz.y/TILE)*S, (hz.radius/TILE)*S, 0, Math.PI*2); ctx.stroke();
}
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "Wire all operator entities into game loop, clean up on death, minimap integration"
```

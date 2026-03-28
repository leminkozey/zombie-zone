// ── SERVER-AUTHORITATIVE GAME LOGIC ────────────────────
// Pure Node.js — no DOM, no Canvas, no browser APIs.
// Runs at 20 ticks/sec. All client speeds * 3.

const TILE = 40;
const COLS = 48;
const ROWS = 27;
const PLAYER_R = 12;
const ZOMBIE_R = 13;
const BULLET_R = 4;
const BULLET_SPD = 9;
const TICK_RATE = 20;
const FRAME_MULT = 3; // 60fps / 20tps

const PICKUP_LIFETIME = 200;   // 600 / 3
const PICKUP_MAX = 3;
const HEALTHPACK_HEAL = 25;
const HEALTHPACK_INTERVAL = [300, 400]; // ~15-20s at 20tps
const AMMOPACK_INTERVAL  = [367, 500]; // ~18-25s at 20tps
const HEALTH_DROP_CHANCE = 0.15;
const AMMO_DROP_CHANCE = 0.10;

const WEAPONS = {
  pistol:         { damage: 1,   range: 55, fireRate: 5,  reloadTicks: 36,  magSize: 12,  spread: 0.06, type: 'Semi',   special: null },
  smg:            { damage: 0.35,range: 45, fireRate: 3,  reloadTicks: 30,  magSize: 35,  spread: 0.12, type: 'Auto',   special: null },
  shotgun:        { damage: 1.5, range: 30, fireRate: 7,  reloadTicks: 44,  magSize: 6,   spread: 0.3,  type: 'Spread', special: 'shotgun' },
  assault_rifle:  { damage: 1.2, range: 65, fireRate: 2,  reloadTicks: 32,  magSize: 30,  spread: 0.04, type: 'Auto',   special: null },
  sniper:         { damage: 4,   range: 90, fireRate: 10, reloadTicks: 50,  magSize: 5,   spread: 0.01, type: 'Single', special: 'pierce' },
  minigun:        { damage: 0.8, range: 55, fireRate: 1,  reloadTicks: 60,  magSize: 100, spread: 0.12, type: 'Auto',   special: 'spinup' },
};

const ZOMBIE_CONFIGS = {
  normal:  { hpBase: [2, 3],  hpScale: 1,   speedMult: 1.0, xp: 10, radius: ZOMBIE_R },
  runner:  { hpBase: [1, 2],  hpScale: 0.5, speedMult: 2.0, xp: 25, radius: Math.round(ZOMBIE_R * 0.85) },
  tank:    { hpBase: [8, 10], hpScale: 2,   speedMult: 0.5, xp: 50, radius: Math.round(ZOMBIE_R * 1.5) },
  spitter: { hpBase: [3, 4],  hpScale: 1,   speedMult: 0.7, xp: 40, radius: ZOMBIE_R },
};

const GOLD_DEF = {
  normal:  [5,  10, 2],
  runner:  [10, 15, 3],
  tank:    [25, 40, 5],
  spitter: [15, 25, 4],
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
  let cum = 0;
  for (const [type, w] of Object.entries(weights)) {
    cum += w;
    if (roll < cum) return type;
  }
  return 'normal';
}

// ── MAP GENERATION ─────────────────────────────────────

function generateMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push((r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? 1 : 0);
    }
    map.push(row);
  }
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);

  function place(c, r) {
    if (r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1) map[r][c] = 1;
  }

  const cx1 = Math.floor(COLS * 0.22);
  const cy1 = Math.floor(ROWS * 0.2);
  place(cx1, cy1); place(cx1 + 1, cy1); place(cx1, cy1 + 1);
  place(COLS - 1 - cx1, cy1); place(COLS - 2 - cx1, cy1); place(COLS - 1 - cx1, cy1 + 1);
  place(cx1, ROWS - 1 - cy1); place(cx1 + 1, ROWS - 1 - cy1); place(cx1, ROWS - 2 - cy1);
  place(COLS - 1 - cx1, ROWS - 1 - cy1); place(COLS - 2 - cx1, ROWS - 1 - cy1); place(COLS - 1 - cx1, ROWS - 2 - cy1);

  const px = Math.floor(COLS * 0.4);
  const py = Math.floor(ROWS * 0.33);
  place(px, py); place(px, py + 1);
  place(COLS - 1 - px, py); place(COLS - 1 - px, py + 1);
  place(px, ROWS - 1 - py); place(px, ROWS - 2 - py);
  place(COLS - 1 - px, ROWS - 1 - py); place(COLS - 1 - px, ROWS - 2 - py);

  return map;
}

// ── GAME ROOM ──────────────────────────────────────────

class GameRoom {
  constructor(code, playerInfos) {
    this.code = code;
    this.tickCount = 0;
    this.map = generateMap();
    this.wave = 0;
    this.waveKills = 0;
    this.waveTotal = 0;
    this.waveActive = false;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this.waveCooldown = 60; // 3s before wave 1

    this.nextId = 1;
    this.players = [];
    this.zombies = [];
    this.bullets = [];
    this.spitterProjectiles = [];
    this.healthpacks = [];
    this.ammopacks = [];
    this.inputs = {};

    this.tickEvents = [];
    this.tickHitTrails = [];

    this.healthpackTimer = this._randRange(HEALTHPACK_INTERVAL);
    this.ammopackTimer = this._randRange(AMMOPACK_INTERVAL);

    this.spawnEdges = this._buildSpawnEdges();

    for (const info of playerInfos) {
      this._addPlayer(info);
    }
  }

  // ── HELPERS ────────────────────────────────────────

  _id() { return this.nextId++; }

  _randRange([min, max]) { return min + Math.floor(Math.random() * (max - min)); }

  _isWall(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return this.map[ty][tx] >= 1;
  }

  _wallCollide(x, y, r) {
    const offsets = [[-r,-r],[r,-r],[-r,r],[r,r],[0,-r],[0,r],[-r,0],[r,0]];
    return offsets.some(([dx,dy]) => this._isWall(x + dx, y + dy));
  }

  _buildSpawnEdges() {
    const edges = [];
    for (let col = 1; col < COLS - 1; col++) {
      if (this.map[1][col] === 0) edges.push({ x: col * TILE + TILE / 2, y: TILE + TILE / 2 });
      if (this.map[ROWS - 2][col] === 0) edges.push({ x: col * TILE + TILE / 2, y: (ROWS - 2) * TILE + TILE / 2 });
    }
    for (let row = 2; row < ROWS - 2; row++) {
      if (this.map[row][1] === 0) edges.push({ x: TILE + TILE / 2, y: row * TILE + TILE / 2 });
      if (this.map[row][COLS - 2] === 0) edges.push({ x: (COLS - 2) * TILE + TILE / 2, y: row * TILE + TILE / 2 });
    }
    return edges;
  }

  _findFreeSpawnTile() {
    const free = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (this.map[r][c] !== 0) continue;
        const tx = c * TILE + TILE / 2;
        const ty = r * TILE + TILE / 2;
        let tooClose = false;
        for (const p of this.players) {
          if (p.dead) continue;
          const dx = tx - p.x, dy = ty - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < TILE * 3) { tooClose = true; break; }
        }
        if (!tooClose) free.push({ x: tx, y: ty });
      }
    }
    return free.length > 0 ? free[Math.floor(Math.random() * free.length)] : null;
  }

  _nearestAlivePlayer(x, y) {
    let best = null, bestDist = Infinity;
    for (const p of this.players) {
      if (p.dead || p.downed) continue;
      const dx = x - p.x, dy = y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }

  _dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── PLAYERS ────────────────────────────────────────

  _addPlayer(info) {
    const wpn = WEAPONS[info.weapon] || WEAPONS.pistol;
    const weaponId = WEAPONS[info.weapon] ? info.weapon : 'pistol';
    const cx = (COLS * TILE) / 2;
    const cy = (ROWS * TILE) / 2;
    const offset = this.players.length * 40 - 60;

    const p = {
      id: info.id,
      name: info.name || 'Player',
      x: cx + offset,
      y: cy,
      angle: 0,
      hp: info.maxHp || 100,
      maxHp: info.maxHp || 100,
      speed: info.speed || 2.8,
      ammo: wpn.magSize,
      maxAmmo: wpn.magSize,
      weaponId,
      recoil: 0,
      shootCooldown: 0,
      reloading: false,
      reloadTimer: 0,
      spinup: 0,
      _lastShoot: false,
      downed: false,
      downedTimer: 0,
      dead: false,
      rescued: false,
      score: 0,
      gold: 0,
      kills: 0,
      dmgCooldown: 0,
    };
    this.players.push(p);
    this.inputs[info.id] = { keys: {}, mouseAngle: 0, shoot: false };
  }

  addInput(playerId, input) {
    if (this.inputs[playerId]) {
      this.inputs[playerId] = input;
    }
  }

  // ── TICK ───────────────────────────────────────────

  tick() {
    this.tickCount++;
    this.tickEvents = [];
    this.tickHitTrails = [];

    this._tickPlayers();
    this._tickWaves();
    this._tickZombies();
    this._tickBullets();
    this._tickSpitterProjectiles();
    this._tickPickups();
  }

  // ── PLAYER TICK ────────────────────────────────────

  _tickPlayers() {
    for (const p of this.players) {
      if (p.dead) continue;
      if (p.downed) {
        p.downedTimer--;
        if (p.downedTimer <= 0) {
          p.dead = true;
          this.tickEvents.push({ type: 'player_dead', id: p.id });
        }
        continue;
      }

      const input = this.inputs[p.id];
      if (!input) continue;

      // Movement (client sends up/down/left/right)
      let mx = 0, my = 0;
      if (input.keys.up) my -= 1;
      if (input.keys.down) my += 1;
      if (input.keys.left) mx -= 1;
      if (input.keys.right) mx += 1;

      if (mx !== 0 || my !== 0) {
        const len = Math.sqrt(mx * mx + my * my);
        mx = (mx / len) * p.speed * FRAME_MULT;
        my = (my / len) * p.speed * FRAME_MULT;

        if (!this._wallCollide(p.x + mx, p.y + my, PLAYER_R)) {
          p.x += mx; p.y += my;
        } else {
          if (!this._wallCollide(p.x + mx, p.y, PLAYER_R)) p.x += mx;
          if (!this._wallCollide(p.x, p.y + my, PLAYER_R)) p.y += my;
        }
      }

      p.angle = input.mouseAngle;
      if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - 1);
      if (p.dmgCooldown > 0) p.dmgCooldown--;

      // Reload
      if (p.reloading) {
        p.reloadTimer--;
        if (p.reloadTimer <= 0) {
          p.reloading = false;
          p.ammo = p.maxAmmo;
          this.tickEvents.push({ type: 'reload_done', id: p.id });
        }
        continue; // can't shoot while reloading
      }

      // Manual reload (client sends keys.reload)
      if (input.keys.reload && !p.reloading && p.ammo < p.maxAmmo) {
        this._startReload(p);
      }

      // Shooting
      if (p.shootCooldown > 0) p.shootCooldown--;

      // Semi/Single weapons: only fire on click, not hold
      const wpn = WEAPONS[p.weaponId];
      const isSemi = wpn && (wpn.type === 'Semi' || wpn.type === 'Single' || wpn.type === 'Spread');
      const shouldShoot = isSemi ? (input.keys.shoot && !p._lastShoot) : input.keys.shoot;
      p._lastShoot = !!input.keys.shoot;

      if (shouldShoot && p.shootCooldown <= 0 && !p.reloading) {
        this._playerShoot(p);
      }
    }
  }

  _playerShoot(p) {
    const wpn = WEAPONS[p.weaponId];
    if (!wpn) return;

    if (p.ammo <= 0) {
      this._startReload(p);
      return;
    }

    p.shootCooldown = wpn.fireRate;

    // Spinup for minigun
    if (wpn.special === 'spinup') {
      p.spinup = Math.min(p.spinup + 1, 20);
      if (p.spinup < 20) {
        const t = p.spinup / 20;
        p.shootCooldown = Math.max(wpn.fireRate, Math.round(wpn.fireRate * (6 - 5 * t * t)));
      }
    }

    p.ammo--;
    p.recoil = 2;
    this.tickEvents.push({ type: 'shoot', id: p.id, weapon: p.weaponId });

    const angle = p.angle;
    const useHitscan = wpn.type === 'Auto' || p.weaponId === 'sniper';

    if (useHitscan) {
      this._fireHitscan(p, wpn, angle);
    } else if (wpn.special === 'shotgun') {
      for (let i = 0; i < 5; i++) {
        const pelletSpread = (i - 2) * 0.12 + (Math.random() - 0.5) * wpn.spread;
        this.bullets.push({
          id: this._id(),
          x: p.x, y: p.y,
          dx: Math.cos(angle + pelletSpread) * BULLET_SPD * FRAME_MULT,
          dy: Math.sin(angle + pelletSpread) * BULLET_SPD * FRAME_MULT,
          life: wpn.range,
          damage: wpn.damage,
          ownerId: p.id,
          pierce: false,
        });
      }
    } else {
      // Pistol / single projectile
      const bulletSpread = (Math.random() - 0.5) * wpn.spread;
      this.bullets.push({
        id: this._id(),
        x: p.x, y: p.y,
        dx: Math.cos(angle + bulletSpread) * BULLET_SPD * FRAME_MULT,
        dy: Math.sin(angle + bulletSpread) * BULLET_SPD * FRAME_MULT,
        life: wpn.range,
        damage: wpn.damage,
        ownerId: p.id,
        pierce: wpn.special === 'pierce',
      });
    }

    if (p.ammo <= 0) {
      this._startReload(p);
    }
  }

  _startReload(p) {
    if (p.reloading) return;
    const wpn = WEAPONS[p.weaponId];
    if (!wpn) return;
    p.reloading = true;
    p.reloadTimer = wpn.reloadTicks;
    p.spinup = 0;
    this.tickEvents.push({ type: 'reload_start', id: p.id });
  }

  _fireHitscan(p, wpn, angle) {
    const spread = (Math.random() - 0.5) * wpn.spread;
    const rayAngle = angle + spread;
    const rayDx = Math.cos(rayAngle);
    const rayDy = Math.sin(rayAngle);
    const maxDist = wpn.range * BULLET_SPD * FRAME_MULT;

    let hitDist = maxDist;
    let hitX = p.x + rayDx * maxDist;
    let hitY = p.y + rayDy * maxDist;

    // Wall check
    for (let d = 0; d < maxDist; d += TILE * 0.5) {
      const wx = p.x + rayDx * d;
      const wy = p.y + rayDy * d;
      if (this._wallCollide(wx, wy, 2)) {
        hitDist = d;
        hitX = wx; hitY = wy;
        break;
      }
    }

    // Zombie intersection
    const isPierce = wpn.special === 'pierce';
    const hitZombies = [];
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const zx = z.x - p.x, zy = z.y - p.y;
      const proj = zx * rayDx + zy * rayDy;
      if (proj < 0 || proj > hitDist) continue;
      const perpX = zx - rayDx * proj;
      const perpY = zy - rayDy * proj;
      const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
      if (perpDist < z.radius + BULLET_R) {
        hitZombies.push({ z, proj });
      }
    }
    hitZombies.sort((a, b) => a.proj - b.proj);

    const maxHits = isPierce ? hitZombies.length : 1;
    const toHit = hitZombies.slice(0, maxHits);
    for (const { z } of toHit) {
      this._damageZombie(z, wpn.damage, p);
    }

    if (hitZombies.length > 0 && !isPierce) {
      hitX = p.x + rayDx * hitZombies[0].proj;
      hitY = p.y + rayDy * hitZombies[0].proj;
    }

    this.tickHitTrails.push({ x1: p.x, y1: p.y, x2: hitX, y2: hitY, weapon: p.weaponId });
  }

  // ── WAVE SYSTEM ────────────────────────────────────

  _tickWaves() {
    if (!this.waveActive) {
      this.waveCooldown--;
      if (this.waveCooldown <= 0) {
        this._startNextWave();
      }
      return;
    }

    // Gradual spawning
    if (this.spawnQueue > 0) {
      this.spawnTimer--;
      if (this.spawnTimer <= 0) {
        this._spawnZombie();
        this.spawnQueue--;
        this.spawnTimer = Math.max(4, 16 - this.wave);
      }
    }

    // Check wave clear
    if (this.waveKills >= this.waveTotal && this.zombies.filter(z => z.alive).length === 0) {
      this.waveActive = false;
      this.waveCooldown = 60; // 3s
      this.tickEvents.push({ type: 'wave_clear', wave: this.wave });
    }
  }

  _startNextWave() {
    this.wave++;
    this.waveKills = 0;
    const count = 4 + this.wave * 3;
    this.waveTotal = count;
    this.spawnQueue = count;
    this.spawnTimer = 0;
    this.waveActive = true;

    // Spawn first zombie immediately
    this._spawnZombie();
    this.spawnQueue--;

    this.tickEvents.push({ type: 'wave_start', wave: this.wave, total: count });
  }

  _spawnZombie() {
    if (this.spawnEdges.length === 0) return;

    let edge, attempts = 0;
    do {
      edge = this.spawnEdges[Math.floor(Math.random() * this.spawnEdges.length)];
      attempts++;
    } while (this._wallCollide(edge.x, edge.y, ZOMBIE_R * 1.5) && attempts < 20);
    if (attempts >= 20) return;

    const type = pickZombieType(this.wave);
    const cfg = ZOMBIE_CONFIGS[type];
    const baseSpd = 0.7 + this.wave * 0.12 + Math.random() * 0.3;
    const baseHp = cfg.hpBase[0] + Math.floor(Math.random() * (cfg.hpBase[1] - cfg.hpBase[0] + 1));
    const hp = baseHp + Math.floor(this.wave / 3) * cfg.hpScale;

    this.zombies.push({
      id: this._id(),
      type,
      x: edge.x, y: edge.y,
      angle: 0,
      hp, maxHp: hp,
      speed: Math.min(baseSpd * cfg.speedMult, 3.5),
      radius: cfg.radius,
      xp: cfg.xp,
      alive: true,
      shootCooldown: type === 'spitter' ? 50 : 0, // 150/3
      lastHitTick: 0,
    });
  }

  // ── ZOMBIE TICK ────────────────────────────────────

  _tickZombies() {
    for (const z of this.zombies) {
      if (!z.alive) continue;

      const target = this._nearestAlivePlayer(z.x, z.y);
      if (!target) continue;

      const dx = target.x - z.x, dy = target.y - z.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Move toward target
      if (dist > 1) {
        this._moveZombie(z, target.x, target.y);
      }

      // Spitter shooting
      if (z.type === 'spitter') {
        z.shootCooldown--;
        if (z.shootCooldown <= 0 && dist < 300) {
          z.shootCooldown = 50; // 150 / 3
          const shootAngle = Math.atan2(target.y - z.y, target.x - z.x);
          this.spitterProjectiles.push({
            id: this._id(),
            x: z.x, y: z.y,
            dx: Math.cos(shootAngle) * 5 * FRAME_MULT,
            dy: Math.sin(shootAngle) * 5 * FRAME_MULT,
            life: 27, // 80 / 3
          });
          this.tickEvents.push({ type: 'spitter_shoot', x: z.x, y: z.y });
        }
      }

      // Melee damage (every ~2s = 40 ticks at 60fps = ~13 ticks at 20tps)
      if (dist < PLAYER_R + z.radius - 2) {
        if (this.tickCount - z.lastHitTick > 13) {
          z.lastHitTick = this.tickCount;
          this._damagePlayer(target, 8);
        }
      }

      // Zombie-zombie separation
      for (const z2 of this.zombies) {
        if (z2 === z || !z2.alive) continue;
        const sdx = z.x - z2.x, sdy = z.y - z2.y;
        const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
        const minDist = z.radius + z2.radius;
        if (sdist < minDist && sdist > 0.1) {
          const push = (minDist - sdist) * 0.3;
          z.x += (sdx / sdist) * push;
          z.y += (sdy / sdist) * push;
        }
      }
    }
  }

  _moveZombie(z, targetX, targetY) {
    const dx = targetX - z.x, dy = targetY - z.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const spd = z.speed * FRAME_MULT;
    const mx = (dx / dist) * spd;
    const my = (dy / dist) * spd;

    if (!this._wallCollide(z.x + mx, z.y + my, z.radius)) {
      z.x += mx; z.y += my;
    } else {
      if (!this._wallCollide(z.x + mx, z.y, z.radius)) z.x += mx;
      if (!this._wallCollide(z.x, z.y + my, z.radius)) z.y += my;
    }
    z.angle = Math.atan2(dy, dx);
  }

  _damageZombie(z, damage, attacker) {
    z.hp -= damage;
    if (z.hp <= 0 && z.alive) {
      z.alive = false;
      this._onZombieKill(z, attacker);
    }
  }

  _onZombieKill(z, killer) {
    this.waveKills++;
    this.tickEvents.push({ type: 'kill', zombieId: z.id, killerId: killer.id, zombieType: z.type, x: z.x, y: z.y });

    // Gold reward
    const gd = GOLD_DEF[z.type] || GOLD_DEF.normal;
    let goldAmount = gd[0] + Math.floor(Math.random() * (gd[1] - gd[0] + 1)) + gd[2] * this.wave;
    const goldMult = this.wave >= 5 ? 1 + (this.wave - 5) * 0.5 : 1;
    goldAmount = Math.round(goldAmount * goldMult);
    const isJackpot = Math.random() < 0.05;
    if (isJackpot) goldAmount *= 3;

    killer.gold += goldAmount;
    killer.score += z.xp;
    killer.kills++;

    this.tickEvents.push({ type: 'gold', playerId: killer.id, amount: goldAmount, jackpot: isJackpot, x: z.x, y: z.y });

    // Drop pickups
    if (Math.random() < HEALTH_DROP_CHANCE && this.healthpacks.length < PICKUP_MAX) {
      this.healthpacks.push({ id: this._id(), x: z.x, y: z.y, life: PICKUP_LIFETIME });
      this.tickEvents.push({ type: 'spawn_health', x: z.x, y: z.y });
    }
    if (Math.random() < AMMO_DROP_CHANCE && this.ammopacks.length < PICKUP_MAX) {
      this.ammopacks.push({ id: this._id(), x: z.x, y: z.y, life: PICKUP_LIFETIME });
      this.tickEvents.push({ type: 'spawn_ammo', x: z.x, y: z.y });
    }
  }

  // ── DAMAGE ─────────────────────────────────────────

  _damagePlayer(p, damage) {
    if (p.dead || p.downed) return;
    if (p.dmgCooldown > 0) return;
    p.dmgCooldown = 5; // ~0.25s immunity

    p.hp -= damage;
    this.tickEvents.push({ type: 'player_hurt', id: p.id, damage, hp: p.hp });

    if (p.hp <= 0) {
      p.downed = true;
      p.downedTimer = 200; // 10s at 20tps
      p.hp = 0;
      this.tickEvents.push({ type: 'player_downed', id: p.id });
    }
  }

  // ── BULLET TICK ────────────────────────────────────

  _tickBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.dx;
      b.y += b.dy;
      b.life--;

      if (b.life <= 0 || this._wallCollide(b.x, b.y, BULLET_R)) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Zombie collision
      let hit = false;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const dx = b.x - z.x, dy = b.y - z.y;
        if (dx * dx + dy * dy < (BULLET_R + z.radius) ** 2) {
          const owner = this.players.find(p => p.id === b.ownerId);
          if (owner) this._damageZombie(z, b.damage, owner);
          if (!b.pierce) { hit = true; break; }
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }
  }

  // ── SPITTER PROJECTILE TICK ────────────────────────

  _tickSpitterProjectiles() {
    for (let i = this.spitterProjectiles.length - 1; i >= 0; i--) {
      const sp = this.spitterProjectiles[i];
      sp.x += sp.dx;
      sp.y += sp.dy;
      sp.life--;

      if (sp.life <= 0 || this._wallCollide(sp.x, sp.y, 3)) {
        this.spitterProjectiles.splice(i, 1);
        continue;
      }

      // Hit player
      for (const p of this.players) {
        if (p.dead || p.downed) continue;
        const dx = sp.x - p.x, dy = sp.y - p.y;
        if (dx * dx + dy * dy < (6 + PLAYER_R) ** 2) {
          this._damagePlayer(p, 10);
          this.spitterProjectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // ── PICKUP TICK ────────────────────────────────────

  _tickPickups() {
    // Timer-based spawning
    this.healthpackTimer--;
    if (this.healthpackTimer <= 0) {
      if (this.healthpacks.length < PICKUP_MAX) {
        const pos = this._findFreeSpawnTile();
        if (pos) {
          this.healthpacks.push({ id: this._id(), x: pos.x, y: pos.y, life: PICKUP_LIFETIME });
          this.tickEvents.push({ type: 'spawn_health', x: pos.x, y: pos.y });
        }
      }
      this.healthpackTimer = this._randRange(HEALTHPACK_INTERVAL);
    }

    this.ammopackTimer--;
    if (this.ammopackTimer <= 0) {
      if (this.ammopacks.length < PICKUP_MAX) {
        const pos = this._findFreeSpawnTile();
        if (pos) {
          this.ammopacks.push({ id: this._id(), x: pos.x, y: pos.y, life: PICKUP_LIFETIME });
          this.tickEvents.push({ type: 'spawn_ammo', x: pos.x, y: pos.y });
        }
      }
      this.ammopackTimer = this._randRange(AMMOPACK_INTERVAL);
    }

    // Update healthpacks
    for (let i = this.healthpacks.length - 1; i >= 0; i--) {
      const h = this.healthpacks[i];
      h.life--;
      if (h.life <= 0) { this.healthpacks.splice(i, 1); continue; }

      for (const p of this.players) {
        if (p.dead || p.downed) continue;
        const dx = h.x - p.x, dy = h.y - p.y;
        if (dx * dx + dy * dy < (PLAYER_R + 10) ** 2) {
          const heal = Math.min(HEALTHPACK_HEAL, p.maxHp - p.hp);
          p.hp += heal;
          this.healthpacks.splice(i, 1);
          this.tickEvents.push({ type: 'pickup_health', id: p.id, heal });
          break;
        }
      }
    }

    // Update ammopacks
    for (let i = this.ammopacks.length - 1; i >= 0; i--) {
      const a = this.ammopacks[i];
      a.life--;
      if (a.life <= 0) { this.ammopacks.splice(i, 1); continue; }

      for (const p of this.players) {
        if (p.dead || p.downed) continue;
        const dx = a.x - p.x, dy = a.y - p.y;
        if (dx * dx + dy * dy < (PLAYER_R + 10) ** 2) {
          p.ammo = p.maxAmmo;
          if (p.reloading) {
            p.reloading = false;
            p.reloadTimer = 0;
          }
          this.ammopacks.splice(i, 1);
          this.tickEvents.push({ type: 'pickup_ammo', id: p.id });
          break;
        }
      }
    }
  }

  // ── STATE ──────────────────────────────────────────

  getMapData() {
    return { cols: COLS, rows: ROWS, tile: TILE, map: this.map };
  }

  getState() {
    return {
      tick: this.tickCount,
      wave: this.wave,
      waveKills: this.waveKills,
      waveTotal: this.waveTotal,
      players: this.players.map(p => ({
        id: p.id, name: p.name,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        angle: Math.round(p.angle * 100) / 100,
        hp: p.hp, maxHp: p.maxHp,
        ammo: p.ammo, maxAmmo: p.maxAmmo,
        weaponId: p.weaponId,
        recoil: p.recoil,
        reloading: p.reloading,
        downed: p.downed, dead: p.dead,
        score: p.score, gold: p.gold, kills: p.kills,
      })),
      zombies: this.zombies.filter(z => z.alive).map(z => ({
        id: z.id, type: z.type,
        x: Math.round(z.x * 10) / 10,
        y: Math.round(z.y * 10) / 10,
        angle: Math.round(z.angle * 100) / 100,
        hp: z.hp, maxHp: z.maxHp,
        radius: z.radius,
      })),
      bullets: this.bullets.map(b => ({
        id: b.id,
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        dx: b.dx, dy: b.dy,
        ownerId: b.ownerId,
      })),
      spitterProjectiles: this.spitterProjectiles.map(sp => ({
        id: sp.id,
        x: Math.round(sp.x * 10) / 10,
        y: Math.round(sp.y * 10) / 10,
      })),
      hitTrails: this.tickHitTrails,
      pickups: {
        health: this.healthpacks.map(h => ({ id: h.id, x: h.x, y: h.y, life: h.life })),
        ammo: this.ammopacks.map(a => ({ id: a.id, x: a.x, y: a.y, life: a.life })),
      },
      events: this.tickEvents,
    };
  }

  isGameOver() {
    return this.players.every(p => p.dead);
  }

  handleRevive(reviverId, targetId) {
    const reviver = this.players.find(p => p.id === reviverId);
    const target = this.players.find(p => p.id === targetId);
    if (!reviver || !target) return;
    if (reviver.dead || reviver.downed) return;
    if (!target.downed || target.dead) return;

    const dx = reviver.x - target.x, dy = reviver.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > PLAYER_R * 4) return; // must be close

    target.downed = false;
    target.downedTimer = 0;
    target.hp = Math.round(target.maxHp * 0.3);
    this.tickEvents.push({ type: 'player_revived', id: target.id, reviverId: reviver.id });
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    delete this.inputs[playerId];
  }

  destroy() {
    this.players = [];
    this.zombies = [];
    this.bullets = [];
    this.spitterProjectiles = [];
    this.healthpacks = [];
    this.ammopacks = [];
    this.inputs = {};
  }
}

module.exports = GameRoom;

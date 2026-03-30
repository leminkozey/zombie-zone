// ── STATE ───────────────────────────────────────────
let runStats = { kills: 0, normalKills: 0, runnerKills: 0, tankKills: 0, spitterKills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, healed: 0, xpEarned: 0, maxWave: 0 };

const DEFAULT_KEYBINDS = {
  moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
  reload: 'KeyR', dash: 'Space', rescue: 'KeyF', pause: 'Escape', perk: 'KeyE',
  operatorAbility: 'KeyQ',
};
let keybinds = JSON.parse(localStorage.getItem('dz_keybinds') || 'null') || { ...DEFAULT_KEYBINDS };
let mouseSensitivity = parseFloat(localStorage.getItem('dz_sensitivity') || '1');

let player, bullets, zombies, particles, bloodDecals;
let spitterProjectiles;
let wave, waveKills, waveTotal, waveActive;
let reloading, reloadStart;
let healthpacks, ammopacks;
let lastHealthpackSpawn, lastAmmopackSpawn;
let nextHealthpackAt, nextAmmopackAt;
let hurtFlash, mouseX, mouseY, running;
let score, frameCount;
let currentLevel;
let keys = {};
let dashCharges = [];
let dashActive = false;
let dashStartX = 0, dashStartY = 0;
let dashTargetX = 0, dashTargetY = 0;
let dashProgress = 0;
let dashAfterimage = null;
let bulletTimeTimer = 0;
let bulletTimeX = 0, bulletTimeY = 0;

let rescueState = 'idle';
let rescueHoldStart = 0;
let rescueSurvivalTimer = 0;
let rescueExpiryTimer = 0;
let rescueExtractProgress = 0;
let rescueCircle = null;
let rescueCooldownUntil = 0;
let rescueRunTime = 0;

let globalXp = 0;        // total XP from server
let pendingXp = 0;       // XP earned this session, not yet synced
let lastXpSync = 0;      // timestamp of last sync
const XP_SYNC_INTERVAL = 10000; // 10 seconds

let globalGold = 0;
let globalDiamonds = 0;
let pendingGold = 0;
let pendingDiamonds = 0;
let lastGoldSync = 0;
const GOLD_SYNC_INTERVAL = 10000;
let floatingTexts = [];
let hitTrails = []; // { x1, y1, x2, y2, life, maxLife } — hitscan visual trails
let minigunSpinup = 0;
let healZones = []; // { x, y, radius, duration, healPerSec, dps, placedAt }
let builderBlocks = []; // { x, y, hp, maxHp, placedAt }
let turrets = []; // { x, y, hp, maxHp, angle, shootCooldown, aggroTimer }
let timeScale = 1; // global speed multiplier (1 = normal, 0.2 = slowmo, 1.5 = speedup)
let frozenBullets = []; // bullets frozen during slowmo
let timeTravelerPhase = 'none'; // 'none', 'slow', 'fast'
let timeTravelerTimer = 0;
let timeTravelerKillCount = 0; // for passive
let miniSlowmoTimer = 0;

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
    chargeCooldown: 480,
    chargeDuration: 90,
    chargeSpeed: 3.0,
    chargeDmg: 15,
    chargeAoe: 60,
    stompCooldown: 300,
    stompRadius: 100,
    stompSlowDuration: 120,
  },
  necromancer: {
    hp: (w) => 50 + w * 5,
    speed: 0.8,
    radius: ZOMBIE_R * 2,
    xp: 200,
    summonCooldown: 360,
    summonCount: [3, 4],
    maxMinions: 8,
    blinkCooldown: 480,
    blinkMinDist: 100,
    blinkMaxDist: 300,
    shieldReduction: 0.5,
  },
  abomination: {
    hp: (w) => 100 + w * 10,
    speed: 0.4,
    radius: ZOMBIE_R * 3.5,
    xp: 200,
    toxicCooldown: 360,
    toxicRadius: 50,
    toxicDuration: 300,
    toxicDps: 3,
    maxPools: 3,
    splitCount: 3,
    splitHpPct: 0.2,
    splitSpeed: 1.5,
    splitRadius: ZOMBIE_R * 1.5,
  },
};

const BOSS_REWARDS = {
  early:  { gold: 2000, diamonds: 5, xp: 200 },
  mid:    { gold: 5000, diamonds: 15, xp: 500 },
  late:   { gold: 10000, diamonds: 30, xp: 1000 },
};

let toxicPools = [];
let bossSlowTimer = 0;
let broodEggs = [];
let playerStunTimer = 0;

function triggerScreenshake(magnitude, durationFrames) {
  shakeMagnitude = magnitude;
  shakeTimer = durationFrames;
}

async function init() {
  camActive = false;
  camX = 0; camY = 0;
  resizeCanvas(); // reset to window size before map gen
  generateMap();
  rebuildSpawnEdges();
  flowfield = null;
  mapCacheCanvas = null;
  lastFlowfieldUpdate = -999; // force immediate flowfield compute on first frame

  const mapW = camActive ? W : COLS * TILE;
  const mapH = camActive ? H : ROWS * TILE;
  if (!camActive) {
    canvas.width = mapW; canvas.height = mapH;
    W = mapW; H = mapH;
  }
  player = {
    x: camActive ? 0 : mapW/2, y: camActive ? 0 : mapH/2,
    hp: getPlayerStat('maxHp'),
    maxHp: getPlayerStat('maxHp'),
    ammo: getWeaponStat(activeWeaponId, 'mag'),
    speed: getPlayerStat('moveSpeed'),
    angle: 0,
    shootCooldown: 0,
    recoil: 0,
    shield: getPlayerStat('shieldHp'),
    maxShield: getPlayerStat('shieldHp'),
    shieldRegenTimer: 0,
    secondWindUsed: false,
    ironSkinReady: hasSkill('iron_skin'),
    ironSkinCooldownTime: 0,
    killRushTimer: 0,
    killRushBoost: 0,
    dashInvulnerable: false,
    soldierRush: false,
    juggernautActive: false,
  };
  player.maxAmmo = getWeaponStat(activeWeaponId, 'mag');
  minigunSpinup = 0;
  operatorAbilityCooldown = 0;
  operatorAbilityActive = false;
  operatorAbilityTimer = 0;
  const shieldWrap = document.getElementById('shield-bar-wrap');
  shieldWrap.style.display = player.maxShield > 0 ? 'block' : 'none';
  player.lastDamageTime = 0;

  const numCharges = getPlayerStat('dashCharges');
  dashCharges = [];
  for (let i = 0; i < numCharges; i++) {
    dashCharges.push({ ready: true, cooldownStart: 0 });
  }
  dashActive = false;
  dashAfterimage = null;
  bulletTimeTimer = 0;

  rescueState = 'idle';
  rescueHoldStart = 0;
  rescueSurvivalTimer = 0;
  rescueExpiryTimer = 0;
  rescueExtractProgress = 0;
  rescueCircle = null;
  rescueCooldownUntil = 0;
  rescueRunTime = 0;

  activePerkCooldowns = {};
  activePerkActive = {};

  runStats = { kills: 0, normalKills: 0, runnerKills: 0, tankKills: 0, spitterKills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, healed: 0, xpEarned: 0, maxWave: 0 };
  bullets = []; zombies = []; particles = []; bloodDecals = []; spitterProjectiles = [];
  healthpacks = []; ammopacks = []; floatingTexts = []; hitTrails = [];
  healZones = [];
  for (const b of builderBlocks) { if (!camActive && MAP[b.y] && MAP[b.y][b.x] === 2) MAP[b.y][b.x] = 0; }
  builderBlocks = [];
  turrets = [];
  timeScale = 1; frozenBullets = []; timeTravelerPhase = 'none'; timeTravelerTimer = 0; timeTravelerKillCount = 0; miniSlowmoTimer = 0;
  toxicPools = []; bossSlowTimer = 0; broodEggs = []; playerStunTimer = 0;
  lastHealthpackSpawn = 0; lastAmmopackSpawn = 0;
  nextHealthpackAt = HEALTHPACK_INTERVAL[0] + Math.random() * (HEALTHPACK_INTERVAL[1] - HEALTHPACK_INTERVAL[0]);
  nextAmmopackAt = AMMOPACK_INTERVAL[0] + Math.random() * (AMMOPACK_INTERVAL[1] - AMMOPACK_INTERVAL[0]);
  wave = Math.max(0, startWave - 1); waveKills = 0; waveTotal = 0; waveActive = false;
  reloading = false; reloadStart = 0;
  hurtFlash = 0; score = 0; frameCount = 0;
  mouseX = W/2; mouseY = H/2;
  running = true;

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
  pendingGold = 0;
  pendingDiamonds = 0;
  lastXpSync = performance.now();
  lastGoldSync = performance.now();
  currentLevel = getLevelFromXp(globalXp);

  updateHUD();
  startNextWave();
}

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
    type: 'tank',
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

    const addMult = wave <= 10 ? 0.5 : wave <= 20 ? 0.75 : 1.0;
    addCount = Math.floor((4 + wave * 3) * addMult);
    waveTotal = bossCount + addCount;
  } else {
    addCount = 4 + wave * 3;
    waveTotal = addCount;
  }

  let spawned = 0;
  const spawnInterval = setInterval(() => {
    if (spawned >= addCount) { clearInterval(spawnInterval); return; }
    spawnZombie();
    spawned++;
  }, Math.max(200, 800 - wave * 40));
  if (addCount > 0) { spawnZombie(); spawned++; }

  if (boss) {
    showWaveBanner('BOSS WAVE ' + wave, true);
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

function spawnZombie() {
  let edge, attempts = 0;
  if (camActive) {
    // City (infinite): spawn around player just outside visible area
    do {
      const angle = Math.random() * Math.PI * 2;
      const dist = W * 0.6 + Math.random() * 200;
      edge = { x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist };
      attempts++;
    } while (wallCollide(edge.x, edge.y, ZOMBIE_R * 1.5) && attempts < 30);
  } else {
    do {
      edge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
      attempts++;
    } while (wallCollide(edge.x, edge.y, ZOMBIE_R * 1.5) && attempts < 20);
  }

  if (attempts >= 30) return;

  if (rescueCircle) {
    const rdx = edge.x - rescueCircle.x;
    const rdy = edge.y - rescueCircle.y;
    if (Math.sqrt(rdx*rdx + rdy*rdy) < rescueCircle.radius + 6 * TILE) {
      const otherEdge = SPAWN_EDGES[Math.floor(Math.random() * SPAWN_EDGES.length)];
      edge = otherEdge;
    }
  }

  let type = pickZombieType(wave);
  if (type === 'healer' && zombies.some(z => z.alive && z.type === 'healer')) {
    type = 'normal';
  }
  const cfg = ZOMBIE_CONFIGS[type];
  const baseSpd = 0.7 + wave * 0.12 + Math.random() * 0.3;
  const baseHp = cfg.hpBase[0] + Math.floor(Math.random() * (cfg.hpBase[1] - cfg.hpBase[0] + 1));
  const hp = baseHp + Math.floor(wave / 3) * cfg.hpScale;

  zombies.push({
    x: edge.x, y: edge.y,
    prevX: edge.x, prevY: edge.y,
    stuckFrames: 0,
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
    avoidDir: 0,
    shootCooldown: type === 'spitter' ? 150 : 0,
    throwAnim: 0,
    burnTimer: 0, burnDps: 0,
    cryoTimer: 0,
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
  });
}

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


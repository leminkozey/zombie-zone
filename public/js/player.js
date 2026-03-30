const RESCUE_BASE_RADIUS = 60;
const RESCUE_MIN_WALL_DIST = 3; // in tiles
const RESCUE_MIN_BORDER_DIST = 5; // in tiles
const RESCUE_SPAWN_ATTEMPTS = 50;
const RESCUE_HOLD_DURATION = 3000; // ms
const RESCUE_DECAY_SLOWDOWN = 3; // decay is 3x slower than fill
const EVAC_CHOPPER_SPEED_MULT = 0.5;
const EVAC_CHOPPER_SNAP_DIST_SQ = 100; // 10px squared

const TURRET_RANGE = 150;
const TURRET_DPS = 2;
const TURRET_FIRE_INTERVAL = 2;
const TURRET_MELEE_INTERVAL = 40;
const TURRET_MELEE_DMG = 8;
const TURRET_SELF_REPAIR_PER_SEC = 2;
const TURRET_AGGRO_DURATION = 300;

const BUILDER_MAX_BLOCKS = 15;
const BUILDER_BLOCK_HP = 10;
const BUILDER_HEAL_DELAY_FRAMES = 600; // 10s at 60fps
const BUILDER_HEAL_RATE = 0.01;

const SNIPER_EXPLOSIVE_AOE = 40;
const SNIPER_EXPLOSIVE_DMG_MULT = 0.5;
const SNIPER_EXPLOSIVE_PARTICLE_COUNT = 8;

const SHOTGUN_PELLET_COUNT = 5;
const SHOTGUN_PELLET_SPACING = 0.12;
const SLUG_SPEED_MULT = 1.2;
const SLUG_RANGE_MULT = 1.5;
const SLUG_DMG_MULT = 5;

const MINIGUN_SPINUP_THRESHOLD = 40;
const MINIGUN_RAMP_FRAMES = 180;
const MINIGUN_MOVE_SPEED_MULT = 0.35;

const BLOOD_DECAL_LIMIT = 200;

const IRON_SKIN_COOLDOWN = 60000; // 60s
const SECOND_WIND_HP_PCT = 0.3;
const BERSERKER_HP_THRESHOLD = 0.5;
const ADRENALIN_HP_THRESHOLD = 0.3;

const MEDIC_HEAL_ZONE_RADIUS = 80;
const MEDIC_HEAL_ZONE_DURATION = 480; // 8s at 60fps
const MEDIC_HEAL_PER_SEC = 5;

const TIME_TRAVELER_ABILITY_DURATION = 480; // 5s slow + 3s fast
const TIME_TRAVELER_SLOW_PHASE = 300; // 5s at 60fps
const TIME_TRAVELER_SLOW_SCALE = 0.2;
const TIME_TRAVELER_SPEED_MULT = 1.8;

const ZHASH_CELL = 80;
const _zombieHash = new Map();

function spawnRescueCircle() {
  const radius = RESCUE_BASE_RADIUS * (1 + getPlayerStat('rescueCircleRadiusPct'));
  const minWallDist = RESCUE_MIN_WALL_DIST * TILE;
  const minBorderDist = RESCUE_MIN_BORDER_DIST * TILE;
  const mapW = COLS * TILE;
  const mapH = ROWS * TILE;

  let best = null;
  for (let attempt = 0; attempt < RESCUE_SPAWN_ATTEMPTS; attempt++) {
    const x = minBorderDist + Math.random() * (mapW - 2 * minBorderDist);
    const y = minBorderDist + Math.random() * (mapH - 2 * minBorderDist);

    let tooClose = false;
    const checkRadius = Math.ceil(minWallDist / TILE);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (let r = -checkRadius; r <= checkRadius && !tooClose; r++) {
      for (let c = -checkRadius; c <= checkRadius && !tooClose; c++) {
        const cr = ty + r, cc = tx + c;
        if (isWall(cc * TILE + TILE/2, cr * TILE + TILE/2)) {
          const wx = cc * TILE + TILE/2, wy = cr * TILE + TILE/2;
          const ddx = x - wx, ddy = y - wy;
          if (ddx*ddx + ddy*ddy < minWallDist * minWallDist) tooClose = true;
        }
      }
    }

    if (!tooClose) { best = { x, y, radius }; break; }
  }

  if (!best) {
    const x = 3*TILE + Math.random() * (mapW - 6*TILE);
    const y = 3*TILE + Math.random() * (mapH - 6*TILE);
    best = { x, y, radius };
  }

  rescueCircle = best;
}

function updateRescue(now) {
  rescueRunTime++;

  switch (rescueState) {
    case 'idle':
      break;

    case 'holding_f':
      if (!keys[keybinds.rescue]) { rescueState = 'idle'; break; }
      if (now - rescueHoldStart >= RESCUE_HOLD_DURATION) {
        rescueState = 'survival_phase';
        rescueSurvivalTimer = getPlayerStat('rescueSurvivalTime') * 60;
        playSound('rescue_start');
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
      updateRescueExtraction();
      break;
    }
  }
}

function updateRescueExtraction() {
  rescueExpiryTimer--;

  const cdx = player.x - rescueCircle.x;
  const cdy = player.y - rescueCircle.y;
  const inCircle = cdx*cdx + cdy*cdy < rescueCircle.radius * rescueCircle.radius;

  if (rescueState === 'circle_spawned' && inCircle) {
    rescueState = 'extracting';
  } else if (rescueState === 'extracting' && !inCircle) {
    rescueState = 'circle_spawned';
  }

  if (rescueState === 'circle_spawned' && rescueExtractProgress > 0) {
    const baseDecay = 1 / (getPlayerStat('rescueStandTime') * 60 * RESCUE_DECAY_SLOWDOWN);
    const decayReduction = getPlayerStat('rescueDecayReduction') || 0;
    const decayRate = baseDecay * Math.max(0, 1 - decayReduction);
    rescueExtractProgress = Math.max(0, rescueExtractProgress - decayRate);
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

  if (hasSkill('evac_chopper') && rescueCircle) {
    const speed = getPlayerStat('moveSpeed') * EVAC_CHOPPER_SPEED_MULT;
    const ecx = player.x - rescueCircle.x;
    const ecy = player.y - rescueCircle.y;
    const ecDistSq = ecx*ecx + ecy*ecy;
    if (ecDistSq > EVAC_CHOPPER_SNAP_DIST_SQ) {
      const ecdist = Math.sqrt(ecDistSq);
      rescueCircle.x += (ecx/ecdist) * speed;
      rescueCircle.y += (ecy/ecdist) * speed;
    }
  }

  if (rescueExpiryTimer <= 0) {
    rescueState = 'idle';
    rescueCircle = null;
    rescueCooldownUntil = performance.now() + getPlayerStat('rescueCooldown') * 1000;
    showWaveBanner('RESCUE FEHLGESCHLAGEN');
  }
}

async function rescueSuccess() {
  running = false;
  playSound('rescue_success');
  stopAmbient();

  if (authToken) {
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify(runStats)
      });
    } catch {}

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

    if (pendingGold > 0 || pendingDiamonds > 0) {
      const g = pendingGold, d = pendingDiamonds;
      pendingGold = 0; pendingDiamonds = 0;
      globalGold += g; globalDiamonds += d;
      try {
        await fetch('/api/gold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ gold: g, diamonds: d })
        });
      } catch {}
    }

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

function drawRescueCircle() {
  if (!rescueCircle) return;
  ctx.save();
  const pulse = 0.6 + Math.sin(frameCount * 0.08) * 0.4;
  ctx.strokeStyle = 'rgba(100, 255, 150, ' + pulse + ')';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#66ff9988';
  ctx.beginPath();
  ctx.arc(rescueCircle.x, rescueCircle.y, rescueCircle.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(100, 255, 150, ' + (pulse * 0.08) + ')';
  ctx.fill();

  if ((rescueState === 'extracting' || rescueState === 'circle_spawned') && rescueExtractProgress > 0) {
    const barW = rescueCircle.radius * 2;
    const barH = 6;
    const barX = rescueCircle.x - barW/2;
    const barY = rescueCircle.y - rescueCircle.radius - 20;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = rescueState === 'extracting' ? '#66ff99' : '#aa8833';
    ctx.fillRect(barX, barY, barW * rescueExtractProgress, barH);
  }
  ctx.restore();
}

function drawRescueHUD() {
  ctx.save();
  const midY = H / 2;

  if (rescueState === 'idle') {
    const activationFrames = getPlayerStat('rescueActivationTime') * 60;
    if (rescueRunTime < activationFrames) {
      const secsLeft = Math.ceil((activationFrames - rescueRunTime) / 60);
      const prog = rescueRunTime / activationFrames;
      ctx.font = "9px 'Share Tech Mono'";
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.fillText('RESCUE ' + secsLeft + 's', 16, midY);
      const barW = 80, barH = 3;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(16, midY + 4, barW, barH);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(16, midY + 4, barW * prog, barH);
    } else if (performance.now() < rescueCooldownUntil) {
      const secsLeft = Math.ceil((rescueCooldownUntil - performance.now()) / 1000);
      ctx.font = "9px 'Share Tech Mono'";
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.fillText('RESCUE CD ' + secsLeft + 's', 16, midY);
    } else {
      ctx.font = "11px 'Share Tech Mono'";
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'left';
      ctx.fillText('[F] RESCUE', 16, midY);
    }
  }

  if (rescueState === 'holding_f') {
    const prog = Math.min((performance.now() - rescueHoldStart) / RESCUE_HOLD_DURATION, 1);
    ctx.textAlign = 'center';
    const barW = 200, barH = 8;
    ctx.fillStyle = '#222';
    ctx.fillRect(W/2 - barW/2, H/2 + 40, barW, barH);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(W/2 - barW/2, H/2 + 40, barW * prog, barH);
    ctx.font = "12px 'Share Tech Mono'";
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('RESCUE ANFRAGE...', W/2, H/2 + 35);
  }

  if (rescueState === 'survival_phase') {
    const secs = Math.ceil(rescueSurvivalTimer / 60);
    ctx.textAlign = 'center';
    ctx.font = "16px 'Bebas Neue'";
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('UEBERLEBE: ' + secs + 's', W/2, 60);
  }

  if (rescueState === 'circle_spawned' || rescueState === 'extracting') {
    const secs = Math.ceil(rescueExpiryTimer / 60);
    ctx.textAlign = 'center';
    ctx.font = "16px 'Bebas Neue'";
    ctx.fillStyle = secs < 15 ? '#cc2200' : '#ffaa00';
    ctx.fillText('RETTUNGSZONE: ' + secs + 's', W/2, 60);
  }

  ctx.restore();
}

let paused = false;

function togglePause() {
  if (mpEnabled) return;
  if (!running && !paused) return;
  paused = !paused;
  if (paused) {
    running = false;
    document.getElementById('pause-screen').style.display = 'flex';
  } else {
    running = true;
    document.getElementById('pause-screen').style.display = 'none';
    requestAnimationFrame(loop);
  }
}

document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  if (e.code === keybinds.pause) { togglePause(); return; }
  keys[e.code] = true;
  if (mpEnabled) { e.preventDefault(); return; }
  if (e.code === keybinds.reload && !reloading && player.ammo < getWeaponStat(activeWeaponId, 'mag')) startReload();
  const weaponKeys = { 'Digit1': 'pistol', 'Digit2': 'smg', 'Digit3': 'shotgun', 'Digit4': 'assault_rifle', 'Digit5': 'sniper', 'Digit6': 'minigun' };
  if (weaponKeys[e.code] && ownedWeaponIds.includes(weaponKeys[e.code]) && running && !paused) {
    setActiveWeapon(weaponKeys[e.code]);
    player.ammo = getWeaponStat(activeWeaponId, 'mag');
    player.maxAmmo = getWeaponStat(activeWeaponId, 'mag');
    reloading = false;
    document.getElementById('reload-bar-wrap').style.display = 'none';
    minigunSpinup = 0;
    updateHUD();
  }
  if (e.code === keybinds.perk && running && !paused) {
    const wpnPerks = Object.entries(PERK_DEFS).filter(([id, p]) => p.weaponId === activeWeaponId && p.type === 'active' && ownedPerks.includes(id));
    for (const [perkId, perk] of wpnPerks) {
      if (activePerkCooldowns[perkId] > 0) continue;
      activePerkCooldowns[perkId] = perk.cooldown;
      activePerkActive[perkId] = true;
      playSound('perk_activate');
      showWaveBanner(perk.name + ' AKTIVIERT!');
      if (perkId === 'minigun_overdrive') {
        setTimeout(() => { activePerkActive['minigun_overdrive'] = false; }, 5000);
      }
      if (perkId === 'shotgun_dragon') {
        setTimeout(() => { activePerkActive['shotgun_dragon'] = false; }, 5000);
      }
      if (perkId === 'sniper_wallpen') {
        // Active for 1 magazine
      }
      if (perkId === 'pistol_akimbo') {
        // Active for 1 magazine
      }
      if (perkId === 'shotgun_slug') {
        // Active for 1 magazine
      }
      if (perkId === 'smg_drum') {
        player.ammo = getWeaponStat(activeWeaponId, 'mag') * 3;
        player.maxAmmo = getWeaponStat(activeWeaponId, 'mag') * 3;
        activePerkActive['smg_drum'] = false;
        updateHUD();
      }
      if (perkId === 'ar_grenade') {
        const gAngle = Math.atan2((mouseY + camY) - player.y, (mouseX + camX) - player.x);
        bullets.push({
          x: player.x, y: player.y,
          dx: Math.cos(gAngle) * 6,
          dy: Math.sin(gAngle) * 6,
          life: 60, damage: 0, pierce: false, isGrenade: true, grenadeDmg: 8,
        });
        activePerkActive['ar_grenade'] = false;
      }
      break;
    }
  }
  if (e.code === keybinds.operatorAbility && running && !paused && activeOperatorId) {
    if (operatorAbilityCooldown <= 0 && !operatorAbilityActive) {
      activateOperatorAbility();
    }
  }
  if (e.code === keybinds.dash) { tryDash(); e.preventDefault(); return; }
  if (e.code === keybinds.rescue && rescueState === 'idle' && running && !paused) {
    const activationFrames = getPlayerStat('rescueActivationTime') * 60;
    if (rescueRunTime >= activationFrames && performance.now() >= rescueCooldownUntil) {
      rescueState = 'holding_f';
      rescueHoldStart = performance.now();
    }
  }
  e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
});

let mouseDown = false;
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });

function startReload() {
  if (player.soldierRush) return;
  if (activeOperatorId === 'juggernaut' && activeWeaponId === 'minigun') return;
  const maxAmmo = getWeaponStat(activeWeaponId, 'mag');
  if (reloading || player.ammo === maxAmmo) return;
  reloading = true;
  reloadStart = performance.now();
  playSound('reload');
  document.getElementById('reload-bar-wrap').style.display = 'block';
  activePerkActive['pistol_akimbo'] = false;
  activePerkActive['sniper_wallpen'] = false;
  activePerkActive['shotgun_slug'] = false;
}

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

function activateOperatorAbility() {
  const op = OPERATORS[activeOperatorId];
  if (!op) return;
  operatorAbilityCooldown = op.active.cooldown;
  operatorAbilityActive = true;
  operatorAbilityTimer = op.active.duration;
  playSound('perk_activate');
  showWaveBanner(op.active.name + '!');

  if (activeOperatorId === 'soldier') {
    player.soldierRush = true;
  }
  if (activeOperatorId === 'juggernaut') {
    player.juggernautActive = true;
  }
  if (activeOperatorId === 'medic') {
    healZones.push({
      x: player.x, y: player.y,
      radius: MEDIC_HEAL_ZONE_RADIUS, duration: MEDIC_HEAL_ZONE_DURATION,
      healPerSec: MEDIC_HEAL_PER_SEC,
      dps: 0,
      placedAt: frameCount,
    });
    playSound('pickup_health');
  }
  if (activeOperatorId === 'builder') {
    const tx = Math.floor(mouseX / TILE);
    const ty = Math.floor(mouseY / TILE);
    const ptx = Math.floor(player.x / TILE);
    const pty = Math.floor(player.y / TILE);
    if (tx > 0 && tx < COLS-1 && ty > 0 && ty < ROWS-1 && (tx !== ptx || ty !== pty)) {
      const existing = builderBlocks.find(b => b.x === tx && b.y === ty);
      if (existing && !existing.reinforced) {
        existing.reinforced = true;
        existing.hp = existing.maxHp;
        floatingTexts.push({ x: tx * TILE + TILE/2, y: ty * TILE, text: 'REINFORCED', life: 30, maxLife: 30, color: '#88aa66' });
        playSound('ui_click');
      } else if (!camActive && MAP[ty] && MAP[ty][tx] === 0) {
        if (builderBlocks.length >= BUILDER_MAX_BLOCKS) {
          const oldIdx = builderBlocks.findIndex(b => !b.reinforced);
          const removeIdx = oldIdx >= 0 ? oldIdx : 0;
          const old = builderBlocks.splice(removeIdx, 1)[0];
          if (!camActive && MAP[old.y] && MAP[old.y][old.x] === 2) MAP[old.y][old.x] = 0;
          mapCacheCanvas = null;
          _floorNoise = null;
        }
        builderBlocks.push({ x: tx, y: ty, hp: BUILDER_BLOCK_HP, maxHp: BUILDER_BLOCK_HP, placedAt: frameCount, reinforced: false });
        if (!camActive) MAP[ty][tx] = 2;
        mapCacheCanvas = null;
        _floorNoise = null;
        computeFlowfield();
        playSound('ui_click');
      }
    }
  }
  if (activeOperatorId === 'time_traveler') {
    operatorAbilityTimer = TIME_TRAVELER_ABILITY_DURATION;
    timeTravelerPhase = 'slow';
    timeTravelerTimer = TIME_TRAVELER_SLOW_PHASE;
    timeScale = TIME_TRAVELER_SLOW_SCALE;
    frozenBullets = [];
    playSound('perk_activate');
  }
  if (activeOperatorId === 'electrician') {
    if (turrets.length >= 2) {
      turrets.forEach(t => { t.aggroTimer = TURRET_AGGRO_DURATION; });
      showWaveBanner('TURRET AGGRO!');
      operatorAbilityCooldown = 0;
      operatorAbilityActive = false;
      operatorAbilityTimer = 0;
      return;
    }
    turrets.push({
      x: player.x, y: player.y,
      hp: 50, maxHp: 50,
      angle: 0, shootCooldown: 0,
      aggroTimer: 0,
    });
    playSound('ui_click');
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

function updateTurrets() {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const t = turrets[i];
    if (activeOperatorId === 'electrician' && t.hp < t.maxHp) {
      t.hp = Math.min(t.hp + TURRET_SELF_REPAIR_PER_SEC/60, t.maxHp);
    }
    let nearest = null, nearestDistSq = TURRET_RANGE * TURRET_RANGE;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dx = z.x - t.x, dy = z.y - t.y;
      const dSq = dx*dx + dy*dy;
      if (dSq < nearestDistSq) { nearest = z; nearestDistSq = dSq; }
    }
    if (nearest && t.shootCooldown <= 0) {
      t.angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
      nearest.hp -= TURRET_DPS/30;
      t.shootCooldown = TURRET_FIRE_INTERVAL;
      hitTrails.push({ x1: t.x, y1: t.y, x2: nearest.x, y2: nearest.y, life: 2, maxLife: 2, style: 'minigun' });
      if (nearest.hp <= 0 && nearest.alive) {
        nearest.alive = false; nearest.deathTimer = nearest.isBoss ? 60 : 30; onZombieKill(nearest);
      }
    }
    if (t.shootCooldown > 0) t.shootCooldown--;
    if (t.aggroTimer > 0) t.aggroTimer--;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dx = z.x - t.x, dy = z.y - t.y;
      if (dx*dx + dy*dy < (z.radius + 15)**2) {
        if (z.frame % TURRET_MELEE_INTERVAL === 0) t.hp -= TURRET_MELEE_DMG;
      }
    }
    if (t.hp <= 0) {
      turrets.splice(i, 1);
      playSound('explosion');
    }
  }
}

function drawTurrets() {
  for (const t of turrets) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = '#3a4440';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#5a6a55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.rotate(t.angle);
    ctx.fillStyle = '#2a2e28';
    ctx.fillRect(8, -2, 12, 4);
    ctx.restore();
    if (t.hp < t.maxHp) {
      ctx.fillStyle = '#400';
      ctx.fillRect(t.x - 12, t.y - 18, 24, 3);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(t.x - 12, t.y - 18, 24 * (t.hp / t.maxHp), 3);
    }
    if (t.aggroTimer > 0) {
      ctx.strokeStyle = 'rgba(255,100,50,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.x, t.y, 200, 0, Math.PI*2); ctx.stroke();
    }
  }
}

function updateBuilderBlocks() {
  for (let i = builderBlocks.length - 1; i >= 0; i--) {
    const b = builderBlocks[i];
    if (b.hp < b.maxHp && frameCount - b.placedAt > BUILDER_HEAL_DELAY_FRAMES) {
      b.hp = Math.min(b.hp + BUILDER_HEAL_RATE, b.maxHp);
    }
    if (b.hp <= 0) {
      if (MAP[b.y] && MAP[b.y][b.x] !== undefined) MAP[b.y][b.x] = 0;
      mapCacheCanvas = null;
      _floorNoise = null;
      builderBlocks.splice(i, 1);
      computeFlowfield();
    }
  }
}

function drawBuilderBlocks() {
  for (const b of builderBlocks) {
    const x = b.x * TILE, y = b.y * TILE;
    if (b.reinforced) {
      ctx.fillStyle = '#5a6655';
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = '#8a9a77';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = '#4a5540';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + TILE - 3, y + TILE - 3);
      ctx.moveTo(x + TILE - 3, y + 3); ctx.lineTo(x + 3, y + TILE - 3);
      ctx.moveTo(x + TILE/2, y + 2); ctx.lineTo(x + TILE/2, y + TILE - 2);
      ctx.moveTo(x + 2, y + TILE/2); ctx.lineTo(x + TILE - 2, y + TILE/2);
      ctx.stroke();
      ctx.fillStyle = '#8a9a77';
      const rv = 2;
      ctx.fillRect(x + 3, y + 3, rv, rv);
      ctx.fillRect(x + TILE - 5, y + 3, rv, rv);
      ctx.fillRect(x + 3, y + TILE - 5, rv, rv);
      ctx.fillRect(x + TILE - 5, y + TILE - 5, rv, rv);
    } else {
      ctx.fillStyle = '#4a5540';
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = '#6a7a55';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = '#3a4530';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + TILE - 4, y + TILE - 4);
      ctx.moveTo(x + TILE - 4, y + 4); ctx.lineTo(x + 4, y + TILE - 4);
      ctx.stroke();
      if (b.hp < b.maxHp) {
        const bw = TILE - 8;
        ctx.fillStyle = '#400';
        ctx.fillRect(x + 4, y - 4, bw, 3);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(x + 4, y - 4, bw * (b.hp / b.maxHp), 3);
      }
    }
  }
}

function applyPerkDamageEffects(z, effectiveDmg, weaponId) {
  if (ownedPerks.includes('pistol_hollow') && weaponId === 'pistol' && z.type === 'normal') {
    effectiveDmg *= 1.5;
  }
  const actualDmg = applyBossDamage(z, effectiveDmg, player.x, player.y);
  z.hp -= actualDmg;
  runStats.damageDealt += actualDmg;

  if (ownedPerks.includes('smg_incendiary') && weaponId === 'smg') {
    z.burnTimer = 180; z.burnDps = 2;
  }
  if (activePerkActive['shotgun_dragon'] && weaponId === 'shotgun') {
    z.burnTimer = 180; z.burnDps = 3;
  }
  if (ownedPerks.includes('minigun_cryo') && weaponId === 'minigun') {
    z.cryoTimer = 120;
  }
  if (ownedPerks.includes('sniper_explosive') && weaponId === 'sniper' && z.alive) {
    playSound('explosion');
    const aoeRSq = SNIPER_EXPLOSIVE_AOE * SNIPER_EXPLOSIVE_AOE;
    for (const oz of zombies) {
      if (oz === z || !oz.alive) continue;
      const odx = oz.x - z.x, ody = oz.y - z.y;
      if (odx*odx + ody*ody < aoeRSq) {
        oz.hp -= applyBossDamage(oz, effectiveDmg * SNIPER_EXPLOSIVE_DMG_MULT, player.x, player.y);
        runStats.damageDealt += effectiveDmg * SNIPER_EXPLOSIVE_DMG_MULT;
        spawnBlood(oz.x, oz.y, 4);
        if (oz.hp <= 0) { oz.alive = false; oz.deathTimer = oz.isBoss ? 60 : 30; onZombieKill(oz); }
      }
    }
    for (let i = 0; i < SNIPER_EXPLOSIVE_PARTICLE_COUNT; i++) {
      const ea = Math.random() * Math.PI * 2;
      particles.push({ x: z.x, y: z.y, dx: Math.cos(ea)*4, dy: Math.sin(ea)*4, life: 15, maxLife: 15, color: '#ff6600', r: 4 });
    }
  }
}

function tryShoot() {
  if (playerStunTimer > 0) return;
  const wpn = WEAPONS[activeWeaponId];
  if (!wpn) return;
  let fireRate = Math.max(1, Math.round(getWeaponStat(activeWeaponId, 'rate')));
  const magSize = getWeaponStat(activeWeaponId, 'mag');
  let spread = getWeaponStat(activeWeaponId, 'acc');
  let dmg = getWeaponStat(activeWeaponId, 'dmg');

  dmg *= 1 + getPlayerStat('weaponDamagePct');

  const berserkerMax = getPlayerStat('berserkerMaxBonus');
  if (berserkerMax > 0) {
    const hpPct = player.hp / getPlayerStat('maxHp');
    if (hpPct < BERSERKER_HP_THRESHOLD) {
      dmg *= 1 + berserkerMax * (1 - hpPct * 2);
    }
  }

  if (player.juggernautActive) dmg *= 1.5;

  if (activeWeaponId === 'minigun' && minigunSpinup > MINIGUN_SPINUP_THRESHOLD) {
    dmg *= 1 + Math.min((minigunSpinup - MINIGUN_SPINUP_THRESHOLD) / MINIGUN_RAMP_FRAMES, 1.0);
  }

  const rangeMult = 1 + getPlayerStat('weaponRangePct');
  const range = Math.round(getWeaponStat(activeWeaponId, 'range') * rangeMult);
  const fireRateMult = 1 + getPlayerStat('fireRatePct');
  fireRate = Math.max(1, Math.round(fireRate * Math.max(0.3, fireRateMult)));

  const akimboActive = activePerkActive['pistol_akimbo'] && activeWeaponId === 'pistol';
  if (akimboActive) {
    fireRate = Math.max(1, Math.round(fireRate / 2));
    spread *= 2;
  }

  const isSoldierRush = player.soldierRush === true;

  if (reloading || player.shootCooldown > 0) return;
  if (player.ammo <= 0 && !isSoldierRush) {
    playSoundThrottled('empty_mag', 200);
    return;
  }

  if (wpn.special === 'spinup') {
    minigunSpinup++;
    if (activePerkActive['minigun_overdrive']) {
      player.shootCooldown = fireRate;
    } else {
      if (minigunSpinup < MINIGUN_SPINUP_THRESHOLD) {
        const t = minigunSpinup / MINIGUN_SPINUP_THRESHOLD;
        player.shootCooldown = Math.max(fireRate, Math.round(fireRate * (6 - 5 * t * t)));
      } else {
        player.shootCooldown = fireRate;
      }
    }
  } else {
    player.shootCooldown = fireRate;
  }

  if (isSoldierRush) {
    player.shootCooldown = Math.max(1, Math.round(player.shootCooldown * 0.5));
  }

  if (typeof rescueState !== 'undefined' && rescueState === 'extracting' && hasSkill('last_stand')) {
    player.shootCooldown = Math.max(1, Math.round(player.shootCooldown * 0.5));
  }

  if (!isSoldierRush) player.ammo--;
  player.recoil = 4;
  playSoundThrottled('shoot_' + activeWeaponId, 50);
  updateHUD();

  const angle = Math.atan2((mouseY + camY) - player.y, (mouseX + camX) - player.x);
  const slugActive = activePerkActive['shotgun_slug'] && activeWeaponId === 'shotgun';
  const useHitscan = wpn.type === 'Auto' || activeWeaponId === 'sniper';

  if (useHitscan && timeTravelerPhase !== 'slow') {
    shootHitscan(angle, spread, range, dmg, wpn, akimboActive);
  } else if (useHitscan && timeTravelerPhase === 'slow') {
    shootFrozenHitscan(angle, spread, range, dmg, wpn);
  } else if (wpn.special === 'shotgun' && !slugActive) {
    shootShotgun(angle, spread, range, dmg);
  } else if (slugActive) {
    shootSlug(angle, range, dmg);
  } else {
    shootProjectile(angle, spread, range, dmg, wpn, akimboActive);
  }

  spawnMuzzleParticles(angle, useHitscan);

  if (player.ammo === 0) {
    activePerkActive['pistol_akimbo'] = false;
    activePerkActive['shotgun_slug'] = false;
    activePerkActive['sniper_wallpen'] = false;
    startReload();
  }
}

function shootHitscan(angle, spread, range, dmg, wpn, akimboActive) {
  const bulletSpread = (Math.random() - 0.5) * spread;
  const rayAngle = angle + bulletSpread;
  const rayDx = Math.cos(rayAngle);
  const rayDy = Math.sin(rayAngle);
  const maxDist = range * BULLET_SPD;

  let hitDist = maxDist;
  let hitX = player.x + rayDx * maxDist;
  let hitY = player.y + rayDy * maxDist;

  const wallPenActive = activePerkActive['sniper_wallpen'] && activeWeaponId === 'sniper';
  if (!wallPenActive) {
    for (let d = 0; d < maxDist; d += TILE * 0.5) {
      const wx = player.x + rayDx * d;
      const wy = player.y + rayDy * d;
      if (wallCollide(wx, wy, 2)) {
        hitDist = d;
        hitX = wx; hitY = wy;
        break;
      }
    }
  }

  const fmjActive = ownedPerks.includes('ar_fmj') && activeWeaponId === 'assault_rifle';
  const isPierce = wpn.special === 'pierce' || fmjActive;
  const hitZombies = [];
  for (const z of zombies) {
    if (!z.alive || z.burrowed) continue;
    const zx = z.x - player.x, zy = z.y - player.y;
    const proj = zx * rayDx + zy * rayDy;
    if (proj < 0 || proj > hitDist) continue;
    const perpX = zx - rayDx * proj;
    const perpY = zy - rayDy * proj;
    const perpDistSq = perpX * perpX + perpY * perpY;
    const hitRadius = z.radius + BULLET_R;
    if (perpDistSq < hitRadius * hitRadius) {
      hitZombies.push({ z, proj });
    }
  }
  hitZombies.sort((a, b) => a.proj - b.proj);

  const sniperExecute = activeWeaponId === 'sniper' && playerWeapons.find(w => w.weapon_id === 'sniper' && w.dmg_level >= 10);
  const maxHits = fmjActive ? 2 : (isPierce ? hitZombies.length : 1);
  const toHit = hitZombies.slice(0, maxHits);
  for (const { z, proj } of toHit) {
    if (sniperExecute) {
      z.hp = 0;
      runStats.damageDealt += z.maxHp;
    } else {
      applyPerkDamageEffects(z, dmg, activeWeaponId);
    }
    spawnBlood(z.x, z.y, sniperExecute ? 12 : 6, rayAngle);
    if (z.hp <= 0 && z.alive) {
      z.alive = false;
      z.deathTimer = z.isBoss ? 60 : 30;
      onZombieKill(z);
    } else if (z.alive) {
      playSoundThrottled('zombie_hit', 80);
    }
  }
  if (hitZombies.length > 0 && !isPierce) {
    hitX = player.x + rayDx * hitZombies[0].proj;
    hitY = player.y + rayDy * hitZombies[0].proj;
  }

  if (activeWeaponId === 'sniper') {
    hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 12, maxLife: 12, style: 'sniper' });
  } else if (activeWeaponId === 'minigun') {
    hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 3, maxLife: 3, style: 'minigun' });
  } else if (activeWeaponId === 'assault_rifle') {
    hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 8, maxLife: 8, style: 'rifle' });
  } else {
    hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 4, maxLife: 4, style: 'auto' });
  }
}

function shootFrozenHitscan(angle, spread, range, dmg, wpn) {
  const bulletSpread = (Math.random() - 0.5) * spread;
  frozenBullets.push({
    x: player.x, y: player.y,
    dx: Math.cos(angle + bulletSpread) * BULLET_SPD,
    dy: Math.sin(angle + bulletSpread) * BULLET_SPD,
    life: range, damage: dmg, pierce: wpn.special === 'pierce',
    weaponId: activeWeaponId,
  });
}

function shootShotgun(angle, spread, range, dmg) {
  const targetArr = timeTravelerPhase === 'slow' ? frozenBullets : bullets;
  for (let p = 0; p < SHOTGUN_PELLET_COUNT; p++) {
    const pelletSpread = (p - 2) * SHOTGUN_PELLET_SPACING + (Math.random() - 0.5) * spread;
    targetArr.push({
      x: player.x, y: player.y,
      dx: Math.cos(angle + pelletSpread) * BULLET_SPD,
      dy: Math.sin(angle + pelletSpread) * BULLET_SPD,
      life: range, damage: dmg, pierce: false,
      weaponId: activeWeaponId,
    });
  }
}

function shootSlug(angle, range, dmg) {
  const slugBullet = {
    x: player.x, y: player.y,
    dx: Math.cos(angle) * BULLET_SPD * SLUG_SPEED_MULT,
    dy: Math.sin(angle) * BULLET_SPD * SLUG_SPEED_MULT,
    life: range * SLUG_RANGE_MULT, damage: dmg * SLUG_DMG_MULT, pierce: false,
    weaponId: activeWeaponId,
  };
  if (timeTravelerPhase === 'slow') frozenBullets.push(slugBullet);
  else bullets.push(slugBullet);
}

function shootProjectile(angle, spread, range, dmg, wpn, akimboActive) {
  const bulletSpread = (Math.random() - 0.5) * spread;
  const pistolBullet = {
    x: player.x, y: player.y,
    dx: Math.cos(angle + bulletSpread) * BULLET_SPD,
    dy: Math.sin(angle + bulletSpread) * BULLET_SPD,
    life: range, damage: dmg, pierce: wpn.special === 'pierce',
    weaponId: activeWeaponId,
  };
  if (timeTravelerPhase === 'slow') frozenBullets.push(pistolBullet);
  else bullets.push(pistolBullet);

  if (akimboActive) {
    const bulletSpread2 = (Math.random() - 0.5) * spread;
    const akimboBullet = {
      x: player.x, y: player.y,
      dx: Math.cos(angle + bulletSpread2) * BULLET_SPD,
      dy: Math.sin(angle + bulletSpread2) * BULLET_SPD,
      life: range, damage: dmg, pierce: false,
      weaponId: activeWeaponId,
    };
    if (timeTravelerPhase === 'slow') frozenBullets.push(akimboBullet);
    else bullets.push(akimboBullet);
  }
}

function spawnMuzzleParticles(angle, useHitscan) {
  for (let i = 0; i < (useHitscan ? 2 : 4); i++) {
    const a = angle + (Math.random()-0.5)*0.4;
    particles.push({
      x: player.x, y: player.y,
      dx: Math.cos(a)*3*(Math.random()+0.5),
      dy: Math.sin(a)*3*(Math.random()+0.5),
      life: 6, maxLife: 6, color: '#ffcc00', r: 2,
    });
  }
}

function xpForLevel(n) {
  return Math.floor(50 * Math.pow(n, 1.5));
}

function getLevelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

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

function showLevelUp() {
  playSound('levelup');
  const el = document.getElementById('level-up-banner');
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 2500);
  for (let ring = 0; ring < 2; ring++) {
    const ringCount = ring === 0 ? 24 : 16;
    const ringSpeed = ring === 0 ? 4 : 2.5;
    const ringDelay = ring * 3;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      particles.push({
        x: player.x, y: player.y,
        dx: Math.cos(a) * (ringSpeed + Math.random()),
        dy: Math.sin(a) * (ringSpeed + Math.random()),
        life: 25 + ringDelay + Math.random()*10,
        maxLife: 38,
        color: ring === 0 ? '#44ff44' : '#88ff88',
        r: ring === 0 ? 4 + Math.random()*2 : 2 + Math.random()*2,
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: player.x, y: player.y,
      dx: Math.cos(a) * (1 + Math.random()*2),
      dy: Math.sin(a) * (1 + Math.random()*2),
      life: 30, maxLife: 30,
      color: '#ffffff', r: 2,
    });
  }
}

function spawnBlood(x, y, count = 8, dirAngle = null) {
  if (bloodDecals.length > BLOOD_DECAL_LIMIT) bloodDecals.shift();
  bloodDecals.push({ x, y, r: 6 + Math.random()*6, alpha: 0.5, shape: 'circle' });
  if (dirAngle !== null) {
    for (let i = 0; i < 2; i++) {
      const splatDist = 8 + Math.random() * 12;
      const splatAngle = dirAngle + (Math.random() - 0.5) * 0.8;
      bloodDecals.push({
        x: x + Math.cos(splatAngle) * splatDist,
        y: y + Math.sin(splatAngle) * splatDist,
        r: 3 + Math.random()*4,
        alpha: 0.35,
        shape: 'splat'
      });
    }
  }
  for (let i = 0; i < count; i++) {
    const a = dirAngle !== null
      ? dirAngle + (Math.random() - 0.5) * 1.2
      : Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3.5;
    particles.push({
      x, y,
      dx: Math.cos(a)*spd, dy: Math.sin(a)*spd,
      life: 12 + Math.random()*12,
      maxLife: 24,
      color: `hsl(${Math.random()*15},85%,${20+Math.random()*18}%)`,
      r: 2 + Math.random()*3,
    });
  }
}

function movePlayer() {
  let dx = 0, dy = 0;
  if (keys[keybinds.moveUp])    dy -= 1;
  if (keys[keybinds.moveDown])  dy += 1;
  if (keys[keybinds.moveLeft])  dx -= 1;
  if (keys[keybinds.moveRight]) dx += 1;

  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

  let speed = getPlayerStat('moveSpeed');
  if (playerStunTimer > 0) {
    speed = 0;
  }
  if (hasSkill('fortress') && player.shield >= player.maxShield && player.maxShield > 0) {
    speed *= 1.10;
  }
  const adrenalinPct = getPlayerStat('adrenalinSpeedPct');
  if (adrenalinPct > 0 && player.hp < getPlayerStat('maxHp') * ADRENALIN_HP_THRESHOLD) {
    speed *= (1 + adrenalinPct);
  }
  if (player.killRushTimer > 0) {
    speed *= (1 + (player.killRushBoost || 0));
    player.killRushTimer--;
  }
  if (activeWeaponId === 'minigun' && mouseDown && !reloading && player.ammo > 0 && !activePerkActive['minigun_overdrive']) {
    speed *= MINIGUN_MOVE_SPEED_MULT;
  }
  if (activeOperatorId === 'time_traveler' && timeTravelerPhase !== 'none') {
    speed *= TIME_TRAVELER_SPEED_MULT;
  }
  if (bossSlowTimer > 0) {
    speed *= 0.5;
  }
  const nx = player.x + dx * speed;
  const ny = player.y + dy * speed;

  if (!wallCollide(nx, player.y, PLAYER_R - 2)) player.x = nx;
  if (!wallCollide(player.x, ny, PLAYER_R - 2)) player.y = ny;

  const targetAngle = Math.atan2((mouseY + camY) - player.y, (mouseX + camX) - player.x);
  const angleDiff = targetAngle - player.angle;
  const normalized = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
  player.angle += normalized * Math.min(1, mouseSensitivity);
  if (player.shootCooldown > 0) player.shootCooldown--;
  if (player.recoil > 0) player.recoil -= 0.5;
}

function damagePlayer(rawDamage, source) {
  const reduction = getPlayerStat('damageReductionPct');
  let damage = Math.round(rawDamage * (1 - reduction));

  if (source === 'melee') {
    const ghostRed = getPlayerStat('ghostReduction');
    if (ghostRed > 0) damage = Math.round(damage * (1 - ghostRed));
  }

  if (hasSkill('iron_skin') && player.ironSkinReady) {
    player.ironSkinReady = false;
    player.ironSkinCooldownTime = performance.now() + IRON_SKIN_COOLDOWN;
    showWaveBanner('IRON SKIN!');
    return;
  }

  if (typeof rescueState !== 'undefined' && rescueState === 'extracting' && hasSkill('fortified_lz')) {
    damage = Math.round(damage * 0.5);
  }

  if (player.dashInvulnerable) return;

  if (player.shield > 0) {
    if (damage <= player.shield) {
      player.shield -= damage;
      damage = 0;
    } else {
      damage -= player.shield;
      player.shield = 0;
    }
  }

  player.hp -= damage;
  runStats.damageTaken += rawDamage;
  player.shieldRegenTimer = 0;
  player.lastDamageTime = frameCount;

  hurtFlash = 18;
  spawnBlood(player.x, player.y, 4);
  playSound('player_hurt');

  if (player.hp <= 0 && hasSkill('second_wind') && !player.secondWindUsed) {
    player.secondWindUsed = true;
    player.hp = Math.round(getPlayerStat('maxHp') * SECOND_WIND_HP_PCT);
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

function applyMove(entity, mx, my, collR) {
  if (!wallCollide(entity.x + mx, entity.y + my, collR)) {
    entity.x += mx;
    entity.y += my;
    return true;
  }
  let moved = false;
  if (!wallCollide(entity.x + mx, entity.y, collR)) {
    entity.x += mx;
    moved = true;
  }
  if (!wallCollide(entity.x, entity.y + my, collR)) {
    entity.y += my;
    moved = true;
  }
  if (moved) return true;
  const halfMx = mx * 0.5, halfMy = my * 0.5;
  if (!wallCollide(entity.x + halfMx, entity.y, collR)) {
    entity.x += halfMx;
    return true;
  }
  if (!wallCollide(entity.x, entity.y + halfMy, collR)) {
    entity.y += halfMy;
    return true;
  }
  const tileX = Math.floor(entity.x / TILE);
  const tileY = Math.floor(entity.y / TILE);
  let bestCD = Infinity, bestNX = 0, bestNY = 0;
  for (let dr = 0; dr <= 1; dr++) {
    for (let dc = 0; dc <= 1; dc++) {
      const cx = (tileX + dc) * TILE;
      const cy = (tileY + dr) * TILE;
      let walls = 0;
      if (isTileWall(tileX + dc - 1, tileY + dr - 1)) walls++;
      if (isTileWall(tileX + dc, tileY + dr - 1)) walls++;
      if (isTileWall(tileX + dc - 1, tileY + dr)) walls++;
      if (isTileWall(tileX + dc, tileY + dr)) walls++;
      if (walls === 0 || walls === 4) continue;
      const cdx = entity.x - cx, cdy = entity.y - cy;
      const cd = cdx * cdx + cdy * cdy;
      if (cd < bestCD) {
        bestCD = cd;
        const cdist = Math.sqrt(cd);
        if (cdist > 0.1) { bestNX = cdx / cdist; bestNY = cdy / cdist; }
      }
    }
  }
  const maxCD = (collR + TILE) * (collR + TILE);
  if (bestCD < maxCD && (bestNX !== 0 || bestNY !== 0)) {
    const speed = Math.sqrt(mx * mx + my * my);
    const dot = (-bestNY) * mx + bestNX * my;
    const tx = dot > 0 ? -bestNY : bestNY;
    const ty = dot > 0 ? bestNX : -bestNX;
    if (!wallCollide(entity.x + tx * speed, entity.y + ty * speed, collR)) {
      entity.x += tx * speed;
      entity.y += ty * speed;
      return true;
    }
    if (!wallCollide(entity.x + tx * speed * 0.5, entity.y + ty * speed * 0.5, collR)) {
      entity.x += tx * speed * 0.5;
      entity.y += ty * speed * 0.5;
      return true;
    }
  }
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0.01) {
    const perpX = -my / len * 2, perpY = mx / len * 2;
    if (!wallCollide(entity.x + perpX, entity.y + perpY, collR)) {
      entity.x += perpX;
      entity.y += perpY;
      return true;
    }
    if (!wallCollide(entity.x - perpX, entity.y - perpY, collR)) {
      entity.x -= perpX;
      entity.y -= perpY;
      return true;
    }
  }
  return false;
}

function buildZombieHash() {
  _zombieHash.clear();
  for (const z of zombies) {
    if (!z.alive || z.burrowed) continue;
    const key = (Math.floor(z.x / ZHASH_CELL) * 100000) + Math.floor(z.y / ZHASH_CELL);
    let cell = _zombieHash.get(key);
    if (!cell) { cell = []; _zombieHash.set(key, cell); }
    cell.push(z);
  }
}

// ── RESCUE ──────────────────────────────────────────
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
          if (Math.sqrt(ddx*ddx + ddy*ddy) < minWallDist) tooClose = true;
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
      if (now - rescueHoldStart >= 3000) {
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
      rescueExpiryTimer--;

      const cdx = player.x - rescueCircle.x;
      const cdy = player.y - rescueCircle.y;
      const inCircle = Math.sqrt(cdx*cdx + cdy*cdy) < rescueCircle.radius;

      if (rescueState === 'circle_spawned' && inCircle) {
        rescueState = 'extracting';
      } else if (rescueState === 'extracting' && !inCircle) {
        rescueState = 'circle_spawned';
      }

      // Progress decays slowly when outside circle (reducible via Steady Hands)
      if (rescueState === 'circle_spawned' && rescueExtractProgress > 0) {
        const baseDecay = 1 / (getPlayerStat('rescueStandTime') * 60 * 3); // 3x slower than fill
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

      // Evac Chopper
      if (hasSkill('evac_chopper') && rescueCircle) {
        const speed = getPlayerStat('moveSpeed') * 0.5;
        const ecx = player.x - rescueCircle.x;
        const ecy = player.y - rescueCircle.y;
        const ecdist = Math.sqrt(ecx*ecx + ecy*ecy);
        if (ecdist > 10) {
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
      break;
    }
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

    // Sync gold before rescue
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

  // Show progress bar whenever there's progress (extracting OR decaying)
  if ((rescueState === 'extracting' || rescueState === 'circle_spawned') && rescueExtractProgress > 0) {
    const barW = rescueCircle.radius * 2;
    const barH = 6;
    const barX = rescueCircle.x - barW/2;
    const barY = rescueCircle.y - rescueCircle.radius - 20;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    // Green when extracting, orange-fading when decaying
    ctx.fillStyle = rescueState === 'extracting' ? '#66ff99' : '#aa8833';
    ctx.fillRect(barX, barY, barW * rescueExtractProgress, barH);
  }
  ctx.restore();
}

function drawRescueHUD() {
  ctx.save();
  const midY = H / 2; // left-center Y position

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
      // Ready — left center
      ctx.font = "11px 'Share Tech Mono'";
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'left';
      ctx.fillText('[F] RESCUE', 16, midY);
    }
  }

  if (rescueState === 'holding_f') {
    const prog = Math.min((performance.now() - rescueHoldStart) / 3000, 1);
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

// ── INPUT ────────────────────────────────────────────
let paused = false;

function togglePause() {
  if (mpEnabled) return; // no pause in multiplayer
  if (!running && !paused) return; // game over, nicht pausieren
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
  // In MP mode, only track keys — server handles all game logic
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
        // Active for 1 magazine — deactivated on reload
      }
      if (perkId === 'pistol_akimbo') {
        // Active for 1 magazine — deactivated on reload
      }
      if (perkId === 'shotgun_slug') {
        // Active for 1 magazine — deactivated on reload
      }
      if (perkId === 'smg_drum') {
        // Immediately give 3x mag
        player.ammo = getWeaponStat(activeWeaponId, 'mag') * 3;
        player.maxAmmo = getWeaponStat(activeWeaponId, 'mag') * 3;
        activePerkActive['smg_drum'] = false;
        updateHUD();
      }
      if (perkId === 'ar_grenade') {
        // Fire a grenade projectile
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
  // Scale CSS pixels to canvas pixels (canvas may be larger than CSS size)
  mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
});

let mouseDown = false;
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });

// ── RELOAD ───────────────────────────────────────────
function startReload() {
  // Soldier Rush — no reload during ability
  if (player.soldierRush) return;
  // Juggernaut passive — minigun no reload
  if (activeOperatorId === 'juggernaut' && activeWeaponId === 'minigun') return;
  const maxAmmo = getWeaponStat(activeWeaponId, 'mag');
  if (reloading || player.ammo === maxAmmo) return;
  reloading = true;
  reloadStart = performance.now();
  playSound('reload');
  document.getElementById('reload-bar-wrap').style.display = 'block';
  // Deactivate magazine-based perks on reload
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

// ── OPERATOR ABILITIES ──────────────────────────────
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
      radius: 80, duration: 480, // 8s
      healPerSec: 5,
      dps: 0, // 0 by default, upgradeable later
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
      // reinforcement: place on existing builder block → make it indestructible
      const existing = builderBlocks.find(b => b.x === tx && b.y === ty);
      if (existing && !existing.reinforced) {
        existing.reinforced = true;
        existing.hp = existing.maxHp;
        floatingTexts.push({ x: tx * TILE + TILE/2, y: ty * TILE, text: 'REINFORCED', life: 30, maxLife: 30, color: '#88aa66' });
        playSound('ui_click');
      } else if (!camActive && MAP[ty] && MAP[ty][tx] === 0) {
        // new block
        if (builderBlocks.length >= 15) {
          // remove oldest non-reinforced, or oldest reinforced if all reinforced
          const oldIdx = builderBlocks.findIndex(b => !b.reinforced);
          const removeIdx = oldIdx >= 0 ? oldIdx : 0;
          const old = builderBlocks.splice(removeIdx, 1)[0];
          if (!camActive && MAP[old.y] && MAP[old.y][old.x] === 2) MAP[old.y][old.x] = 0;
          mapCacheCanvas = null;
          _floorNoise = null;
        }
        builderBlocks.push({ x: tx, y: ty, hp: 10, maxHp: 10, placedAt: frameCount, reinforced: false });
        if (!camActive) MAP[ty][tx] = 2;
        mapCacheCanvas = null;
        _floorNoise = null;
        computeFlowfield(); // immediate recompute so zombies path around
        playSound('ui_click');
      }
    }
  }
  if (activeOperatorId === 'time_traveler') {
    operatorAbilityTimer = 480; // 5s slow + 3s fast = 8s total
    timeTravelerPhase = 'slow';
    timeTravelerTimer = 300; // 5s at 60fps
    timeScale = 0.2;
    frozenBullets = [];
    playSound('perk_activate');
  }
  if (activeOperatorId === 'electrician') {
    if (turrets.length >= 2) {
      // Second activation on existing turrets: activate aggro mode
      turrets.forEach(t => { t.aggroTimer = 300; }); // 5s aggro
      showWaveBanner('TURRET AGGRO!');
      operatorAbilityCooldown = 0; // no cooldown for aggro toggle
      operatorAbilityActive = false;
      operatorAbilityTimer = 0;
      return;
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

// ── TURRETS ─────────────────────────────────────────
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
        nearest.alive = false; nearest.deathTimer = nearest.isBoss ? 60 : 30; onZombieKill(nearest);
      }
    }
    if (t.shootCooldown > 0) t.shootCooldown--;
    // Aggro timer tick
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

// ── BUILDER BLOCKS ──────────────────────────────────
function updateBuilderBlocks() {
  for (let i = builderBlocks.length - 1; i >= 0; i--) {
    const b = builderBlocks[i];
    // Self-heal after 10s if damaged
    if (b.hp < b.maxHp && frameCount - b.placedAt > 600) {
      b.hp = Math.min(b.hp + 0.01, b.maxHp);
    }
    // Remove if destroyed
    if (b.hp <= 0) {
      if (MAP[b.y] && MAP[b.y][b.x] !== undefined) MAP[b.y][b.x] = 0;
      mapCacheCanvas = null;
      _floorNoise = null;
      builderBlocks.splice(i, 1);
      computeFlowfield(); // recompute so zombies update paths
    }
  }
}

function drawBuilderBlocks() {
  for (const b of builderBlocks) {
    const x = b.x * TILE, y = b.y * TILE;
    if (b.reinforced) {
      // reinforced block — steel look
      ctx.fillStyle = '#5a6655';
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = '#8a9a77';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      // double cross-hatch
      ctx.strokeStyle = '#4a5540';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + TILE - 3, y + TILE - 3);
      ctx.moveTo(x + TILE - 3, y + 3); ctx.lineTo(x + 3, y + TILE - 3);
      ctx.moveTo(x + TILE/2, y + 2); ctx.lineTo(x + TILE/2, y + TILE - 2);
      ctx.moveTo(x + 2, y + TILE/2); ctx.lineTo(x + TILE - 2, y + TILE/2);
      ctx.stroke();
      // corner rivets
      ctx.fillStyle = '#8a9a77';
      const rv = 2;
      ctx.fillRect(x + 3, y + 3, rv, rv);
      ctx.fillRect(x + TILE - 5, y + 3, rv, rv);
      ctx.fillRect(x + 3, y + TILE - 5, rv, rv);
      ctx.fillRect(x + TILE - 5, y + TILE - 5, rv, rv);
    } else {
      // normal block
      ctx.fillStyle = '#4a5540';
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = '#6a7a55';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      // cross-hatch
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
}

// ── SHOOTING ─────────────────────────────────────────
function applyPerkDamageEffects(z, effectiveDmg, weaponId) {
  // Hollow Point — +50% damage to normal zombies (pistol passive)
  if (ownedPerks.includes('pistol_hollow') && weaponId === 'pistol' && z.type === 'normal') {
    effectiveDmg *= 1.5;
  }
  const actualDmg = applyBossDamage(z, effectiveDmg, player.x, player.y);
  z.hp -= actualDmg;
  runStats.damageDealt += actualDmg;

  // Incendiary — SMG passive: burn 3s at 2 DPS
  if (ownedPerks.includes('smg_incendiary') && weaponId === 'smg') {
    z.burnTimer = 180; z.burnDps = 2;
  }
  // Dragon's Breath — shotgun active: burn on hit
  if (activePerkActive['shotgun_dragon'] && weaponId === 'shotgun') {
    z.burnTimer = 180; z.burnDps = 3;
  }
  // Cryo — minigun passive: slow 30% for 2s
  if (ownedPerks.includes('minigun_cryo') && weaponId === 'minigun') {
    z.cryoTimer = 120;
  }
  // Explosive — sniper passive: AoE on hit
  if (ownedPerks.includes('sniper_explosive') && weaponId === 'sniper' && z.alive) {
    playSound('explosion');
    const aoeR = 40;
    for (const oz of zombies) {
      if (oz === z || !oz.alive) continue;
      const odx = oz.x - z.x, ody = oz.y - z.y;
      if (odx*odx + ody*ody < aoeR*aoeR) {
        oz.hp -= applyBossDamage(oz, effectiveDmg * 0.5, player.x, player.y);
        runStats.damageDealt += effectiveDmg * 0.5;
        spawnBlood(oz.x, oz.y, 4);
        if (oz.hp <= 0) { oz.alive = false; oz.deathTimer = oz.isBoss ? 60 : 30; onZombieKill(oz); }
      }
    }
    // Explosion particles
    for (let i = 0; i < 8; i++) {
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
  // Apply operator weapon damage buff/debuff
  const wpnDmgMult = 1 + getPlayerStat('weaponDamagePct');
  dmg *= wpnDmgMult;
  // Berserker — more damage at low HP
  const berserkerMax = getPlayerStat('berserkerMaxBonus');
  if (berserkerMax > 0) {
    const hpPct = player.hp / getPlayerStat('maxHp');
    if (hpPct < 0.5) {
      const berserkerMult = 1 + berserkerMax * (1 - hpPct * 2);
      dmg *= berserkerMult;
    }
  }
  // Juggernaut active — +50% damage
  if (player.juggernautActive) dmg *= 1.5;
  // Minigun ramp-up — damage scales up after spinup (up to 2x at sustained fire)
  if (activeWeaponId === 'minigun' && minigunSpinup > 40) {
    dmg *= 1 + Math.min((minigunSpinup - 40) / 180, 1.0);
  }
  // Operator range buff
  const rangeMult = 1 + getPlayerStat('weaponRangePct');
  const range = Math.round(getWeaponStat(activeWeaponId, 'range') * rangeMult);
  // Operator fire rate buff/debuff
  const fireRateMult = 1 + getPlayerStat('fireRatePct');
  fireRate = Math.max(1, Math.round(fireRate * Math.max(0.3, fireRateMult)));

  // Akimbo — double fire rate, double spread
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
    // Overdrive — skip spinup delay but still count for ramp-up
    if (activePerkActive['minigun_overdrive']) {
      player.shootCooldown = fireRate;
    } else {
      if (minigunSpinup < 40) {
        const t = minigunSpinup / 40;
        player.shootCooldown = Math.max(fireRate, Math.round(fireRate * (6 - 5 * t * t)));
      } else {
        player.shootCooldown = fireRate;
      }
    }
  } else {
    player.shootCooldown = fireRate;
  }

  // Soldier Rush — halve fire rate cooldown
  if (isSoldierRush) {
    player.shootCooldown = Math.max(1, Math.round(player.shootCooldown * 0.5));
  }

  // Last Stand — +50% fire rate during rescue extraction
  if (typeof rescueState !== 'undefined' && rescueState === 'extracting' && hasSkill('last_stand')) {
    player.shootCooldown = Math.max(1, Math.round(player.shootCooldown * 0.5));
  }

  if (!isSoldierRush) player.ammo--;
  player.recoil = 4;
  playSoundThrottled('shoot_' + activeWeaponId, 50);
  updateHUD();

  const angle = Math.atan2((mouseY + camY) - player.y, (mouseX + camX) - player.x);

  // Slug Round — shotgun fires single heavy bullet
  const slugActive = activePerkActive['shotgun_slug'] && activeWeaponId === 'shotgun';

  const useHitscan = wpn.type === 'Auto' || activeWeaponId === 'sniper';

  if (useHitscan && timeTravelerPhase !== 'slow') {
    // Hitscan — instant ray, no bullet object
    const bulletSpread = (Math.random() - 0.5) * spread;
    const rayAngle = angle + bulletSpread;
    const rayDx = Math.cos(rayAngle);
    const rayDy = Math.sin(rayAngle);
    const maxDist = range * BULLET_SPD;

    let hitDist = maxDist;
    let hitX = player.x + rayDx * maxDist;
    let hitY = player.y + rayDy * maxDist;

    // Wall Penetration — sniper active: skip wall check
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

    // FMJ — AR passive: pierce 1 extra zombie
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
      const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
      if (perpDist < z.radius + BULLET_R) {
        hitZombies.push({ z, proj });
      }
    }
    hitZombies.sort((a, b) => a.proj - b.proj);

    const sniperExecute = activeWeaponId === 'sniper' && playerWeapons.find(w => w.weapon_id === 'sniper' && w.dmg_level >= 10);
    // FMJ pierces 2 (first + 1), sniper pierce = all
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

    // Visual tracer
    if (activeWeaponId === 'sniper') {
      hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 12, maxLife: 12, style: 'sniper' });
    } else if (activeWeaponId === 'minigun') {
      hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 3, maxLife: 3, style: 'minigun' });
    } else if (activeWeaponId === 'assault_rifle') {
      hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 8, maxLife: 8, style: 'rifle' });
    } else {
      hitTrails.push({ x1: player.x, y1: player.y, x2: hitX, y2: hitY, life: 4, maxLife: 4, style: 'auto' });
    }

  } else if (useHitscan && timeTravelerPhase === 'slow') {
    // Slowmo: convert hitscan to frozen projectile
    const bulletSpread = (Math.random() - 0.5) * spread;
    frozenBullets.push({
      x: player.x, y: player.y,
      dx: Math.cos(angle + bulletSpread) * BULLET_SPD,
      dy: Math.sin(angle + bulletSpread) * BULLET_SPD,
      life: range, damage: dmg, pierce: wpn.special === 'pierce',
      weaponId: activeWeaponId,
    });
  } else if (wpn.special === 'shotgun' && !slugActive) {
    // Shotgun keeps projectiles (5 pellets, short range)
    const targetArr = timeTravelerPhase === 'slow' ? frozenBullets : bullets;
    for (let p = 0; p < 5; p++) {
      const pelletSpread = (p - 2) * 0.12 + (Math.random() - 0.5) * spread;
      targetArr.push({
        x: player.x, y: player.y,
        dx: Math.cos(angle + pelletSpread) * BULLET_SPD,
        dy: Math.sin(angle + pelletSpread) * BULLET_SPD,
        life: range, damage: dmg, pierce: false,
        weaponId: activeWeaponId,
      });
    }
  } else if (slugActive) {
    // Slug Round — single heavy bullet, no spread, 5x damage
    const slugBullet = {
      x: player.x, y: player.y,
      dx: Math.cos(angle) * BULLET_SPD * 1.2,
      dy: Math.sin(angle) * BULLET_SPD * 1.2,
      life: range * 1.5, damage: dmg * 5, pierce: false,
      weaponId: activeWeaponId,
    };
    if (timeTravelerPhase === 'slow') frozenBullets.push(slugBullet);
    else bullets.push(slugBullet);
  } else {
    // Pistol — keep projectiles (low fire rate, few objects)
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
    // Akimbo — fire second bullet
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

  // Muzzle particles
  for (let i = 0; i < (useHitscan ? 2 : 4); i++) {
    const a = angle + (Math.random()-0.5)*0.4;
    particles.push({
      x: player.x, y: player.y,
      dx: Math.cos(a)*3*(Math.random()+0.5),
      dy: Math.sin(a)*3*(Math.random()+0.5),
      life: 6, maxLife: 6, color: '#ffcc00', r: 2,
    });
  }

  if (player.ammo === 0) {
    // Deactivate magazine-based perks on empty
    activePerkActive['pistol_akimbo'] = false;
    activePerkActive['shotgun_slug'] = false;
    activePerkActive['sniper_wallpen'] = false;
    startReload();
  }
}

// ── XP SYSTEM ─────────────────────────────────────────
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
  // Expanding ring of particles (2 concentric rings)
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
  // Central burst
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

// ── PARTICLES ────────────────────────────────────────
function spawnBlood(x, y, count = 8, dirAngle = null) {
  if (bloodDecals.length > 200) bloodDecals.shift();
  // Main splatter decal
  bloodDecals.push({ x, y, r: 6 + Math.random()*6, alpha: 0.5, shape: 'circle' });
  // Secondary directional splatter decals
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
  // Particles — spray in a direction if provided
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

// ── PLAYER MOVE ──────────────────────────────────────
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
  // Adrenalin — speed boost under 30% HP
  const adrenalinPct = getPlayerStat('adrenalinSpeedPct');
  if (adrenalinPct > 0 && player.hp < getPlayerStat('maxHp') * 0.3) {
    speed *= (1 + adrenalinPct);
  }
  // Kill Rush — temp speed boost
  if (player.killRushTimer > 0) {
    speed *= (1 + (player.killRushBoost || 0));
    player.killRushTimer--;
  }
  if (activeWeaponId === 'minigun' && mouseDown && !reloading && player.ammo > 0 && !activePerkActive['minigun_overdrive']) {
    speed *= 0.35;
  }
  // Time Traveler aktiv — massiver Speed-Boost
  if (activeOperatorId === 'time_traveler' && timeTravelerPhase !== 'none') {
    speed *= 1.8;
  }
  // Boss stomp slow
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

// ── DAMAGE PIPELINE ─────────────────────────────────
function damagePlayer(rawDamage, source) {
  // source: 'melee' or 'ranged' (spitter projectile)
  const reduction = getPlayerStat('damageReductionPct');
  let damage = Math.round(rawDamage * (1 - reduction));

  // Ghost — reduce melee damage
  if (source === 'melee') {
    const ghostRed = getPlayerStat('ghostReduction');
    if (ghostRed > 0) damage = Math.round(damage * (1 - ghostRed));
  }

  // Iron Skin — block next hit every 60s
  if (hasSkill('iron_skin') && player.ironSkinReady) {
    player.ironSkinReady = false;
    player.ironSkinCooldownTime = performance.now() + 60000; // 60s
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
    player.hp = Math.round(getPlayerStat('maxHp') * 0.3);
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

// Helper to apply movement with wall sliding (hoisted out of loop for perf)
function applyMove(entity, mx, my, collR) {
  // Try full diagonal move
  if (!wallCollide(entity.x + mx, entity.y + my, collR)) {
    entity.x += mx;
    entity.y += my;
    return true;
  }
  // Try each axis independently (wall sliding)
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
  // Both axes blocked — try half-steps for corner scraping
  const halfMx = mx * 0.5, halfMy = my * 0.5;
  if (!wallCollide(entity.x + halfMx, entity.y, collR)) {
    entity.x += halfMx;
    return true;
  }
  if (!wallCollide(entity.x, entity.y + halfMy, collR)) {
    entity.y += halfMy;
    return true;
  }
  // Corner rounding — find nearest wall corner and slide tangentially
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
      if (walls === 0 || walls === 4) continue; // no corner
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
    // Tangent perpendicular to corner-normal, choose direction aligned with movement
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
  // Last resort — perpendicular nudge
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

// ── SPATIAL HASH FOR ZOMBIE SEPARATION ───────────────
const ZHASH_CELL = 80; // ~2 tiles, covers max zombie radius overlap
const _zombieHash = new Map();

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


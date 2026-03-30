// ── HUD UPDATE ───────────────────────────────────────
function updateHUD() {
  const hpEl = document.getElementById('hp-val');
  hpEl.textContent = Math.max(0, Math.floor(player.hp));
  hpEl.className = 'hud-val' + (player.hp <= 30 ? ' danger' : '');
  const pct = Math.max(0, player.hp / player.maxHp);
  const bar = document.getElementById('hp-bar');
  bar.style.width = (pct * 100) + '%';
  bar.style.background = pct > 0.6 ? '#33cc44' : pct > 0.3 ? '#ccaa00' : '#cc2200';

  document.getElementById('ammo-val').textContent = player.ammo;
  const maxAmmo = getWeaponStat(activeWeaponId, 'mag');
  const pips = document.getElementById('ammo-display');
  const pipCount = Math.min(maxAmmo, 40);
  // Only rebuild DOM if pip count changed
  if (pips.children.length !== pipCount) {
    pips.innerHTML = '';
    for (let i = 0; i < pipCount; i++) {
      const d = document.createElement('div');
      d.className = 'bullet-pip empty';
      pips.appendChild(d);
    }
  }
  // Just toggle classes
  for (let i = 0; i < pips.children.length; i++) {
    pips.children[i].className = 'bullet-pip' + (i < player.ammo ? '' : ' empty');
  }

  if (player.maxShield > 0) {
    const shieldPct = player.shield / player.maxShield;
    document.getElementById('shield-bar').style.width = (shieldPct * 100) + '%';
  }

  // Dash display is updated in updateDash() every frame
}

// ── XP SYNC ─────────────────────────────────────────
function syncXp() {
  if (!authToken || pendingXp <= 0) return;
  const xpToSync = pendingXp;
  pendingXp = 0;
  globalXp += xpToSync;
  fetch('/api/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ xp: xpToSync })
  }).then(res => {
    if (!res.ok) { pendingXp += xpToSync; globalXp -= xpToSync; }
  }).catch(() => {
    pendingXp += xpToSync;
    globalXp -= xpToSync;
  });
}

// ── GOLD SYNC ────────────────────────────────────────
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
  }).then(res => {
    if (!res.ok) { pendingGold += goldToSync; pendingDiamonds += diaToSync; globalGold -= goldToSync; globalDiamonds -= diaToSync; }
  }).catch(() => {
    pendingGold += goldToSync;
    pendingDiamonds += diaToSync;
    globalGold -= goldToSync;
    globalDiamonds -= diaToSync;
  });
}

// ── GAME OVER ────────────────────────────────────────
async function gameOver() {
  running = false;
  playSound('death');
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
      const res = await fetch('/api/death', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (res.ok) {
        const data = await res.json();
        globalXp = data.xp;
        globalGold = 0;
        // globalDiamonds stays — diamonds persist through death
      }
    } catch {}
  }

  // Reset weapons and perks on death — back to pistol only
  playerWeapons = [];
  ownedWeaponIds = ['pistol'];
  setActiveWeapon('pistol');
  globalGold = 0;
  ownedPerks = [];
  activePerkCooldowns = {};
  activePerkActive = {};
  operatorAbilityCooldown = 0;
  operatorAbilityActive = false;
  operatorAbilityTimer = 0;
  for (const b of builderBlocks) { if (!camActive && MAP[b.y] && MAP[b.y][b.x] === 2) MAP[b.y][b.x] = 0; }
  builderBlocks = [];
  turrets = [];
  mapCacheCanvas = null;

  const totalEarned = score;
  lastRunText = 'GESTORBEN: Wave ' + wave + '  |  +' + totalEarned + ' XP  |  75% VERLOREN';
  showGameMenu();
}

// ── DASH SYSTEM ──────────────────────────────────────
function tryDash() {
  if (!getPlayerStat('dashUnlocked')) return;
  if (dashActive) return;
  const charge = dashCharges.find(c => c.ready);
  if (!charge) return;

  charge.ready = false;
  charge.cooldownStart = performance.now();
  dashActive = true;
  dashProgress = 0;
  playSound('dash');
  dashStartX = player.x;
  dashStartY = player.y;

  const dist = getPlayerStat('dashDistance');
  // Dash direction from WASD input, not mouse aim
  let ddx = 0, ddy = 0;
  if (keys[keybinds.moveUp])    ddy -= 1;
  if (keys[keybinds.moveDown])  ddy += 1;
  if (keys[keybinds.moveLeft])  ddx -= 1;
  if (keys[keybinds.moveRight]) ddx += 1;
  // Fallback to aim direction if no movement keys held
  if (ddx === 0 && ddy === 0) {
    ddx = Math.cos(player.angle);
    ddy = Math.sin(player.angle);
  } else {
    const dl = Math.sqrt(ddx*ddx + ddy*ddy);
    ddx /= dl; ddy /= dl;
  }
  dashTargetX = player.x + ddx * dist;
  dashTargetY = player.y + ddy * dist;

  if (hasSkill('phantom_dash')) {
    player.dashInvulnerable = true;
    dashAfterimage = { x: player.x, y: player.y, angle: player.angle, timer: 90 };
  }
}

function updateDash() {
  const cd = getPlayerStat('dashCooldown') * 1000;
  const now = performance.now();
  for (const c of dashCharges) {
    if (!c.ready && now - c.cooldownStart >= cd) {
      c.ready = true;
    }
  }

  if (dashActive) {
    dashProgress += 0.15;
    if (dashProgress >= 1) {
      dashProgress = 1;
      dashActive = false;
      player.dashInvulnerable = false;

      if (hasSkill('bullet_time')) {
        bulletTimeTimer = 120;
        bulletTimeX = player.x;
        bulletTimeY = player.y;
      }
    }

    const t = dashProgress;
    const nx = dashStartX + (dashTargetX - dashStartX) * t;
    const ny = dashStartY + (dashTargetY - dashStartY) * t;

    if (!wallCollide(nx, player.y, PLAYER_R - 2)) player.x = nx;
    if (!wallCollide(player.x, ny, PLAYER_R - 2)) player.y = ny;

    for (let i = 0; i < 2; i++) {
      particles.push({
        x: player.x + (Math.random()-0.5)*10,
        y: player.y + (Math.random()-0.5)*10,
        dx: (Math.random()-0.5)*2, dy: (Math.random()-0.5)*2,
        life: 10, maxLife: 10, color: '#33aaff', r: 3,
      });
    }
  }

  if (dashAfterimage) {
    dashAfterimage.timer--;
    if (dashAfterimage.timer <= 0) dashAfterimage = null;
  }

  if (bulletTimeTimer > 0) bulletTimeTimer--;

  // Update dash HUD every frame
  const dashEl = document.getElementById('dash-display');
  if (getPlayerStat('dashUnlocked') && dashCharges.length > 0) {
    dashEl.style.display = 'flex';
    for (let i = 0; i < dashCharges.length; i++) {
      let pip = dashEl.children[i];
      if (!pip) {
        pip = document.createElement('div');
        dashEl.appendChild(pip);
      }
      const ready = dashCharges[i].ready;
      pip.style.cssText = 'width:8px;height:16px;border:1px solid ' + (ready ? '#33aaff' : '#333') + ';background:' + (ready ? '#33aaff44' : 'transparent');
    }
    // Remove extra pips
    while (dashEl.children.length > dashCharges.length) dashEl.removeChild(dashEl.lastChild);
  } else {
    dashEl.style.display = 'none';
  }
}

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

// ── MAIN LOOP ────────────────────────────────────────
function loop(now) {
  if (!running) return;
  if (!player._lastFrameTime) player._lastFrameTime = now;
  const dt = Math.min((now - player._lastFrameTime) / 1000, 0.05); // seconds, capped at 50ms
  player._lastFrameTime = now;
  frameCount++;

  movePlayer();

  // Update flowfield
  if (frameCount - lastFlowfieldUpdate > 5) {
    if (camActive && flowfield) {
      // City: recompute if player moved >2 tiles from flowfield center
      const ptx = Math.floor(player.x / TILE);
      const pty = Math.floor(player.y / TILE);
      if (Math.abs(ptx - ffCenterCol) > 2 || Math.abs(pty - ffCenterRow) > 2) {
        computeFlowfield();
      }
    } else {
      computeFlowfield();
    }
    lastFlowfieldUpdate = frameCount;
  }

  updateDash();
  updateOperatorAbility();
  updateRescue(performance.now());
  // Semi/Single weapons: only fire on initial click, not hold
  const wpnType = WEAPONS[activeWeaponId] ? WEAPONS[activeWeaponId].type : 'Auto';
  if (wpnType === 'Semi' || wpnType === 'Single') {
    if (mouseDown && !player._lastMouseDown) tryShoot();
  } else {
    if (mouseDown) tryShoot();
  }
  player._lastMouseDown = mouseDown;
  if (!mouseDown) minigunSpinup = 0;
  updateZombies();
  updateBossAbilities();
  updateToxicPools();
  updateSpecialZombies();
  updateBroodEggs();
  updateBullets();
  updateSpitterProjectiles();
  updateHealZones();
  updateTimeManipulation();
  updateParticles();
  updateFloatingTexts();
  updateHitTrails();
  updateReload(now);
  updateBuilderBlocks();
  updateTurrets();

  // Perk cooldown ticks
  for (const perkId in activePerkCooldowns) {
    if (activePerkCooldowns[perkId] > 0) activePerkCooldowns[perkId]--;
  }

  // Shield regen
  if (player.maxShield > 0) {
    if (player.shield < player.maxShield) {
      player.shieldRegenTimer += dt;
      const delay = getPlayerStat('shieldRegenDelay');
      if (player.shieldRegenTimer >= delay) {
        let rate = getPlayerStat('shieldRegenRate');
        if (hasSkill('fortress')) rate *= 2;
        player.shield = Math.min(player.shield + rate * dt, player.maxShield);
      }
    }
  }

  // HP Regen
  if (!player.lastDamageTime) player.lastDamageTime = 0;
  const regenRate = getPlayerStat('regenHpPerSec');
  if (regenRate > 0 && player.hp < getPlayerStat('maxHp')) {
    const timeSinceDamage = (frameCount - player.lastDamageTime) / 60;
    if (timeSinceDamage > 3) {
      player.hp = Math.min(Math.round((player.hp + regenRate * dt) * 10) / 10, getPlayerStat('maxHp'));
    }
  }

  // Iron Skin cooldown (time-based)
  if (player.ironSkinCooldownTime && now >= player.ironSkinCooldownTime) {
    player.ironSkinReady = true;
    player.ironSkinCooldownTime = 0;
  }

  if (pendingXp > 0 && now - lastXpSync > XP_SYNC_INTERVAL) {
    syncXp();
    lastXpSync = now;
  }

  if ((pendingGold > 0 || pendingDiamonds > 0) && now - lastGoldSync > GOLD_SYNC_INTERVAL) {
    syncGold();
    lastGoldSync = now;
  }

  tryTimerHealthpack();
  tryTimerAmmopack();
  updateHealthpacks();
  updateAmmopacks();

  // death animations
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z.alive && z.deathTimer > 0) {
      z.deathTimer--;
      if (z.deathTimer <= 0) zombies.splice(i, 1);
    }
  }

  // screenshake
  let shakeActive = false;
  if (shakeTimer > 0) {
    shakeTimer--;
    const sx = (Math.random() - 0.5) * 2 * shakeMagnitude;
    const sy = (Math.random() - 0.5) * 2 * shakeMagnitude;
    ctx.save();
    ctx.translate(sx, sy);
    shakeActive = true;
  }

  // Camera
  if (camActive) {
    camX = player.x - W / 2;
    camY = player.y - H / 2;
  } else {
    camX = 0; camY = 0;
  }

  // Draw
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (camActive) ctx.translate(-camX, -camY);

  drawMap();
  drawBuilderBlocks();
  drawTurrets();
  drawBloodDecals();
  drawHealthpacks();
  drawAmmopacks();
  drawRescueCircle();
  drawParticles();
  drawFloatingTexts();
  drawHitTrails();
  drawBullets();
  drawSpitterProjectiles();
  drawHealZones();
  drawToxicPools();
  drawBroodEggs();
  drawFrozenBullets();
  zombies.forEach(drawZombie);
  drawDashAfterimage();
  drawPlayer();

  ctx.restore(); // back to screen space
  drawMinimap();

  // Hurt flash — red vignette from edges
  if (hurtFlash > 0) {
    const intensity = (hurtFlash / 18) * 0.6;
    const vignetteGrad = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.min(W,H)*0.7);
    vignetteGrad.addColorStop(0, 'rgba(180,0,0,0)');
    vignetteGrad.addColorStop(0.6, `rgba(180,0,0,${intensity * 0.15})`);
    vignetteGrad.addColorStop(1, `rgba(200,0,0,${intensity})`);
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, W, H);
    hurtFlash--;
  }

  // Time manipulation visual overlay
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

  // Stun visual
  if (playerStunTimer > 0) {
    ctx.save();
    // radial blur-like vignette
    const stunPct = playerStunTimer / 30;
    const stunGrd = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.15, W/2, H/2, Math.min(W,H)*0.6);
    stunGrd.addColorStop(0, 'rgba(180, 150, 60, 0)');
    stunGrd.addColorStop(0.5, `rgba(160, 130, 40, ${stunPct * 0.08})`);
    stunGrd.addColorStop(1, `rgba(140, 110, 30, ${stunPct * 0.2})`);
    ctx.fillStyle = stunGrd;
    ctx.fillRect(0, 0, W, H);
    // concentric rings pulsing outward from player
    ctx.globalAlpha = stunPct * 0.15;
    ctx.strokeStyle = '#ddaa44';
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 3; ring++) {
      const ringR = 30 + ring * 25 + (30 - playerStunTimer) * 3;
      ctx.beginPath(); ctx.arc(player.x, player.y, ringR, 0, Math.PI * 2); ctx.stroke();
    }
    // text with shake
    const shakeX = (Math.random() - 0.5) * 4 * stunPct;
    const shakeY = (Math.random() - 0.5) * 3 * stunPct;
    ctx.globalAlpha = 0.6 + stunPct * 0.4;
    ctx.font = "bold 18px 'Oswald', sans-serif";
    ctx.fillStyle = '#ddaa44';
    ctx.textAlign = 'center';
    ctx.fillText('STUNNED', W/2 + shakeX, H/2 - 30 + shakeY);
    ctx.restore();
  }

  // Score display
  ctx.save();
  ctx.font = "12px 'JetBrains Mono'";
  ctx.fillStyle = '#404050';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE  ${score}`, W - 14, H - 14);
  ctx.restore();

  // Perk HUD — show perks for current weapon
  {
    const wpnPerks = Object.entries(PERK_DEFS).filter(([id, p]) => p.weaponId === activeWeaponId && ownedPerks.includes(id));
    // Draw perks left-center, below operator HUD
    const opOffset = activeOperatorId ? 40 : 0;
    let py = H/2 + 50 + opOffset;
    ctx.save();
    for (const [perkId, perk] of wpnPerks) {
      const cd = activePerkCooldowns[perkId] || 0;
      const isActive = activePerkActive[perkId];
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = 'left';
      if (perk.type === 'active') {
        if (cd > 0 && !isActive) {
          ctx.fillStyle = '#555';
          ctx.fillText('[E] ' + perk.name + ' ' + Math.ceil(cd / 60) + 's', 16, py);
        } else {
          ctx.fillStyle = isActive ? '#33cc44' : '#ffaa00';
          ctx.fillText('[E] ' + perk.name + (isActive ? ' AKTIV' : ' BEREIT'), 16, py);
        }
      } else {
        ctx.fillStyle = '#8866cc';
        ctx.fillText(perk.icon + ' ' + perk.name, 16, py);
      }
      py += 16;
    }
    ctx.restore();
  }

  drawRescueHUD();
  drawOperatorHUD();

  if (shakeActive) ctx.restore();

  requestAnimationFrame(loop);
}

function drawOperatorHUD() {
  if (!activeOperatorId || !OPERATORS[activeOperatorId]) return;
  const op = OPERATORS[activeOperatorId];
  const lx = 16, ly = H/2 + 50;

  ctx.save();
  // Operator name
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#556070';
  ctx.textAlign = 'left';
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


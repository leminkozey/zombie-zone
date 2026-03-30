// ── ZOMBIE UPDATE ────────────────────────────────────
function updateZombies() {
  buildZombieHash();
  for (const z of zombies) {
    if (!z.alive) continue;

    // Burn DOT
    if (z.burnTimer > 0) {
      z.burnTimer--;
      z.hp -= applyBossDamage(z, z.burnDps / 60);
      // Fire particles
      if (z.frame % 6 === 0) {
        particles.push({ x: z.x + (Math.random()-0.5)*10, y: z.y + (Math.random()-0.5)*10, dx: (Math.random()-0.5)*2, dy: -1 - Math.random(), life: 12, maxLife: 12, color: '#ff6600', r: 3 });
      }
      if (z.hp <= 0 && z.alive) { z.alive = false; z.deathTimer = z.isBoss ? 60 : 30; onZombieKill(z); continue; }
    }
    // Cryo slow tick
    if (z.cryoTimer > 0) z.cryoTimer--;

    // Shielder shield regen
    if (z.type === 'shielder' && !z.shieldBroken && z.shieldHp < z.shieldMaxHp) {
      if (z.shieldRegenTimer > 0) {
        z.shieldRegenTimer--;
      } else {
        z.shieldHp = Math.min(z.shieldHp + 0.05, z.shieldMaxHp);
      }
    }

    // Movement collision radius — smaller than visual to prevent corner-catching
    const moveR = z.radius * 0.6;

    // ── Aggressive push out of walls ──
    if (wallCollide(z.x, z.y, moveR)) {
      // Try cardinal pushes with increasing force
      const pushDirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      let escaped = false;
      for (let force = 2; force <= 20 && !escaped; force += 2) {
        for (const [pdx, pdy] of pushDirs) {
          const testX = z.x + pdx * force;
          const testY = z.y + pdy * force;
          if (!wallCollide(testX, testY, moveR)) {
            z.x = testX;
            z.y = testY;
            escaped = true;
            break;
          }
        }
      }
      // Still stuck — teleport to nearest free tile center
      if (!escaped) {
        const free = nearestFreeTileCenter(z.x, z.y);
        z.x = free.x;
        z.y = free.y;
      }
    }

    z.frame++;
    z.wobble += 0.08;

    // Track previous position for stuck detection
    if (z.frame % 3 === 0) {
      const movedDx = z.x - z.prevX;
      const movedDy = z.y - z.prevY;
      const movedDist = movedDx * movedDx + movedDy * movedDy;
      if (movedDist < 1) {
        z.stuckFrames += 3;
      } else {
        z.stuckFrames = 0;
      }
      z.prevX = z.x;
      z.prevY = z.y;
    }

    const dx = player.x - z.x;
    const dy = player.y - z.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    z.angle = Math.atan2(dy, dx);

    // ── Tiered stuck recovery ──
    if (z.stuckFrames >= 20) {
      if (z.stuckFrames < 60) {
        // Mild stuck: jiggle — add random perpendicular offset to movement
        const jdx = player.x - z.x, jdy = player.y - z.y;
        const jlen = Math.sqrt(jdx * jdx + jdy * jdy);
        if (jlen > 1) {
          const perpX = -jdy / jlen, perpY = jdx / jlen;
          const jiggle = (Math.random() - 0.5) * 4;
          const mx = (jdx / jlen + perpX * jiggle) * z.speed;
          const my = (jdy / jlen + perpY * jiggle) * z.speed;
          applyMove(z, mx, my, moveR);
        }
        continue;
      } else if (z.stuckFrames < 120) {
        // Medium stuck: move toward nearest free tile center (respecting walls)
        const free = nearestFreeTileCenter(z.x, z.y);
        const toDx = free.x - z.x, toDy = free.y - z.y;
        const toLen = Math.sqrt(toDx * toDx + toDy * toDy);
        if (toLen > 2) {
          applyMove(z, (toDx / toLen) * z.speed * 1.5, (toDy / toLen) * z.speed * 1.5, moveR);
        }
        continue;
      } else {
        // Hard stuck: teleport to nearest free tile (last resort)
        const free = nearestFreeTileCenter(z.x, z.y);
        z.x = free.x;
        z.y = free.y;
        z.stuckFrames = 0;
        continue;
      }
    }

    // skip normal movement for charging brute
    if (z.isBoss && z.bossType === 'brute' && z.charging) continue;
    if (z.burrowed) continue;

    if (dashAfterimage && z.type !== 'spitter') {
      const adx = dashAfterimage.x - z.x, ady = dashAfterimage.y - z.y;
      const adist = Math.sqrt(adx*adx + ady*ady);
      if (adist < 150) {
        const spd = z.speed * timeScale;
        applyMove(z, (adx/adist) * spd, (ady/adist) * spd, moveR);
        z.angle = Math.atan2(ady, adx);
        continue;
      }
    }

    // spitter distance-keeping
    if ((z.type === 'spitter' || z.type === 'screamer' || z.type === 'healer') && dist > 1) {
      if (dist < 150) {
        // flee from player
        const spd = z.speed * timeScale;
        applyMove(z, -(dx/dist) * spd, -(dy/dist) * spd, moveR);
      }
      // if dist 150-200, do nothing (hold position)
      // if dist > 200, fall through to normal movement below
    }

    // Turret aggro override
    let turretAggroed = false;
    if (turrets.length > 0) {
      for (const t of turrets) {
        if (t.aggroTimer > 0) {
          const tdx = t.x - z.x, tdy = t.y - z.y;
          const tdist = Math.sqrt(tdx*tdx + tdy*tdy);
          if (tdist < 200 && tdist > 15) {
            const spd = z.speed * timeScale;
            const cryoMult = z.cryoTimer > 0 ? 0.7 : 1.0;
            const mx = (tdx/tdist) * spd * cryoMult;
            const my = (tdy/tdist) * spd * cryoMult;
            applyMove(z, mx, my, moveR);
            z.angle = Math.atan2(tdy, tdx);
            turretAggroed = true;
            break;
          }
        }
      }
    }

    if (!turretAggroed && !(z.type === 'spitter' && dist <= 200) && dist > 1) {
      const spd = z.speed;
      const aggroMult = player.hp < player.maxHp * 0.3 ? 1.2 : 1.0;
      let bulletTimeMult = 1.0;
      if (bulletTimeTimer > 0) {
        const btdx = z.x - bulletTimeX, btdy = z.y - bulletTimeY;
        if (btdx*btdx + btdy*btdy < 200*200) bulletTimeMult = 0.5;
      }
      const cryoMult = z.cryoTimer > 0 ? 0.7 : 1.0;
      const screamMult = z.screamBuff > 0 ? 1.3 : 1.0;
      const finalSpeed = spd * aggroMult * bulletTimeMult * cryoMult * timeScale * screamMult;

      const dirX = dx / dist;
      const dirY = dy / dist;

      let moveX, moveY;

      // Line-of-sight check (cache per zombie, recheck every 6 frames)
      if (z.frame % 6 === 0 || z._los === undefined) {
        z._los = hasLineOfSight(z.x, z.y, player.x, player.y);
      }

      if (dist < TILE * 0.8 || z._los) {
        // Clear path to player — walk straight
        moveX = dirX * finalSpeed;
        moveY = dirY * finalSpeed;
      } else if (flowfield) {
        // Obstacle in the way — follow flowfield around it
        const smooth = getSmoothedFlowDir(z.x, z.y);
        if (smooth && (smooth.dx !== 0 || smooth.dy !== 0)) {
          moveX = smooth.dx * finalSpeed;
          moveY = smooth.dy * finalSpeed;
        } else {
          moveX = dirX * finalSpeed;
          moveY = dirY * finalSpeed;
        }
      } else {
        moveX = dirX * finalSpeed;
        moveY = dirY * finalSpeed;
      }

      // Apply movement with wall collision + corner rounding
      if (!applyMove(z, moveX, moveY, moveR) && !z._los) {
        // Completely blocked while pathfinding — try perpendicular to flowfield dir
        const pLen = Math.sqrt(moveX * moveX + moveY * moveY);
        if (pLen > 0.01) {
          const perpX = -moveY / pLen * finalSpeed * 0.7;
          const perpY = moveX / pLen * finalSpeed * 0.7;
          // Pick whichever perpendicular direction makes progress toward player
          const dot1 = perpX * dirX + perpY * dirY;
          if (dot1 > 0) {
            applyMove(z, perpX, perpY, moveR);
          } else {
            applyMove(z, -perpX, -perpY, moveR);
          }
        }
      }
    }

    // spitter shooting — only if line of sight to player
    if (z.type === 'spitter' && z.alive) {
      z.shootCooldown -= timeScale;
      if (z.shootCooldown <= 0 && dist < 300 && hasLineOfSight(z.x, z.y, player.x, player.y)) {
        z.shootCooldown = 150; // ~2.5s at 60fps
        z.throwAnim = 8;
        const shootAngle = Math.atan2(player.y - z.y, player.x - z.x);
        spitterProjectiles.push({
          x: z.x, y: z.y,
          dx: Math.cos(shootAngle) * 5,
          dy: Math.sin(shootAngle) * 5,
          life: 80,
        });
      }
    }

    if (z.throwAnim > 0) z.throwAnim--;

    // Zombie hits player (full radius for combat)
    if (dist < PLAYER_R + z.radius - 2) {
      const hitCooldown = timeScale < 1 ? Math.ceil(40 / timeScale) : 40;
      if (!z.hitting || frameCount - z.lastHit > hitCooldown) {
        z.lastHit = frameCount;
        damagePlayer(z.screamBuff > 0 ? 10 : 8, 'melee');
      }
      z.hitting = true;
      // Juggernaut active — contact damage to zombie
      if (player.juggernautActive) {
        z.hp -= applyBossDamage(z, 5 / 60); // 5 DPS, per frame
        if (z.hp <= 0 && z.alive) { z.alive = false; z.deathTimer = z.isBoss ? 60 : 30; onZombieKill(z); }
      }
    } else {
      z.hitting = false;
    }

    // Zombie-zombie separation (spatial hash — O(n) avg)
    const zcx = Math.floor(z.x / ZHASH_CELL);
    const zcy = Math.floor(z.y / ZHASH_CELL);
    for (let ndy = -1; ndy <= 1; ndy++) {
      for (let ndx = -1; ndx <= 1; ndx++) {
        const nkey = (zcx + ndx) * 100000 + (zcy + ndy);
        const cell = _zombieHash.get(nkey);
        if (!cell) continue;
        for (const z2 of cell) {
          if (z2 === z) continue;
          const ex = z.x - z2.x, ey = z.y - z2.y;
          const ed = Math.sqrt(ex * ex + ey * ey);
          if (ed < z.radius + z2.radius && ed > 0) {
            const push = (z.radius + z2.radius - ed) / 2 * 0.3;
            z.x += (ex / ed) * push; z.y += (ey / ed) * push;
            z2.x -= (ex / ed) * push; z2.y -= (ey / ed) * push;
          }
        }
      }
    }

    // Zombies attack adjacent builder blocks
    if (builderBlocks.length > 0) {
      const ztx = Math.floor(z.x / TILE);
      const zty = Math.floor(z.y / TILE);
      for (const b of builderBlocks) {
        if (Math.abs(b.x - ztx) <= 1 && Math.abs(b.y - zty) <= 1 && (!camActive && MAP[b.y] && MAP[b.y][b.x] === 2) && !b.reinforced) {
          if (z.frame % 40 === 0) {
            b.hp -= 1;
            b.placedAt = frameCount; // reset heal timer on damage
          }
        }
      }
    }
  }
}

function updateBossAbilities() {
  for (const z of zombies) {
    if (!z.alive || !z.isBoss || z.hasSplit) continue;

    if (z.bossType === 'necromancer') {
      const cfg = BOSS_CONFIGS.necromancer;

      z.minions = z.minions.filter(m => m.alive);
      z.shielded = z.minions.length > 0;

      // summon
      z.summonCooldown--;
      if (z.summonCooldown <= 0 && z.minions.length < cfg.maxMinions) {
        z.summonCooldown = cfg.summonCooldown;
        const count = cfg.summonCount[0] + Math.floor(Math.random() * (cfg.summonCount[1] - cfg.summonCount[0] + 1));
        let actualSpawned = 0;
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
          actualSpawned++;
          for (let p = 0; p < 5; p++) {
            particles.push({ x: sx, y: sy, dx: (Math.random()-0.5)*4, dy: (Math.random()-0.5)*4, life: 15, maxLife: 15, color: '#8833cc', r: 3 });
          }
        }
        floatingTexts.push({ x: z.x, y: z.y - 20, text: 'SUMMON!', life: 40, maxLife: 40, color: '#9944dd' });
        waveTotal += actualSpawned;
      }

      // blink
      z.blinkCooldown--;
      if (z.blinkCooldown <= 0) {
        z.blinkCooldown = cfg.blinkCooldown;
        const angle = Math.random() * Math.PI * 2;
        const dist = cfg.blinkMinDist + Math.random() * (cfg.blinkMaxDist - cfg.blinkMinDist);
        let nx = z.x + Math.cos(angle) * dist;
        let ny = z.y + Math.sin(angle) * dist;
        nx = Math.max(TILE * 2, Math.min(nx, (COLS - 2) * TILE));
        ny = Math.max(TILE * 2, Math.min(ny, (ROWS - 2) * TILE));
        if (wallCollide(nx, ny, z.radius)) {
          const free = nearestFreeTileCenter(nx, ny);
          nx = free.x; ny = free.y;
        }
        for (let p = 0; p < 8; p++) {
          particles.push({ x: z.x, y: z.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3, life: 25, maxLife: 25, color: '#6622aa', r: 4 });
        }
        z.x = nx; z.y = ny;
        for (let p = 0; p < 6; p++) {
          particles.push({ x: nx, y: ny, dx: (Math.random()-0.5)*4, dy: (Math.random()-0.5)*4, life: 20, maxLife: 20, color: '#44ff88', r: 3 });
        }
      }
    }

    if (z.bossType === 'abomination') {
      const cfg = BOSS_CONFIGS.abomination;

      z.toxicCooldown--;
      if (z.toxicCooldown <= 0 && toxicPools.length < cfg.maxPools) {
        z.toxicCooldown = cfg.toxicCooldown;
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
        for (let i = 0; i < 6; i++) {
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
          particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*5, dy: Math.sin(a)*5, life: 20, maxLife: 20, color: '#66cc33', r: 3 });
        }
      }
    }

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
        if (z.frame % 3 === 0) {
          particles.push({ x: z.x, y: z.y, dx: (Math.random()-0.5)*3, dy: (Math.random()-0.5)*3, life: 15, maxLife: 15, color: '#cc2200', r: 4 });
        }
        const cdx = player.x - z.x, cdy = player.y - z.y;
        const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
        if (cdist < cfg.chargeAoe) {
          damagePlayer(cfg.chargeDmg, 'boss_charge');
          triggerScreenshake(8, 18);
          z.charging = false;
          z.chargeCooldown = cfg.chargeCooldown;
        } else if (z.chargeTimer <= 0 || wallCollide(z.x, z.y, z.radius * 0.6)) {
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

  if (bossSlowTimer > 0) bossSlowTimer--;
}

function applyShieldDamage(z, dmg, sourceX, sourceY) {
  if (z.type !== 'shielder' || z.shieldBroken || z.shieldHp <= 0) return dmg;
  const angleToSource = Math.atan2(sourceY - z.y, sourceX - z.x);
  let angleDiff = angleToSource - z.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const fromFront = Math.abs(angleDiff) < Math.PI / 3;
  if (fromFront) {
    z.shieldHp -= dmg * 0.2;
    z.shieldRegenTimer = 300;
    if (z.shieldHp <= 0) {
      z.shieldHp = 0;
      z.shieldBroken = true;
      floatingTexts.push({ x: z.x, y: z.y - 15, text: 'SHIELD BROKEN', life: 40, maxLife: 40, color: '#6688aa' });
    }
    return dmg * 0.2;
  }
  return dmg;
}

function applyBossDamage(z, dmg, sourceX, sourceY) {
  if (z.burrowed) return 0;
  if (z.isBoss && z.bossType === 'necromancer' && z.shielded) {
    dmg = dmg * BOSS_CONFIGS.necromancer.shieldReduction;
  }
  if (sourceX !== undefined && sourceY !== undefined) {
    dmg = applyShieldDamage(z, dmg, sourceX, sourceY);
  }
  return dmg;
}

function updateToxicPools() {
  for (let i = toxicPools.length - 1; i >= 0; i--) {
    const p = toxicPools[i];
    p.life--;
    if (p.life <= 0) { toxicPools.splice(i, 1); continue; }
    const dx = player.x - p.x, dy = player.y - p.y;
    if (Math.sqrt(dx*dx + dy*dy) < p.radius + PLAYER_R) {
      damagePlayer(p.dps / 60, 'toxic');
    }
  }
}

function drawToxicPools() {
  for (const p of toxicPools) {
    const fadeIn = Math.min(p.life / 30, 1);
    const baseAlpha = fadeIn * (0.22 + Math.sin(frameCount * 0.06 + p.x) * 0.06);
    ctx.save();
    // outer toxic ring
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.strokeStyle = '#55aa22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (0.95 + Math.sin(frameCount * 0.04) * 0.05), 0, Math.PI * 2);
    ctx.stroke();
    // inner pool — multi-layer gradient
    ctx.globalAlpha = baseAlpha;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    grd.addColorStop(0, '#88ee44');
    grd.addColorStop(0.3, '#66cc33');
    grd.addColorStop(0.7, '#338811');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // animated surface bubbles
    if (frameCount % 8 === 0 && p.life > 20) {
      const ba = Math.random() * Math.PI * 2;
      const bd = Math.random() * p.radius * 0.7;
      particles.push({
        x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd,
        dx: (Math.random()-0.5) * 0.5, dy: -0.8 - Math.random() * 0.5,
        life: 12, maxLife: 12, color: Math.random() > 0.5 ? '#88ee44' : '#aaff66', r: 1 + Math.random() * 1.5,
      });
    }
    ctx.restore();
  }
}

function updateSpecialZombies() {
  for (const z of zombies) {
    if (!z.alive) continue;

    // Screamer buff
    if (z.type === 'screamer') {
      z.screamCooldown -= timeScale;
      if (z.screamCooldown <= 0) {
        z.screamCooldown = 300;
        for (const oz of zombies) {
          if (!oz.alive || oz === z) continue;
          const dx = oz.x - z.x, dy = oz.y - z.y;
          if (Math.sqrt(dx*dx + dy*dy) < 120) {
            oz.screamBuff = 180;
          }
        }
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
        const dx = player.x - z.x, dy = player.y - z.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1) {
          const spd = z.speed * 1.5;
          z.x += (dx / dist) * spd;
          z.y += (dy / dist) * spd;
        }
        if (z.burrowTimer <= 0 || dist < 80) {
          z.burrowed = false;
          z.burrowCooldown = 360;
          // push out of wall if emerged inside one
          if (wallCollide(z.x, z.y, z.radius)) {
            const free = nearestFreeTileCenter(z.x, z.y);
            z.x = free.x; z.y = free.y;
          }
          const sdx = player.x - z.x, sdy = player.y - z.y;
          if (Math.sqrt(sdx*sdx + sdy*sdy) < 40) {
            playerStunTimer = 30;
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*3, dy: Math.sin(a)*3 - 1, life: 18, maxLife: 18, color: '#886644', r: 3 });
          }
          floatingTexts.push({ x: z.x, y: z.y - 15, text: 'BURROW!', life: 30, maxLife: 30, color: '#887744' });
        }
      } else {
        z.burrowCooldown -= timeScale;
        if (z.burrowCooldown <= 0) {
          z.burrowed = true;
          z.burrowTimer = 90;
          for (let i = 0; i < 6; i++) {
            particles.push({ x: z.x + (Math.random()-0.5)*10, y: z.y, dx: (Math.random()-0.5)*2, dy: 1 + Math.random(), life: 15, maxLife: 15, color: '#665533', r: 2 });
          }
        }
      }
    }

    // Broodmother egg laying
    if (z.type === 'broodmother') {
      z.eggCooldown -= timeScale;
      if (z.eggCooldown <= 0 && z.eggs < 3) {
        z.eggCooldown = 480;
        z.eggs++;
        broodEggs.push({
          x: z.x, y: z.y,
          hatchTimer: 180,
          hp: 3, maxHp: 3,
          alive: true,
          owner: z,
        });
        floatingTexts.push({ x: z.x, y: z.y - 10, text: 'EGG!', life: 30, maxLife: 30, color: '#aa8866' });
      }
    }

    // Decrement scream buff on all zombies
    if (z.screamBuff > 0) z.screamBuff--;
  }

  if (playerStunTimer > 0) playerStunTimer--;
}

function updateBroodEggs() {
  for (let i = broodEggs.length - 1; i >= 0; i--) {
    const e = broodEggs[i];
    if (!e.alive) { broodEggs.splice(i, 1); continue; }
    e.hatchTimer--;
    if (e.hatchTimer <= 0) {
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

function drawBroodEggs() {
  for (const e of broodEggs) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    const hatchPct = 1 - e.hatchTimer / 180;
    const pulse = 1 + Math.sin(e.hatchTimer * 0.12) * (0.03 + hatchPct * 0.06);
    ctx.scale(pulse, pulse);
    // ground shadow
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 3, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // egg body — organic shape
    ctx.fillStyle = '#aa8866';
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    // surface texture — veins
    ctx.strokeStyle = '#997755';
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.quadraticCurveTo(0, -2, 2, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, 2); ctx.quadraticCurveTo(3, 4, 1, 6); ctx.stroke();
    ctx.globalAlpha = 1;
    // highlight
    ctx.fillStyle = 'rgba(255,240,220,0.2)';
    ctx.beginPath(); ctx.ellipse(-1.5, -2, 2, 3, -0.3, 0, Math.PI * 2); ctx.fill();
    // outline
    ctx.strokeStyle = '#776644';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
    // cracking when close to hatching
    if (e.hatchTimer < 90) {
      const crackIntensity = 1 - e.hatchTimer / 90;
      ctx.strokeStyle = '#442211';
      ctx.lineWidth = 0.8 + crackIntensity;
      ctx.globalAlpha = 0.5 + crackIntensity * 0.5;
      ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(0, -1); ctx.lineTo(-1, 2); ctx.stroke();
      if (e.hatchTimer < 45) {
        ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(2, 0); ctx.lineTo(0, 3); ctx.stroke();
      }
      // glow from inside
      ctx.globalAlpha = crackIntensity * 0.2;
      const egrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
      egrd.addColorStop(0, '#ffcc66');
      egrd.addColorStop(1, 'transparent');
      ctx.fillStyle = egrd;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    }
    // shaking when about to hatch
    if (e.hatchTimer < 30 && e.hatchTimer % 4 < 2) {
      ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1);
    }
    ctx.restore();
  }
}

// ── BULLET UPDATE ────────────────────────────────────
function onZombieKill(z) {
  playSound('kill');
  runStats.kills++;

  // abomination split
  if (z.isBoss && z.bossType === 'abomination' && !z.hasSplit) {
    const cfg = BOSS_CONFIGS.abomination;
    triggerScreenshake(10, 24);
    for (let i = 0; i < cfg.splitCount; i++) {
      const angle = (i / cfg.splitCount) * Math.PI * 2 + Math.random() * 0.5;
      const sx = z.x + Math.cos(angle) * 30;
      const sy = z.y + Math.sin(angle) * 30;
      const splitHp = Math.floor(z.maxHp * cfg.splitHpPct);
      zombies.push({
        x: sx, y: sy, prevX: sx, prevY: sy, stuckFrames: 0,
        type: 'tank',
        isBoss: true, bossType: 'abomination',
        hasSplit: true,
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
        toxicCooldown: 9999,
        minions: [],
      });
      for (let p = 0; p < 6; p++) {
        particles.push({ x: sx, y: sy, dx: Math.cos(angle)*4 + (Math.random()-0.5)*2, dy: Math.sin(angle)*4 + (Math.random()-0.5)*2, life: 20, maxLife: 20, color: '#66cc33', r: 4 });
      }
    }
    waveTotal += cfg.splitCount;
    floatingTexts.push({ x: z.x, y: z.y - 30, text: 'SPLIT!', life: 50, maxLife: 50, color: '#88ee44' });
  }

  // Boss death flash
  if (z.isBoss) {
    hurtFlash = 6;
  }

  // Exploder explosion
  if (z.type === 'exploder') {
    const explodeRadius = 40;
    const explodeDmg = 12;
    const dx = player.x - z.x, dy = player.y - z.y;
    if (Math.sqrt(dx*dx + dy*dy) < explodeRadius + PLAYER_R) {
      damagePlayer(explodeDmg, 'exploder');
    }
    triggerScreenshake(3, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      particles.push({ x: z.x, y: z.y, dx: Math.cos(a)*4, dy: Math.sin(a)*4, life: 18, maxLife: 18, color: '#ff6600', r: 4 });
    }
    toxicPools.push({ x: z.x, y: z.y, radius: 30, dps: 2, life: 120, maxLife: 120 });
  }

  // Broodmother death spawn
  if (z.type === 'broodmother') {
    const spawnCount = 4 + Math.floor(Math.random() * 2);
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
    for (const e of broodEggs) {
      if (e.owner === z) { e.alive = false; }
    }
  }

  if (z.isBoss) runStats.bossKills++;
  else if (runStats[z.type + 'Kills'] !== undefined) runStats[z.type + 'Kills']++;
  tryDropHealthpack(z.x, z.y);
  tryDropAmmopack(z.x, z.y);

  // Vampirism — heal on kill
  const vampHeal = getPlayerStat('vampHeal');
  if (vampHeal > 0) {
    player.hp = Math.min(player.hp + vampHeal, getPlayerStat('maxHp'));
    runStats.healed += vampHeal;
  }

  // Kill Rush — speed boost on kill
  const killRushLvl = getSkillLevel('kill_rush');
  if (killRushLvl > 0) {
    player.killRushTimer = 120; // 2 seconds at 60fps
    player.killRushBoost = 0.15 + 0.1 * killRushLvl;
  }
  score += z.xp;
  runStats.xpEarned += z.xp;
  pendingXp += z.xp;

  // Gold/Diamond/XP rewards
  let goldAmount, goldText, goldColor;

  if (z.isBoss && !z.hasSplit) {
    const tier = getBossRewardTier(wave);
    goldAmount = tier.gold;
    pendingGold += goldAmount;
    pendingDiamonds += tier.diamonds;
    pendingXp += tier.xp;
    score += tier.xp;
    goldText = '+' + goldAmount + 'G +' + tier.diamonds + 'D';
    goldColor = '#ffdd44';
    floatingTexts.push({ x: z.x, y: z.y - 30, text: '+' + tier.xp + ' BOSS XP', life: 60, maxLife: 60, color: '#33ff88' });
  } else if (z.isBoss && z.hasSplit) {
    goldAmount = Math.floor(getBossRewardTier(wave).gold * 0.1);
    pendingGold += goldAmount;
    goldText = '+' + goldAmount + 'G';
    goldColor = '#ddaa00';
  } else {
    const goldDef = { normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4], exploder: [12,18,3], screamer: [18,28,4], healer: [20,30,5], shielder: [22,35,5], broodmother: [30,45,6], burrower: [18,28,4] };
    const gd = goldDef[z.type] || goldDef.normal;
    goldAmount = gd[0] + Math.floor(Math.random() * (gd[1] - gd[0] + 1)) + gd[2] * wave;
    const goldMultiplier = wave >= 5 ? 1 + (wave - 5) * 0.5 : 1;
    goldAmount = Math.round(goldAmount * goldMultiplier);
    const isGoldHaufen = Math.random() < 0.05;
    if (isGoldHaufen) goldAmount *= 3;
    pendingGold += goldAmount;

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

  // Time Traveler passive — mini-slowmo every 10 kills
  if (activeOperatorId === 'time_traveler') {
    timeTravelerKillCount++;
    if (timeTravelerKillCount % 10 === 0 && timeTravelerPhase === 'none') {
      miniSlowmoTimer = 120; // 2s
      timeScale = 0.5;
    }
  }

  updateXpBar();
  waveKills++;
  spawnBlood(z.x, z.y, 16);
  updateHUD();
  if (waveKills >= waveTotal && zombies.filter(zz => zz.alive).length === 0) {
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
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx * timeScale; b.y += b.dy * timeScale;
    b.life--;

    if (b.life <= 0 || wallCollide(b.x, b.y, 2)) {
      bullets.splice(i, 1);
      continue;
    }

    // Grenade — explode on zombie hit or end of life
    if (b.isGrenade) {
      let explode = false;
      let explodeX = b.x, explodeY = b.y;
      for (const z of zombies) {
        if (!z.alive || z.burrowed) continue;
        const gdx = b.x - z.x, gdy = b.y - z.y;
        if (gdx*gdx + gdy*gdy < (10 + z.radius)**2) { explode = true; break; }
      }
      if (b.life <= 1 || wallCollide(b.x, b.y, 4)) explode = true;
      if (explode) {
        playSound('explosion');
        // AoE damage in 60px radius
        const aoeR = 60;
        for (const z of zombies) {
          if (!z.alive || z.burrowed) continue;
          const adx = z.x - b.x, ady = z.y - b.y;
          if (adx*adx + ady*ady < aoeR*aoeR) {
            const gDmg = applyBossDamage(z, b.grenadeDmg, b.x, b.y);
            z.hp -= gDmg;
            runStats.damageDealt += gDmg;
            spawnBlood(z.x, z.y, 6);
            if (z.hp <= 0) { z.alive = false; z.deathTimer = z.isBoss ? 60 : 30; onZombieKill(z); }
          }
        }
        // Explosion particles
        for (let ep = 0; ep < 16; ep++) {
          const ea = Math.random() * Math.PI * 2;
          particles.push({ x: b.x, y: b.y, dx: Math.cos(ea)*5, dy: Math.sin(ea)*5, life: 20, maxLife: 20, color: '#ff4400', r: 5 });
        }
        bullets.splice(i, 1);
        continue;
      }
    }

    let hit = false;
    for (const z of zombies) {
      if (!z.alive || z.burrowed) continue;
      const dx = b.x - z.x, dy = b.y - z.y;
      if (dx*dx + dy*dy < (BULLET_R + z.radius)**2) {
        const bWpnId = b.weaponId || 'pistol';
        applyPerkDamageEffects(z, b.damage || 1, bWpnId);
        const bulletDir = Math.atan2(b.dy, b.dx);
        spawnBlood(z.x, z.y, 6, bulletDir);
        if (!b.pierce) {
          bullets.splice(i, 1);
          hit = true;
        }
        if (z.hp <= 0 && z.alive) {
          z.alive = false;
          z.deathTimer = z.isBoss ? 60 : 30;
          onZombieKill(z);
        } else if (z.alive) {
          playSoundThrottled('zombie_hit', 80);
        }
        if (!b.pierce) break;
      }
    }
    if (hit) continue;

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
  }
}

// ── PARTICLES UPDATE ─────────────────────────────────
function updateParticles() {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.dx; p.y += p.dy;
    p.dx *= 0.88; p.dy *= 0.88;
    p.life--;
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
  }
}

// ── FLOATING TEXTS ──────────────────────────────────
function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 0.5;
    ft.life--;
    if (ft.life <= 0) { floatingTexts[i] = floatingTexts[floatingTexts.length - 1]; floatingTexts.pop(); }
  }
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    ctx.save();
    ctx.globalAlpha = ft.life / ft.maxLife;
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function updateSpitterProjectiles() {
  for (let i = spitterProjectiles.length - 1; i >= 0; i--) {
    const p = spitterProjectiles[i];
    p.x += p.dx * timeScale; p.y += p.dy * timeScale;
    p.life--;

    if (p.life <= 0 || wallCollide(p.x, p.y, 3)) {
      spitterProjectiles.splice(i, 1);
      continue;
    }

    // hit player
    const dx = p.x - player.x, dy = p.y - player.y;
    if (dx*dx + dy*dy < (6 + PLAYER_R)**2) {
      spitterProjectiles.splice(i, 1);
      damagePlayer(10, 'ranged');
    }
  }
}

function drawSpitterProjectiles() {
  for (const p of spitterProjectiles) {
    ctx.save();
    // Toxic trail
    const trailAngle = Math.atan2(p.dy, p.dx);
    const trailX = p.x - Math.cos(trailAngle) * 10;
    const trailY = p.y - Math.sin(trailAngle) * 10;
    const grad = ctx.createLinearGradient(trailX, trailY, p.x, p.y);
    grad.addColorStop(0, 'rgba(100,255,50,0)');
    grad.addColorStop(1, 'rgba(100,255,50,0.4)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // Outer glow
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#55aa22';
    ctx.fillStyle = '#66dd22';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
    ctx.fill();
    // Inner bright core
    ctx.fillStyle = '#99ff66';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

// ── HEAL ZONES ──────────────────────────────────────
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
          z.hp -= applyBossDamage(z, hz.dps / 60);
          if (z.hp <= 0 && z.alive) { z.alive = false; z.deathTimer = z.isBoss ? 60 : 30; onZombieKill(z); }
        }
      }
    }
  }
}

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

// ── TIME MANIPULATION ────────────────────────────────
function updateTimeManipulation() {
  // Mini-slowmo passive
  if (miniSlowmoTimer > 0) {
    miniSlowmoTimer--;
    if (timeTravelerPhase === 'none') { // only if active ability isn't running
      timeScale = 0.5;
      if (miniSlowmoTimer <= 0) timeScale = 1;
    }
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
      operatorAbilityTimer = 0; // force done
    }
  }
}

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


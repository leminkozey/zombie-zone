// ── DRAW ─────────────────────────────────────────────
// Floor tile noise cache (declared near MAP at line 719)
function getFloorNoise(col, row) {
  if (!_floorNoise || !_floorNoise[row] || !_floorNoise[row][col]) {
    _floorNoise = [];
    for (let r = 0; r < ROWS; r++) {
      _floorNoise[r] = [];
      for (let c = 0; c < COLS; c++) {
        const seed = (r * 137 + c * 311) % 1000 / 1000;
        const variant = seed < 0.33 ? '#0c0c0e' : seed < 0.66 ? '#101014' : '#0e0e12';
        // Debris dots (pre-computed positions)
        const debris = [];
        const debrisCount = Math.floor(seed * 5);
        for (let d = 0; d < debrisCount; d++) {
          const dseed = ((r * 53 + c * 97 + d * 31) % 1000) / 1000;
          const dseed2 = ((r * 71 + c * 43 + d * 67) % 1000) / 1000;
          debris.push({
            ox: dseed * (TILE - 4) + 2,
            oy: dseed2 * (TILE - 4) + 2,
            r: 0.5 + dseed * 1,
            color: dseed > 0.5 ? '#1a1a1e' : '#16161a'
          });
        }
        _floorNoise[r][c] = { variant, debris };
      }
    }
  }
  return _floorNoise[row][col];
}

function drawCityTile(tctx, col, row) {
  const tile = getCityTile(col, row);
  const x = col * TILE, y = row * TILE;
  const s = (((col * 137 + row * 311) % 1000) + 1000) % 1000 / 1000;
  const s2 = (((col * 71 + row * 43) % 1000) + 1000) % 1000 / 1000;

  if (tile === 1) {
    // BUILDING ROOFTOP — solid, no entry
    const bx = Math.floor(col / 12);
    const by = Math.floor(row / 10);
    const bseed = (((bx * 53 + by * 97) % 3) + 3) % 3;
    const roofBase = ['#2a2018', '#201414', '#1e2020'][bseed];
    tctx.fillStyle = roofBase;
    tctx.fillRect(x, y, TILE, TILE);
    // Edge detection
    const top = getCityTile(col, row - 1) !== 1;
    const bot = getCityTile(col, row + 1) !== 1;
    const lft = getCityTile(col - 1, row) !== 1;
    const rgt = getCityTile(col + 1, row) !== 1;
    // Wall edges visible from top
    if (top) { tctx.fillStyle = '#3a3430'; tctx.fillRect(x, y, TILE, 3); }
    if (bot) { tctx.fillStyle = '#14100e'; tctx.fillRect(x, y + TILE - 3, TILE, 3); }
    if (lft) { tctx.fillStyle = '#302a26'; tctx.fillRect(x, y, 3, TILE); }
    if (rgt) { tctx.fillStyle = '#100e0c'; tctx.fillRect(x + TILE - 3, y, 3, TILE); }
    // Windows on building edges
    if (top) { for (let wx = 6; wx < TILE - 4; wx += 10) { tctx.fillStyle = 'rgba(0,0,0,0.4)'; tctx.fillRect(x + wx, y, 4, 3); tctx.fillStyle = 'rgba(40,60,80,0.15)'; tctx.fillRect(x + wx + 0.5, y + 0.5, 3, 2); } }
    if (lft) { for (let wy = 6; wy < TILE - 4; wy += 10) { tctx.fillStyle = 'rgba(0,0,0,0.4)'; tctx.fillRect(x, y + wy, 3, 4); tctx.fillStyle = 'rgba(40,60,80,0.15)'; tctx.fillRect(x + 0.5, y + wy + 0.5, 2, 3); } }
    // Roof details (interior tiles)
    if (!top && !bot && !lft && !rgt) {
      if (s > 0.65) { tctx.fillStyle = '#1e1a18'; tctx.fillRect(x + 10, y + 8, 18, 14); tctx.strokeStyle = '#2a2624'; tctx.lineWidth = 0.5; tctx.strokeRect(x + 10, y + 8, 18, 14); tctx.beginPath(); tctx.arc(x + 19, y + 15, 4, 0, Math.PI * 2); tctx.stroke(); }
      if (s > 0.35 && s < 0.45) { tctx.fillStyle = '#242018'; tctx.fillRect(x + 12, y + 10, 14, 10); tctx.strokeStyle = '#302a22'; tctx.lineWidth = 0.8; tctx.strokeRect(x + 12, y + 10, 14, 10); }
    }
    // Damage holes
    if (s2 > 0.85) { tctx.fillStyle = '#0a0808'; tctx.beginPath(); tctx.ellipse(x + TILE * 0.4, y + TILE * 0.5, 5 + s * 4, 4 + s2 * 3, s * 2, 0, Math.PI * 2); tctx.fill(); }
  } else {
    // STREET / SIDEWALK
    const adjBuilding = getCityTile(col - 1, row) === 1 || getCityTile(col + 1, row) === 1 || getCityTile(col, row - 1) === 1 || getCityTile(col, row + 1) === 1;
    if (adjBuilding) {
      // Sidewalk
      tctx.fillStyle = '#201e1c';
      tctx.fillRect(x, y, TILE, TILE);
      tctx.strokeStyle = 'rgba(40,38,34,0.4)'; tctx.lineWidth = 0.5;
      tctx.strokeRect(x, y, TILE / 2, TILE / 2); tctx.strokeRect(x + TILE / 2, y, TILE / 2, TILE / 2);
      tctx.strokeRect(x, y + TILE / 2, TILE / 2, TILE / 2); tctx.strokeRect(x + TILE / 2, y + TILE / 2, TILE / 2, TILE / 2);
      // Curb
      if (getCityTile(col, row - 1) === 1) { tctx.fillStyle = '#2a2826'; tctx.fillRect(x, y, TILE, 2); }
      if (getCityTile(col, row + 1) === 1) { tctx.fillStyle = '#2a2826'; tctx.fillRect(x, y + TILE - 2, TILE, 2); }
      if (getCityTile(col - 1, row) === 1) { tctx.fillStyle = '#2a2826'; tctx.fillRect(x, y, 2, TILE); }
      if (getCityTile(col + 1, row) === 1) { tctx.fillStyle = '#2a2826'; tctx.fillRect(x + TILE - 2, y, 2, TILE); }
      // Shadow from buildings
      if (getCityTile(col, row - 1) === 1) { tctx.fillStyle = 'rgba(0,0,0,0.3)'; tctx.fillRect(x, y, TILE, 6); }
      if (getCityTile(col - 1, row) === 1) { tctx.fillStyle = 'rgba(0,0,0,0.25)'; tctx.fillRect(x, y, 5, TILE); }
    } else {
      // Road asphalt
      tctx.fillStyle = s < 0.33 ? '#1a1818' : s < 0.66 ? '#1c1a18' : '#181616';
      tctx.fillRect(x, y, TILE, TILE);
      // Grain noise
      for (let i = 0; i < 4; i++) {
        const ns = (((col * 53 + row * 97 + i * 31) % 1000) + 1000) % 1000 / 1000;
        const ns2 = (((col * 71 + row * 43 + i * 67) % 1000) + 1000) % 1000 / 1000;
        tctx.fillStyle = ns > 0.5 ? 'rgba(30,28,24,0.3)' : 'rgba(10,8,6,0.3)';
        tctx.fillRect(x + ns * TILE, y + ns2 * TILE, 2, 2);
      }
      // Potholes
      if (s > 0.88) { tctx.fillStyle = '#0c0a0a'; tctx.beginPath(); tctx.ellipse(x + TILE * 0.5, y + TILE * 0.5, 6 + s * 4, 4 + s2 * 3, 0, 0, Math.PI * 2); tctx.fill(); tctx.strokeStyle = '#222020'; tctx.lineWidth = 0.5; tctx.beginPath(); tctx.ellipse(x + TILE * 0.5, y + TILE * 0.5, 6 + s * 4, 4 + s2 * 3, 0, 0, Math.PI * 2); tctx.stroke(); }
      // Cracks
      if (s2 > 0.6 && s2 < 0.75) { tctx.strokeStyle = 'rgba(8,6,6,0.7)'; tctx.lineWidth = 1; tctx.beginPath(); tctx.moveTo(x, y + s * TILE); tctx.lineTo(x + TILE * 0.3, y + s * TILE + 4); tctx.lineTo(x + TILE * 0.7, y + s * TILE - 2); tctx.lineTo(x + TILE, y + s * TILE + 6); tctx.stroke(); }
      // Road markings — dashed lines on open road tiles far from buildings
      if (!adjBuilding) {
        // Horizontal marking every 10 rows, vertical every 12 cols
        if (((row % 10) + 10) % 10 === 5 && getCityTile(col, row - 1) === 0 && getCityTile(col, row + 1) === 0) {
          tctx.setLineDash([6, 8]); tctx.strokeStyle = 'rgba(200,180,40,0.18)'; tctx.lineWidth = 1.5;
          tctx.beginPath(); tctx.moveTo(x, y + TILE / 2); tctx.lineTo(x + TILE, y + TILE / 2); tctx.stroke(); tctx.setLineDash([]);
        }
        if (((col % 12) + 12) % 12 === 6 && getCityTile(col - 1, row) === 0 && getCityTile(col + 1, row) === 0) {
          tctx.setLineDash([6, 8]); tctx.strokeStyle = 'rgba(200,180,40,0.18)'; tctx.lineWidth = 1.5;
          tctx.beginPath(); tctx.moveTo(x + TILE / 2, y); tctx.lineTo(x + TILE / 2, y + TILE); tctx.stroke(); tctx.setLineDash([]);
        }
      }
    }
  }
}

function drawTileAt(tctx, col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  const cell = MAP[row][col];
  const x = col * TILE, y = row * TILE;
  const th = getTheme();
  if (cell >= 1) {
    tctx.fillStyle = th.wallBase; tctx.fillRect(x, y, TILE, TILE);
    tctx.fillStyle = th.wallTop; tctx.fillRect(x, y, TILE, 6);
    tctx.fillStyle = th.wallLeft; tctx.fillRect(x, y, 3, TILE);
    tctx.fillStyle = th.wallBody; tctx.fillRect(x + 3, y + 6, TILE - 6, TILE - 9);
    tctx.strokeStyle = th.wallLine; tctx.lineWidth = 0.6;
    tctx.beginPath();
    tctx.moveTo(x + 4, y + Math.floor(TILE * 0.35)); tctx.lineTo(x + TILE - 4, y + Math.floor(TILE * 0.35));
    tctx.moveTo(x + 4, y + Math.floor(TILE * 0.65)); tctx.lineTo(x + TILE - 4, y + Math.floor(TILE * 0.65));
    tctx.stroke();
    // Bunker: bolt dots instead of brick lines
    if (selectedMap === 'bunker') {
      tctx.fillStyle = th.wallBevel;
      [[5,5],[TILE-6,5],[5,TILE-6],[TILE-6,TILE-6]].forEach(([bx,by]) => {
        tctx.beginPath(); tctx.arc(x+bx, y+by, 1.5, 0, Math.PI*2); tctx.fill();
      });
    }
    tctx.fillStyle = th.wallShadowR; tctx.fillRect(x + TILE - 2, y, 2, TILE);
    tctx.fillStyle = th.wallShadowB; tctx.fillRect(x, y + TILE - 3, TILE, 3);
    tctx.fillStyle = th.wallBevel; tctx.fillRect(x, y, TILE, 1); tctx.fillRect(x, y, 1, TILE);
    // Bunker: green light strip on walls adjacent to floor above
    if (selectedMap === 'bunker' && row > 0 && MAP[row-1] && MAP[row-1][col] === 0) {
      tctx.fillStyle = '#33ff55'; tctx.fillRect(x + 4, y, TILE - 8, 1.5);
      tctx.shadowBlur = 4; tctx.shadowColor = '#33ff55'; tctx.fillRect(x + 4, y, TILE - 8, 1); tctx.shadowBlur = 0;
    }
  } else {
    const s = ((col * 137 + row * 311) % 1000) / 1000;
    tctx.fillStyle = s < 0.33 ? th.floor[0] : s < 0.66 ? th.floor[1] : th.floor[2];
    tctx.fillRect(x, y, TILE, TILE);
    tctx.strokeStyle = th.grid; tctx.lineWidth = 0.3; tctx.strokeRect(x, y, TILE, TILE);
    // Debris
    for (let d = 0; d < 3; d++) {
      const ds = ((col * 53 + row * 97 + d * 31) % 1000) / 1000;
      const ds2 = ((col * 71 + row * 43 + d * 67) % 1000) / 1000;
      tctx.fillStyle = th.debris[d % th.debris.length];
      tctx.fillRect(x + ds * (TILE - 4) + 2, y + ds2 * (TILE - 4) + 2, 0.5 + ds, 0.5 + ds2);
    }
    // Bunker diamond plate pattern
    if (selectedMap === 'bunker') {
      tctx.fillStyle = 'rgba(20,30,20,0.25)';
      for (let dy = 2; dy < TILE; dy += 8) {
        for (let dx = ((dy/8|0) % 2) * 4; dx < TILE; dx += 8) {
          tctx.beginPath();
          tctx.moveTo(x+dx, y+dy-2); tctx.lineTo(x+dx+2, y+dy); tctx.lineTo(x+dx, y+dy+2); tctx.lineTo(x+dx-2, y+dy);
          tctx.closePath(); tctx.fill();
        }
      }
    }
    // Shadows from adjacent walls
    if (row > 0 && MAP[row-1] && MAP[row-1][col] >= 1) { tctx.fillStyle = 'rgba(0,0,0,0.25)'; tctx.fillRect(x, y, TILE, 5); }
    if (col > 0 && MAP[row][col-1] >= 1) { tctx.fillStyle = 'rgba(0,0,0,0.2)'; tctx.fillRect(x, y, 4, TILE); }
    if (row < ROWS-1 && MAP[row+1] && MAP[row+1][col] >= 1) { tctx.fillStyle = 'rgba(0,0,0,0.12)'; tctx.fillRect(x, y + TILE - 2, TILE, 2); }
    if (col < COLS-1 && MAP[row][col+1] >= 1) { tctx.fillStyle = 'rgba(0,0,0,0.12)'; tctx.fillRect(x + TILE - 2, y, 2, TILE); }
  }
}

function drawMap() {
  if (!MAP || MAP.length === 0) return;
  // Camera mode: infinite city — render visible tiles on-the-fly
  if (camActive) {
    const startC = Math.floor(camX / TILE) - 1;
    const endC = Math.ceil((camX + W) / TILE) + 1;
    const startR = Math.floor(camY / TILE) - 1;
    const endR = Math.ceil((camY + H) / TILE) + 1;
    // background
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(camX, camY, W, H);
    for (let row = startR; row < endR; row++) {
      for (let col = startC; col < endC; col++) {
        drawCityTile(ctx, col, row);
      }
    }
    return;
  }
  if (mapCacheCanvas) {
    ctx.drawImage(mapCacheCanvas, 0, 0);
    return;
  }
  // Create off-screen cache using themed drawTileAt
  mapCacheCanvas = document.createElement('canvas');
  mapCacheCanvas.width = COLS * TILE;
  mapCacheCanvas.height = ROWS * TILE;
  const mctx = mapCacheCanvas.getContext('2d');
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      drawTileAt(mctx, col, row);
  ctx.drawImage(mapCacheCanvas, 0, 0);
}

function findFreeSpawnTile() {
  if (camActive) {
    // City: pick random tiles near player
    for (let attempt = 0; attempt < 30; attempt++) {
      const rx = player.x + (Math.random() - 0.5) * W * 0.8;
      const ry = player.y + (Math.random() - 0.5) * H * 0.8;
      if (!isWall(rx, ry)) {
        const dx = rx - player.x, dy = ry - player.y;
        if (Math.sqrt(dx*dx + dy*dy) > TILE * 3) return { x: rx, y: ry };
      }
    }
    return null;
  }
  const freeTiles = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (MAP[r][c] !== 0) continue;
      const tx = c * TILE + TILE/2;
      const ty = r * TILE + TILE/2;
      const dx = tx - player.x, dy = ty - player.y;
      if (Math.sqrt(dx*dx + dy*dy) < TILE * 3) continue;
      freeTiles.push({ x: tx, y: ty });
    }
  }
  return freeTiles.length > 0 ? freeTiles[Math.floor(Math.random() * freeTiles.length)] : null;
}

function spawnHealthpack() {
  if (healthpacks.length >= PICKUP_MAX) return;
  const pos = findFreeSpawnTile();
  if (!pos) return;
  healthpacks.push({ x: pos.x, y: pos.y, life: PICKUP_LIFETIME });
}

function tryTimerHealthpack() {
  lastHealthpackSpawn++;
  if (lastHealthpackSpawn >= nextHealthpackAt) {
    spawnHealthpack();
    lastHealthpackSpawn = 0;
    nextHealthpackAt = HEALTHPACK_INTERVAL[0] + Math.random() * (HEALTHPACK_INTERVAL[1] - HEALTHPACK_INTERVAL[0]);
  }
}

function tryDropHealthpack(x, y) {
  let healthDropChance = 0.15;
  if (activeOperatorId === 'medic') healthDropChance *= 1.5;
  if (Math.random() < healthDropChance && healthpacks.length < PICKUP_MAX) {
    healthpacks.push({ x, y, life: PICKUP_LIFETIME });
  }
}

function updateHealthpacks() {
  for (let i = healthpacks.length - 1; i >= 0; i--) {
    const h = healthpacks[i];
    h.life--;
    if (h.life <= 0) { healthpacks.splice(i, 1); continue; }

    const dx = h.x - player.x, dy = h.y - player.y;
    if (dx*dx + dy*dy < (PLAYER_R + 10)**2) {
      const healMult = 1 + getPlayerStat('healingEffectivenessPct');
      const healAmount = Math.round(HEALTHPACK_HEAL * (1 + getPlayerStat('healthpackHealPct')) * Math.max(0.1, healMult));
      runStats.healed += healAmount;
      player.hp = Math.min(player.hp + healAmount, getPlayerStat('maxHp'));
      healthpacks.splice(i, 1);
      playSound('pickup_health');
      updateHUD();
      for (let j = 0; j < 8; j++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: player.x, y: player.y,
          dx: Math.cos(a)*2, dy: Math.sin(a)*2 - 1,
          life: 15, maxLife: 15,
          color: '#33cc44', r: 3,
        });
      }
    }
  }
}

function drawHealthpacks() {
  for (const h of healthpacks) {
    if (h.life < PICKUP_BLINK && Math.floor(h.life / 8) % 2 === 0) continue;

    ctx.save();
    ctx.translate(h.x, h.y);

    const pulse = 0.8 + Math.sin(frameCount * 0.1) * 0.2;
    ctx.globalAlpha = pulse;

    ctx.fillStyle = '#33cc44';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#33cc4488';
    ctx.fillRect(-3, -8, 6, 16);
    ctx.fillRect(-8, -3, 16, 6);

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulse * 0.6;
    ctx.fillRect(-1.5, -5, 3, 10);
    ctx.fillRect(-5, -1.5, 10, 3);

    ctx.restore();
  }
}

// ammo pickups
function spawnAmmopack() {
  if (ammopacks.length >= PICKUP_MAX) return;
  const pos = findFreeSpawnTile();
  if (!pos) return;
  ammopacks.push({ x: pos.x, y: pos.y, life: PICKUP_LIFETIME });
}

function tryTimerAmmopack() {
  lastAmmopackSpawn++;
  if (lastAmmopackSpawn >= nextAmmopackAt) {
    spawnAmmopack();
    lastAmmopackSpawn = 0;
    nextAmmopackAt = AMMOPACK_INTERVAL[0] + Math.random() * (AMMOPACK_INTERVAL[1] - AMMOPACK_INTERVAL[0]);
  }
}

function tryDropAmmopack(x, y) {
  let ammoDropChance = 0.1;
  if (activeOperatorId === 'soldier') ammoDropChance *= 1.5;
  if (Math.random() < ammoDropChance && ammopacks.length < PICKUP_MAX) {
    ammopacks.push({ x, y, life: PICKUP_LIFETIME });
  }
}

function updateAmmopacks() {
  for (let i = ammopacks.length - 1; i >= 0; i--) {
    const a = ammopacks[i];
    a.life--;
    if (a.life <= 0) { ammopacks.splice(i, 1); continue; }

    const dx = a.x - player.x, dy = a.y - player.y;
    if (dx*dx + dy*dy < (PLAYER_R + 10)**2) {
      player.ammo = getWeaponStat(activeWeaponId, 'mag');
      if (reloading) {
        reloading = false;
        document.getElementById('reload-bar-wrap').style.display = 'none';
      }
      ammopacks.splice(i, 1);
      playSound('pickup_ammo');
      updateHUD();
      for (let j = 0; j < 8; j++) {
        const ang = Math.random() * Math.PI * 2;
        particles.push({
          x: player.x, y: player.y,
          dx: Math.cos(ang)*2, dy: Math.sin(ang)*2 - 1,
          life: 15, maxLife: 15,
          color: '#ccaa00', r: 3,
        });
      }
    }
  }
}

function drawAmmopacks() {
  for (const a of ammopacks) {
    if (a.life < PICKUP_BLINK && Math.floor(a.life / 8) % 2 === 0) continue;

    ctx.save();
    ctx.translate(a.x, a.y);

    const pulse = 0.8 + Math.sin(frameCount * 0.1) * 0.2;
    ctx.globalAlpha = pulse;

    // gelbes Munitions-Symbol (Patrone)
    ctx.fillStyle = '#ccaa00';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ccaa0088';
    ctx.fillRect(-2, -8, 4, 12); // hülse
    ctx.fillStyle = '#aa7700';
    ctx.beginPath();
    ctx.arc(0, -8, 3, Math.PI, 0); // spitze
    ctx.fill();
    ctx.fillStyle = '#886600';
    ctx.fillRect(-3, 4, 6, 3); // boden

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulse * 0.4;
    ctx.fillRect(-0.5, -6, 1, 8);

    ctx.restore();
  }
}

function drawBloodDecals() {
  for (const d of bloodDecals) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    if (d.shape === 'splat') {
      // Irregular splatter shape
      ctx.fillStyle = '#380000';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 1.3, d.r * 0.5, d.x % 3, 0, Math.PI*2);
      ctx.fill();
      // Small droplets around splat
      ctx.fillStyle = '#300000';
      ctx.beginPath();
      ctx.arc(d.x + d.r, d.y + 2, d.r * 0.25, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3a0000';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.x % 2, 0, Math.PI*2);
      ctx.fill();
      // Darker center
      ctx.fillStyle = '#280000';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.4, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    // Bullet trail — short luminous streak behind
    const trailLen = 12;
    const angle = Math.atan2(b.dy, b.dx);
    const trailX = b.x - Math.cos(angle) * trailLen;
    const trailY = b.y - Math.sin(angle) * trailLen;
    const grad = ctx.createLinearGradient(trailX, trailY, b.x, b.y);
    grad.addColorStop(0, 'rgba(255,204,0,0)');
    grad.addColorStop(0.7, 'rgba(255,220,50,0.3)');
    grad.addColorStop(1, 'rgba(255,255,170,0.8)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Bullet head — bright
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffcc00';
    ctx.fillStyle = '#ffffcc';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R - 1, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function updateHitTrails() {
  for (let i = hitTrails.length - 1; i >= 0; i--) {
    hitTrails[i].life--;
    if (hitTrails[i].life <= 0) { hitTrails[i] = hitTrails[hitTrails.length - 1]; hitTrails.pop(); }
  }
}

function drawHitTrails() {
  for (const t of hitTrails) {
    const progress = t.life / t.maxLife;
    ctx.save();

    if (t.style === 'sniper') {
      // Sniper: bright thick tracer that travels along the line
      // The "bullet" moves from x1,y1 to x2,y2 over the trail lifetime
      const bulletPos = 1 - progress; // 0 at start, 1 at end
      const bx = t.x1 + (t.x2 - t.x1) * Math.min(1, bulletPos * 3); // bullet moves fast
      const by = t.y1 + (t.y2 - t.y1) * Math.min(1, bulletPos * 3);
      const tailX = t.x1 + (t.x2 - t.x1) * Math.max(0, bulletPos * 3 - 0.4);
      const tailY = t.y1 + (t.y2 - t.y1) * Math.max(0, bulletPos * 3 - 0.4);

      // Glow line (full path, fading)
      ctx.globalAlpha = progress * 0.2;
      ctx.strokeStyle = '#ffddaa';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();

      // Bright tracer body
      ctx.globalAlpha = Math.min(1, progress * 2);
      const grad = ctx.createLinearGradient(tailX, tailY, bx, by);
      grad.addColorStop(0, 'rgba(255,200,100,0)');
      grad.addColorStop(0.5, 'rgba(255,240,180,0.8)');
      grad.addColorStop(1, 'rgba(255,255,220,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(bx, by); ctx.stroke();

      // Bullet head glow
      if (bulletPos * 3 <= 1.2) {
        ctx.globalAlpha = Math.min(1, progress * 2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffcc44';
        ctx.fillStyle = '#ffffcc';
        ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

    } else if (t.style === 'rifle') {
      // AR: same as sniper but smaller/faster
      const bulletPos = 1 - progress;
      const bx = t.x1 + (t.x2 - t.x1) * Math.min(1, bulletPos * 4);
      const by = t.y1 + (t.y2 - t.y1) * Math.min(1, bulletPos * 4);
      const tailX = t.x1 + (t.x2 - t.x1) * Math.max(0, bulletPos * 4 - 0.3);
      const tailY = t.y1 + (t.y2 - t.y1) * Math.max(0, bulletPos * 4 - 0.3);

      // Faint path line
      ctx.globalAlpha = progress * 0.12;
      ctx.strokeStyle = '#ffddaa';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();

      // Tracer
      ctx.globalAlpha = Math.min(1, progress * 2);
      const grad = ctx.createLinearGradient(tailX, tailY, bx, by);
      grad.addColorStop(0, 'rgba(255,200,100,0)');
      grad.addColorStop(0.6, 'rgba(255,230,150,0.6)');
      grad.addColorStop(1, 'rgba(255,250,200,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(bx, by); ctx.stroke();

      // Small bullet head
      if (bulletPos * 4 <= 1.2) {
        ctx.globalAlpha = Math.min(1, progress * 2);
        ctx.fillStyle = '#ffeecc';
        ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2); ctx.fill();
      }

    } else if (t.style === 'minigun') {
      // Minigun: very thin, faint, rapid streaks
      ctx.globalAlpha = progress * 0.35;
      ctx.strokeStyle = '#ffdd66';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();

    } else {
      // SMG/AR: thin line with slight glow at tip
      const tipX = t.x1 + (t.x2 - t.x1) * (1 - progress * 0.3);
      const tipY = t.y1 + (t.y2 - t.y1) * (1 - progress * 0.3);
      ctx.globalAlpha = progress * 0.5;
      ctx.strokeStyle = '#ffee88';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      // Small bright dot at impact
      ctx.globalAlpha = progress * 0.8;
      ctx.fillStyle = '#ffeeaa';
      ctx.beginPath(); ctx.arc(t.x2, t.y2, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }
}

const ZOMBIE_TYPES = {
  normal:  { body: '#3d7a28', skin: '#8abb55', arm: '#4a7030', outline: '#5a9938', scale: 1.0, eyeColor: '#ff4422', eyeGlow: '#ff2200' },
  runner:  { body: '#dd6600', skin: '#ffaa33', arm: '#cc5500', outline: '#ff8800', scale: 0.85, eyeColor: '#ffee00', eyeGlow: '#ffcc00' },
  tank:    { body: '#882222', skin: '#aa3333', arm: '#771818', outline: '#aa2222', scale: 1.5, eyeColor: '#ff2200', eyeGlow: '#dd0000', plate: '#661515' },
  spitter: { body: '#6644bb', skin: '#9966dd', arm: '#5533aa', outline: '#8855cc', scale: 1.0, eyeColor: '#aaff55', eyeGlow: '#88ee33', glow: '#bbff66', glowDim: '#77cc33' },
  exploder:    { body: '#cc4400', skin: '#ff6622', arm: '#aa3300', outline: '#883300', scale: 1.1, eyeColor: '#ffaa00', eyeGlow: '#ff8800' },
  screamer:    { body: '#cccccc', skin: '#eeeeee', arm: '#aaaaaa', outline: '#999999', scale: 0.9, eyeColor: '#ff2200', eyeGlow: '#dd0000' },
  healer:      { body: '#22aa44', skin: '#44dd66', arm: '#33bb55', outline: '#229944', scale: 1.0, eyeColor: '#aaffaa', eyeGlow: '#88ff88' },
  shielder:    { body: '#334466', skin: '#445577', arm: '#2a3a55', outline: '#556688', scale: 1.2, eyeColor: '#88aadd', eyeGlow: '#6688bb' },
  broodmother: { body: '#553344', skin: '#664455', arm: '#442233', outline: '#775566', scale: 1.4, eyeColor: '#ffaa66', eyeGlow: '#dd8844' },
  burrower:    { body: '#665533', skin: '#887744', arm: '#554422', outline: '#776644', scale: 1.0, eyeColor: '#ddaa55', eyeGlow: '#cc9944' },
  boss_brute:    { body: '#661515', skin: '#772218', arm: '#551111', outline: '#441008', scale: 3.0, eyeColor: '#ff3300', eyeGlow: '#ff2200' },
  boss_necro:    { body: '#3a1866', skin: '#5a2e88', arm: '#4a2277', outline: '#2a1144', scale: 2.0, eyeColor: '#44ff88', eyeGlow: '#33dd66' },
  boss_abom:     { body: '#448822', skin: '#55aa28', arm: '#3a7718', outline: '#336615', scale: 3.5, eyeColor: '#ccff44', eyeGlow: '#aadd22' },
  boss_abom_split: { body: '#448822', skin: '#55aa28', arm: '#3a7718', outline: '#336615', scale: 1.5, eyeColor: '#ccff44', eyeGlow: '#aadd22' },
};

function drawZombie(z) {
  if (!z.alive && !z.deathTimer) return;

  let typeKey = z.type;
  if (z.isBoss) {
    if (z.bossType === 'brute') typeKey = 'boss_brute';
    else if (z.bossType === 'necromancer') typeKey = 'boss_necro';
    else if (z.bossType === 'abomination') typeKey = z.hasSplit ? 'boss_abom_split' : 'boss_abom';
  }
  const t = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.normal;
  const s = t.scale;
  const r = 11 * s;

  ctx.save();
  ctx.translate(z.x, z.y);

  // Death — fragments scatter
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

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 3, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Runner: motion trail
  if (z.type === 'runner') {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = t.outline;
    const bx = -Math.cos(z.angle) * 10 * s;
    const by = -Math.sin(z.angle) * 10 * s;
    ctx.beginPath(); ctx.arc(bx, by, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.06;
    ctx.beginPath(); ctx.arc(bx * 1.7, by * 1.7, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

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

  // Spitter: toxic drip
  if (z.type === 'spitter' && z.frame % 5 === 0) {
    particles.push({
      x: z.x + (Math.random() - 0.5) * 8,
      y: z.y + (Math.random() - 0.5) * 8,
      dx: (Math.random() - 0.5) * 0.5, dy: 0.3 + Math.random() * 0.5,
      life: 15, maxLife: 15, color: t.glow, r: 1.5 + Math.random(),
    });
  }

  // Exploder: volatile core glow + danger ring
  if (z.type === 'exploder') {
    const hpPct = z.hp / z.maxHp;
    const pulseSpeed = 0.06 + (1 - hpPct) * 0.2;
    const pulse = Math.sin(z.frame * pulseSpeed);
    // outer danger ring — expands as HP drops
    ctx.save();
    ctx.globalAlpha = (0.08 + (1 - hpPct) * 0.12) * (0.7 + pulse * 0.3);
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    const ringR = r * (1.4 + (1 - hpPct) * 0.6);
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // inner core glow — double layer
    ctx.save();
    const coreAlpha = 0.12 + pulse * 0.1 + (1 - hpPct) * 0.15;
    ctx.globalAlpha = coreAlpha;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    grd.addColorStop(0, '#ffcc00');
    grd.addColorStop(0.4, '#ff6600');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // sparks when low HP
    if (hpPct < 0.4 && z.frame % 6 === 0) {
      const sa = Math.random() * Math.PI * 2;
      particles.push({ x: z.x + Math.cos(sa)*r*0.5, y: z.y + Math.sin(sa)*r*0.5, dx: Math.cos(sa)*2, dy: Math.sin(sa)*2 - 1, life: 8, maxLife: 8, color: '#ffaa00', r: 1.5 });
    }
  }

  // Healer: pulsing heal rings + cross symbol
  if (z.type === 'healer') {
    ctx.save();
    // outer heal radius ring
    const healPulse = Math.sin(z.frame * 0.03);
    ctx.globalAlpha = 0.06 + healPulse * 0.03;
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(0, 0, 80 / s, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // inner aura with ring wave
    const waveR = (z.frame % 120) / 120 * 80 / s;
    ctx.globalAlpha = 0.15 * (1 - waveR / (80 / s));
    ctx.strokeStyle = '#66ff66';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, waveR, 0, Math.PI * 2); ctx.stroke();
    // soft glow
    ctx.globalAlpha = 0.06 + healPulse * 0.02;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
    grd.addColorStop(0, '#44ff88');
    grd.addColorStop(0.5, '#22aa44');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Screamer: sound wave rings emanating outward
  if (z.type === 'screamer' && z.screamCooldown > 240) {
    ctx.save();
    const progress = 1 - (z.screamCooldown - 240) / 60;
    const ringR = progress * 120 / s;
    ctx.globalAlpha = (1 - progress) * 0.25;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - progress) * 0.12;
    ctx.beginPath(); ctx.arc(0, 0, ringR * 0.7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Broodmother: egg sacs on body
  if (z.type === 'broodmother') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const eggPositions = [[-3, -5], [2, -6], [-1, 5], [4, 4]];
    for (const [ex, ey] of eggPositions) {
      ctx.fillStyle = '#aa8866';
      ctx.beginPath(); ctx.ellipse(ex * s * 0.3, ey * s * 0.3, 2 * s * 0.3, 2.5 * s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#886644';
      ctx.beginPath(); ctx.arc(ex * s * 0.3, (ey - 1) * s * 0.3, 1 * s * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Burrower: underground effect when burrowed
  if (z.type === 'burrower' && z.burrowed) {
    // dirt mound shadow
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(z.frame * 0.15) * 0.1;
    ctx.fillStyle = '#554433';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // dirt spray particles
    if (z.frame % 3 === 0) {
      const pa = Math.random() * Math.PI * 2;
      particles.push({ x: z.x + Math.cos(pa)*6, y: z.y + Math.sin(pa)*6, dx: Math.cos(pa)*1.5, dy: -1.5 - Math.random(), life: 10, maxLife: 10, color: z.frame % 6 < 3 ? '#886644' : '#665533', r: 1.5 + Math.random() });
    }
    // small cracks radiating
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#443322';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const ca = (i / 4) * Math.PI * 2 + z.frame * 0.02;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ca) * r * 0.3, Math.sin(ca) * r * 0.3);
      ctx.lineTo(Math.cos(ca) * r * 0.8, Math.sin(ca) * r * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.rotate(z.angle);
  const wobble = Math.sin(z.wobble * 0.5) * 2;
  const armReach = z.hitting ? 14 * s : 10 * s;

  // ── N-02 HUSK: Thin, ribs, claws, hollow cheeks ──
  if (z.type === 'normal') {
    // Thin arms with claw-tips
    ctx.fillStyle = t.arm;
    ctx.fillRect(6*s, (-5 + wobble)*s, 10*s, 2.5*s);
    ctx.fillRect(6*s, (3.5 - wobble)*s, 8*s, 2.2*s);
    // Claws
    ctx.fillStyle = '#2a5015';
    ctx.fillRect((15 + (z.hitting?3:0))*s, (-5.5 + wobble)*s, 3*s, 1.5*s);
    ctx.fillRect((15 + (z.hitting?3:0))*s, (-3.5 + wobble)*s, 2.5*s, 1.2*s);
    ctx.fillRect((13 + (z.hitting?3:0))*s, (3 - wobble)*s, 2.5*s, 1.2*s);
    ctx.fillRect((13 + (z.hitting?3:0))*s, (5 - wobble)*s, 3*s, 1.2*s);

    // Thin oval body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 10*s, 8.5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.2*s; ctx.stroke();

    // Rib lines
    ctx.strokeStyle = '#2a5518'; ctx.lineWidth = 0.8*s;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-4*s, i*2.8*s);
      ctx.quadraticCurveTo(0, i*2.2*s, 5*s, i*2.5*s);
      ctx.stroke();
    }

    // Head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 5*s, 0, Math.PI*2); ctx.fill();

    // Hollow cheeks
    ctx.fillStyle = '#2a5518'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(4*s, -3.5*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4*s, 3.5*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // Eyes
    ctx.save();
    ctx.shadowBlur = 6*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7.5*s, -2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7.5*s, 2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── R-01 SPRINTER: Arms back, motion blur, open jaw ──
  } else if (z.type === 'runner') {
    // Arms swept back
    ctx.fillStyle = t.arm;
    ctx.save(); ctx.translate(-4*s, -4*s); ctx.rotate(0.5 + wobble*0.03);
    ctx.fillRect(0, -1*s, -12*s, 2.5*s); ctx.restore();
    ctx.save(); ctx.translate(-4*s, 4*s); ctx.rotate(-0.5 - wobble*0.03);
    ctx.fillRect(0, -1*s, -12*s, 2.5*s); ctx.restore();

    // Narrow body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 11*s, 6.5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.5*s; ctx.stroke();

    // Small feral head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(7*s, 0, 4*s, 0, Math.PI*2); ctx.fill();

    // Open jaw — triangle
    ctx.fillStyle = '#882200';
    ctx.beginPath();
    ctx.moveTo(9*s, -1.5*s); ctx.lineTo(12*s, 0); ctx.lineTo(9*s, 1.5*s);
    ctx.fill();

    // Eyes — intense yellow
    ctx.save();
    ctx.shadowBlur = 7*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(8.5*s, -2*s, 1.6*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8.5*s, 2*s, 1.6*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── T-03 GOLEM: Blocky, asymmetric, one huge arm ──
  } else if (z.type === 'tank') {
    const tSwing = Math.sin(z.wobble * 0.3) * 1.5;

    // Small left arm
    ctx.fillStyle = t.arm;
    ctx.fillRect(4*s, (-8 + tSwing)*s, 9*s, 4*s);
    // HUGE right arm with fist
    ctx.fillRect(2*s, (4 - tSwing)*s, 15*s, 6.5*s);
    ctx.beginPath(); ctx.arc(16*s, (7 - tSwing)*s, 4.5*s, 0, Math.PI*2); ctx.fill();

    // Blocky body
    ctx.fillStyle = t.body;
    ctx.beginPath();
    ctx.moveTo(-12*s, -13*s);
    ctx.lineTo(8*s, -14*s);
    ctx.lineTo(10*s, 14*s);
    ctx.lineTo(-11*s, 12*s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 2*s; ctx.stroke();

    // Crack lines
    ctx.strokeStyle = '#551010'; ctx.lineWidth = 1.2*s;
    ctx.beginPath();
    ctx.moveTo(-8*s, -10*s); ctx.lineTo(0, 0); ctx.lineTo(-5*s, 10*s);
    ctx.stroke();

    // Head — tilted
    ctx.fillStyle = t.skin;
    ctx.save();
    ctx.translate(7*s, -2*s); ctx.rotate(-0.15);
    ctx.beginPath(); ctx.arc(0, 0, 5*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Eyes — asymmetric (one bigger)
    ctx.save();
    ctx.shadowBlur = 4*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(9*s, -4.5*s, 2.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10*s, 0.5*s, 1.5*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── S-02 SHAMAN: Big glowing head, ritual markings, third eye ──
  } else if (z.type === 'spitter') {
    const throwExt = z.throwAnim > 0 ? z.throwAnim * 1.5 : 0;

    // Arms with dripping hands
    ctx.fillStyle = t.arm;
    ctx.fillRect(5*s, (-5 + wobble)*s, (9 + throwExt)*s, 2.8*s);
    ctx.fillRect(5*s, (3 - wobble)*s, 9*s, 2.8*s);
    // Toxic drips from hands
    ctx.fillStyle = t.glowDim; ctx.globalAlpha = 0.5;
    ctx.fillRect((13 + throwExt)*s, (-4.5 + wobble)*s, 1.5*s, 4*s);
    ctx.fillRect(13*s, (3.5 - wobble)*s, 1.5*s, 3.5*s);
    ctx.globalAlpha = 1;

    // Slim body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 9*s, 8.5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.2*s; ctx.stroke();

    // Ritual markings on body
    ctx.strokeStyle = t.glowDim; ctx.lineWidth = 0.7*s; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(-1*s, 0, 5*s, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4*s, -4*s); ctx.lineTo(4*s, 4*s);
    ctx.moveTo(-4*s, 4*s); ctx.lineTo(4*s, -4*s);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // BIG glowing head
    ctx.save();
    const gp = 0.15 + Math.sin(frameCount * 0.1) * 0.08;
    ctx.globalAlpha = gp; ctx.fillStyle = t.glow;
    ctx.beginPath(); ctx.arc(5*s, 0, 9*s, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 6.5*s, 0, Math.PI*2); ctx.fill();

    // Third eye (center, large, bright)
    ctx.save();
    ctx.shadowBlur = 8*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.glow;
    ctx.beginPath(); ctx.arc(9*s, 0, 2.5*s, 0, Math.PI*2); ctx.fill();

    // Regular eyes
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7.5*s, -3*s, 1.6*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7.5*s, 3*s, 1.6*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Exploder: bloated round body, volatile core ──
  } else if (z.type === 'exploder') {
    // Stubby arms
    ctx.fillStyle = t.arm;
    ctx.fillRect(4*s, (-5+wobble)*s, 8*s, 3*s);
    ctx.fillRect(4*s, (3-wobble)*s, 8*s, 3*s);
    // Bloated round body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.5*s; ctx.stroke();
    // Volatile core (inner glow already drawn pre-rotate)
    ctx.fillStyle = '#ff6622'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(0, 0, r*0.5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    // Small head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 4*s, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.save(); ctx.shadowBlur = 5*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7*s, -2*s, 1.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7*s, 2*s, 1.5*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Screamer: thin, pale, open mouth ──
  } else if (z.type === 'screamer') {
    // Thin arms raised
    ctx.fillStyle = t.arm;
    ctx.fillRect(3*s, (-6+wobble)*s, 10*s, 2.5*s);
    ctx.fillRect(3*s, (4-wobble)*s, 10*s, 2.5*s);
    // Thin body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 9*s, 7.5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.2*s; ctx.stroke();
    // Head with wide open mouth
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 5*s, 0, Math.PI*2); ctx.fill();
    // Open mouth
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(8*s, 0, 3*s, 0, Math.PI*2); ctx.fill();
    // Eyes — intense red
    ctx.save(); ctx.shadowBlur = 6*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(6*s, -3*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(6*s, 3*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Healer: green, crosses on body ──
  } else if (z.type === 'healer') {
    // Arms
    ctx.fillStyle = t.arm;
    ctx.fillRect(4*s, (-5+wobble)*s, 9*s, 2.8*s);
    ctx.fillRect(4*s, (3-wobble)*s, 9*s, 2.8*s);
    // Body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.5*s; ctx.stroke();
    // Cross marks on body
    ctx.fillStyle = '#66ff88'; ctx.globalAlpha = 0.3;
    ctx.fillRect(-1.5*s, -5*s, 3*s, 10*s);
    ctx.fillRect(-5*s, -1.5*s, 10*s, 3*s);
    ctx.globalAlpha = 1;
    // Head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 5*s, 0, Math.PI*2); ctx.fill();
    // Eyes — green glow
    ctx.save(); ctx.shadowBlur = 5*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7*s, -2.2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7*s, 2.2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Shielder: blue-grey, bulky ──
  } else if (z.type === 'shielder') {
    // Thick arms holding shield
    ctx.fillStyle = t.arm;
    ctx.fillRect(3*s, (-7+wobble)*s, 10*s, 4*s);
    ctx.fillRect(3*s, (4-wobble)*s, 10*s, 4*s);
    // Wide body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r*0.95, r*1.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.8*s; ctx.stroke();
    // Head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(6*s, 0, 5*s, 0, Math.PI*2); ctx.fill();
    // Eyes — blue
    ctx.save(); ctx.shadowBlur = 4*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(8*s, -2.2*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8*s, 2.2*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Broodmother: purple-brown, large, egg sacs ──
  } else if (z.type === 'broodmother') {
    // Thick short arms
    ctx.fillStyle = t.arm;
    ctx.fillRect(3*s, (-7+wobble)*s, 8*s, 4.5*s);
    ctx.fillRect(3*s, (3-wobble)*s, 8*s, 4.5*s);
    // Large bloated body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r*1.15, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 2*s; ctx.stroke();
    // Veiny texture
    ctx.strokeStyle = t.arm; ctx.lineWidth = 0.8*s; ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(-5*s, -6*s); ctx.quadraticCurveTo(0, 0, 5*s, -4*s);
    ctx.moveTo(-4*s, 5*s); ctx.quadraticCurveTo(2*s, 2*s, 6*s, 6*s);
    ctx.stroke(); ctx.globalAlpha = 1;
    // Head — small relative to body
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(7*s, 0, 4.5*s, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.save(); ctx.shadowBlur = 4*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(9*s, -2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(9*s, 2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Burrower: brown/earth tones, digging claws ──
  } else if (z.type === 'burrower') {
    // Arms with digging claws
    ctx.fillStyle = t.arm;
    ctx.fillRect(5*s, (-5+wobble)*s, 10*s, 2.8*s);
    ctx.fillRect(5*s, (3-wobble)*s, 10*s, 2.8*s);
    // Claw tips
    ctx.fillStyle = '#887755';
    ctx.fillRect(14*s, (-5.5+wobble)*s, 3*s, 1.5*s);
    ctx.fillRect(14*s, (3.5-wobble)*s, 3*s, 1.5*s);
    // Body
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 10*s, 9*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.3*s; ctx.stroke();
    // Dirt patches
    ctx.fillStyle = '#554433'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(-3*s, -3*s, 2.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(2*s, 4*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    // Head
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 5*s, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.save(); ctx.shadowBlur = 4*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7*s, -2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7*s, 2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();

  // ── Fallback: generic zombie body for unknown types ──
  } else {
    ctx.fillStyle = t.arm;
    ctx.fillRect(4*s, (-5+wobble)*s, armReach, 3*s);
    ctx.fillRect(4*s, (3-wobble)*s, armReach*0.8, 2.5*s);
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = t.outline; ctx.lineWidth = 1.5*s; ctx.stroke();
    ctx.fillStyle = t.skin;
    ctx.beginPath(); ctx.arc(5*s, 0, 5*s, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.shadowBlur = 5*s; ctx.shadowColor = t.eyeGlow;
    ctx.fillStyle = t.eyeColor;
    ctx.beginPath(); ctx.arc(7*s, -2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7*s, 2*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // HP bar — unrotated, above zombie
  if (z.alive && z.hp < z.maxHp) {
    ctx.save();
    ctx.translate(z.x, z.y);
    const bw = 24 * s, bh = 3;
    ctx.fillStyle = '#1a0000';
    ctx.fillRect(-bw / 2, -r - 10, bw, bh);
    ctx.fillStyle = '#ee2200';
    ctx.fillRect(-bw / 2, -r - 10, bw * (z.hp / z.maxHp), bh);
    ctx.restore();
  }

  // Shielder front shield
  if (z.type === 'shielder' && z.alive) {
    ctx.save();
    const shieldPct = z.shieldBroken ? 0 : z.shieldHp / z.shieldMaxHp;
    if (!z.shieldBroken) {
      // shield body — layered arc with energy effect
      const shieldAlpha = 0.25 + shieldPct * 0.45;
      ctx.globalAlpha = shieldAlpha;
      // outer edge glow
      ctx.strokeStyle = '#88bbee';
      ctx.lineWidth = 4 * s;
      ctx.shadowColor = '#4488cc';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(r * 0.6, 0, r * 1.0, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // inner fill
      ctx.fillStyle = 'rgba(80,140,200,0.12)';
      ctx.fill();
      // energy lines on shield
      ctx.globalAlpha = shieldAlpha * 0.6;
      ctx.strokeStyle = '#aaddff';
      ctx.lineWidth = 0.8 * s;
      for (let i = 0; i < 3; i++) {
        const lineAngle = -Math.PI * 0.35 + (i / 2) * Math.PI * 0.35;
        const lx = r * 0.6 + Math.cos(lineAngle) * r * 0.7;
        const ly = Math.sin(lineAngle) * r * 0.7;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(lineAngle) * r * 0.25, ly + Math.sin(lineAngle) * r * 0.25);
        ctx.stroke();
      }
      // damage flash when recently hit
      if (z.shieldRegenTimer > 280) {
        ctx.globalAlpha = (z.shieldRegenTimer - 280) / 20 * 0.3;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(r * 0.6, 0, r * 1.0, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.stroke();
      }
    } else {
      // broken shield — faint cracked remnant
      ctx.globalAlpha = 0.08 + Math.sin(z.frame * 0.05) * 0.03;
      ctx.strokeStyle = '#445566';
      ctx.lineWidth = 1.5 * s;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(r * 0.6, 0, r * 1.0, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Boss HP bar
  if (z.isBoss && z.alive) {
    ctx.save();
    ctx.translate(z.x, z.y);
    const barW = Math.max(40, z.radius * 2);
    const barH = 4;
    const barY = -z.radius - 14;
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(-barW/2, barY, barW, barH);
    const hpPct = Math.max(0, z.hp / z.maxHp);
    const bossColors = { brute: '#cc2211', necromancer: '#8833cc', abomination: '#55bb33' };
    ctx.fillStyle = bossColors[z.bossType] || '#cc2211';
    ctx.fillRect(-barW/2, barY, barW * hpPct, barH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-barW/2, barY, barW, barH);
    ctx.font = "bold 8px 'Oswald', sans-serif";
    ctx.fillStyle = bossColors[z.bossType] || '#cc2211';
    ctx.textAlign = 'center';
    const bossNames = { brute: 'BRUTE', necromancer: 'NECROMANCER', abomination: 'ABOMINATION' };
    ctx.fillText(bossNames[z.bossType] || 'BOSS', 0, barY - 3);
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
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  // shadow — larger, softer
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 3, 14, 9, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.rotate(player.angle);

  const recoil = player.recoil || 0;

  // Boot tips (visible at bottom when "walking")
  const walkCycle = Math.sin(frameCount * 0.15) * 2;
  ctx.fillStyle = '#2a2a1e';
  ctx.fillRect(-8, 8 + walkCycle, 5, 4);
  ctx.fillRect(-8, -12 - walkCycle, 5, 4);

  // Backpack (small square on the back)
  ctx.fillStyle = '#3a3a2a';
  ctx.fillRect(-14, -5, 7, 10);
  ctx.strokeStyle = '#2a2a1e';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-14, -5, 7, 10);
  // Backpack straps
  ctx.strokeStyle = '#333322';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, -4); ctx.lineTo(-3, -6);
  ctx.moveTo(-7, 4); ctx.lineTo(-3, 6);
  ctx.stroke();

  // Off-hand arm (left arm, stabilizing the weapon)
  ctx.fillStyle = '#556644';
  ctx.save();
  ctx.translate(6 - recoil, -5);
  ctx.rotate(-0.2);
  ctx.fillRect(0, 0, 8, 3.5);
  ctx.restore();

  // Main arm (right arm, holding weapon)
  ctx.fillStyle = '#556644';
  ctx.save();
  ctx.translate(4 - recoil, 3);
  ctx.rotate(0.15);
  ctx.fillRect(0, 0, 10, 3.5);
  ctx.restore();

  // Weapon — drawn based on activeWeaponId (top-down, pointing right)
  ctx.save();
  ctx.translate(-recoil, 0);
  if (activeWeaponId === 'pistol') {
    // Compact — grip visible as wider bump, short barrel
    ctx.fillStyle = '#3a3530'; // grip
    ctx.fillRect(2, -3, 6, 6);
    ctx.fillStyle = '#2a2a28'; // slide
    ctx.fillRect(3, -2, 14, 4);
    ctx.fillStyle = '#1a1a18'; // barrel
    ctx.fillRect(17, -1.2, 5, 2.4);
    ctx.fillStyle = '#cc2200'; // front sight
    ctx.fillRect(21, -0.5, 1, 1);

  } else if (activeWeaponId === 'smg') {
    // Stubby stock, medium body, mag down, foregrip
    ctx.fillStyle = '#222220'; // stock
    ctx.fillRect(-4, -1.5, 6, 3);
    ctx.fillStyle = '#2a2a28'; // body
    ctx.fillRect(2, -3, 16, 6);
    ctx.fillStyle = '#1a1a18'; // barrel
    ctx.fillRect(18, -1.5, 8, 3);
    ctx.fillStyle = '#252522'; // magazine
    ctx.fillRect(6, 3, 3.5, 6);
    ctx.fillStyle = '#333330'; // foregrip
    ctx.fillRect(12, -4, 3, 8);
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(25, -0.5, 1, 1);

  } else if (activeWeaponId === 'shotgun') {
    // Long — wooden stock, pump section, WIDE barrel end
    ctx.fillStyle = '#3d3525'; // stock
    ctx.fillRect(-8, -2, 12, 4);
    ctx.fillStyle = '#4a3e2e'; // stock butt
    ctx.fillRect(-8, -2.5, 3, 5);
    ctx.fillStyle = '#2a2a28'; // receiver
    ctx.fillRect(4, -3, 10, 6);
    ctx.fillStyle = '#3d3525'; // pump
    ctx.fillRect(14, -3, 6, 6);
    ctx.fillStyle = '#1a1a18'; // barrel — WIDE
    ctx.fillRect(20, -3.5, 12, 7);
    ctx.fillStyle = '#0e0f0e'; // bore
    ctx.beginPath(); ctx.arc(32, 0, 2.5, 0, Math.PI*2); ctx.fill();

  } else if (activeWeaponId === 'assault_rifle') {
    // Long, sleek — stock, rail on top, curved mag, flash hider
    ctx.fillStyle = '#222220'; // stock
    ctx.fillRect(-10, -2, 10, 4);
    ctx.fillStyle = '#2a2a28'; // stock plate
    ctx.fillRect(-12, -3, 3, 6);
    ctx.fillStyle = '#2a2a28'; // receiver
    ctx.fillRect(0, -3, 18, 6);
    ctx.fillStyle = '#333330'; // rail
    ctx.fillRect(2, -4.5, 14, 1.5);
    ctx.fillStyle = '#252522'; // magazine (angled)
    ctx.save(); ctx.translate(6, 3); ctx.rotate(0.1);
    ctx.fillRect(0, 0, 4, 7);
    ctx.restore();
    ctx.fillStyle = '#1a1a18'; // handguard + barrel
    ctx.fillRect(18, -2, 12, 4);
    ctx.fillStyle = '#333330'; // flash hider
    ctx.fillRect(29, -2.5, 3, 5);
    ctx.fillStyle = '#0e0f0e';
    ctx.fillRect(30, -0.8, 1.5, 1.6);
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(8, -5, 1, 1);

  } else if (activeWeaponId === 'sniper') {
    // Very long — big scope on top, thin barrel, muzzle brake
    ctx.fillStyle = '#2a2a28'; // stock
    ctx.fillRect(-14, -2, 14, 4);
    ctx.fillStyle = '#222220'; // stock plate
    ctx.fillRect(-16, -3.5, 4, 7);
    ctx.fillStyle = '#2a2a28'; // receiver
    ctx.fillRect(0, -2.5, 14, 5);
    ctx.fillStyle = '#1e1e1c'; // scope (prominent)
    ctx.fillRect(-4, -6, 18, 3);
    ctx.fillStyle = '#1a2a40'; // lens front
    ctx.beginPath(); ctx.arc(14, -4.5, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a2a40'; // lens rear
    ctx.beginPath(); ctx.arc(-4, -4.5, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#252522'; // mag
    ctx.fillRect(2, 2.5, 5, 5);
    ctx.fillStyle = '#1a1a18'; // long thin barrel
    ctx.fillRect(14, -1.2, 22, 2.4);
    ctx.fillStyle = '#333330'; // muzzle brake
    ctx.fillRect(34, -2.5, 4, 5);
    ctx.fillStyle = '#0e0f0e';
    ctx.fillRect(35.5, -1, 1, 2);
    ctx.fillRect(37, -1, 1, 2);

  } else if (activeWeaponId === 'minigun') {
    // Wide and chunky — motor back, barrel cluster, ammo hint
    ctx.fillStyle = '#2a2a28'; // motor housing
    ctx.fillRect(-6, -5, 10, 10);
    ctx.fillStyle = '#222220'; // motor cap
    ctx.beginPath(); ctx.arc(-6, 0, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3d3525'; // handles
    ctx.fillRect(-4, -7.5, 4, 2.5);
    ctx.fillRect(-4, 5, 4, 2.5);
    ctx.fillStyle = '#2a2a28'; // body
    ctx.fillRect(4, -4, 10, 8);
    ctx.fillStyle = '#1a1a18'; // 5 barrels
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(14, i*2.2 - 0.7, 14, 1.4);
    }
    ctx.strokeStyle = '#333330'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(20, 0, 5, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(26, 0, 5, 0, Math.PI*2); ctx.stroke();
    // Ammo belt
    ctx.fillStyle = '#ddaa00'; ctx.globalAlpha = 0.2;
    ctx.fillRect(-4, -9, 6, 1.5);
    ctx.fillRect(-1, -10.5, 5, 1.5);
    ctx.globalAlpha = 1;

  } else {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(4, -2, 14, 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(18, -1, 6, 2);
  }
  ctx.restore();

  // Body — rounded rect torso with tactical vest
  ctx.fillStyle = '#556644';
  ctx.beginPath();
  // Rounded body shape
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();

  // Tactical vest detail — darker center stripe
  ctx.fillStyle = '#445533';
  ctx.fillRect(-3, -10, 6, 20);
  // Vest side panels
  ctx.fillStyle = '#4a5a38';
  ctx.fillRect(-10, -6, 7, 12);
  ctx.fillRect(3, -6, 7, 12);
  // Vest pocket outlines
  ctx.strokeStyle = '#3a4a28';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-9, -3, 5, 4);
  ctx.strokeRect(4, -3, 5, 4);

  // Body outline for clarity
  ctx.strokeStyle = '#333a28';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.stroke();

  // Head — with helmet
  ctx.fillStyle = '#c8a070';
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  // Helmet
  ctx.fillStyle = '#445533';
  ctx.beginPath();
  ctx.arc(4, 0, 6.5, -Math.PI * 0.7, Math.PI * 0.7);
  ctx.closePath();
  ctx.fill();

  // Helmet rim
  ctx.strokeStyle = '#556644';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(4, 0, 7, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  // Helmet band/goggle strap
  ctx.strokeStyle = '#3a4a28';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(4, 0, 6, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();

  ctx.restore();
}

function drawMinimap() {
  // City: small minimap showing area around player
  // Others: full map minimap
  const mmCols = camActive ? 30 : COLS;
  const mmRows = camActive ? 20 : ROWS;
  const S = camActive ? 5 : 6;
  const ox = W - mmCols * S - 10, oy = 10;
  // For city, calculate tile offset centered on player
  const pTileX = Math.floor(player.x / TILE);
  const pTileY = Math.floor(player.y / TILE);
  const mmStartC = camActive ? pTileX - Math.floor(mmCols / 2) : 0;
  const mmStartR = camActive ? pTileY - Math.floor(mmRows / 2) : 0;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#000';
  ctx.fillRect(ox - 2, oy - 2, mmCols * S + 4, mmRows * S + 4);
  for (let r = 0; r < mmRows; r++) {
    for (let c = 0; c < mmCols; c++) {
      const wc = mmStartC + c, wr = mmStartR + r;
      const isWallTile = camActive ? getCityTile(wc, wr) >= 1 : (wr >= 0 && wr < ROWS && wc >= 0 && wc < COLS && MAP[wr][wc] >= 1);
      ctx.fillStyle = isWallTile ? (camActive ? '#2a2420' : '#2a2a30') : (camActive ? '#141210' : '#0e0e12');
      ctx.fillRect(ox + c * S, oy + r * S, S - 1, S - 1);
    }
  }
  // Zombies
  const minimapColors = { normal: '#aa2200', runner: '#cc6600', tank: '#661111', spitter: '#663399', exploder: '#cc4400', screamer: '#cccccc', healer: '#44dd44', shielder: '#4466aa', broodmother: '#664455', burrower: '#887744' };
  for (const z of zombies) {
    if (!z.alive) continue;
    const zc = z.x / TILE - mmStartC, zr = z.y / TILE - mmStartR;
    if (zc < 0 || zc >= mmCols || zr < 0 || zr >= mmRows) continue;
    ctx.fillStyle = minimapColors[z.type] || '#aa2200';
    ctx.fillRect(ox + zc * S - 1, oy + zr * S - 1, 3, 3);
  }
  // Helper: convert world coords to minimap coords
  function mmX(wx) { return ox + (wx / TILE - mmStartC) * S; }
  function mmY(wy) { return oy + (wy / TILE - mmStartR) * S; }
  function mmVisible(wx, wy) { const mc = wx/TILE-mmStartC, mr = wy/TILE-mmStartR; return mc >= -1 && mc <= mmCols+1 && mr >= -1 && mr <= mmRows+1; }

  // Boss markers (larger)
  for (const z of zombies) {
    if (!z.alive || !z.isBoss || !mmVisible(z.x, z.y)) continue;
    const bossMapColors = { brute: '#ff2200', necromancer: '#9944dd', abomination: '#55cc33' };
    ctx.fillStyle = bossMapColors[z.bossType] || '#ff0000';
    const size = z.hasSplit ? 4 : { brute: 6, necromancer: 5, abomination: 7 }[z.bossType] || 5;
    ctx.fillRect(mmX(z.x) - size/2, mmY(z.y) - size/2, size, size);
  }
  // Toxic pools
  ctx.save(); ctx.fillStyle = '#44aa22'; ctx.globalAlpha = 0.4;
  for (const tp of toxicPools) { if (!mmVisible(tp.x, tp.y)) continue; ctx.beginPath(); ctx.arc(mmX(tp.x), mmY(tp.y), (tp.radius/TILE)*S, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
  // Healthpacks
  ctx.fillStyle = '#33cc44';
  for (const h of healthpacks) { if (!mmVisible(h.x, h.y)) continue; ctx.fillRect(mmX(h.x)-1, mmY(h.y)-1, 3, 3); }
  // Ammopacks
  ctx.fillStyle = '#ccaa00';
  for (const a of ammopacks) { if (!mmVisible(a.x, a.y)) continue; ctx.fillRect(mmX(a.x)-1, mmY(a.y)-1, 3, 3); }
  // Heal zones
  ctx.strokeStyle = '#33cc44'; ctx.lineWidth = 1;
  for (const hz of healZones) { if (!mmVisible(hz.x, hz.y)) continue; ctx.beginPath(); ctx.arc(mmX(hz.x), mmY(hz.y), (hz.radius/TILE)*S, 0, Math.PI*2); ctx.stroke(); }
  // Rescue circle
  if (rescueCircle && mmVisible(rescueCircle.x, rescueCircle.y)) {
    ctx.save(); ctx.strokeStyle = frameCount % 30 < 15 ? '#66ff99' : 'transparent'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mmX(rescueCircle.x), mmY(rescueCircle.y), (rescueCircle.radius/TILE)*S, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  }
  // Turrets
  ctx.fillStyle = '#5a6a55';
  for (const t of turrets) { if (!mmVisible(t.x, t.y)) continue; ctx.fillRect(mmX(t.x)-2, mmY(t.y)-2, 4, 4); }
  // Builder blocks
  ctx.fillStyle = '#4a5540';
  for (const b of builderBlocks) { const bwx = b.x*TILE, bwy = b.y*TILE; if (!mmVisible(bwx, bwy)) continue; ctx.fillRect(mmX(bwx), mmY(bwy), S-1, S-1); }
  // Player — always center for city, absolute for others
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(mmX(player.x) - 2, mmY(player.y) - 2, 4, 4);
  ctx.restore();

  // Wave info under minimap
  ctx.font = "14px 'Oswald', 'Bebas Neue', sans-serif";
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.fillText('WAVE ' + wave, ox + mmCols*S/2, oy + mmRows*S + 18);
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#444';
  ctx.fillText(waveKills + ' / ' + waveTotal, ox + mmCols*S/2, oy + mmRows*S + 32);

  // Gold display left of minimap
  ctx.font = "13px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#ddaa00';
  ctx.textAlign = 'right';
  ctx.fillText((globalGold + pendingGold) + 'G', ox - 12, oy + 12);
  // Gold multiplier indicator
  if (wave >= 5) {
    const mult = 1 + (wave - 5) * 0.5;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = '#eecc22';
    ctx.fillText('x' + mult.toFixed(1) + ' GOLD', ox - 12, oy + 26);
  }
  // Diamonds below
  if (globalDiamonds + pendingDiamonds > 0) {
    ctx.fillStyle = '#44ddff';
    ctx.font = "13px 'JetBrains Mono', monospace";
    ctx.fillText((globalDiamonds + pendingDiamonds) + 'D', ox - 12, wave >= 5 ? oy + 40 : oy + 28);
  }
}


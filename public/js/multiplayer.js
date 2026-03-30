const MP_INPUT_BUFFER_MAX = 200;
const MP_INPUT_BUFFER_TRIM = 100;
const MP_CONNECT_DELAY_MS = 500;
const MP_INTERP_STEP = 1 / 3;
const MP_CLIPBOARD_FEEDBACK_MS = 500;
const MP_LOBBY_CODE_LENGTH = 4;

function mpPredictLocalMovement(input) {
  let mx = 0, my = 0;
  if (input.keys.up) my -= 1;
  if (input.keys.down) my += 1;
  if (input.keys.left) mx -= 1;
  if (input.keys.right) mx += 1;
  if (mx === 0 && my === 0) return;
  const len = Math.sqrt(mx * mx + my * my);
  // Server moves speed*FRAME_MULT(3) per tick. Client renders 3 frames per tick.
  // So per client frame: speed * 3 / 3 = speed
  mx = (mx / len) * mpLocalSpeed;
  my = (my / len) * mpLocalSpeed;
  if (!wallCollide(mpPredictedX + mx, mpPredictedY + my, PLAYER_R)) {
    mpPredictedX += mx; mpPredictedY += my;
  } else {
    if (!wallCollide(mpPredictedX + mx, mpPredictedY, PLAYER_R)) mpPredictedX += mx;
    if (!wallCollide(mpPredictedX, mpPredictedY + my, PLAYER_R)) mpPredictedY += my;
  }
}

function applyDelta(base, delta) {
  const result = { ...base, tick: delta.tick };

  if (delta.wave !== undefined) result.wave = delta.wave;
  if (delta.waveKills !== undefined) result.waveKills = delta.waveKills;
  if (delta.waveTotal !== undefined) result.waveTotal = delta.waveTotal;

  // Players — merge delta fields (preserve players not in delta)
  if (delta.players) {
    const pMap = new Map((base.players || []).map(p => [p.id, p]));
    for (const dp of delta.players) {
      const existing = pMap.get(dp.id);
      pMap.set(dp.id, existing ? { ...existing, ...dp } : dp);
    }
    result.players = [...pMap.values()];
  }

  // Zombies — merge updates + remove deleted
  if (delta.zombies || delta.zombiesRemoved) {
    const zMap = new Map((base.zombies || []).map(z => [z.id, z]));
    if (delta.zombiesRemoved) {
      for (const id of delta.zombiesRemoved) zMap.delete(id);
    }
    if (delta.zombies) {
      for (const dz of delta.zombies) {
        const existing = zMap.get(dz.id);
        zMap.set(dz.id, existing ? { ...existing, ...dz } : dz);
      }
    }
    result.zombies = [...zMap.values()];
  }

  if (delta.bullets !== undefined) result.bullets = delta.bullets;
  if (delta.spitterProjectiles !== undefined) result.spitterProjectiles = delta.spitterProjectiles;
  if (delta.hitTrails !== undefined) result.hitTrails = delta.hitTrails;
  else result.hitTrails = [];
  if (delta.pickups !== undefined) result.pickups = delta.pickups;
  result.events = delta.events || [];

  return result;
}

function mpConnect() {
  if (mpSocket) return;
  mpSocket = io();
  mpSocket.on('connect', () => {
    mpLocalId = mpSocket.id;
    mpSocket.emit('set-player-info', {
      name: currentUser,
      level: getLevelFromXp(globalXp),
      weapon: activeWeaponId,
      maxHp: Math.round(getPlayerStat('maxHp')),
      speed: Math.round(getPlayerStat('moveSpeed') * 100) / 100,
      operator: activeOperatorId,
    });
  });
  mpSocket.on('lobby-updated', (data) => { mpPlayers = data.players; mpIsHost = data.hostId === mpSocket.id; renderMpLobby(); });
  mpSocket.on('game-start', (data) => { mpStartGame(data); });
  mpSocket.on('game-state', (data) => {
    mpPrevState = mpGameState;
    // Delta or full state?
    if (data._delta && mpGameState) {
      mpGameState = applyDelta(mpGameState, data);
    } else {
      mpGameState = data;
    }
    mpInterpT = 0;
    // Server reconciliation — snap to server pos, replay pending inputs
    const serverMe = mpGameState.players ? mpGameState.players.find(p => p.id === mpLocalId) : null;
    if (serverMe) {
      mpPredictedX = serverMe.x;
      mpPredictedY = serverMe.y;
      if (serverMe.speed) mpLocalSpeed = serverMe.speed;
      const lastAck = serverMe.lastInputSeq || 0;
      mpPendingInputs = mpPendingInputs.filter(inp => inp.seq > lastAck);
      if (mpPendingInputs.length > MP_INPUT_BUFFER_MAX) mpPendingInputs = mpPendingInputs.slice(-MP_INPUT_BUFFER_TRIM);
      for (const inp of mpPendingInputs) mpPredictLocalMovement(inp);
    }
    if (!mpPrevState) console.log('[MP] First game-state received, zombies:', (mpGameState.zombies||[]).length, 'players:', (mpGameState.players||[]).length);
  });
  mpSocket.on('game-over', () => { mpEndGame(); });
  mpSocket.on('kicked', () => { mpDisconnect(); alert('Du wurdest gekickt'); });
}

function mpDisconnect() {
  if (mpSocket) { mpSocket.emit('leave-lobby'); mpSocket.disconnect(); mpSocket = null; }
  mpEnabled = false; mpIsHost = false; mpLobbyCode = null; mpPlayers = []; mpLocalId = null; mpGameState = null;
}

function mpCreateLobby() {
  mpConnect();
  setTimeout(() => {
    mpSocket.emit('create-lobby', (res) => {
      if (res.error) { document.getElementById('mp-error').textContent = res.error; return; }
      mpLobbyCode = res.code; mpIsHost = true;
      document.getElementById('mp-pre-lobby').style.display = 'none';
      document.getElementById('mp-in-lobby').style.display = 'block';
      renderMpLobby();
    });
  }, MP_CONNECT_DELAY_MS);
}

function mpJoinLobby() {
  const code = document.getElementById('mp-code-input').value.trim().toUpperCase();
  if (code.length !== MP_LOBBY_CODE_LENGTH) { document.getElementById('mp-error').textContent = 'Code muss 4 Zeichen sein'; return; }
  mpConnect();
  setTimeout(() => {
    mpSocket.emit('join-lobby', code, (res) => {
      if (res.error) { document.getElementById('mp-error').textContent = res.error; return; }
      mpLobbyCode = res.code; mpPlayers = res.players; mpIsHost = res.hostId === mpSocket.id;
      document.getElementById('mp-pre-lobby').style.display = 'none';
      document.getElementById('mp-in-lobby').style.display = 'block';
      renderMpLobby();
    });
  }, MP_CONNECT_DELAY_MS);
}

function renderMpLobby() {
  document.getElementById('mp-lobby-code').textContent = mpLobbyCode;
  const list = document.getElementById('mp-player-list');
  list.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = mpPlayers.find(pp => pp.slot === i);
    const div = document.createElement('div');
    div.style.cssText = 'padding:10px;margin:4px 0;background:#0a0d10;border:1px solid ' + (p ? '#33cc44' : '#1a1e22') + ';width:300px;display:inline-block;text-align:left;font-family:JetBrains Mono,monospace;font-size:12px;color:' + (p ? '#c0ccd8' : '#333');
    div.textContent = p ? (p.name + ' (LVL ' + p.level + ')') : 'Leer...';
    list.appendChild(div);
    list.appendChild(document.createElement('br'));
  }
  const actions = document.getElementById('mp-lobby-actions');
  actions.innerHTML = '';
  if (mpIsHost && mpPlayers.length >= 2) {
    const btn = document.createElement('button');
    btn.className = 'start-btn'; btn.style.cssText = 'font-size:22px;padding:14px 50px;letter-spacing:6px';
    btn.textContent = 'STARTEN'; btn.onclick = () => mpSocket.emit('start-game');
    actions.appendChild(btn);
  }
  const leave = document.createElement('button');
  leave.className = 'start-btn btn-secondary'; leave.style.cssText = 'font-size:14px;padding:8px 20px;margin-left:12px';
  leave.textContent = 'VERLASSEN'; leave.onclick = () => { mpSocket.emit('leave-lobby'); document.getElementById('mp-in-lobby').style.display = 'none'; document.getElementById('mp-pre-lobby').style.display = 'block'; mpLobbyCode = null; mpPlayers = []; };
  actions.appendChild(leave);
}

function mpStartGame(data) {
  mpEnabled = true;
  mpPlayers = data.players;

  // Load server map — override local map so all clients have same map
  if (data.map && data.map.map) {
    COLS = data.map.cols || 48;
    ROWS = data.map.rows || 27;
    TILE = data.map.tile || 40;
    MAP = data.map.map;
    mapCacheCanvas = null;
    _floorNoise = null;
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    W = canvas.width;
    H = canvas.height;
    console.log('[MP] Map loaded:', COLS, 'x', ROWS, 'MAP rows:', MAP.length);
  } else {
    // Fallback: generate local map with server dimensions
    console.warn('[MP] No map data from server, generating locally');
    COLS = 48; ROWS = 27; TILE = 40;
    generateMap();
    mapCacheCanvas = null;
    _floorNoise = null;
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    W = canvas.width;
    H = canvas.height;
  }

  document.getElementById('mp-lobby-screen').style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  mpGameState = null; mpPrevState = null;
  mpInputSeq = 0; mpPendingInputs = [];
  mpPredictedX = 0; mpPredictedY = 0;
  mpLocalSpeed = Math.round(getPlayerStat('moveSpeed') * 100) / 100;
  // Init global arrays used by rendering functions (drawZombie pushes particles, etc.)
  floatingTexts = [];
  particles = [];
  bloodDecals = [];
  hitTrails = [];
  frameCount = 0;
  // Init player object for MP rendering (drawPlayer needs these properties)
  player = {
    x: 0, y: 0, angle: 0, hp: 100, maxHp: 100, speed: 2.8,
    ammo: 30, maxAmmo: 30, recoil: 0, shootCooldown: 0,
    shield: 0, maxShield: 0, shieldRegenTimer: 0,
    secondWindUsed: false, dashInvulnerable: false,
    downed: false, downedTimer: 0, _lastMouseDown: false, _shootBuffered: false,
    soldierRush: false, juggernautActive: false,
    ironSkinReady: false, ironSkinCooldown: 0,
    killRushTimer: 0, killRushBoost: 0, lastDamageTime: 0,
    reviving: false,
  };
  running = true;
  ensureAudio(); startAmbient();
  requestAnimationFrame(mpLoop);
}

function mpEndGame() {
  running = false;
  stopAmbient();
  mpEnabled = false;
  mpGameState = null;
  mpPrevState = null;
  mpPendingInputs = [];
  mpPredictedX = 0;
  mpPredictedY = 0;
  mpInputSeq = 0;
  showGameMenu();
}

function mpLoop(now) {
  if (!mpEnabled) return;
  if (!mpGameState) {
    // Warte auf ersten Server-State — zeichne Map als Ladebildschirm
    ctx.clearRect(0, 0, W, H);
    if (MAP && MAP.length > 0) drawMap();
    ctx.save();
    ctx.font = "24px 'Bebas Neue', sans-serif";
    ctx.fillStyle = '#ee2200';
    ctx.textAlign = 'center';
    ctx.fillText('WARTE AUF SERVER...', W/2, H/2);
    ctx.restore();
    requestAnimationFrame(mpLoop);
    return;
  }
  frameCount++;

  // Track shoot clicks (buffered between sends for semi weapons)
  if (mouseDown && !player._lastMouseDown) player._shootBuffered = true;
  player._lastMouseDown = mouseDown;

  // Send inputs to server EVERY FRAME (throttling caused input drops)
  if (mpSocket) {
    const shootInput = mouseDown || player._shootBuffered;
    player._shootBuffered = false;

    // Calculate mouse angle — use predicted position for accurate aiming
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasMouseX = mouseX * scaleX;
    const canvasMouseY = mouseY * scaleY;
    const aimAngle = Math.atan2(canvasMouseY - mpPredictedY, canvasMouseX - mpPredictedX);

    mpInputSeq++;
    const inputData = {
      seq: mpInputSeq,
      keys: {
        up: !!keys[keybinds.moveUp], down: !!keys[keybinds.moveDown],
        left: !!keys[keybinds.moveLeft], right: !!keys[keybinds.moveRight],
        reload: !!keys[keybinds.reload], dash: !!keys[keybinds.dash],
        shoot: shootInput, rescue: !!keys[keybinds.rescue],
      },
      mouseAngle: aimAngle,
    };
    mpSocket.emit('input', inputData);
    // Client-side prediction — predict own movement locally
    mpPendingInputs.push(inputData);
    mpPredictLocalMovement(inputData);
  }

  // Interpolation
  mpInterpT = Math.min(1, mpInterpT + MP_INTERP_STEP);

  // Render
  ctx.clearRect(0, 0, W, H);

  // Draw map
  drawMap();

  const state = mpGameState;

  // Find local player for camera/angle
  const localPlayer = (state.players || []).find(p => p.id === mpLocalId);

  // Draw pickups (server sends { health: [...], ammo: [...] })
  const pkData = state.pickups || {};
  for (const h of (pkData.health || [])) {
    ctx.save(); ctx.translate(h.x, h.y);
    const pulse = 0.8 + Math.sin(frameCount * 0.1) * 0.2;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#33cc44'; ctx.shadowBlur = 12; ctx.shadowColor = '#33cc4488';
    ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
    ctx.restore();
  }
  for (const a of (pkData.ammo || [])) {
    ctx.save(); ctx.translate(a.x, a.y);
    const pulse = 0.8 + Math.sin(frameCount * 0.1) * 0.2;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ccaa00'; ctx.shadowBlur = 12; ctx.shadowColor = '#ccaa0088';
    ctx.fillRect(-2, -8, 4, 12);
    ctx.restore();
  }

  // Draw hit trails from server
  for (const ht of (state.hitTrails || [])) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffee88'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ht.x1, ht.y1); ctx.lineTo(ht.x2, ht.y2); ctx.stroke();
    ctx.restore();
  }

  // Draw bullets from server
  for (const b of (state.bullets || [])) {
    ctx.save(); ctx.fillStyle = '#ffffaa'; ctx.shadowBlur = 6; ctx.shadowColor = '#ffcc00';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Draw spitter projectiles from server
  for (const sp of (state.spitterProjectiles || [])) {
    ctx.save();
    ctx.fillStyle = '#66cc22'; ctx.shadowBlur = 8; ctx.shadowColor = '#44aa00';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Draw zombies from server state
  for (const z of (state.zombies || [])) {
    const idHash = typeof z.id === 'string' ? z.id.charCodeAt(0) : (z.id || 0);
    const tempZ = {
      ...z,
      wobble: (frameCount * 0.08 + idHash),
      frame: frameCount,
      hitting: false,
      deathTimer: 0,
      alive: true,
      throwAnim: 0,
      shieldBroken: false,
      shieldHp: 0,
      shieldMaxHp: 0,
      shieldRegenTimer: 0,
      screamCooldown: 0,
      isBoss: false,
      burrowed: false,
      charging: false,
      speed: z.speed || 1,
      burnTimer: 0,
      cryoTimer: 0,
      shielded: false,
    };
    drawZombie(tempZ);
  }

  // Update + draw particles/decals (drawZombie pushes to these arrays)
  updateParticles();
  drawBloodDecals();
  drawParticles();

  // Draw ALL players — same skin, same drawPlayer function
  for (const p of (state.players || [])) {
    if (p.dead || p.rescued) continue;
    // Use predicted position for local player, server position for others
    const isLocal = (p.id === mpLocalId);
    const renderX = isLocal ? mpPredictedX : p.x;
    const renderY = isLocal ? mpPredictedY : p.y;

    const saved = { x: player.x, y: player.y, angle: player.angle, hp: player.hp, maxHp: player.maxHp, recoil: player.recoil, shield: player.shield, maxShield: player.maxShield };
    const savedWeapon = activeWeaponId;
    player.x = renderX; player.y = renderY; player.angle = p.angle;
    player.hp = p.hp; player.maxHp = p.maxHp;
    player.recoil = p.recoil || 0;
    player.shield = p.shield || 0; player.maxShield = p.maxShield || 0;
    activeWeaponId = p.weaponId || 'pistol';

    drawPlayer();

    // Restore
    player.x = saved.x; player.y = saved.y; player.angle = saved.angle;
    player.hp = saved.hp; player.maxHp = saved.maxHp;
    player.recoil = saved.recoil; player.shield = saved.shield; player.maxShield = saved.maxShield;
    activeWeaponId = savedWeapon;

    // Nametag + HP bar above each player
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = isLocal ? '#88aa66' : '#8090a0';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, renderX, renderY - 22);
    // HP bar
    ctx.fillStyle = '#1a0000';
    ctx.fillRect(renderX - 14, renderY - 18, 28, 3);
    ctx.fillStyle = p.downed ? '#cc2200' : '#33cc44';
    ctx.fillRect(renderX - 14, renderY - 18, 28 * Math.max(0, p.hp / (p.maxHp || 100)), 3);
    // Downed indicator
    if (p.downed) {
      ctx.strokeStyle = '#cc2200'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + Math.sin(frameCount*0.1)*0.3;
      ctx.beginPath(); ctx.arc(renderX, renderY, 18, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  // Draw MP minimap (custom — don't use singleplayer drawMinimap which reads global zombies)
  {
    const S = 6, ox = W - COLS*S - 10, oy = 10;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(ox-2, oy-2, COLS*S+4, ROWS*S+4);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (MAP && MAP[r] && MAP[r][c] >= 1) ? '#444' : '#1a1a1a';
        ctx.fillRect(ox + c*S, oy + r*S, S-1, S-1);
      }
    }
    // Zombies on minimap
    ctx.fillStyle = '#aa2200';
    for (const z of (state.zombies || [])) {
      ctx.fillRect(ox + (z.x/TILE)*S - 1, oy + (z.y/TILE)*S - 1, 3, 3);
    }
    // Players on minimap
    for (const p of (state.players || [])) {
      if (p.dead) continue;
      const isLocal = (p.id === mpLocalId);
      const px = isLocal ? mpPredictedX : p.x;
      const py = isLocal ? mpPredictedY : p.y;
      ctx.fillStyle = isLocal ? '#00ff88' : (p.downed ? '#cc2200' : '#33aaff');
      ctx.fillRect(ox + (px/TILE)*S - 2, oy + (py/TILE)*S - 2, 4, 4);
    }
    ctx.restore();
    // Wave info under minimap
    ctx.save();
    ctx.font = "14px 'Oswald', sans-serif"; ctx.fillStyle = '#666'; ctx.textAlign = 'center';
    ctx.fillText('WAVE ' + (state.wave || 1), ox + COLS*S/2, oy + ROWS*S + 18);
    ctx.restore();
  }

  // Update local HUD with local player data
  if (localPlayer) {
    document.getElementById('hp-val').textContent = Math.max(0, Math.floor(localPlayer.hp));
    const pct = Math.max(0, localPlayer.hp / (localPlayer.maxHp || 100));
    const bar = document.getElementById('hp-bar');
    bar.style.width = (pct * 100) + '%';
    bar.style.background = pct > 0.6 ? '#33cc44' : pct > 0.3 ? '#ccaa00' : '#cc2200';
    document.getElementById('ammo-val').textContent = localPlayer.ammo || 0;
    // Show level
    const xpLvl = document.getElementById('xp-level');
    if (xpLvl) xpLvl.textContent = 'LVL ' + (localPlayer.level || 1);
  }

  // Process events for sounds and feedback
  for (const ev of (state.events || [])) {
    if (ev.type === 'sound') playSoundThrottled(ev.sound, 30);
    if (ev.type === 'shoot') playSoundThrottled('shoot_' + (ev.weapon || 'pistol'), 30);
    if (ev.type === 'gold' && ev.playerId === mpLocalId) {
      floatingTexts.push({ x: ev.x || 0, y: (ev.y || 0) - 10, text: '+' + (ev.amount || 0) + 'G', life: 40, maxLife: 40, color: ev.jackpot ? '#ffcc00' : '#ddaa00' });
    }
    if (ev.type === 'wave_start') showWaveBanner('WAVE ' + ev.wave);
    if (ev.type === 'wave_clear') showWaveBanner('WAVE ' + ev.wave + ' CLEAR!');
    if (ev.type === 'player_downed' && ev.id === mpLocalId) showWaveBanner('DU BIST DOWN!');
    if (ev.type === 'player_revived' && ev.id === mpLocalId) showWaveBanner('WIEDERBELEBT!');
  }

  // Update floating texts
  updateFloatingTexts();
  drawFloatingTexts();

  // MP info
  ctx.save();
  ctx.font = "10px 'JetBrains Mono'"; ctx.fillStyle = '#ff0'; ctx.textAlign = 'left';
  ctx.fillText('MP | Z:' + (state.zombies||[]).length + ' P:' + (state.players||[]).length + ' W:' + (state.wave||0), 16, H - 4);
  ctx.restore();

  requestAnimationFrame(mpLoop);
}

document.querySelectorAll('.menu-tab').forEach(tab => {
  tab.addEventListener('click', () => { playSound('ui_click'); switchMenuTab(tab.dataset.tab); });
});

document.getElementById('st-back').addEventListener('click', () => {
  switchMenuTab('lobby');
});

// Map selector
document.querySelectorAll('.map-option').forEach(opt => {
  opt.addEventListener('click', () => {
    playSound('ui_click');
    document.querySelectorAll('.map-option').forEach(o => {
      o.classList.remove('active');
      o.style.border = '1px solid #1a1e22';
      o.style.background = 'transparent';
      o.style.color = '#3a5060';
      o.style.fontSize = '12px';
      o.style.padding = '10px 16px';
    });
    opt.classList.add('active');
    opt.style.border = '1px solid #ee2200';
    opt.style.background = 'rgba(238,34,0,0.04)';
    opt.style.color = '#8090a0';
    opt.style.fontSize = '14px';
    opt.style.padding = '12px 16px';
    selectedMap = opt.dataset.map;
  });
});

// Wave selector
document.querySelectorAll('.wave-option').forEach(opt => {
  opt.addEventListener('click', () => {
    playSound('ui_click');
    document.querySelectorAll('.wave-option').forEach(o => {
      o.classList.remove('active');
      o.style.border = '1px solid #1a1e22';
      o.style.background = 'transparent';
      o.style.color = '#3a5060';
    });
    opt.classList.add('active');
    opt.style.border = '1px solid #ee2200';
    opt.style.background = 'rgba(238,34,0,0.04)';
    opt.style.color = '#8090a0';
    startWave = parseInt(opt.dataset.wave) || 1;
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  mpEnabled = false;
  ensureAudio();
  document.getElementById('hud-username').textContent = currentUser ? currentUser.toUpperCase() : '';
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  lastRunText = '';
  paused = false;
  init();
  startAmbient();
  requestAnimationFrame(loop);
});

document.getElementById('resume-btn').addEventListener('click', () => {
  playSound('ui_click');
  togglePause();
});

document.getElementById('quit-btn').addEventListener('click', async () => {
  paused = false;
  running = false;
  stopAmbient();
  document.getElementById('pause-screen').style.display = 'none';

  if (authToken) {
    try { await syncToServer('/api/stats', runStats); } catch {}

    if (pendingXp > 0) {
      const xpToSync = pendingXp;
      pendingXp = 0;
      globalXp += xpToSync;
      try { await syncToServer('/api/xp', { xp: xpToSync }); } catch {}
    }

    if (pendingGold > 0 || pendingDiamonds > 0) {
      const g = pendingGold, d = pendingDiamonds;
      pendingGold = 0; pendingDiamonds = 0;
      globalGold += g; globalDiamonds += d;
      try { await syncToServer('/api/gold', { gold: g, diamonds: d }); } catch {}
    }

    try {
      const res = await syncToServer('/api/death', {});
      if (res.ok) {
        const data = await res.json();
        globalXp = data.xp;
        globalGold = 0;
      }
    } catch {}
  }

  // Reset weapons and perks on quit — back to pistol only
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

  lastRunText = 'VERLASSEN: Wave ' + wave + '  |  75% XP VERLOREN';
  showGameMenu();
});

function renderKeybinds() {
  const list = document.getElementById('keybind-list');
  if (!list) return;
  list.innerHTML = '';
  const labels = {
    moveUp: 'NACH OBEN', moveDown: 'NACH UNTEN', moveLeft: 'NACH LINKS', moveRight: 'NACH RECHTS',
    reload: 'NACHLADEN', dash: 'DASH', rescue: 'RESCUE', pause: 'PAUSE', perk: 'PERK AKTIVIEREN',
    operatorAbility: 'OPERATOR FAEHIGKEIT',
  };
  Object.entries(keybinds).forEach(([action, key]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #111418';
    const keyDisplay = key.replace('Key', '').replace('Arrow', '').replace('Space', 'LEERTASTE').replace('Escape', 'ESC');
    row.innerHTML = `
      <span style="font-size:12px;color:#8090a0;letter-spacing:2px">${labels[action]}</span>
      <button class="keybind-btn" data-action="${action}" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#c0ccd8;background:#0a0d10;border:1px solid #1a1e22;padding:6px 16px;cursor:pointer;min-width:100px;text-align:center">${keyDisplay}</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.keybind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.textContent = 'DRUECKE...';
      btn.style.color = '#ee2200';
      const handler = (e) => {
        e.preventDefault();
        keybinds[btn.dataset.action] = e.code;
        localStorage.setItem('dz_keybinds', JSON.stringify(keybinds));
        document.removeEventListener('keydown', handler);
        renderKeybinds();
      };
      document.addEventListener('keydown', handler);
    });
  });
}

// Sensitivity slider
document.getElementById('sensitivity-slider').addEventListener('input', (e) => {
  mouseSensitivity = parseFloat(e.target.value);
  document.getElementById('sensitivity-val').textContent = mouseSensitivity.toFixed(1);
  localStorage.setItem('dz_sensitivity', mouseSensitivity.toString());
});
document.getElementById('sensitivity-slider').value = mouseSensitivity;
document.getElementById('sensitivity-val').textContent = mouseSensitivity.toFixed(1);

// Password change
document.getElementById('pw-save-btn').addEventListener('click', async () => {
  const old = document.getElementById('pw-old').value;
  const newPw = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const errEl = document.getElementById('pw-error');

  if (!old || !newPw || !confirm) { errEl.textContent = 'Alle Felder ausfuellen'; return; }
  if (newPw !== confirm) { errEl.textContent = 'Passwoerter stimmen nicht ueberein'; return; }
  if (newPw.length < 3) { errEl.textContent = 'Mindestens 3 Zeichen'; return; }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ oldPassword: old, newPassword: newPw })
    });
    const data = await res.json();
    if (res.ok) {
      errEl.style.color = '#33cc44';
      errEl.textContent = 'Passwort geaendert!';
      document.getElementById('pw-old').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
    } else {
      errEl.style.color = '#ee2200';
      errEl.textContent = data.error || 'Fehler';
    }
  } catch { errEl.style.color = '#ee2200'; errEl.textContent = 'Server-Fehler'; }
});

// Stats display
async function loadStats() {
  const display = document.getElementById('stats-display');
  if (!display) return;
  display.innerHTML = '<div style="color:#3a4450">Laden...</div>';

  try {
    const res = await fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if (res.ok) {
      const s = await res.json();
      display.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="stat-card"><div class="stat-card-label">KILLS GESAMT</div><div class="stat-card-val">${s.total_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">HOECHSTE WAVE</div><div class="stat-card-val">${s.total_waves}</div></div>
          <div class="stat-card"><div class="stat-card-label">NORMAL KILLS</div><div class="stat-card-val">${s.total_normal_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">RUNNER KILLS</div><div class="stat-card-val">${s.total_runner_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">TANK KILLS</div><div class="stat-card-val">${s.total_tank_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">SPITTER KILLS</div><div class="stat-card-val">${s.total_spitter_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">BOSS KILLS</div><div class="stat-card-val">${s.total_boss_kills}</div></div>
          <div class="stat-card"><div class="stat-card-label">SCHADEN VERURSACHT</div><div class="stat-card-val">${Math.round(s.total_damage_dealt)}</div></div>
          <div class="stat-card"><div class="stat-card-label">SCHADEN ERHALTEN</div><div class="stat-card-val">${Math.round(s.total_damage_taken)}</div></div>
          <div class="stat-card"><div class="stat-card-label">GEHEILT</div><div class="stat-card-val">${Math.round(s.total_healed)}</div></div>
          <div class="stat-card"><div class="stat-card-label">XP VERDIENT</div><div class="stat-card-val">${s.total_xp_earned}</div></div>
          <div class="stat-card"><div class="stat-card-label">TODE</div><div class="stat-card-val">${s.total_deaths}</div></div>
          <div class="stat-card"><div class="stat-card-label">RETTUNGEN</div><div class="stat-card-val">${s.total_rescues}</div></div>
        </div>
      `;
    }
  } catch {}
}

// Settings tab switching
document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    playSound('ui_click');
    document.querySelectorAll('.settings-tab').forEach(t => { t.style.color = '#404855'; t.style.borderBottomColor = 'transparent'; });
    document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
    tab.style.color = '#ee2200';
    tab.style.borderBottomColor = '#ee2200';
    const panel = document.getElementById('spanel-' + tab.dataset.stab);
    if (panel) panel.style.display = 'block';
    if (tab.dataset.stab === 'stats') loadStats();
    if (tab.dataset.stab === 'controls') renderKeybinds();
  });
});

// Open/close settings
function showSettings() {
  document.getElementById('settings-screen').style.display = 'flex';
  renderKeybinds();
  // Sync volume controls
  document.getElementById('volume-slider').value = masterVolume;
  document.getElementById('volume-val').textContent = Math.round(masterVolume * 100) + '%';
  document.getElementById('sound-toggle').checked = soundEnabled;
}

document.getElementById('settings-btn-pause').addEventListener('click', showSettings);
document.getElementById('settings-btn-lobby').addEventListener('click', showSettings);
document.getElementById('settings-back').addEventListener('click', () => {
  document.getElementById('settings-screen').style.display = 'none';
});

// Volume controls
document.getElementById('volume-slider').addEventListener('input', (e) => {
  masterVolume = parseFloat(e.target.value);
  document.getElementById('volume-val').textContent = Math.round(masterVolume * 100) + '%';
  localStorage.setItem('dz_volume', masterVolume);
  if (ambientDrone) ambientDrone.gain.gain.value = masterVolume * 0.04;
});
document.getElementById('sound-toggle').addEventListener('change', (e) => {
  soundEnabled = e.target.checked;
  localStorage.setItem('dz_sound', soundEnabled);
  if (!soundEnabled) stopAmbient();
});

document.getElementById('mp-btn').addEventListener('click', () => {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('mp-lobby-screen').style.display = 'flex';
  document.getElementById('mp-pre-lobby').style.display = 'block';
  document.getElementById('mp-in-lobby').style.display = 'none';
});
document.getElementById('mp-create-btn').addEventListener('click', mpCreateLobby);
document.getElementById('mp-join-btn').addEventListener('click', mpJoinLobby);
document.getElementById('mp-back-btn').addEventListener('click', () => {
  mpDisconnect();
  document.getElementById('mp-lobby-screen').style.display = 'none';
  showGameMenu();
});
document.getElementById('mp-lobby-code').addEventListener('click', function() {
  navigator.clipboard.writeText(this.textContent);
  this.style.color = '#33cc44';
  setTimeout(() => this.style.color = '#ee2200', MP_CLIPBOARD_FEEDBACK_MS);
});
document.getElementById('mp-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') mpJoinLobby();
});

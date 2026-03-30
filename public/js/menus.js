const stCanvas = document.getElementById('skill-tree-canvas');
const stCtx = stCanvas.getContext('2d');
let stActive = false;
let stActivePath = 'survival';
let stCamX = 0, stCamY = 0, stZoom = 1;
let stTargetCamX = 0, stTargetCamY = 0, stTargetZoom = 1;
let stDragStart = null, stCamStart = null;
let stHovered = null;
let stTime = 0;

const ST_COLORS = {
  survival: { main: '#33cc44', dim: '#1a3a1e', glow: 'rgba(51,204,68,0.3)', bg: 'rgba(51,204,68,0.1)', line: '#1e4a22' },
  mobility: { main: '#33aaff', dim: '#152a40', glow: 'rgba(51,170,255,0.3)', bg: 'rgba(51,170,255,0.1)', line: '#183050' },
  rescue:   { main: '#ffaa00', dim: '#3a2a0a', glow: 'rgba(255,170,0,0.3)',  bg: 'rgba(255,170,0,0.1)',  line: '#4a3510' },
};

function stWorldToScreen(wx, wy) {
  return { x: (wx - stCamX) * stZoom + stCanvas.width/2, y: (wy - stCamY) * stZoom + stCanvas.height/2 };
}
function stScreenToWorld(sx, sy) {
  return { x: (sx - stCanvas.width/2) / stZoom + stCamX, y: (sy - stCanvas.height/2) / stZoom + stCamY };
}

function getAvailableSkillPoints() {
  const level = getLevelFromXp(globalXp);
  const total = level - 1;
  const used = activeSkills.reduce((sum, s) => sum + s.level, 0);
  return total - used;
}

function isSkillUnlockable(skill) {
  if (skill.tier === 0 || skill.maxLvl === 0) return false;
  const currentLvl = getSkillLevel(skill.id);
  if (currentLvl >= skill.maxLvl) return false;
  if (getAvailableSkillPoints() <= 0) return false;
  if (skill.req) {
    const reqSkill = SKILL_MAP[skill.req];
    if (reqSkill.tier > 0 && getSkillLevel(skill.req) <= 0) return false;
  }
  return true;
}

async function investSkillPoint(skillId) {
  if (!authToken) return;
  try {
    const res = await fetch('/api/skills/invest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ skillId })
    });
    if (res.ok) {
      const data = await res.json();
      activeSkills = data.skills.map(s => ({ skillId: s.skill_id, level: s.level }));
      updateSkillTreeTab();
    }
  } catch {}
}

function updateSkillTreeTab() {
  const totalLevel = getLevelFromXp(globalXp);
  const totalPoints = totalLevel - 1;
  const usedPoints = activeSkills.reduce((sum, s) => sum + s.level, 0);
  const availPts = totalPoints - usedPoints;
  const stTab = document.querySelector('.menu-tab[data-tab="skilltree"]');
  if (!stTab) return;
  if (availPts > 0) {
    stTab.classList.add('blink-notify');
    stTab.textContent = 'SKILL TREE (' + availPts + ')';
  } else {
    stTab.classList.remove('blink-notify');
    stTab.textContent = 'SKILL TREE';
  }
  const stPts = document.getElementById('st-points');
  if (stPts) {
    stPts.textContent = 'PUNKTE: ' + availPts;
    stPts.style.color = availPts > 0 ? '#33cc44' : '#556070';
  }
}

// Draw hexagon path helper
function stHexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (Math.PI / 3) * i;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Draw diamond path helper
function stDiamondPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.2);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r * 1.2);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function drawSkillConnections(col, connections) {
  for (const c of connections) {
    const from = SKILL_MAP[c.from], to = SKILL_MAP[c.to];
    const p1 = stWorldToScreen(from.x, from.y), p2 = stWorldToScreen(to.x, to.y);
    const fromInvested = getSkillLevel(from.id) > 0 || from.tier === 0;
    const active = fromInvested;

    if (active) {
      stCtx.save();
      stCtx.strokeStyle = col.glow; stCtx.lineWidth = 4 * stZoom;
      stCtx.beginPath(); stCtx.moveTo(p1.x, p1.y); stCtx.lineTo(p2.x, p2.y); stCtx.stroke();
      stCtx.restore();
    }

    stCtx.strokeStyle = active ? col.line : '#111418';
    stCtx.lineWidth = (active ? 2 : 1) * stZoom;
    stCtx.beginPath(); stCtx.moveTo(p1.x, p1.y); stCtx.lineTo(p2.x, p2.y); stCtx.stroke();

    if (active) {
      for (let i = 0; i < 3; i++) {
        const t = ((stTime * 0.25 + i / 3) % 1);
        const fx = p1.x + (p2.x - p1.x) * t;
        const fy = p1.y + (p2.y - p1.y) * t;
        stCtx.fillStyle = col.main;
        stCtx.globalAlpha = 0.5 * (1 - Math.abs(t - 0.5) * 2);
        stCtx.beginPath(); stCtx.arc(fx, fy, 1.5 * stZoom, 0, Math.PI * 2); stCtx.fill();
      }
      stCtx.globalAlpha = 1;

      const at = 0.7;
      const ax = p1.x + (p2.x - p1.x) * at;
      const ay = p1.y + (p2.y - p1.y) * at;
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const arrowSize = 4 * stZoom;
      stCtx.fillStyle = col.main; stCtx.globalAlpha = 0.6;
      stCtx.beginPath();
      stCtx.moveTo(ax + Math.cos(angle) * arrowSize, ay + Math.sin(angle) * arrowSize);
      stCtx.lineTo(ax + Math.cos(angle + 2.5) * arrowSize * 0.7, ay + Math.sin(angle + 2.5) * arrowSize * 0.7);
      stCtx.lineTo(ax + Math.cos(angle - 2.5) * arrowSize * 0.7, ay + Math.sin(angle - 2.5) * arrowSize * 0.7);
      stCtx.fill();
      stCtx.globalAlpha = 1;
    }
  }
}

function drawSkillNodes(col, skillDefs) {
  for (const s of skillDefs) {
    const p = stWorldToScreen(s.x, s.y);
    const isHovered = stHovered === s;
    const r = s.r * stZoom;
    const invested = getSkillLevel(s.id);
    const unlockable = isSkillUnlockable(s);
    const hasInvestment = invested > 0;
    const isTier3 = s.tier === 3;
    const isStart = s.tier === 0;
    const isLocked = !hasInvestment && !unlockable && !isStart;

    if ((hasInvestment || isHovered) && !isStart) {
      stCtx.save();
      stCtx.shadowBlur = isHovered ? 30 : 18;
      stCtx.shadowColor = col.main;
      isTier3 ? stDiamondPath(stCtx, p.x, p.y, r) : stHexPath(stCtx, p.x, p.y, r);
      stCtx.fillStyle = 'rgba(0,0,0,0.01)'; stCtx.fill();
      stCtx.restore();
    }

    if (isTier3) {
      const pulse = r + 5*stZoom + Math.sin(stTime * 2) * 2*stZoom;
      stCtx.save();
      stDiamondPath(stCtx, p.x, p.y, pulse);
      stCtx.strokeStyle = hasInvestment ? col.main : col.dim;
      stCtx.lineWidth = stZoom;
      stCtx.globalAlpha = 0.3 + Math.sin(stTime * 2) * 0.15;
      stCtx.setLineDash([3*stZoom, 3*stZoom]); stCtx.stroke();
      stCtx.restore();
    }

    stCtx.save();
    if (isTier3) {
      stDiamondPath(stCtx, p.x, p.y, r);
    } else if (isStart) {
      stCtx.beginPath(); stCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    } else {
      stHexPath(stCtx, p.x, p.y, r);
    }

    if (hasInvestment) {
      stCtx.fillStyle = col.bg;
    } else if (isStart) {
      stCtx.fillStyle = 'rgba(15,18,22,0.9)';
    } else if (isLocked) {
      stCtx.fillStyle = '#0a0c0e';
    } else if (isHovered) {
      stCtx.fillStyle = 'rgba(20,25,30,0.95)';
    } else {
      stCtx.fillStyle = '#0c0e12';
    }
    stCtx.fill();

    if (hasInvestment) {
      stCtx.strokeStyle = col.main;
      stCtx.lineWidth = 2 * stZoom;
    } else if (unlockable) {
      stCtx.strokeStyle = col.dim;
      stCtx.lineWidth = 1.5 * stZoom;
    } else if (isStart) {
      stCtx.strokeStyle = col.dim;
      stCtx.lineWidth = 1.5 * stZoom;
    } else {
      stCtx.strokeStyle = '#1a1e22';
      stCtx.lineWidth = 1 * stZoom;
    }
    stCtx.stroke();
    stCtx.restore();

    if (isStart) {
      stCtx.save();
      stCtx.beginPath(); stCtx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
      stCtx.fillStyle = col.main; stCtx.globalAlpha = 0.4; stCtx.fill();
      stCtx.restore();
    }

    if (isLocked && stZoom > 0.5) {
      stCtx.save();
      stCtx.globalAlpha = 0.15;
      stCtx.strokeStyle = '#333';
      stCtx.lineWidth = 2 * stZoom;
      const lw = r * 0.6;
      stCtx.beginPath();
      stCtx.moveTo(p.x - lw, p.y - 1*stZoom); stCtx.lineTo(p.x + lw, p.y - 1*stZoom);
      stCtx.moveTo(p.x - lw*0.7, p.y + 3*stZoom); stCtx.lineTo(p.x + lw*0.7, p.y + 3*stZoom);
      stCtx.stroke();
      stCtx.restore();
    }

    if (stZoom > 0.35 && !isLocked) {
      stCtx.save();
      stCtx.font = Math.max(12, r * 0.7) + 'px serif';
      stCtx.textAlign = 'center'; stCtx.textBaseline = 'middle';
      stCtx.globalAlpha = hasInvestment || isStart ? 1 : 0.6;
      stCtx.fillText(s.icon, p.x, p.y);
      stCtx.restore();
    }

    if (stZoom > 0.55) {
      stCtx.save();
      stCtx.font = Math.max(8, 9*stZoom) + "px 'JetBrains Mono', monospace";
      stCtx.textAlign = 'center';
      stCtx.fillStyle = hasInvestment ? col.main : isHovered ? '#778' : isLocked ? '#222' : '#445';
      const labelY = isTier3 ? p.y + r * 1.3 + 10*stZoom : p.y + r + 12*stZoom;
      stCtx.fillText(s.name, p.x, labelY);
      stCtx.restore();
    }

    if (s.maxLvl > 0 && stZoom > 0.5) {
      const pipW = 5*stZoom, pipH = 2.5*stZoom, gap = 2*stZoom;
      const totalW = s.maxLvl * (pipW + gap) - gap;
      const startX = p.x - totalW / 2;
      const pipY = isTier3 ? p.y - r * 1.3 - 6*stZoom : p.y - r - 6*stZoom;
      for (let i = 0; i < s.maxLvl; i++) {
        stCtx.fillStyle = i < invested ? col.main : '#1a1e22';
        stCtx.globalAlpha = i < invested ? 1 : 0.5;
        stCtx.fillRect(startX + i * (pipW + gap), pipY, pipW, pipH);
      }
      stCtx.globalAlpha = 1;
    }
  }
}

function drawSkillTree() {
  if (!stActive) return;
  stTime += 0.016;
  const sw = stCanvas.width, sh = stCanvas.height;

  stCamX += (stTargetCamX - stCamX) * 0.08;
  stCamY += (stTargetCamY - stCamY) * 0.08;
  stZoom += (stTargetZoom - stZoom) * 0.08;

  stCtx.clearRect(0, 0, sw, sh);

  stCtx.fillStyle = '#06080a';
  stCtx.fillRect(0, 0, sw, sh);

  const hexSize = 40 * stZoom;
  if (hexSize > 8) {
    stCtx.strokeStyle = '#0e1014';
    stCtx.lineWidth = 0.5;
    const hexH = hexSize * Math.sqrt(3);
    const startCol = Math.floor((-sw/2/stZoom + stCamX) / (hexSize * 1.5)) - 1;
    const endCol = startCol + Math.ceil(sw / (hexSize * 1.5 * stZoom)) + 3;
    const startRow = Math.floor((-sh/2/stZoom + stCamY) / hexH) - 1;
    const endRow = startRow + Math.ceil(sh / (hexH * stZoom)) + 3;
    for (let col = startCol; col < endCol; col++) {
      for (let row = startRow; row < endRow; row++) {
        const wx = col * hexSize * 1.5;
        const wy = row * hexH + (col % 2 ? hexH / 2 : 0);
        const p = stWorldToScreen(wx, wy);
        if (p.x < -hexSize*2 || p.x > sw+hexSize*2 || p.y < -hexSize*2 || p.y > sh+hexSize*2) continue;
        stHexPath(stCtx, p.x, p.y, hexSize * 0.55);
        stCtx.stroke();
      }
    }
  }

  const col = ST_COLORS[stActivePath];
  const activeConns = SKILL_CONNECTIONS.filter(c => c.path === stActivePath);
  const activeSkillDefs = SKILLS.filter(s => s.path === stActivePath);

  drawSkillConnections(col, activeConns);
  drawSkillNodes(col, activeSkillDefs);

  const pts = getAvailableSkillPoints();
  document.getElementById('st-points').textContent = 'PUNKTE: ' + pts;
  document.getElementById('st-points').style.color = pts > 0 ? col.main : '#556070';

  requestAnimationFrame(drawSkillTree);
}

// Skill tree input handlers
function stMousePos(e) {
  const r = stCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

stCanvas.addEventListener('mousedown', e => {
  stDragStart = { x: e.clientX, y: e.clientY };
  stCamStart = { x: stTargetCamX, y: stTargetCamY };
});

stCanvas.addEventListener('mousemove', e => {
  if (stDragStart) {
    stTargetCamX = stCamStart.x - (e.clientX - stDragStart.x) / stZoom;
    stTargetCamY = stCamStart.y - (e.clientY - stDragStart.y) / stZoom;
    document.getElementById('st-tooltip').style.display = 'none';
    stHovered = null;
    return;
  }

  const mp = stMousePos(e);
  const world = stScreenToWorld(mp.x, mp.y);
  stHovered = null;
  for (const s of SKILLS.filter(sk => sk.path === stActivePath)) {
    const ddx = world.x - s.x, ddy = world.y - s.y;
    if (ddx*ddx + ddy*ddy < (s.r+8)*(s.r+8)) { stHovered = s; break; }
  }

  const tt = document.getElementById('st-tooltip');
  if (stHovered) {
    const s = stHovered;
    const c = ST_COLORS[s.path];
    const lvl = getSkillLevel(s.id);
    const isLocked = lvl === 0 && !isSkillUnlockable(s) && s.tier > 0;
    let html = '<div style="font-size:8px;color:#334;letter-spacing:2px;margin-bottom:4px">' + (s.tier === 3 ? 'CAPSTONE' : 'TIER ' + s.tier) + '</div>';
    html += '<div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:' + c.main + ';margin-bottom:6px">' + s.name + '</div>';
    if (isLocked) {
      html += '<div style="font-size:10px;color:#334;letter-spacing:1px">[CLASSIFIED]</div>';
    } else {
      html += '<div style="font-size:10px;color:#667;line-height:1.6;margin-bottom:8px">' + s.desc + '</div>';
    }
    if (s.maxLvl > 0) {
      html += '<div style="font-size:9px;color:#556;margin-bottom:4px;letter-spacing:1px">LVL ' + lvl + '/' + s.maxLvl + '</div>';
      if (s.effect && lvl > 0) {
        const fx = s.effect(lvl);
        const entries = Object.entries(fx).filter(([k,v]) => v !== 0);
        if (entries.length > 0) {
          html += '<div style="font-size:9px;color:#889;border-top:1px solid #1a1e22;padding-top:6px;margin-top:4px">';
          for (const [k, v] of entries) html += k + ': <span style="color:' + c.main + '">' + (v > 0 ? '+' : '') + v + '</span><br>';
          html += '</div>';
        }
      }
      if (s.req) html += '<div style="font-size:8px;color:#cc2200;margin-top:6px;letter-spacing:1px">REQ: ' + SKILL_MAP[s.req].name + '</div>';
    }
    tt.innerHTML = html;
    const panelRect = stCanvas.parentElement.getBoundingClientRect();
    let tx = e.clientX - panelRect.left + 16, ty = e.clientY - panelRect.top - 10;
    if (tx + 270 > stCanvas.width) tx = e.clientX - panelRect.left - 270;
    if (ty < 10) ty = 10;
    tt.style.left = tx + 'px'; tt.style.top = ty + 'px';
    tt.style.display = 'block';
    stCanvas.style.cursor = isSkillUnlockable(s) ? 'pointer' : 'default';
  } else {
    tt.style.display = 'none';
    stCanvas.style.cursor = 'grab';
  }
});

stCanvas.addEventListener('mouseup', e => {
  if (stDragStart && Math.abs(e.clientX - stDragStart.x) < 5 && Math.abs(e.clientY - stDragStart.y) < 5) {
    if (stHovered && isSkillUnlockable(stHovered)) {
      investSkillPoint(stHovered.id);
    }
  }
  stDragStart = null; stCamStart = null;
});

stCanvas.addEventListener('mouseleave', () => {
  stDragStart = null; stHovered = null;
  document.getElementById('st-tooltip').style.display = 'none';
});

stCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = -e.deltaY * 0.0008;
  stTargetZoom = Math.max(0.4, Math.min(2.5, stTargetZoom * (1 + delta)));
  const mp = stMousePos(e);
  const wx = (mp.x - stCanvas.width/2) / stZoom + stCamX;
  const wy = (mp.y - stCanvas.height/2) / stZoom + stCamY;
  stTargetCamX = wx - (mp.x - stCanvas.width/2) / stTargetZoom;
  stTargetCamY = wy - (mp.y - stCanvas.height/2) / stTargetZoom;
}, { passive: false });

function stSelectPath(p) {
  stActivePath = p;
  document.getElementById('st-survival').className = 'start-btn' + (p === 'survival' ? '' : ' btn-secondary');
  document.getElementById('st-mobility').className = 'start-btn' + (p === 'mobility' ? '' : ' btn-secondary');
  document.getElementById('st-rescue').className = 'start-btn' + (p === 'rescue' ? '' : ' btn-secondary');
  stTargetCamX = 0; stTargetCamY = -200; stTargetZoom = 1;
}

document.getElementById('st-survival').addEventListener('click', () => stSelectPath('survival'));
document.getElementById('st-mobility').addEventListener('click', () => stSelectPath('mobility'));
document.getElementById('st-rescue').addEventListener('click', () => stSelectPath('rescue'));

function drawWeaponPreview(ctx, weaponId, scale) {
  ctx.save();
  const s = scale || 1;

  const dark = '#1e2220';
  const body = '#343836';
  const light = '#4a514c';
  const accent = '#555d58';
  const wood = '#4a3828';
  const woodL = '#5a4832';
  const bore = '#0e0f0e';
  const red = '#cc2200';
  const outline = '#2a3030';

  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  if (weaponId === 'pistol') {
    // Compact handgun — top-down: rectangular body, short barrel
    // Body
    ctx.fillStyle = body;
    ctx.fillRect(-6*s, -3*s, 16*s, 6*s);
    // Barrel
    ctx.fillStyle = dark;
    ctx.fillRect(10*s, -2*s, 10*s, 4*s);
    // Bore
    ctx.fillStyle = bore;
    ctx.beginPath(); ctx.arc(20*s, 0, 1.2*s, 0, Math.PI*2); ctx.fill();
    // Grip (below, visible as wider section)
    ctx.fillStyle = wood;
    ctx.fillRect(-4*s, -4.5*s, 8*s, 9*s);
    // Trigger guard
    ctx.strokeStyle = body; ctx.lineWidth = 1*s;
    ctx.beginPath(); ctx.arc(3*s, 0, 2.5*s, -0.5, 0.5); ctx.stroke();
    // Sight dot
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(19*s, 0, 0.8*s, 0, Math.PI*2); ctx.fill();

  } else if (weaponId === 'smg') {
    // Compact SMG — slightly longer, magazine sticks out
    // Stock stub
    ctx.fillStyle = dark;
    ctx.fillRect(-16*s, -2*s, 8*s, 4*s);
    // Body
    ctx.fillStyle = body;
    ctx.fillRect(-8*s, -3.5*s, 22*s, 7*s);
    // Barrel
    ctx.fillStyle = dark;
    ctx.fillRect(14*s, -2*s, 12*s, 4*s);
    ctx.fillStyle = bore;
    ctx.beginPath(); ctx.arc(26*s, 0, 1.2*s, 0, Math.PI*2); ctx.fill();
    // Magazine (sticks out to one side)
    ctx.fillStyle = accent;
    ctx.fillRect(0*s, 3.5*s, 5*s, 8*s);
    // Foregrip
    ctx.fillStyle = light;
    ctx.fillRect(8*s, -4.5*s, 4*s, 9*s);
    // Sight
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(25*s, 0, 0.8*s, 0, Math.PI*2); ctx.fill();

  } else if (weaponId === 'shotgun') {
    // Pump shotgun — long, wide barrel end
    // Stock
    ctx.fillStyle = wood;
    ctx.fillRect(-28*s, -2.5*s, 14*s, 5*s);
    ctx.fillStyle = woodL;
    ctx.fillRect(-28*s, -2.5*s, 3*s, 5*s);
    // Receiver
    ctx.fillStyle = body;
    ctx.fillRect(-14*s, -3.5*s, 16*s, 7*s);
    // Pump grip
    ctx.fillStyle = wood;
    ctx.fillRect(2*s, -4*s, 8*s, 8*s);
    ctx.strokeStyle = woodL; ctx.lineWidth = 0.6*s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo((3+i*2.5)*s, -3*s); ctx.lineTo((3+i*2.5)*s, 3*s); ctx.stroke();
    }
    // Barrel — wider
    ctx.fillStyle = dark;
    ctx.fillRect(10*s, -3*s, 20*s, 6*s);
    // Muzzle — wide opening
    ctx.fillStyle = bore;
    ctx.beginPath(); ctx.arc(30*s, 0, 2.5*s, 0, Math.PI*2); ctx.fill();

  } else if (weaponId === 'assault_rifle') {
    // AR — long with rail on top
    // Stock
    ctx.fillStyle = dark;
    ctx.fillRect(-30*s, -2.5*s, 12*s, 5*s);
    ctx.fillStyle = body;
    ctx.fillRect(-32*s, -3.5*s, 5*s, 7*s);
    // Body/receiver
    ctx.fillStyle = body;
    ctx.fillRect(-18*s, -4*s, 26*s, 8*s);
    // Rail on top
    ctx.fillStyle = light;
    ctx.fillRect(-14*s, -5*s, 20*s, 1.5*s);
    // Magazine
    ctx.fillStyle = accent;
    ctx.save(); ctx.translate(-4*s, 4*s); ctx.rotate(0.08);
    ctx.fillRect(0, 0, 5*s, 10*s);
    ctx.restore();
    // Handguard
    ctx.fillStyle = dark;
    ctx.fillRect(8*s, -3*s, 14*s, 6*s);
    // Barrel
    ctx.fillStyle = dark;
    ctx.fillRect(22*s, -1.5*s, 14*s, 3*s);
    // Flash hider
    ctx.fillStyle = body;
    ctx.fillRect(34*s, -2.5*s, 4*s, 5*s);
    ctx.fillStyle = bore;
    ctx.beginPath(); ctx.arc(38*s, 0, 1*s, 0, Math.PI*2); ctx.fill();
    // Sight
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(4*s, -5.5*s, 0.8*s, 0, Math.PI*2); ctx.fill();

  } else if (weaponId === 'sniper') {
    // Sniper — very long, scope visible as long cylinder on top
    // Stock (adjustable)
    ctx.fillStyle = body;
    ctx.fillRect(-40*s, -2.5*s, 16*s, 5*s);
    ctx.fillStyle = dark;
    ctx.fillRect(-42*s, -4*s, 5*s, 8*s);
    // Body
    ctx.fillStyle = body;
    ctx.fillRect(-24*s, -3.5*s, 22*s, 7*s);
    // Scope (long tube on top)
    ctx.fillStyle = dark;
    ctx.fillRect(-18*s, -6.5*s, 22*s, 3*s);
    // Scope lenses
    ctx.fillStyle = '#1a2a44';
    ctx.beginPath(); ctx.arc(-18*s, -5*s, 1.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4*s, -5*s, 1.5*s, 0, Math.PI*2); ctx.fill();
    // Magazine
    ctx.fillStyle = accent;
    ctx.fillRect(-10*s, 3.5*s, 6*s, 6*s);
    // Long barrel
    ctx.fillStyle = dark;
    ctx.fillRect(-2*s, -2*s, 40*s, 4*s);
    // Muzzle brake
    ctx.fillStyle = body;
    ctx.fillRect(36*s, -3*s, 6*s, 6*s);
    ctx.fillStyle = bore;
    ctx.fillRect(38*s, -1.5*s, 1*s, 3*s);
    ctx.fillRect(40*s, -1.5*s, 1*s, 3*s);
    // Bipod legs (folded alongside barrel)
    ctx.strokeStyle = light; ctx.lineWidth = 1.2*s;
    ctx.beginPath(); ctx.moveTo(4*s, 3.5*s); ctx.lineTo(14*s, 5*s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4*s, -3.5*s); ctx.lineTo(14*s, -5*s); ctx.stroke();

  } else if (weaponId === 'minigun') {
    // Minigun — wide, multiple barrels visible as parallel lines
    // Motor/rear housing
    ctx.fillStyle = body;
    ctx.fillRect(-20*s, -7*s, 14*s, 14*s);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(-20*s, 0, 7*s, 0, Math.PI*2); ctx.fill();
    // Handles
    ctx.fillStyle = wood;
    ctx.fillRect(-16*s, -10*s, 6*s, 3*s);
    ctx.fillRect(-16*s, 7*s, 6*s, 3*s);
    // Body
    ctx.fillStyle = body;
    ctx.fillRect(-6*s, -5*s, 18*s, 10*s);
    // 6 barrels as parallel lines
    ctx.fillStyle = dark;
    const barrelOffsets = [-5, -3, -1, 1, 3, 5];
    for (const off of barrelOffsets) {
      ctx.fillRect(12*s, off*s - 0.8*s, 26*s, 1.6*s);
    }
    // Barrel shroud ring
    ctx.strokeStyle = light; ctx.lineWidth = 1.5*s;
    ctx.beginPath(); ctx.arc(24*s, 0, 6.5*s, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(34*s, 0, 6.5*s, 0, Math.PI*2); ctx.stroke();
    // Muzzle ends
    for (const off of barrelOffsets) {
      ctx.fillStyle = bore;
      ctx.beginPath(); ctx.arc(38*s, off*s, 0.8*s, 0, Math.PI*2); ctx.fill();
    }
    // Ammo belt
    ctx.fillStyle = '#ddaa00'; ctx.globalAlpha = 0.25;
    ctx.fillRect(-18*s, -12*s, 10*s, 2.5*s);
    ctx.fillRect(-12*s, -14*s, 8*s, 2.5*s);
    ctx.globalAlpha = 1;
  }

  // Schematic overlay — thin outline around weapon for blueprint feel
  ctx.strokeStyle = '#2a3535';
  ctx.lineWidth = 0.5 * s;
  ctx.globalAlpha = 0.3;
  // Center crosshair
  ctx.beginPath();
  ctx.moveTo(-3*s, 0); ctx.lineTo(3*s, 0);
  ctx.moveTo(0, -3*s); ctx.lineTo(0, 3*s);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// Arsenal UI
function renderArsenal() {
  const weaponList = document.getElementById('weapon-list');
  if (!weaponList) return;
  weaponList.innerHTML = '';

  // Update gold display in arsenal
  const arsenalGold = document.getElementById('arsenal-gold');
  if (arsenalGold) arsenalGold.textContent = globalGold + ' G';

  const level = getLevelFromXp(globalXp);
  const gold = globalGold;

  Object.entries(WEAPONS).forEach(([id, wpn]) => {
    const owned = ownedWeaponIds.includes(id);
    const locked = !owned && (id === 'pistol' ? false : level < wpn.unlockLevel);
    const canBuy = !owned && level >= wpn.unlockLevel && gold >= wpn.cost && id !== 'pistol';
    const isActive = id === activeWeaponId;

    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 18px;cursor:pointer;border-left:3px solid transparent;transition:all 0.1s;';
    if (isActive) item.style.borderLeftColor = '#ee2200';
    if (isActive) item.style.background = 'rgba(238,34,0,0.04)';
    if (id === selectedArsenalWeapon) item.style.background = 'rgba(255,255,255,0.03)';
    if (!owned && !canBuy) item.style.opacity = '0.35';

    item.innerHTML = `
      <div style="width:40px;height:40px;border:1px solid ${owned ? '#1e2228' : '#111418'};background:rgba(255,255,255,0.02);display:flex;align-items:center;justify-content:center;font-size:20px">${owned ? wpn.icon : '\u{1F512}'}</div>
      <div style="flex:1">
        <div style="font-family:'Oswald',sans-serif;font-size:14px;font-weight:500;letter-spacing:2px;color:${owned ? '#c0ccd8' : '#3a4450'}">${wpn.name}</div>
        <div style="font-size:10px;color:#3a4450;letter-spacing:1px">${wpn.type}</div>
        ${!owned ? '<div style="font-size:10px;letter-spacing:1px;color:#661100;margin-top:2px">LVL ' + wpn.unlockLevel + ' // ' + wpn.cost + 'G</div>' : ''}
      </div>
    `;

    item.addEventListener('click', () => {
      selectedArsenalWeapon = id;
      renderArsenal();
    });

    weaponList.appendChild(item);
  });

  // Center display
  const sel = WEAPONS[selectedArsenalWeapon] || WEAPONS.pistol;
  const selOwned = ownedWeaponIds.includes(selectedArsenalWeapon);
  document.getElementById('arsenal-wpn-name').textContent = sel.name;
  document.getElementById('arsenal-wpn-type').textContent = sel.type + (sel.special ? ' // ' + sel.special.toUpperCase() : '');
  // Draw weapon preview on canvas
  const wpnCanvas = document.getElementById('arsenal-wpn-canvas');
  if (wpnCanvas) {
    const wCtx = wpnCanvas.getContext('2d');
    wCtx.clearRect(0, 0, wpnCanvas.width, wpnCanvas.height);
    wCtx.save();
    wCtx.translate(wpnCanvas.width / 2, wpnCanvas.height / 2);
    drawWeaponPreview(wCtx, selectedArsenalWeapon, 2.2);
    wCtx.restore();
  }

  const actionDiv = document.getElementById('arsenal-wpn-action');
  if (selOwned) {
    if (selectedArsenalWeapon === activeWeaponId) {
      actionDiv.innerHTML = '<div style="font-size:10px;letter-spacing:2px;color:#33cc44">AUSGERUESTET</div>';
    } else {
      actionDiv.innerHTML = '<button id="equip-btn" style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:3px;color:#33cc44;background:transparent;border:1px solid #33cc44;padding:8px 30px;cursor:pointer">AUSRUESTEN</button>';
      document.getElementById('equip-btn').addEventListener('click', () => {
        setActiveWeapon(selectedArsenalWeapon);
        renderArsenal();
      });
    }
  } else if (level >= sel.unlockLevel && gold >= sel.cost) {
    actionDiv.innerHTML = '<button id="buy-btn" style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:3px;color:#ddaa00;background:transparent;border:1px solid #ddaa00;padding:8px 30px;cursor:pointer">KAUFEN \u2014 ' + sel.cost + 'G</button>';
    document.getElementById('buy-btn').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/weapons/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ weaponId: selectedArsenalWeapon })
        });
        if (res.ok) {
          const data = await res.json();
          playerWeapons = data.weapons;
          ownedWeaponIds = ['pistol', ...data.weapons.map(w => w.weapon_id)];
          globalGold = data.gold;
          renderArsenal();
        }
      } catch {}
    });
  } else {
    let reason = level < sel.unlockLevel ? 'LVL ' + sel.unlockLevel + ' BENOETIGT' : 'NICHT GENUG GOLD';
    actionDiv.innerHTML = '<div style="font-size:10px;letter-spacing:2px;color:#661100">' + reason + '</div>';
  }

  // Stats panel
  const statsContainer = document.getElementById('stats-container');
  if (!statsContainer) return;
  statsContainer.innerHTML = '';

  const statDefs = [
    { key: 'dmg', name: 'SCHADEN', color: '#ee2200' },
    { key: 'range', name: 'REICHWEITE', color: '#44aa88' },
    { key: 'rate', name: 'FEUERRATE', color: '#ddaa00' },
    { key: 'reload', name: 'NACHLADEN', color: '#8866cc' },
    { key: 'mag', name: 'MAGAZIN', color: '#3388dd' },
    { key: 'acc', name: 'GENAUIGKEIT', color: '#55bb33' },
  ];

  const wpnData = playerWeapons.find(w => w.weapon_id === selectedArsenalWeapon);

  statDefs.forEach(sd => {
    const currentLvl = wpnData ? (wpnData[sd.key + '_level'] || 0) : 0;
    const maxLvl = 10;
    const cost = getUpgradeCost(sd.key, currentLvl);
    const canUpgrade = selOwned && currentLvl < maxLvl && gold >= cost;

    const currentVal = getWeaponStat(selectedArsenalWeapon, sd.key);
    // Format stat as readable number
    let displayVal;
    if (sd.key === 'dmg') displayVal = currentVal.toFixed(1) + 'x';
    else if (sd.key === 'range') displayVal = Math.round(currentVal) + 'm';
    else if (sd.key === 'rate') displayVal = (60 / currentVal).toFixed(1) + '/s';
    else if (sd.key === 'reload') displayVal = (currentVal / 1000).toFixed(1) + 's';
    else if (sd.key === 'mag') displayVal = Math.round(currentVal);
    else if (sd.key === 'acc') displayVal = (100 - currentVal * 100).toFixed(0) + '%';

    // What the next upgrade gives
    let nextVal = '';
    if (currentLvl < maxLvl) {
      // Simulate +1 level
      const base = WEAPONS[selectedArsenalWeapon];
      const nl = currentLvl + 1;
      let nv;
      if (sd.key === 'dmg') nv = base.damage * (1 + nl * 0.1);
      else if (sd.key === 'range') nv = base.range + nl * 5;
      else if (sd.key === 'rate') nv = Math.max(Math.ceil(base.fireRate * 0.4), base.fireRate - nl * 0.3);
      else if (sd.key === 'reload') nv = base.reloadMs * (1 - nl * 0.08);
      else if (sd.key === 'mag') nv = Math.round(base.magSize * (1 + nl * 0.1));
      else if (sd.key === 'acc') nv = base.spread * (1 - nl * 0.08);

      if (sd.key === 'dmg') nextVal = ' \u2192 ' + nv.toFixed(1) + 'x';
      else if (sd.key === 'range') nextVal = ' \u2192 ' + Math.round(nv) + 'm';
      else if (sd.key === 'rate') nextVal = ' \u2192 ' + (60 / nv).toFixed(1) + '/s';
      else if (sd.key === 'reload') nextVal = ' \u2192 ' + (nv / 1000).toFixed(1) + 's';
      else if (sd.key === 'mag') nextVal = ' \u2192 ' + Math.round(nv);
      else if (sd.key === 'acc') nextVal = ' \u2192 ' + (100 - nv * 100).toFixed(0) + '%';
    }

    const row = document.createElement('div');
    row.style.marginBottom = '16px';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
        <span style="font-size:11px;letter-spacing:2px;color:#4a5460">${sd.name}</span>
        <span style="font-size:10px;color:#556070;letter-spacing:1px">LVL ${currentLvl}/${maxLvl}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-family:'Oswald',sans-serif;font-size:18px;color:${sd.color};letter-spacing:1px">${displayVal}<span style="font-size:12px;color:#3a4450">${nextVal}</span></span>
        ${selOwned ? `<button class="upgrade-stat-btn" data-stat="${sd.key}" style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:1px;color:${canUpgrade ? '#ddaa00' : '#333'};background:transparent;border:1px solid ${canUpgrade ? '#665500' : '#1a1a1a'};padding:4px 12px;cursor:${canUpgrade ? 'pointer' : 'default'}">${currentLvl >= maxLvl ? 'MAX' : cost + 'G \u25B2'}</button>` : ''}
      </div>
    `;
    statsContainer.appendChild(row);
  });

  // Wire upgrade buttons
  statsContainer.querySelectorAll('.upgrade-stat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stat = btn.dataset.stat;
      const wpnD = playerWeapons.find(w => w.weapon_id === selectedArsenalWeapon);
      const lvl = wpnD ? (wpnD[stat + '_level'] || 0) : 0;
      if (lvl >= 10) return;
      const cst = getUpgradeCost(stat, lvl);
      if (globalGold < cst) return;

      try {
        const res = await fetch('/api/weapons/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ weaponId: selectedArsenalWeapon, stat })
        });
        if (res.ok) {
          const data = await res.json();
          playerWeapons = data.weapons;
          ownedWeaponIds = ['pistol', ...data.weapons.map(w => w.weapon_id)];
          globalGold = data.gold;
          renderArsenal();
        }
      } catch {}
    });
  });

  // Perk slots for selected weapon
  const perkSection = document.createElement('div');
  perkSection.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1px solid #141a20';
  perkSection.innerHTML = '<div style="font-family:Oswald,sans-serif;font-size:15px;font-weight:600;letter-spacing:3px;color:#8090a0;margin-bottom:14px;text-align:center">PERKS</div>';

  const wpnPerks = Object.entries(PERK_DEFS).filter(([id, p]) => p.weaponId === selectedArsenalWeapon);
  const perkRow = document.createElement('div');
  perkRow.style.cssText = 'display:flex;gap:16px;justify-content:center';

  for (const [perkId, perk] of wpnPerks) {
    const owned = ownedPerks.includes(perkId);
    const slot = document.createElement('div');
    slot.style.cssText = 'width:56px;height:56px;border:1px solid ' + (owned ? '#33cc44' : '#1a1e22') + ';background:' + (owned ? 'rgba(51,204,68,0.06)' : 'rgba(255,255,255,0.02)') + ';display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:all 0.2s';
    // Diamond shape via transform
    slot.style.transform = 'rotate(45deg)';
    const inner = document.createElement('div');
    inner.style.cssText = 'transform:rotate(-45deg);text-align:center;font-size:9px;letter-spacing:1px;line-height:1.3';
    if (owned) {
      inner.innerHTML = '<div style="font-size:18px">' + perk.icon + '</div><div style="color:#33cc44;font-size:7px">' + perk.name + '</div>';
    } else {
      inner.innerHTML = '<div style="font-size:18px;color:#333">+</div><div style="color:#333;font-size:7px">SHOP</div>';
    }
    slot.appendChild(inner);
    if (!owned) {
      slot.addEventListener('click', () => switchMenuTab('shop'));
    }
    // Tooltip on hover
    slot.title = perk.name + ' — ' + perk.desc;
    perkRow.appendChild(slot);
  }
  perkSection.appendChild(perkRow);
  statsContainer.appendChild(perkSection);
}

function renderOperators() {
  const grid = document.getElementById('operator-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const opGold = document.getElementById('op-gold');
  const opDia = document.getElementById('op-diamonds');
  const opSp = document.getElementById('op-sp-display');
  if (opGold) opGold.textContent = globalGold.toLocaleString();
  if (opDia) opDia.textContent = globalDiamonds;

  // Calculate available SP for operator upgrades
  const totalLevel = getLevelFromXp(globalXp);
  const totalSP = totalLevel - 1;
  const usedSkillSP = activeSkills.reduce((sum, s) => sum + s.level, 0);
  const usedOpSP = ownedOperators.reduce((sum, o) => {
    let sp = 0;
    for (let i = 1; i <= o.active_level; i++) sp += i * 3;
    for (let i = 1; i <= o.passive_level; i++) sp += i * 2;
    for (let i = 1; i <= o.buff_level; i++) sp += i * 5;
    return sum + sp;
  }, 0);
  const availSP = totalSP - usedSkillSP - usedOpSP;
  if (opSp) opSp.textContent = 'SP: ' + availSP;

  const level = getLevelFromXp(globalXp);

  Object.entries(OPERATORS).forEach(([opId, op]) => {
    const owned = ownedOperators.find(o => o.operator_id === opId);
    const isActive = activeOperatorId === opId;
    const canAffordGold = globalGold >= op.goldCost;
    const canAffordDia = globalDiamonds >= op.diamondCost;
    const levelOk = level >= op.unlockLevel;

    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0d10;border:2px solid ' + (isActive ? '#33cc44' : owned ? '#1e2530' : '#111418') + ';padding:18px;width:320px;position:relative;transition:border-color 0.2s';

    let html = '';
    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:28px">' + op.icon + '</span><div>';
    html += '<div style="font-family:Oswald,sans-serif;font-size:18px;font-weight:600;letter-spacing:3px;color:' + (owned ? '#c0ccd8' : '#4a5460') + '">' + op.name + '</div>';
    html += '<div style="font-size:9px;color:#3a4450;letter-spacing:1px">LVL ' + op.unlockLevel + '</div>';
    html += '</div></div>';
    if (isActive) html += '<div style="font-size:9px;color:#33cc44;border:1px solid #33cc44;padding:2px 8px;letter-spacing:2px">AKTIV</div>';
    html += '</div>';

    // Description
    html += '<div style="font-size:10px;color:#556070;margin-bottom:10px;line-height:1.5">' + op.desc + '</div>';

    // Buffs/Debuffs
    const buffText = Object.entries(op.buffs).map(([k, v]) => {
      const pct = k.endsWith('Pct');
      return (v > 0 ? '+' : '') + (pct ? Math.round(v * 100) + '%' : v) + ' ' + k.replace('Pct', '').replace(/([A-Z])/g, ' $1');
    }).join(', ');
    const debuffText = Object.entries(op.debuffs).map(([k, v]) => {
      const pct = k.endsWith('Pct');
      return (pct ? Math.round(v * 100) + '%' : v) + ' ' + k.replace('Pct', '').replace(/([A-Z])/g, ' $1');
    }).join(', ');
    html += '<div style="font-size:10px;color:#33cc44;margin-bottom:3px">\u25B2 ' + buffText + '</div>';
    html += '<div style="font-size:10px;color:#ee2200;margin-bottom:8px">\u25BC ' + debuffText + '</div>';

    // Active + Passive
    html += '<div style="font-size:10px;color:#ffaa00;margin-bottom:3px">[Q] ' + op.active.name + ': ' + op.active.desc + '</div>';
    html += '<div style="font-size:10px;color:#8866cc;margin-bottom:12px">\u27E1 ' + op.passive + '</div>';

    // Action area
    if (!owned) {
      if (!levelOk) {
        html += '<div style="font-size:10px;color:#333;letter-spacing:2px;text-align:center">LEVEL ' + op.unlockLevel + ' BENOETIGT</div>';
      } else {
        html += '<div style="display:flex;gap:8px;justify-content:center">';
        html += '<button class="op-buy-btn" data-op="' + opId + '" data-currency="gold" style="font-family:JetBrains Mono,monospace;font-size:11px;color:' + (canAffordGold ? '#ddaa00' : '#333') + ';background:transparent;border:1px solid ' + (canAffordGold ? '#665500' : '#1a1a1a') + ';padding:6px 16px;cursor:' + (canAffordGold ? 'pointer' : 'default') + '">' + op.goldCost.toLocaleString() + 'G</button>';
        html += '<button class="op-buy-btn" data-op="' + opId + '" data-currency="diamonds" style="font-family:JetBrains Mono,monospace;font-size:11px;color:' + (canAffordDia ? '#44ddff' : '#333') + ';background:transparent;border:1px solid ' + (canAffordDia ? '#1a5566' : '#1a1a1a') + ';padding:6px 16px;cursor:' + (canAffordDia ? 'pointer' : 'default') + '">' + op.diamondCost + '\uD83D\uDC8E</button>';
        html += '</div>';
      }
    } else if (!isActive) {
      html += '<div style="text-align:center"><button class="op-select-btn" data-op="' + opId + '" style="font-family:Oswald,sans-serif;font-size:13px;letter-spacing:3px;color:#33cc44;background:transparent;border:1px solid #33cc44;padding:8px 24px;cursor:pointer">AUSWAEHLEN</button></div>';
    } else {
      // Upgrade slots
      html += '<div style="border-top:1px solid #141a20;padding-top:10px;margin-top:8px">';
      html += '<div style="font-size:9px;letter-spacing:2px;color:#4a5460;margin-bottom:8px;text-align:center">UPGRADES</div>';
      ['active', 'passive', 'buff'].forEach(slot => {
        const maxLvl = slot === 'buff' ? 3 : 5;
        const lvl = owned[slot + '_level'] || 0;
        const baseCost = { active: { gold: 5000, sp: 3 }, passive: { gold: 3000, sp: 2 }, buff: { gold: 8000, sp: 5 } }[slot];
        const nextLvl = lvl + 1;
        const goldCost = baseCost.gold * nextLvl;
        const spCost = baseCost.sp * nextLvl;
        const canUpgrade = lvl < maxLvl && globalGold >= goldCost && availSP >= spCost;
        const label = slot === 'active' ? 'AKTIV' : slot === 'passive' ? 'PASSIV' : 'BUFF';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
        html += '<span style="font-size:10px;color:#556070">' + label + ' ' + lvl + '/' + maxLvl + '</span>';
        if (lvl < maxLvl) {
          html += '<button class="op-upgrade-btn" data-op="' + opId + '" data-slot="' + slot + '" style="font-family:JetBrains Mono,monospace;font-size:9px;color:' + (canUpgrade ? '#ddaa00' : '#333') + ';background:transparent;border:1px solid ' + (canUpgrade ? '#665500' : '#1a1a1a') + ';padding:3px 10px;cursor:' + (canUpgrade ? 'pointer' : 'default') + '">' + goldCost.toLocaleString() + 'G + ' + spCost + 'SP</button>';
        } else {
          html += '<span style="font-size:9px;color:#33cc44;letter-spacing:1px">MAX</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    card.innerHTML = html;
    grid.appendChild(card);
  });

  // Wire buy buttons
  grid.querySelectorAll('.op-buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const opId = btn.dataset.op;
      const currency = btn.dataset.currency;
      try {
        const res = await fetch('/api/operators/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ operatorId: opId, currency: currency })
        });
        if (res.ok) {
          const data = await res.json();
          ownedOperators = data.operators;
          globalGold = data.gold;
          globalDiamonds = data.diamonds;
          renderOperators();
        }
      } catch(e) {}
    });
  });

  // Wire select buttons
  grid.querySelectorAll('.op-select-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const opId = btn.dataset.op;
      try {
        const res = await fetch('/api/operators/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ operatorId: opId })
        });
        if (res.ok) {
          const data = await res.json();
          activeOperatorId = data.activeOperator;
          renderOperators();
        }
      } catch(e) {}
    });
  });

  // Wire upgrade buttons
  grid.querySelectorAll('.op-upgrade-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const opId = btn.dataset.op;
      const slot = btn.dataset.slot;
      try {
        const res = await fetch('/api/operators/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ operatorId: opId, slot: slot })
        });
        if (res.ok) {
          const data = await res.json();
          ownedOperators = data.operators;
          globalGold = data.gold;
          renderOperators();
        }
      } catch(e) {}
    });
  });
}

function renderShop() {
  const grid = document.getElementById('perk-shop-grid');
  if (!grid) return;
  grid.innerHTML = '';

  document.getElementById('shop-gold').textContent = globalGold.toLocaleString();
  document.getElementById('shop-diamonds').textContent = globalDiamonds;

  const level = getLevelFromXp(globalXp);

  // Group by weapon
  const weaponOrder = ['pistol', 'smg', 'shotgun', 'assault_rifle', 'sniper', 'minigun'];
  for (const wpnId of weaponOrder) {
    const wpn = WEAPONS[wpnId];
    const wpnOwned = ownedWeaponIds.includes(wpnId);
    const perks = Object.entries(PERK_DEFS).filter(([id, p]) => p.weaponId === wpnId);
    if (perks.length === 0) continue;

    // Weapon group header
    const header = document.createElement('div');
    header.style.cssText = 'width:100%;font-family:Oswald,sans-serif;font-size:14px;font-weight:600;letter-spacing:3px;color:#4a5460;padding:8px 0 4px 8px;border-bottom:1px solid #141a20;margin-top:8px';
    header.textContent = wpn.name;
    if (!wpnOwned) header.textContent += ' (NICHT FREIGESCHALTET)';
    grid.appendChild(header);

    const row = document.createElement('div');
    row.style.cssText = 'width:100%;display:flex;gap:12px;flex-wrap:wrap';
    grid.appendChild(row);

    for (const [perkId, perk] of perks) {
      const owned = ownedPerks.includes(perkId);
      const canAfford = globalGold >= perk.gold && globalDiamonds >= perk.diamonds;
      const canBuy = wpnOwned && canAfford && !owned;

      const card = document.createElement('div');
      card.style.cssText = 'width:240px;background:#0c0f14;border:1px solid ' + (owned ? '#33cc44' : canBuy ? '#ddaa00' : '#1a1e22') + ';padding:16px;position:relative;transition:border-color 0.2s';

      const typeBadge = perk.type === 'active' ? '<span style="font-size:9px;color:#ffaa00;border:1px solid #665500;padding:1px 5px;letter-spacing:1px">AKTIV</span>' : '<span style="font-size:9px;color:#8866cc;border:1px solid #443366;padding:1px 5px;letter-spacing:1px">PASSIV</span>';

      let actionHtml = '';
      if (owned) {
        actionHtml = '<div style="font-size:10px;letter-spacing:2px;color:#33cc44;margin-top:10px">FREIGESCHALTET</div>';
      } else if (!wpnOwned) {
        actionHtml = '<div style="font-size:10px;letter-spacing:2px;color:#333;margin-top:10px">WAFFE BENOETIGT</div>';
      } else if (!canAfford) {
        actionHtml = '<div style="font-size:10px;letter-spacing:2px;color:#661100;margin-top:10px">NICHT GENUG RESSOURCEN</div>';
      } else {
        actionHtml = '<button class="perk-buy-btn" data-perk="' + perkId + '" style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:#ddaa00;background:transparent;border:1px solid #665500;padding:6px 20px;cursor:pointer;margin-top:10px;transition:all 0.2s">KAUFEN</button>';
      }

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-family:Oswald,sans-serif;font-size:15px;font-weight:500;letter-spacing:2px;color:${owned ? '#33cc44' : '#c0ccd8'}">${perk.icon} ${perk.name}</span>
          ${typeBadge}
        </div>
        <div style="font-size:10px;color:#556070;line-height:1.6;min-height:32px">${perk.desc}</div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:11px;letter-spacing:1px">
          <span style="color:#ddaa00">${perk.gold} G</span>
          <span style="color:#44bbff">${perk.diamonds} D</span>
        </div>
        ${actionHtml}
      `;
      row.appendChild(card);
    }
  }

  // Wire buy buttons
  grid.querySelectorAll('.perk-buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const perkId = btn.dataset.perk;
      try {
        const res = await fetch('/api/perks/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ perkId })
        });
        if (res.ok) {
          const data = await res.json();
          ownedPerks = data.perks;
          globalGold = data.gold;
          globalDiamonds = data.diamonds;
          renderShop();
          renderArsenal();
        } else {
          const err = await res.json();
          showWaveBanner(err.error || 'Kauf fehlgeschlagen');
        }
      } catch {}
    });
  });
}

// Tab switching
function switchMenuTab(tabName) {
  document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.menu-panel').forEach(p => { p.style.display = 'none'; });
  const activeTab = document.querySelector('.menu-tab[data-tab="' + tabName + '"]');
  if (activeTab) activeTab.classList.add('active');
  const panel = document.getElementById('panel-' + tabName);
  if (panel) panel.style.display = 'flex';

  if (tabName === 'skilltree') {
    const panelRect = panel.getBoundingClientRect();
    stCanvas.width = panelRect.width;
    stCanvas.height = panelRect.height;
    stActive = true;
    stSelectPath(stActivePath);
    requestAnimationFrame(drawSkillTree);
  } else {
    stActive = false;
  }

  if (tabName === 'arsenal') { selectedArsenalWeapon = activeWeaponId; renderArsenal(); }
  if (tabName === 'skins') { renderOperators(); }
  if (tabName === 'shop') { renderShop(); }
}


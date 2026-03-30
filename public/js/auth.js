// auth state
let authToken = localStorage.getItem('dz_token');
let currentUser = localStorage.getItem('dz_user');
let authMode = 'login';

function togglePwVisibility(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (input.type === 'password') { input.type = 'text'; toggle.textContent = '🔒'; }
  else { input.type = 'password'; toggle.textContent = '👁'; }
}

function switchAuthTab(mode) {
  playSound('ui_click');
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.auth-tab:${mode === 'login' ? 'first' : 'last'}-child`).classList.add('active');
  document.getElementById('auth-btn').textContent = mode === 'login' ? 'LOGIN' : 'REGISTRIEREN';
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-pass-confirm-wrap').style.display = mode === 'register' ? 'block' : 'none';
}

async function doAuth() {
  ensureAudio();
  const name = document.getElementById('auth-name').value.trim();
  const password = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  if (!name || !password) { errEl.textContent = 'Name und Passwort eingeben'; return; }

  if (authMode === 'register') {
    const confirm = document.getElementById('auth-pass-confirm').value;
    if (password !== confirm) { errEl.textContent = 'Passwoerter stimmen nicht ueberein'; return; }
    if (password.length < 3) { errEl.textContent = 'Mindestens 3 Zeichen'; return; }
  }

  const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken = data.token;
    currentUser = data.name;
    localStorage.setItem('dz_token', authToken);
    localStorage.setItem('dz_user', currentUser);
    showGameMenu();
  } catch (e) {
    errEl.textContent = 'Server nicht erreichbar';
  }
}

function doLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('dz_token');
  localStorage.removeItem('dz_user');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('overlay').style.display = 'none';
}

let lastRunText = '';

async function showGameMenu() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  document.getElementById('overlay').style.display = 'block';
  document.getElementById('hud').style.display = 'none';
  stActive = false;

  // Reset to lobby tab
  switchMenuTab('lobby');

  document.getElementById('last-run').textContent = lastRunText;
  document.getElementById('lobby-stats').textContent = '';
  document.getElementById('lobby-player-name').textContent = currentUser ? currentUser.toUpperCase() : '';
  document.getElementById('lobby-level-badge').textContent = '';
  document.getElementById('lobby-gold').textContent = '0 G';
  document.getElementById('lobby-diamonds').textContent = '0 D';

  if (authToken) {
    try {
      const res = await fetch('/api/profile', {
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (res.ok) {
        const data = await res.json();
        globalXp = data.xp;
        activeOperatorId = data.active_operator || null;
        globalGold = data.gold || 0;
        globalDiamonds = data.diamonds || 0;
        const totalLevel = getLevelFromXp(globalXp);
        const skillPoints = totalLevel - 1;
        const opLabel = activeOperatorId && OPERATORS[activeOperatorId] ? ' | ' + OPERATORS[activeOperatorId].icon + ' ' + OPERATORS[activeOperatorId].name : '';
        document.getElementById('lobby-stats').textContent =
          'LVL ' + totalLevel + '  |  ' + globalXp + ' XP  |  ' + skillPoints + ' SP' + opLabel;
        document.getElementById('lobby-level-badge').textContent = 'LVL ' + totalLevel;
        document.getElementById('lobby-gold').textContent = globalGold + ' G';
        document.getElementById('lobby-diamonds').textContent = globalDiamonds + ' D';
      }
    } catch {}

    try {
      const skillRes = await fetch('/api/skills', {
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (skillRes.ok) {
        const skillData = await skillRes.json();
        activeSkills = skillData.skills.map(s => ({ skillId: s.skill_id, level: s.level }));
      }
    } catch {}

    try {
      const wpnRes = await fetch('/api/weapons', { headers: { 'Authorization': 'Bearer ' + authToken } });
      if (wpnRes.ok) {
        const wpnData = await wpnRes.json();
        playerWeapons = wpnData.weapons;
        ownedWeaponIds = ['pistol', ...wpnData.weapons.map(w => w.weapon_id)];
        if (!ownedWeaponIds.includes(activeWeaponId)) setActiveWeapon('pistol');
      }
    } catch {}

    try {
      const perkRes = await fetch('/api/perks', { headers: { 'Authorization': 'Bearer ' + authToken } });
      if (perkRes.ok) {
        const perkData = await perkRes.json();
        ownedPerks = perkData.perks;
      }
    } catch {}

    try {
      const opRes = await fetch('/api/operators', { headers: { 'Authorization': 'Bearer ' + authToken } });
      if (opRes.ok) {
        const opData = await opRes.json();
        ownedOperators = opData.operators;
        activeOperatorId = opData.activeOperator;
      }
    } catch {}

    renderArsenal();

    updateSkillTreeTab();
  }
}

// auto-login if token exists
async function checkToken() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.name;
      showGameMenu();
      return;
    }
  } catch {}
  doLogout();
}

checkToken();

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// dynamische Canvas-Größe
let W, H;
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  W = canvas.width;
  H = canvas.height;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

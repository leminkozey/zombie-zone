// ── SOUND SYSTEM ──────────────────────────────────────
let audioCtx = null;
let soundEnabled = true;
let masterVolume = 0.5;

// Load saved values
masterVolume = parseFloat(localStorage.getItem('dz_volume') || '0.5');
soundEnabled = localStorage.getItem('dz_sound') !== 'false';

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function ensureAudio() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

let lastSoundTime = {};
function playSoundThrottled(type, minInterval, options) {
  const now = performance.now();
  if (lastSoundTime[type] && now - lastSoundTime[type] < minInterval) return;
  lastSoundTime[type] = now;
  playSound(type, options);
}

function playSound(type, options = {}) {
  if (!audioCtx || !soundEnabled) return;
  const vol = (options.volume || 1) * masterVolume;

  switch (type) {
    case 'shoot_pistol': sfxShoot(800, 0.06, vol * 0.3, 0.8); break;
    case 'shoot_smg': sfxShoot(1200, 0.04, vol * 0.2, 0.5); break;
    case 'shoot_shotgun': sfxShoot(300, 0.12, vol * 0.5, 1.2); break;
    case 'shoot_assault_rifle': sfxShoot(900, 0.05, vol * 0.25, 0.7); break;
    case 'shoot_sniper': sfxShoot(200, 0.15, vol * 0.6, 1.5); break;
    case 'shoot_minigun': sfxShoot(1500, 0.03, vol * 0.15, 0.3); break;
    case 'reload': sfxReload(vol * 0.4); break;
    case 'hit': sfxHit(vol * 0.3); break;
    case 'kill': sfxKill(vol * 0.25); break;
    case 'zombie_hit': sfxZombieHit(vol * 0.2); break;
    case 'player_hurt': sfxPlayerHurt(vol * 0.4); break;
    case 'dash': sfxDash(vol * 0.3); break;
    case 'pickup_health': sfxPickup(600, vol * 0.3); break;
    case 'pickup_ammo': sfxPickup(800, vol * 0.3); break;
    case 'pickup_gold': sfxPickup(1200, vol * 0.15); break;
    case 'levelup': sfxLevelUp(vol * 0.4); break;
    case 'wave_start': sfxWaveStart(vol * 0.3); break;
    case 'empty_mag': sfxClick(2000, vol * 0.2); break;
    case 'ui_click': sfxClick(1000, vol * 0.15); break;
    case 'rescue_start': sfxRescueStart(vol * 0.3); break;
    case 'rescue_success': sfxRescueSuccess(vol * 0.5); break;
    case 'death': sfxDeath(vol * 0.5); break;
    case 'perk_activate': sfxPerkActivate(vol * 0.4); break;
    case 'explosion': sfxExplosion(vol * 0.5); break;
  }
}

// ── SOUND GENERATORS ──────────────────────────────────

function sfxShoot(freq, duration, vol, decay) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const noise = createNoise(duration + 0.05);
  const noiseGain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration * decay);

  noiseGain.gain.setValueAtTime(vol * 0.6, audioCtx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain).connect(audioCtx.destination);
  noise.connect(noiseGain).connect(audioCtx.destination);

  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  noise.onended = () => { noise.disconnect(); noiseGain.disconnect(); };
  osc.start(); osc.stop(audioCtx.currentTime + duration);
  noise.start(); noise.stop(audioCtx.currentTime + duration + 0.05);
}

function sfxReload(vol) {
  sfxClick(3000, vol);
  setTimeout(() => sfxClick(2000, vol * 0.8), 150);
  setTimeout(() => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(vol * 0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  }, 300);
}

function sfxHit(vol) {
  const noise = createNoise(0.05);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  noise.connect(gain).connect(audioCtx.destination);
  noise.start(); noise.stop(audioCtx.currentTime + 0.05);
}

function sfxKill(vol) {
  const noise = createNoise(0.1);
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start(); noise.stop(audioCtx.currentTime + 0.1);
}

function sfxZombieHit(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150 + Math.random() * 100, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.08);
}

function sfxPlayerHurt(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

function sfxDash(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

function sfxPickup(freq, vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(freq * 1.5, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.15);
}

function sfxLevelUp(vol) {
  [0, 100, 200].forEach((delay, i) => {
    setTimeout(() => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 400 + i * 200;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }, delay);
  });
}

function sfxWaveStart(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(120, audioCtx.currentTime + 0.5);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(vol * 0.8, audioCtx.currentTime + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.8);
}

function sfxClick(freq, vol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.03);
}

function sfxRescueStart(vol) {
  const noise = createNoise(0.3);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol * 0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  noise.connect(gain).connect(audioCtx.destination);
  noise.start(); noise.stop(audioCtx.currentTime + 0.3);
  setTimeout(() => sfxClick(1500, vol), 200);
  setTimeout(() => sfxClick(1500, vol), 350);
}

function sfxRescueSuccess(vol) {
  [0, 120, 240, 360].forEach((delay, i) => {
    setTimeout(() => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = [523, 659, 784, 1047][i];
      gain.gain.setValueAtTime(vol * 0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    }, delay);
  });
}

function sfxDeath(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 1);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 1);
}

function sfxPerkActivate(vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.2);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

function sfxExplosion(vol) {
  const noise = createNoise(0.4);
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  noise.start(); noise.stop(audioCtx.currentTime + 0.4);
}

function createNoise(duration) {
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  return source;
}

// Background ambient drone
let ambientDrone = null;
function startAmbient() {
  if (!audioCtx || ambientDrone) return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc1.type = 'sine'; osc1.frequency.value = 55;
  osc2.type = 'sine'; osc2.frequency.value = 57;
  filter.type = 'lowpass'; filter.frequency.value = 200;
  gain.gain.value = masterVolume * 0.04;
  osc1.connect(filter); osc2.connect(filter);
  filter.connect(gain).connect(audioCtx.destination);
  osc1.start(); osc2.start();
  ambientDrone = { osc1, osc2, gain };
}
function stopAmbient() {
  if (!ambientDrone) return;
  ambientDrone.osc1.stop(); ambientDrone.osc2.stop();
  ambientDrone = null;
}


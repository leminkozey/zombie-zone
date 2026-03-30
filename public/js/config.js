// World & entity sizes
let TILE = 40;
const PLAYER_R = 12;
const ZOMBIE_R = 13;
const BULLET_R = 4;
const BULLET_SPD = 9;

// Pickup timing & limits
const PICKUP_LIFETIME = 600; // 10s at 60fps
const PICKUP_BLINK = 180; // blink last 3s
const PICKUP_MAX = 3;
const HEALTHPACK_HEAL = 25;
const HEALTHPACK_INTERVAL = [900, 1200]; // 15-20s at 60fps
const AMMOPACK_INTERVAL = [1100, 1500]; // 18-25s at 60fps

const BASE_STATS = {
  maxHp: 100,
  moveSpeed: 2.8,
  healthpackHealPct: 0,
  damageReductionPct: 0,
  shieldHp: 0,
  shieldRegenDelay: 8,
  shieldRegenRate: 5,
  regenHpPerSec: 0,
  dashUnlocked: 0,
  dashDistance: 120,
  dashCooldown: 5,
  dashCharges: 1,
  rescueActivationTime: 30,
  rescueSurvivalTime: 90,
  rescueStandTime: 20,
  rescueCooldown: 30,
  rescueExpiryTime: 60,
  rescueCircleRadiusPct: 0,
  rescueDecayReduction: 0,
  vampHeal: 0,
  adrenalinSpeedPct: 0,
  berserkerMaxBonus: 0,
  ghostReduction: 0,
  weaponDamagePct: 0,
  healingEffectivenessPct: 0,
  fireRatePct: 0,
  weaponRangePct: 0,
};

let activeSkills = []; // { skillId, level } loaded from server

function getPlayerStat(stat) {
  const base = BASE_STATS[stat];
  if (base === undefined) return 0;
  let flat = 0;
  let pct = 0;

  for (const s of activeSkills) {
    const def = SKILL_MAP[s.skillId];
    if (!def) continue;
    const fx = def.effect(s.level);
    if (fx[stat] !== undefined) flat += fx[stat];
    if (fx[stat + 'Pct'] !== undefined) pct += fx[stat + 'Pct'];
  }

  // Operator buffs/debuffs
  if (activeOperatorId && OPERATORS[activeOperatorId]) {
    const op = OPERATORS[activeOperatorId];
    if (op.buffs) {
      if (op.buffs[stat] !== undefined) flat += op.buffs[stat];
      if (op.buffs[stat + 'Pct'] !== undefined) pct += op.buffs[stat + 'Pct'];
    }
    if (op.debuffs) {
      if (op.debuffs[stat] !== undefined) flat += op.debuffs[stat];
      if (op.debuffs[stat + 'Pct'] !== undefined) pct += op.debuffs[stat + 'Pct'];
    }
    // Juggernaut exception: fireRate debuff doesn't apply to minigun
    if (activeOperatorId === 'juggernaut' && stat + 'Pct' === 'fireRatePct' && activeWeaponId === 'minigun') {
      pct -= (op.debuffs.fireRatePct || 0);
    }
  }

  return base * (1 + pct) + flat;
}

const SKILLS = [
  // SURVIVAL — Start
  { id: 'surv_start', path: 'survival', req: null, tier: 0, maxLvl: 0,
    icon: '♥', name: 'SURVIVAL', desc: 'Startknoten des Survival-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },
  // SURVIVAL — Tier 1
  { id: 'vitality', path: 'survival', req: 'surv_start', tier: 1, maxLvl: 5,
    icon: '♥', name: 'VITALITY', desc: 'Erhoeht max. Lebenspunkte.',
    x: -120, y: -120, r: 22, effect: (lvl) => ({ maxHp: 15 * lvl }) },
  { id: 'field_medic', path: 'survival', req: 'surv_start', tier: 1, maxLvl: 3,
    icon: '✚', name: 'FIELD MEDIC', desc: 'Healthpacks heilen mehr.',
    x: 120, y: -120, r: 20, effect: (lvl) => ({ healthpackHealPct: 0.3 * lvl }) },
  // SURVIVAL — Tier 2
  { id: 'shield', path: 'survival', req: 'vitality', tier: 2, maxLvl: 5,
    icon: '🛡', name: 'SHIELD', desc: 'Schutzschild das Schaden absorbiert.',
    x: -220, y: -260, r: 26, effect: (lvl) => ({ shieldHp: 10 * lvl, shieldRegenDelay: -lvl }) },
  { id: 'regen', path: 'survival', req: 'vitality', tier: 2, maxLvl: 3,
    icon: '♻', name: 'REGENERATION', desc: 'Passive HP-Regen. Stoppt bei Schaden.',
    x: 0, y: -270, r: 20, effect: (lvl) => ({ regenHpPerSec: 0.5 * lvl }) },
  { id: 'thick_skin', path: 'survival', req: 'field_medic', tier: 2, maxLvl: 3,
    icon: '🧱', name: 'THICK SKIN', desc: 'Reduziert eingehenden Schaden.',
    x: 220, y: -260, r: 20, effect: (lvl) => ({ damageReductionPct: 0.05 * lvl }) },
  // SURVIVAL — Tier 2 (new)
  { id: 'vampirism', path: 'survival', req: 'field_medic', tier: 2, maxLvl: 3,
    icon: '🩸', name: 'VAMPIRISM', desc: 'Heilt HP bei jedem Kill.',
    x: 300, y: -180, r: 20, effect: (lvl) => ({ vampHeal: lvl }) },
  { id: 'adrenalin', path: 'survival', req: 'vitality', tier: 2, maxLvl: 3,
    icon: '💉', name: 'ADRENALIN', desc: 'Unter 30% HP: Speed-Boost.',
    x: -100, y: -280, r: 20, effect: (lvl) => ({ adrenalinSpeedPct: 0.1 * lvl }) },
  { id: 'berserker', path: 'survival', req: 'thick_skin', tier: 2, maxLvl: 3,
    icon: '🔥', name: 'BERSERKER', desc: 'Mehr Schaden je niedriger HP.',
    x: 320, y: -340, r: 22, effect: (lvl) => ({ berserkerMaxBonus: 0.2 * lvl }) },
  // SURVIVAL — Tier 3
  { id: 'fortress', path: 'survival', req: 'shield', tier: 3, maxLvl: 1,
    icon: '🏰', name: 'FORTRESS', desc: '2x Shield-Regen. +10% Speed bei vollem Shield.',
    x: -140, y: -420, r: 28, effect: () => ({}) },
  { id: 'second_wind', path: 'survival', req: 'regen', tier: 3, maxLvl: 1,
    icon: '💀', name: 'SECOND WIND', desc: '1x pro Run: Ueberlebst toedlichen Treffer mit 30% HP.',
    x: 140, y: -420, r: 28, effect: () => ({}) },
  { id: 'iron_skin', path: 'survival', req: 'berserker', tier: 3, maxLvl: 1,
    icon: '🛡', name: 'IRON SKIN', desc: 'Alle 60s: naechster Treffer wird komplett geblockt.',
    x: 340, y: -480, r: 28, effect: () => ({}) },
  // MOBILITY — Start
  { id: 'mob_start', path: 'mobility', req: null, tier: 0, maxLvl: 0,
    icon: '⚡', name: 'MOBILITY', desc: 'Startknoten des Mobility-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },
  // MOBILITY — Tier 1
  { id: 'swift', path: 'mobility', req: 'mob_start', tier: 1, maxLvl: 5,
    icon: '👟', name: 'SWIFT', desc: 'Erhoehte Laufgeschwindigkeit.',
    x: -100, y: -130, r: 22, effect: (lvl) => ({ moveSpeedPct: 0.08 * lvl }) },
  // MOBILITY — Tier 1 (new)
  { id: 'kill_rush', path: 'mobility', req: 'mob_start', tier: 1, maxLvl: 3,
    icon: '💀', name: 'KILL RUSH', desc: 'Bei Kill: kurzer Speed-Boost.',
    x: 120, y: -130, r: 20, effect: (lvl) => ({ killRushSpeedPct: 0.15 + 0.1 * lvl, killRushDuration: 120 }) },
  // MOBILITY — Tier 2
  { id: 'ghost', path: 'mobility', req: 'kill_rush', tier: 2, maxLvl: 3,
    icon: '👤', name: 'GHOST', desc: 'Weniger Nahkampf-Schaden von Zombies.',
    x: 180, y: -280, r: 20, effect: (lvl) => ({ ghostReduction: 0.1 * lvl }) },
  { id: 'dash', path: 'mobility', req: 'swift', tier: 2, maxLvl: 1,
    icon: '💨', name: 'DASH', desc: 'Schaltet Dash frei. Leertaste.',
    x: -40, y: -290, r: 26, effect: () => ({ dashUnlocked: 1 }) },
  { id: 'dash_range', path: 'mobility', req: 'dash', tier: 2, maxLvl: 3,
    icon: '📏', name: 'DASH RANGE', desc: 'Dash geht weiter.',
    x: -200, y: -370, r: 20, effect: (lvl) => ({ dashDistance: 40 * lvl }) },
  { id: 'dash_cd', path: 'mobility', req: 'dash', tier: 2, maxLvl: 3,
    icon: '⏱', name: 'DASH COOLDOWN', desc: 'Dash schneller wieder bereit.',
    x: -40, y: -420, r: 20, effect: (lvl) => ({ dashCooldown: -1 * lvl }) },
  { id: 'dash_charges', path: 'mobility', req: 'dash', tier: 2, maxLvl: 2,
    icon: '⚡', name: 'DASH CHARGES', desc: 'Mehrfach hintereinander dashen.',
    x: 130, y: -370, r: 20, effect: (lvl) => ({ dashCharges: 1 * lvl }) },
  // MOBILITY — Tier 3
  { id: 'phantom_dash', path: 'mobility', req: 'dash_cd', tier: 3, maxLvl: 1,
    icon: '👻', name: 'PHANTOM DASH', desc: 'Unverwundbar beim Dash. Nachbild verwirrt Zombies.',
    x: -40, y: -560, r: 28, effect: () => ({}) },
  { id: 'bullet_time', path: 'mobility', req: 'swift', tier: 3, maxLvl: 1,
    icon: '🕶', name: 'BULLET TIME', desc: 'Nach Dash: 50% Zombie-Slow fuer 2s.',
    x: 100, y: -300, r: 28, effect: () => ({}) },
  // RESCUE — Start
  { id: 'resc_start', path: 'rescue', req: null, tier: 0, maxLvl: 0,
    icon: '📡', name: 'RESCUE', desc: 'Startknoten des Rescue-Pfads.',
    x: 0, y: 0, r: 20, effect: () => ({}) },
  // RESCUE — Tier 1
  { id: 'quick_call', path: 'rescue', req: 'resc_start', tier: 1, maxLvl: 5,
    icon: '⏳', name: 'QUICK CALL', desc: 'Rescue frueher verfuegbar.',
    x: -140, y: -130, r: 22, effect: (lvl) => ({ rescueActivationTime: -4 * lvl }) },
  { id: 'fast_extract', path: 'rescue', req: 'resc_start', tier: 1, maxLvl: 4,
    icon: '🎯', name: 'FAST EXTRACT', desc: 'Weniger Stehzeit im Kreis.',
    x: 140, y: -130, r: 22, effect: (lvl) => ({ rescueStandTime: -3 * lvl }) },
  // RESCUE — Tier 2
  { id: 'survival_instinct', path: 'rescue', req: 'quick_call', tier: 2, maxLvl: 5,
    icon: '⚔', name: 'SURVIVAL INSTINCT', desc: 'Kuerzere Ueberlebensphase.',
    x: -260, y: -280, r: 22, effect: (lvl) => ({ rescueSurvivalTime: -10 * lvl }) },
  { id: 'rapid_redial', path: 'rescue', req: 'quick_call', tier: 2, maxLvl: 3,
    icon: '📻', name: 'RAPID REDIAL', desc: 'Schneller erneut anfragen.',
    x: -60, y: -300, r: 20, effect: (lvl) => ({ rescueCooldown: -5 * lvl }) },
  { id: 'ext_window', path: 'rescue', req: 'fast_extract', tier: 2, maxLvl: 3,
    icon: '🕐', name: 'EXTENDED WINDOW', desc: 'Mehr Zeit bis Rescue ablaeuft.',
    x: 60, y: -300, r: 20, effect: (lvl) => ({ rescueExpiryTime: 15 * lvl }) },
  { id: 'safe_zone', path: 'rescue', req: 'fast_extract', tier: 2, maxLvl: 3,
    icon: '🔵', name: 'SAFE ZONE', desc: 'Groesserer Rettungskreis.',
    x: 260, y: -280, r: 20, effect: (lvl) => ({ rescueCircleRadiusPct: 0.2 * lvl }) },
  { id: 'steady_hands', path: 'rescue', req: 'fast_extract', tier: 2, maxLvl: 3,
    icon: '🤝', name: 'STEADY HANDS', desc: 'Rescue-Fortschritt geht langsamer verloren.',
    x: 180, y: -350, r: 20, effect: (lvl) => ({ rescueDecayReduction: 0.25 * lvl }) },
  // RESCUE — Tier 3
  { id: 'evac_chopper', path: 'rescue', req: 'rapid_redial', tier: 3, maxLvl: 1,
    icon: '🚁', name: 'EVAC CHOPPER', desc: 'Kreis folgt dir langsam.',
    x: -100, y: -460, r: 28, effect: () => ({}) },
  { id: 'fortified_lz', path: 'rescue', req: 'ext_window', tier: 3, maxLvl: 1,
    icon: '🏗', name: 'FORTIFIED LZ', desc: '-50% Schaden im Rettungskreis.',
    x: 100, y: -460, r: 28, effect: () => ({}) },
  { id: 'last_stand', path: 'rescue', req: 'safe_zone', tier: 2, maxLvl: 1,
    icon: '⚔', name: 'LAST STAND', desc: 'Waehrend Extraction: +50% Feuerrate.',
    x: 300, y: -370, r: 24, effect: () => ({}) },
];

const SKILL_MAP = {};
SKILLS.forEach(s => SKILL_MAP[s.id] = s);

const SKILL_CONNECTIONS = SKILLS.filter(s => s.req).map(s => ({ from: s.req, to: s.id, path: s.path }));

function hasSkill(skillId) {
  return activeSkills.some(s => s.skillId === skillId);
}

function getSkillLevel(skillId) {
  const found = activeSkills.find(s => s.skillId === skillId);
  return found ? found.level : 0;
}

const WEAPONS = {
  pistol:         { id: 'pistol', name: 'PISTOL', type: 'Semi', unlockLevel: 0, cost: 0, damage: 1, range: 55, fireRate: 15, reloadMs: 1800, magSize: 12, spread: 0.06, special: null, icon: '🔫' },
  smg:            { id: 'smg', name: 'SMG', type: 'Auto', unlockLevel: 8, cost: 800, damage: 0.35, range: 45, fireRate: 8, reloadMs: 1500, magSize: 35, spread: 0.12, special: null, icon: '⚡' },
  shotgun:        { id: 'shotgun', name: 'SHOTGUN', type: 'Spread', unlockLevel: 20, cost: 4000, damage: 1.5, range: 30, fireRate: 20, reloadMs: 2200, magSize: 6, spread: 0.3, special: 'shotgun', icon: '💥' },
  assault_rifle:  { id: 'assault_rifle', name: 'ASSAULT RIFLE', type: 'Auto', unlockLevel: 35, cost: 12000, damage: 1.2, range: 65, fireRate: 5, reloadMs: 1600, magSize: 30, spread: 0.04, special: null, icon: '🎯' },
  sniper:         { id: 'sniper', name: 'SNIPER', type: 'Single', unlockLevel: 55, cost: 30000, damage: 4, range: 90, fireRate: 30, reloadMs: 2500, magSize: 5, spread: 0.01, special: 'pierce', icon: '🔭' },
  minigun:        { id: 'minigun', name: 'MINIGUN', type: 'Auto', unlockLevel: 75, cost: 60000, damage: 1.0, range: 55, fireRate: 2, reloadMs: 2500, magSize: 150, spread: 0.12, special: 'spinup', icon: '⚙' },
};

const UPGRADE_BASE_COSTS = { dmg: 100, range: 80, rate: 120, reload: 80, mag: 100, acc: 60 };

const PERK_DEFS = {
  pistol_akimbo:      { weaponId: 'pistol', type: 'active', name: 'AKIMBO', desc: 'Dual-Wield: doppelte Feuerrate, doppelter Spread fuer 1 Magazin.', icon: '\u{1F52B}\u{1F52B}', cooldown: 1200, duration: 0, diamonds: 3, gold: 1000 },
  pistol_hollow:      { weaponId: 'pistol', type: 'passive', name: 'HOLLOW POINT', desc: '+50% Schaden gegen Normal-Zombies.', icon: '\u{1F4A2}', diamonds: 3, gold: 1000 },
  smg_drum:           { weaponId: 'smg', type: 'active', name: 'DRUM MAG', desc: 'Naechstes Magazin hat 3x Kapazitaet.', icon: '\u{1F941}', cooldown: 1800, diamonds: 5, gold: 2000 },
  smg_incendiary:     { weaponId: 'smg', type: 'passive', name: 'INCENDIARY', desc: 'Getroffene Zombies brennen 3s (2 DPS).', icon: '\u{1F525}', diamonds: 5, gold: 2000 },
  shotgun_dragon:     { weaponId: 'shotgun', type: 'active', name: "DRAGON'S BREATH", desc: 'Brandgeschosse: Zombies brennen bei Treffer.', icon: '\u{1F409}', cooldown: 1500, diamonds: 7, gold: 3500 },
  shotgun_slug:       { weaponId: 'shotgun', type: 'active', name: 'SLUG ROUND', desc: '1 Magazin: einzelne schwere Kugel (5x Schaden, keine Streuung).', icon: '\u{1F3AF}', cooldown: 1500, diamonds: 7, gold: 3500 },
  ar_grenade:         { weaponId: 'assault_rifle', type: 'active', name: 'GRANATE', desc: 'Feuert 1 Granate (AoE Explosion, 60px Radius).', icon: '\u{1F4A3}', cooldown: 2700, diamonds: 10, gold: 5000 },
  ar_fmj:             { weaponId: 'assault_rifle', type: 'passive', name: 'FMJ', desc: 'Kugeln durchschlagen 1 Zombie.', icon: '\u{1F529}', diamonds: 10, gold: 5000 },
  sniper_wallpen:     { weaponId: 'sniper', type: 'active', name: 'WALL PEN', desc: '1 Magazin: durch Waende schiessen.', icon: '\u{1F9F1}', cooldown: 2100, diamonds: 12, gold: 7000 },
  sniper_explosive:   { weaponId: 'sniper', type: 'passive', name: 'EXPLOSIVE', desc: 'Treffer verursacht AoE-Explosion (40px Radius).', icon: '\u{1F4A5}', diamonds: 12, gold: 7000 },
  minigun_overdrive:  { weaponId: 'minigun', type: 'active', name: 'OVERDRIVE', desc: '5s: kein Spin-Up, kein Movement-Penalty.', icon: '\u26A1', cooldown: 2400, diamonds: 15, gold: 10000 },
  minigun_cryo:       { weaponId: 'minigun', type: 'passive', name: 'CRYO', desc: 'Getroffene Zombies 30% langsamer fuer 2s.', icon: '\u2744\uFE0F', diamonds: 15, gold: 10000 },
};

let ownedPerks = []; // perk IDs from server
let activePerkCooldowns = {}; // { perkId: framesRemaining }
let activePerkActive = {}; // { perkId: true/false } — currently activated

const OPERATORS = {
  soldier: {
    id: 'soldier', name: 'SOLDAT', icon: '\u{1F396}', unlockLevel: 15, goldCost: 5000, diamondCost: 30,
    desc: 'Kampferprobter Veteran. Mehr Schaden, staerkere Ammo-Versorgung.',
    active: { name: 'KAMPFRAUSCH', desc: '8s unendlich Ammo + 50% Feuerrate', cooldown: 2100, duration: 480 },
    passive: 'Ammo-Drops +50% haeufiger, Ammo-Packs geben doppelt',
    buffs: { weaponDamagePct: 0.15 },
    debuffs: { healingEffectivenessPct: -0.30 },
  },
  medic: {
    id: 'medic', name: 'MEDIC', icon: '\u2695', unlockLevel: 25, goldCost: 12000, diamondCost: 50,
    desc: 'Sanitaeter mit Heilfaehigkeiten. Mehr HP, aber weniger Schaden.',
    active: { name: 'HEILFELD', desc: 'Heilzone: 5 HP/s fuer 8s (Phase 2)', cooldown: 1800, duration: 480 },
    passive: 'Healthpack-Drops +50% haeufiger',
    buffs: { maxHp: 50, regenHpPerSec: 1 },
    debuffs: { weaponDamagePct: -0.20 },
  },
  builder: {
    id: 'builder', name: 'BUILDER', icon: '\u{1F9F1}', unlockLevel: 35, goldCost: 25000, diamondCost: 75,
    desc: 'Baut Barrikaden. Mehr HP, aber langsamer beim Schiessen.',
    active: { name: 'BLOCK SETZEN', desc: 'Setzt Wand-Block. Max 10. (Phase 2)', cooldown: 0, duration: 0 },
    passive: 'Bloecke heilen sich nach 10s',
    buffs: { maxHpPct: 0.20 },
    debuffs: { fireRatePct: -0.15 },
  },
  electrician: {
    id: 'electrician', name: 'ELEKTRIKER', icon: '\u26A1', unlockLevel: 50, goldCost: 50000, diamondCost: 100,
    desc: 'Setzt automatische Geschuetztuerme. Mehr Reichweite, langsamer.',
    active: { name: 'TURRET', desc: 'Setzt Turret (2 DPS). Max 2. (Phase 2)', cooldown: 1200, duration: 0 },
    passive: 'Turrets reparieren sich (2 HP/s)',
    buffs: { weaponRangePct: 0.25 },
    debuffs: { moveSpeedPct: -0.20 },
  },
  time_traveler: {
    id: 'time_traveler', name: 'TIME TRAVELER', icon: '\u231B', unlockLevel: 70, goldCost: 100000, diamondCost: 150,
    desc: 'Manipuliert die Zeit. Schnell, aber fragil.',
    active: { name: 'ZEITRISS', desc: '5s Slowmo + Speedup, +80% Speed', cooldown: 2700, duration: 300 },
    passive: 'Jeder 10. Kill: 2s Mini-Slowmo',
    buffs: { moveSpeedPct: 0.30 },
    debuffs: { maxHpPct: -0.25 },
  },
  juggernaut: {
    id: 'juggernaut', name: 'JUGGERNAUT', icon: '\u{1F6E1}', unlockLevel: 90, goldCost: 200000, diamondCost: 200,
    desc: 'Unaufhaltsame Festung. Massiv, aber langsam.',
    active: { name: 'UNAUFHALTSAM', desc: '10s +50% Schaden + Kontaktschaden', cooldown: 2400, duration: 600 },
    passive: 'Minigun kein Reload',
    buffs: { maxHp: 100, shieldHp: 30, damageReductionPct: 0.15 },
    debuffs: { moveSpeedPct: -0.40, fireRatePct: -0.30 },
  },
};

let ownedOperators = [];
let activeOperatorId = null;
let operatorAbilityCooldown = 0;
let operatorAbilityActive = false;
let operatorAbilityTimer = 0;

let mpEnabled = false;
let mpSocket = null;
let mpIsHost = false;
let mpLobbyCode = null;
let mpPlayers = [];
let mpLocalId = null;
let mpGameState = null; // latest server state
let mpPrevState = null; // previous state for interpolation
let mpInterpT = 0;
// Client-side prediction
let mpInputSeq = 0;
let mpPendingInputs = [];
let mpPredictedX = 0;
let mpPredictedY = 0;
let mpLocalSpeed = 2.8;

let playerWeapons = []; // from server: [{weapon_id, dmg_level, range_level, ...}]
let activeWeaponId = localStorage.getItem('dz_activeWeapon') || 'pistol';
let selectedMap = 'warehouse';
let startWave = 1;
let camX = 0, camY = 0, camActive = false;

// Map-specific color themes
const MAP_THEMES = {
  warehouse: {
    floor: ['#1a1814', '#1c1a16', '#181610'],
    debris: ['#2a2418', '#24201a'],
    grid: '#221e16',
    wallBase: '#2a2218', wallTop: '#3a3228', wallLeft: '#322a20',
    wallBody: '#241c14', wallLine: '#1e1810',
    wallShadowR: '#161008', wallShadowB: '#100c06', wallBevel: '#40382c',
    bg: '#0e0c08',
  },
  bunker: {
    floor: ['#0c100c', '#0e120e', '#0a0e0a'],
    debris: ['#182018', '#142014'],
    grid: '#141a14',
    wallBase: '#1a2818', wallTop: '#2a3a20', wallLeft: '#223018',
    wallBody: '#142210', wallLine: '#0e1a0c',
    wallShadowR: '#081208', wallShadowB: '#060e06', wallBevel: '#344830',
    bg: '#060806',
  },
  city: {
    floor: ['#1a1818', '#1c1a18', '#181616'],
    debris: ['#2a2420', '#24201c'],
    grid: '#222018',
    wallBase: '#2a2220', wallTop: '#3a2e28', wallLeft: '#322820',
    wallBody: '#221a18', wallLine: '#1c1410',
    wallShadowR: '#14100e', wallShadowB: '#100c0a', wallBevel: '#3e3228',
    bg: '#0a0808',
  },
};

function getTheme() { return MAP_THEMES[selectedMap] || MAP_THEMES.warehouse; }
function setActiveWeapon(id) { activeWeaponId = id; localStorage.setItem('dz_activeWeapon', id); }
let ownedWeaponIds = ['pistol'];
let selectedArsenalWeapon = 'pistol';

function getWeaponStat(weaponId, stat) {
  const base = WEAPONS[weaponId];
  if (!base) return 0;
  const owned = playerWeapons.find(w => w.weapon_id === weaponId);
  const lvl = owned ? (owned[stat + '_level'] || 0) : 0;
  switch (stat) {
    case 'dmg': return base.damage * (1 + lvl * 0.1);
    case 'range': return base.range + lvl * 5;
    case 'rate': return Math.max(Math.ceil(base.fireRate * 0.4), base.fireRate - lvl * 0.3);
    case 'reload': return base.reloadMs * (1 - lvl * 0.08);
    case 'mag': return Math.round(base.magSize * (1 + lvl * 0.1));
    case 'acc': return base.spread * (1 - lvl * 0.08);
    default: return 0;
  }
}

function getUpgradeCost(stat, currentLevel) {
  return Math.floor(UPGRADE_BASE_COSTS[stat] * (1 + currentLevel * 0.8));
}

const ZOMBIE_CONFIGS = {
  normal:  { hpBase: [2, 3], hpScale: 1, speedMult: 1.0, xp: 10, radius: ZOMBIE_R },
  runner:  { hpBase: [1, 2], hpScale: 0.5, speedMult: 2.0, xp: 25, radius: ZOMBIE_R * 0.85 },
  tank:    { hpBase: [8, 10], hpScale: 2, speedMult: 0.5, xp: 50, radius: ZOMBIE_R * 1.5 },
  spitter:      { hpBase: [3, 4], hpScale: 1, speedMult: 0.7, xp: 40, radius: ZOMBIE_R },
  exploder:     { hpBase: [3, 4], hpScale: 0.5, speedMult: 1.3, xp: 35, radius: ZOMBIE_R * 1.1 },
  screamer:     { hpBase: [4, 5], hpScale: 1, speedMult: 0.6, xp: 45, radius: ZOMBIE_R * 0.9 },
  healer:       { hpBase: [5, 6], hpScale: 1, speedMult: 0.7, xp: 50, radius: ZOMBIE_R },
  shielder:     { hpBase: [6, 8], hpScale: 1.5, speedMult: 0.8, xp: 55, radius: ZOMBIE_R * 1.2 },
  broodmother:  { hpBase: [10, 12], hpScale: 2, speedMult: 0.5, xp: 60, radius: ZOMBIE_R * 1.4 },
  burrower:     { hpBase: [5, 7], hpScale: 1, speedMult: 1.0, xp: 55, radius: ZOMBIE_R },
};

function getSpawnWeights(wave) {
  if (wave <= 1) return { normal: 1 };
  if (wave <= 2) return { normal: 0.7, runner: 0.3 };
  if (wave <= 4) return { normal: 0.5, runner: 0.25, tank: 0.25 };
  if (wave <= 6) return { normal: 0.4, runner: 0.25, tank: 0.2, spitter: 0.15 };
  if (wave <= 9) return { normal: 0.35, runner: 0.2, tank: 0.15, spitter: 0.12, exploder: 0.18 };
  if (wave <= 11) return { normal: 0.3, runner: 0.18, tank: 0.12, spitter: 0.1, exploder: 0.15, screamer: 0.15 };
  if (wave <= 14) return { normal: 0.28, runner: 0.15, tank: 0.1, spitter: 0.1, exploder: 0.12, screamer: 0.1, healer: 0.15 };
  if (wave <= 17) return { normal: 0.25, runner: 0.13, tank: 0.1, spitter: 0.1, exploder: 0.1, screamer: 0.08, healer: 0.08, shielder: 0.16 };
  if (wave <= 21) return { normal: 0.22, runner: 0.12, tank: 0.1, spitter: 0.08, exploder: 0.1, screamer: 0.07, healer: 0.06, shielder: 0.1, broodmother: 0.15 };
  return { normal: 0.2, runner: 0.1, tank: 0.1, spitter: 0.08, exploder: 0.1, screamer: 0.07, healer: 0.05, shielder: 0.08, broodmother: 0.08, burrower: 0.14 };
}

function pickZombieType(wave) {
  const weights = getSpawnWeights(wave);
  const roll = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll < cumulative) return type;
  }
  return 'normal';
}


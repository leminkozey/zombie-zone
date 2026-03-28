// Direct DB setup — bypasses rate limiting
const db = require('./database');
const bcrypt = require('bcryptjs');

function xpForLevel(n) { return Math.floor(50 * Math.pow(n, 1.5)); }

async function main() {
  await db.init();
  console.log('DB ready.');

  // Register or find user
  const name = 'lemin';
  const password = 'lucluc202315!';
  let user = db.findUserByName.get(name);
  if (!user) {
    const hash = bcrypt.hashSync(password, 10);
    db.createUser.run(name, hash);
    user = db.findUserByName.get(name);
    console.log('Created user:', user.id);
  } else {
    // Reset password
    const hash = bcrypt.hashSync(password, 10);
    db.updatePassword.run(hash, user.id);
    console.log('Found existing user:', user.id);
  }
  const uid = user.id;

  // Set XP for level 450
  const targetXp = xpForLevel(450) + 1000; // 478297
  db.setXp.run(targetXp, uid);
  console.log('XP set to', targetXp, '(level 450)');

  // Set gold + diamonds
  db.setGold.run(9999999, uid);
  db.addDiamonds.run(9999, uid);
  console.log('Gold: 9999999, Diamonds: 9999+');

  // Buy + max all weapons
  const weapons = ['pistol', 'smg', 'shotgun', 'assault_rifle', 'sniper', 'minigun'];
  const stats = ['dmg', 'range', 'rate', 'reload', 'mag', 'acc'];
  for (const w of weapons) {
    // Buy if not pistol
    if (w !== 'pistol') {
      try { db.buyWeapon.run(uid, w); } catch {}
    } else {
      // Ensure pistol entry exists
      try { db.buyWeapon.run(uid, 'pistol'); } catch {}
    }
    // Max all stats (set each to 10 directly)
    for (const s of stats) {
      for (let i = 0; i < 10; i++) {
        try { db.upgradeWeaponStat(uid, w, s); } catch {}
      }
    }
    console.log('  Weapon', w, 'maxed');
  }

  // Buy + max all operators
  const operators = ['soldier', 'medic', 'builder', 'electrician', 'time_traveler', 'juggernaut'];
  for (const op of operators) {
    try { db.buyOperator.run(uid, op); } catch {}
    for (let i = 0; i < 5; i++) try { db.upgradeOperatorSlot(uid, op, 'active'); } catch {}
    for (let i = 0; i < 5; i++) try { db.upgradeOperatorSlot(uid, op, 'passive'); } catch {}
    for (let i = 0; i < 3; i++) try { db.upgradeOperatorSlot(uid, op, 'buff'); } catch {}
    console.log('  Operator', op, 'maxed');
  }

  // Buy all perks
  const perks = [
    'pistol_akimbo', 'pistol_hollow', 'smg_drum', 'smg_incendiary',
    'shotgun_dragon', 'shotgun_slug', 'ar_grenade', 'ar_fmj',
    'sniper_wallpen', 'sniper_explosive', 'minigun_overdrive', 'minigun_cryo',
  ];
  for (const p of perks) {
    try { db.buyPerk.run(uid, p); } catch {}
    console.log('  Perk', p, 'OK');
  }

  // Top up gold + diamonds again after purchases
  db.setGold.run(9999999, uid);

  // Verify
  const final = db.getUser.get(uid);
  console.log('\nFinal:', final);
  console.log('DONE!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

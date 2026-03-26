# Weapons System, Main Menu Overhaul & Currency — Design Spec

## Overview

Add a weapons system with 6 guns, Gold/Diamond currencies, a revamped main menu with tab navigation (Lobby, Skill Tree, Arsenal, Shop, Skins), weapon upgrades, and zombie gold drops. Remove reload/fire-rate skills from the skill tree.

## Main Menu Overhaul

### Tab Navigation
Top-center bar with 5 tabs:
- **LOBBY** (default) — Player info, map selection, start button
- **SKILL TREE** — Existing skill tree canvas (moved from separate screen into tab)
- **ARSENAL** — Weapon selection, stats, upgrades
- **SHOP** — "Coming Soon" placeholder
- **SKINS** — "Coming Soon" placeholder

### Lobby Tab
- Top-left: Player name + level badge
- Top-right: Currency bar (Gold + Diamonds)
- Center: "DEAD ZONE" title + XP/Skill Points info
- Bottom-left: Map selection (only "WAREHOUSE" for now, 2 locked "Coming Soon" slots)
- Bottom-right: "STARTEN" button

### Arsenal Tab
- **Left sidebar:** Weapon list (6 weapons). Unlocked weapons show icon + name + type. Locked weapons show lock icon + required level + cost.
- **Center:** Selected weapon display — large name, icon, cost/status
- **Right panel:** Weapon stats as bars (Damage, Range, Fire Rate, Reload, Magazine, Accuracy). Each stat has upgrade button showing Gold cost. Level indicator (0-10) per stat.

### Shop & Skins Tabs
Centered "COMING SOON" text. No functionality yet.

## Currency System

### Gold
- Drops from killed zombies
- Used for: buying weapons, upgrading weapon stats
- **Lost on death** (75% penalty same as XP? No — ALL gold lost on death)
- Displayed in HUD during game + in lobby

### Diamonds
- Rare drop from zombies (1-2% chance on Tank/Spitter kills in high waves)
- Achievement rewards (future)
- Purchasable with real money (future)
- Used for: Premium weapons (future)
- **Persist through death** — never lost
- Displayed in lobby currency bar

### Gold Drop Rates

| Zombie | Base Gold | Per-Wave Bonus |
|--------|-----------|---------------|
| Normal | 5-10 | +2/wave |
| Runner | 10-15 | +3/wave |
| Tank | 25-40 | +5/wave |
| Spitter | 15-25 | +4/wave |

- 5% chance per kill for "Gold Haufen" (3x amount)
- Gold drops visible as floating number above dead zombie

### Diamond Drop Rates
- Tank: 2% chance per kill (wave 10+)
- Spitter: 1% chance per kill (wave 10+)
- Normal/Runner: 0% chance

## Weapons

### Weapon Definitions

| Weapon | Type | Unlock | Cost | Damage | Range | FireRate | ReloadMs | MagSize | Spread | Special |
|--------|------|--------|------|--------|-------|----------|----------|---------|--------|---------|
| Pistol | Semi | Start | — | 1 | 55 | 8 | 1800 | 12 | 0.06 | Weak starter |
| SMG | Auto | Lvl 8 | 800G | 0.7 | 45 | 3 | 1500 | 35 | 0.1 | High fire rate |
| Shotgun | Spread | Lvl 20 | 4000G | 1.5 | 30 | 20 | 2200 | 6 | 0.3 | 5 pellets per shot |
| Assault Rifle | Auto | Lvl 35 | 12000G | 1.2 | 65 | 5 | 1600 | 30 | 0.04 | Balanced allrounder |
| Sniper | Single | Lvl 55 | 30000G | 4 | 90 | 30 | 2500 | 5 | 0.01 | Pierces through zombies |
| Minigun | Auto | Lvl 75 | 60000G | 0.8 | 55 | 2 | 3000 | 100 | 0.12 | Spin-up time, -30% move speed while firing |

Notes:
- Damage is a multiplier on base bullet damage (currently 1 HP per hit)
- Range is bullet lifetime in frames
- FireRate is shootCooldown in frames (lower = faster)
- Spread is random angle deviation in radians
- Shotgun fires 5 bullets in a spread pattern per click
- Sniper bullets don't stop on first zombie hit (pierce)
- Minigun: first 30 frames of firing have increasing fire rate (spin-up), player moves at 70% speed while mouseDown

### Weapon Upgrades

Each weapon has 6 upgradeable stats, each with 10 levels. Cost increases per level.

**Upgrade cost formula:** `baseCost * (1 + level * 0.8)`

| Stat | Base Upgrade Cost | Effect per Level |
|------|------------------|-----------------|
| Damage | 100G | +10% base damage |
| Range | 80G | +5 bullet lifetime |
| Fire Rate | 120G | -0.5 frame cooldown (min 1) |
| Reload | 80G | -8% reload time |
| Magazine | 100G | +10% mag size (rounded) |
| Accuracy | 60G | -8% spread |

### Death Penalty (updated)
On death:
- 75% XP lost
- ALL skill allocations deleted
- **ALL Gold lost**
- ALL normal weapons lost (revert to Pistol)
- ALL weapon upgrades lost
- **Diamonds KEPT**
- **Diamond weapons KEPT** (but their upgrades lost, must re-buy with Gold)

On rescue: Everything kept.

On quit: Same as death.

## Skill Tree Changes

### Removed Skills
- `quick_reload` (Mobility Tier 1) — reload speed now handled by weapon upgrades
- `trigger_finger` (Mobility Tier 2) — fire rate now handled by weapon upgrades

### Moved Skills
- `bullet_time` (was Tier 3, req: `trigger_finger`) → now req: `swift` (stays Tier 3)

### Refund
- On deploy: any points invested in removed skills are automatically freed
- Server `SKILL_MAX_LEVELS` map updated to remove `quick_reload` and `trigger_finger`
- Database: delete any `user_skills` rows for removed skill IDs

### Updated Mobility Tree
```
mob_start (Tier 0)
├── swift (Tier 1, maxLvl 5)
│   ├── dash (Tier 2)
│   │   ├── dash_range (Tier 2)
│   │   ├── dash_cd (Tier 2)
│   │   ├── dash_charges (Tier 2)
│   │   └── phantom_dash (Tier 3)
│   └── bullet_time (Tier 3) ← moved from trigger_finger
```

## Database Changes

### New Table: user_weapons
```sql
CREATE TABLE IF NOT EXISTS user_weapons (
  user_id INTEGER NOT NULL,
  weapon_id TEXT NOT NULL,
  owned INTEGER NOT NULL DEFAULT 1,
  dmg_level INTEGER DEFAULT 0,
  range_level INTEGER DEFAULT 0,
  rate_level INTEGER DEFAULT 0,
  reload_level INTEGER DEFAULT 0,
  mag_level INTEGER DEFAULT 0,
  acc_level INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, weapon_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Modify users table
Add columns:
```sql
ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0;
```

### Updated death transaction
`applyDeath` now also:
- Sets gold to 0
- Deletes all user_weapons EXCEPT diamond-purchased weapons (none yet, but schema supports it)
- Resets upgrade levels on diamond weapons to 0

## New API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/weapons` | Get user's weapons + upgrade levels |
| POST | `/api/weapons/buy` | Buy a weapon `{ weaponId }` — validates level + gold |
| POST | `/api/weapons/upgrade` | Upgrade a stat `{ weaponId, stat }` — validates ownership + gold |
| POST | `/api/weapons/equip` | Set active weapon `{ weaponId }` — validates ownership |
| POST | `/api/gold` | Add gold (called periodically like XP) `{ gold }` |

Modified:
- `POST /api/death` — also clears gold, deletes normal weapons, resets diamond weapon upgrades

## Frontend Architecture

### Menu System
The overlay div becomes a full tab-based menu. The skill tree canvas moves inside the SKILL TREE tab. Arsenal is a new HTML panel with DOM elements (not Canvas).

### In-Game Weapon System
- `player.weapon` references current weapon config
- `tryShoot()` reads from weapon config instead of BASE_STATS
- Shotgun: fires multiple bullets in spread pattern
- Sniper: bullet pierces (doesn't splice on first hit)
- Minigun: spin-up state variable, movement penalty
- Weapon switching: number keys 1-6 (if owned), or scroll wheel

### Gold HUD
Small gold counter in the game HUD (near ammo display). Gold drops show as floating "+15G" text above dead zombies.

### Gold Sync
Same pattern as XP: `pendingGold` tracked locally, synced every 10 seconds via `POST /api/gold`. Final sync before death/rescue.

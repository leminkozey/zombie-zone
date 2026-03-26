# Skill Tree & Rescue Mission — Design Spec

## Overview

Player upgrades via a constellation-style skill tree with 3 paths (Survival, Mobility, Rescue), a unified global XP/level system, persistent skill allocation, and a rescue mission extraction mechanic.

## XP System Overhaul

### Current State
- `sessionXp` starts at 0 each run, sent to server on death
- Lobby shows global level, in-game shows session level — disconnect

### New Behavior
- Single unified XP: in-game XP bar = global XP, always
- `skillPoints = level - 1` (Level 1 = 0 points, Level 10 = 9 points)

### XP Sync Strategy
- Client tracks `pendingXp` locally during run
- Syncs to server via `POST /api/xp` every **10 seconds** (debounced, only if pendingXp > 0)
- On run end (death/rescue/quit): final sync before state change
- `POST /api/death` and `POST /api/rescue` are called AFTER the final XP sync completes
- Server-side: `/api/death` atomically sets `xp = floor(xp * 0.25)` and deletes all skills in a single transaction

### XP Curve (Minecraft-style)
- Formula: `xpForLevel(n) = floor(50 * n^1.5)`
- Example levels:

| Level | Total XP needed | XP for this level |
|-------|----------------|-------------------|
| 1 | 0 | — |
| 2 | 141 | 141 |
| 5 | 559 | 159 |
| 10 | 1,581 | 231 |
| 20 | 4,472 | 331 |
| 50 | 17,677 | 527 |

Tuned so Level 3-4 is achievable in a first run (~10 minutes).

### Death Penalty
- **75% XP lost** (DB: `xp = floor(xp * 0.25)`, atomic transaction)
- **All skill allocations deleted** from DB (same transaction)
- Player returns to lobby with reduced level, can redistribute remaining points

### Quit Behavior
- ESC → "ZUR LOBBY" = **same as death penalty** (75% XP lost, all skills deleted)
- Prevents exploit of quitting to avoid death penalty
- HUD shows warning: "ACHTUNG: Verlassen = Tod-Strafe"

### Rescue Success
- 100% XP kept, all skills remain in DB
- Player returns to lobby

## Skill Tree UI

### Access
- **Lobby only** — new "SKILL TREE" button in the main menu overlay
- NOT accessible from pause screen during a run

### Rendering
- Canvas-based constellation map with pan (drag) and zoom (scroll wheel, slow)
- Toggle bar at top: SURVIVAL | MOBILITY | RESCUE — only one path visible at a time
- Switching paths animates camera to center of that path's node layout
- Dark space background with stars, colored nebula per path

### Node Interaction
- **Hover:** Tooltip with name, description, stats per level, prerequisite, max level
- **Click:** Invest 1 point (server validates: enough points + prerequisite unlocked + not over maxLvl)
- Unlocked nodes glow in path color, locked nodes are dimmed
- Available skill points displayed in HUD

### Visual Hierarchy
- **Tier 0:** Start node — visual anchor only, no cost, no effect, always unlocked. Not counted in skill totals.
- **Tier 1:** Directly connected to start
- **Tier 2:** Requires predecessor node unlocked
- **Tier 3:** Capstone — pulsing dashed border, strong single-level effects

## Skill Definitions

### Data Structure (extensible)

```js
{
  id: 'shield',          // unique identifier
  path: 'survival',      // which tree: survival | mobility | rescue
  req: 'vitality',       // prerequisite skill id (null for start nodes)
  tier: 2,               // 0-3
  maxLvl: 5,             // max investment
  icon: '🛡',
  name: 'SHIELD',
  desc: 'Generates a shield that absorbs damage.',
  x: -220, y: -260,      // position on constellation map
  r: 26,                  // node radius
  effect: (lvl) => ({     // returns stat modifiers
    shieldHp: 10 * lvl,
    shieldRegenDelay: 8 - lvl
  })
}
```

Adding a new skill = adding one object to the array. No system changes needed.

### Stat Calculation Rules
- **Flat bonuses** (HP, shield HP, distances): additive on base value
- **Percentage bonuses** (move speed, damage reduction, heal effectiveness): multiplicative on base value, not on each other
- Calculation order: `finalValue = baseValue * (1 + sumOfPercentBonuses) + sumOfFlatBonuses`
- Example: Swift Lvl 3 (+24%) + Fortress (+10% at full shield) = `2.8 * (1 + 0.24 + 0.10) = 3.752`, not `2.8 * 1.24 * 1.10`

### SURVIVAL Path (green)

| Skill | Tier | Max | Effect per Level |
|-------|------|-----|------------------|
| Vitality | 1 | 5 | +15 Max HP (100 → 175) |
| Field Medic | 1 | 3 | +30% Healthpack heal (25 → 47 HP) |
| Shield | 2 | 5 | +10 Shield HP, -1s regen delay (10/8s → 50/3s) |
| Regeneration | 2 | 3 | +0.5 HP/s passive (0.5 → 1.5) |
| Thick Skin | 2 | 3 | -5% incoming damage (max -15%) |
| **Fortress** | 3 | 1 | 2x shield regen, +10% speed at full shield |
| **Second Wind** | 3 | 1 | Once per run: survive lethal hit at 30% HP |

### Shield Mechanic Details
- Shield absorbs 100% of incoming damage until depleted (damage overflow passes to HP)
- Damage pipeline: `raw damage → Thick Skin reduction → Shield absorb → HP`
- Regen starts after `regenDelay` seconds without taking any damage (shield or HP)
- Regen rate: 5 Shield HP/s (doubled by Fortress)
- HUD: blue bar segment above HP bar, depletes right-to-left

### Second Wind
- Trigger state is **client-only**, resets on run start via `init()`
- Not persisted in DB — only the skill allocation is persisted

### MOBILITY Path (blue)

| Skill | Tier | Max | Effect per Level |
|-------|------|-----|------------------|
| Swift | 1 | 5 | +8% move speed (2.8 → 3.92) |
| Quick Reload | 1 | 3 | -15% reload time (1.8s → 1.0s) |
| Dash | 2 | 1 | Unlocks dash (Spacebar, 120px, 5s CD, 1 charge) |
| Dash Range | 2 | 3 | +40px distance (120 → 240) |
| Dash Cooldown | 2 | 3 | -1s cooldown (5s → 2s) |
| Dash Charges | 2 | 2 | +1 charge (1 → 3) |
| Trigger Finger | 2 | 3 | -1 frame shoot cooldown (8 → 5) |
| **Phantom Dash** | 3 | 1 | Invulnerable during dash, afterimage confuses 1.5s |
| **Bullet Time** | 3 | 1 | After dash: 50% zombie slow in radius for 2s |

### Dash Charge Mechanic
- Each charge has its **own independent cooldown**
- Using a dash consumes 1 charge, that charge starts its cooldown immediately
- Other full charges remain usable
- Example: 3 charges, 2s CD. Use all 3 rapidly → first charge ready again after 2s, second after 2s, third after 2s (staggered by usage time)

### RESCUE Path (orange)

| Skill | Tier | Max | Effect per Level |
|-------|------|-----|------------------|
| Quick Call | 1 | 5 | -20s activation time (240s → 140s) |
| Fast Extract | 1 | 4 | -3s stand time in circle (20s → 8s) |
| Survival Instinct | 2 | 5 | -10s survival phase (90s → 40s) |
| Rapid Redial | 2 | 3 | -5s request cooldown (30s → 15s) |
| Extended Window | 2 | 3 | +15s expiry time (60s → 105s) |
| Safe Zone | 2 | 3 | +20% circle radius (max +60%) |
| **Evac Chopper** | 3 | 1 | Circle slowly follows player (0.5x player speed) |
| **Fortified LZ** | 3 | 1 | -50% damage while standing in circle |

**Totals:** 24 skills (excluding 3 start nodes), 68 points to max all three trees.
- Survival: 5+3+5+3+3+1+1 = 21
- Mobility: 5+3+1+3+3+2+3+1+1 = 22
- Rescue: 5+4+5+3+3+3+1+1 = 25

## Rescue Mission Mechanic

### Activation
- Hold `F` for **3 seconds** to request rescue (prevents accidental trigger)
- HUD shows "RESCUE ANFRAGE..." with progress bar while holding
- Release before full → cancelled, nothing happens
- Only available after **240s** in-run (reducible via Quick Call skill)
- **30s cooldown** between requests (reducible via Rapid Redial)

### State Machine

```
idle → holding_f → survival_phase → circle_spawned → extracting → success
                                                                 ↘ expired → idle (cooldown)
```

State transitions:
- `idle → holding_f`: Player presses F (after activation time met, cooldown clear)
- `holding_f → idle`: Player releases F before 3s
- `holding_f → survival_phase`: 3s hold complete
- `survival_phase → circle_spawned`: Survival timer reaches 0
- `circle_spawned → extracting`: Player enters circle
- `extracting → circle_spawned`: Player leaves circle (progress resets)
- `extracting → success`: Progress bar reaches 100%
- `circle_spawned → expired`: Expiry timer runs out
- `extracting → expired`: Expiry timer runs out (even if partially extracted)
- `expired → idle`: Cooldown starts, can re-request after cooldown

**Death during any rescue state:** Normal death penalty applies. Rescue state is irrelevant — death always means 75% XP loss + skill reset. No special handling needed.

**F pressed during active rescue:** Ignored. Only works in `idle` state.

### Circle Spawn Rules
- Circle center must be **>= 3 tiles** from any wall tile
- Circle center must be **>= 5 tiles** from map border
- **Spawn exclusion zone:** No new zombies spawn within 6 tiles of circle center
- Existing zombies move normally, can enter the circle area
- If no valid position found (very unlikely): retry with relaxed constraints (2 tiles from walls)

### Flow
1. **Request sent** → survival phase timer starts (90s default)
2. Timer visible in HUD, counting down
3. Zombies continue spawning normally throughout
4. After survival phase: **extraction circle** spawns
5. Stand in circle for **20s** (reducible via Fast Extract)
   - Progress bar above circle
   - Progress **resets** if player leaves circle
6. Success → run ends, return to lobby with everything kept

### Expiry
- After circle appears: **60s window** to complete extraction (extendable via Extended Window)
- If expired: mission fails, cooldown starts, can request again

### Visuals
- Glowing pulsing ring on the ground (green/white)
- Timer display in HUD for each phase (survival countdown, expiry countdown, extraction progress)
- Minimap shows circle position as blinking marker
- Hold-F progress bar in center of screen with "RESCUE ANFRAGE..." label

## Bugfix: Zombies Stuck in Walls

- Validate spawn position is not inside a wall tile (check with zombie's full radius)
- Add push-out logic in `updateZombies()`: if a zombie's center is inside a wall, push it to nearest free tile
- Check wall collision with zombie's full radius, not just center point

## Database Changes

### Schema

```sql
-- Existing (unchanged):
users (id, name, password_hash, xp, created_at)

-- New table:
CREATE TABLE IF NOT EXISTS user_skills (
  user_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, skill_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/skills` | Load all skills for authenticated user |
| POST | `/api/skills/invest` | Invest 1 point in skill `{ skillId }`. Server validates: prerequisite unlocked, not over maxLvl, enough unspent points. Returns updated skill list. |
| POST | `/api/death` | Atomic transaction: delete all user_skills + set `xp = floor(xp * 0.25)`. Returns new XP. |
| POST | `/api/rescue` | Rescue success: just save current XP (final sync). Skills stay. Returns profile. |

**Modified existing endpoint:**
- `POST /api/xp` — unchanged logic (additive), but now called periodically during run instead of only at death. No validation changes needed — it only adds, never subtracts.

**Removed ambiguity:** `/api/death` is always called AFTER the final `/api/xp` sync. Client awaits the XP sync response before calling death. No race condition.

## Frontend Architecture

### File Structure
Stays single-file (`index.html`), but logically organized:

- **Skill definitions:** Data-driven array of skill objects
- **Skill tree UI:** Canvas renderer in lobby overlay (pan, zoom, click, hover)
- **Stat system:** `getPlayerStat(stat)` computes base value + all active skill bonuses
- **Rescue state machine:** Own state in game loop with explicit transitions

### Stat System

```js
const BASE_STATS = {
  maxHp: 100,
  moveSpeed: 2.8,
  reloadMs: 1800,
  shootCooldown: 8,
  // ...
};

function getPlayerStat(stat) {
  const base = BASE_STATS[stat];
  let flatBonus = 0;
  let pctBonus = 0;

  for (const s of activeSkills) {
    const fx = skillMap[s.skillId].effect(s.level);
    if (fx[stat]) flatBonus += fx[stat];
    if (fx[stat + 'Pct']) pctBonus += fx[stat + 'Pct'];
  }

  return base * (1 + pctBonus) + flatBonus;
}
```

All game code reads stats through this function. No hardcoded values.

### Extensibility
- New skill = 1 object in the SKILLS array
- New stat = add to BASE_STATS + reference in `effect()` functions
- New path = add color entry + toggle button (future: weapon tree)

# Skill Tree & Rescue Mission — Design Spec

## Overview

Player upgrades via a constellation-style skill tree with 3 paths (Survival, Mobility, Rescue), a unified global XP/level system, persistent skill allocation, and a rescue mission extraction mechanic.

## XP System Overhaul

### Current State
- `sessionXp` starts at 0 each run, sent to server on death
- Lobby shows global level, in-game shows session level — disconnect

### New Behavior
- Single unified XP: in-game XP bar = global XP, always
- XP sent live to server during run (not just on death)
- 1 level = 1 skill point

### XP Curve (Minecraft-style)
- Early levels: fast (e.g., Level 2 = 50 XP)
- Later levels: exponentially harder
- Formula: `xpForLevel(n) = baseXP * n^exponent` (tuned so ~Level 5 is achievable in first run)

### Death Penalty
- **75% XP lost** (stored in DB: `xp = floor(xp * 0.25)`)
- **All skill allocations deleted** from DB
- Player returns to lobby with reduced level, can redistribute remaining points

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
- **Click:** Invest a point (if enough points available + prerequisite unlocked)
- Unlocked nodes glow in path color, locked nodes are dimmed
- Available skill points displayed in HUD

### Visual Hierarchy
- **Tier 0:** Start node — filled center, always unlocked, free
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

### SURVIVAL Path (green)

| Skill | Tier | Max | Effect per Level |
|-------|------|-----|------------------|
| Vitality | 1 | 5 | +15 Max HP (100 → 175) |
| Field Medic | 1 | 3 | +30% Healthpack heal (25 → 47 HP) |
| Shield | 2 | 5 | +10 Shield HP, -1s regen delay (10/8s → 60/3s) |
| Regeneration | 2 | 3 | +0.5 HP/s passive (0.5 → 1.5) |
| Thick Skin | 2 | 3 | -5% incoming damage (max -15%) |
| **Fortress** | 3 | 1 | 2x shield regen, +10% speed at full shield |
| **Second Wind** | 3 | 1 | Once per run: survive lethal hit at 30% HP |

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

**Totals:** 24 skills, 72 points to max all three trees.

## Rescue Mission Mechanic

### Activation
- Hold `F` for **3 seconds** to request rescue (prevents accidental trigger)
- HUD shows "RESCUE ANFRAGE..." with progress bar while holding
- Release before full → cancelled, nothing happens
- Only available after **240s** in-run (reducible via Quick Call skill)
- **30s cooldown** between requests (reducible via Rapid Redial)

### Flow
1. **Request sent** → survival phase timer starts (90s default)
2. Timer visible in HUD, counting down
3. Zombies continue spawning normally throughout
4. After survival phase: **extraction circle** spawns at random map position
   - Not too close to walls
   - Visible on minimap
   - **Spawn exclusion zone** around circle — no new zombies spawn within radius
   - Existing zombies continue moving normally
5. Stand in circle for **20s** (reducible via Fast Extract)
   - Progress bar above circle
   - Progress **resets** if player leaves circle
6. Success → run ends, return to lobby with everything kept

### Expiry
- After circle appears: **60s window** to complete extraction (extendable via Extended Window)
- If expired: mission fails, cooldown starts, can request again

### Visuals
- Glowing pulsing ring on the ground
- Timer display in HUD for each phase
- Minimap shows circle position
- Hold-F progress bar in center of screen

## Bugfix: Zombies Stuck in Walls

- Validate spawn position is not inside a wall tile
- Add push-out logic in `updateZombies()`: if a zombie's center is inside a wall, push it to nearest free tile
- Check wall collision with zombie's full radius, not just center

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

### New API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/skills` | Load all skills for authenticated user |
| POST | `/api/skills` | Invest skill point `{ skillId, level }` |
| POST | `/api/death` | Death: delete all skills, reduce XP by 75% |
| POST | `/api/rescue` | Rescue success: save current XP (skills stay) |

Existing endpoints unchanged: `/api/register`, `/api/login`, `/api/profile`, `/api/xp`.

## Frontend Architecture

### File Structure
Stays single-file (`index.html`), but logically organized:

- **Skill definitions:** Data-driven array of skill objects
- **Skill tree UI:** Canvas renderer in lobby overlay (pan, zoom, click, hover)
- **Stat system:** `getPlayerStat(stat)` computes base value + all active skill bonuses
- **Rescue state machine:** Own state in game loop (idle → holding_f → survival_phase → circle_spawned → extracting → success/expired)

### Stat System

```js
function getPlayerStat(stat) {
  let value = BASE_STATS[stat];
  for (const s of activeSkills) {
    const effect = skillMap[s.skillId].effect(s.level);
    if (effect[stat] !== undefined) {
      value += effect[stat]; // or multiply, depending on stat type
    }
  }
  return value;
}
```

All game code reads stats through this function. No hardcoded values.

### Extensibility
- New skill = 1 object in the SKILLS array
- New stat = add to BASE_STATS + reference in `effect()` functions
- New path = add color entry + toggle button (future: weapon tree)

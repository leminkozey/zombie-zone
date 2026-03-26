# Operators (Klassen-System) — Design Spec

## Overview

6 spielbare Operator-Klassen mit jeweils einer aktiven Faehigkeit, einer passiven Faehigkeit, Buffs und Debuffs. Operatoren werden im OPERATORS-Tab ausgewaehlt und gelten ab dem naechsten Run. Einmal gekauft sind sie permanent, aber ihre Upgrades gehen bei Tod verloren.

## Operator-Auswahl

- Auswahl im **OPERATORS-Tab** (ersetzt "Coming Soon")
- Aenderung jederzeit moeglich, gilt ab naechstem Run
- Ohne Operator: keine Klassen-Boni (wie bisher)
- Aktiver Operator wird in DB gespeichert

## Operator-Unlock

- Jeder Operator hat ein **Mindestlevel**
- Kosten: **Gold ODER Diamanten** (eine der beiden Waehrungen, nicht beide)
- Einmal gekauft = **permanent** (ueberlebt Tod)
- Operator-**Upgrades gehen bei Tod verloren**

### Unlock-Tabelle

| Operator | Unlock Level | Gold-Preis | Diamant-Alternative |
|----------|-------------|-----------|-------------------|
| Soldat | 15 | 5.000G | 30💎 |
| Medic | 25 | 12.000G | 50💎 |
| Builder | 35 | 25.000G | 75💎 |
| Elektriker | 50 | 50.000G | 100💎 |
| Time Traveler | 70 | 100.000G | 150💎 |
| Juggernaut | 90 | 200.000G | 200💎 |

## Operator-Definitionen

### 1. Soldat (Lvl 15)

| | Detail |
|---|---|
| **Aktiv: Kampfrausch** | 8s lang unendlich Ammo + 50% schnellere Feuerrate + kein Reload. Cooldown 35s. |
| **Passiv** | Ammo-Drops +50% haeufiger, Ammo-Packs geben doppelt |
| **Buff** | +15% Schaden auf alle Waffen |
| **Debuff** | -30% Healing-Effektivitaet (Healthpacks heilen weniger) |

### 2. Medic (Lvl 25)

| | Detail |
|---|---|
| **Aktiv: Heilfeld** | Setzt eine Heilzone (80px Radius) die 8s lang bleibt, 5 HP/s heilt wenn man drin steht. Cooldown 30s. Mit Upgrade: Heilzone schiesst auch auf Zombies (1 DPS). |
| **Passiv** | Healthpack-Drops +50% haeufiger |
| **Buff** | +50 Max HP, +1 HP/s passive Regen |
| **Debuff** | -20% Schaden auf alle Waffen |

### 3. Builder (Lvl 35)

| | Detail |
|---|---|
| **Aktiv: Block setzen** | Setzt einen Block (Wand-Tile) auf Cursor-Position. Max 10 Bloecke gleichzeitig (aeltester verschwindet). Zombies brauchen 5 Hits um einen Block zu zerstoeren. Cooldown 8s. |
| **Passiv** | Bloecke heilen sich selbst nach 10s wenn beschaedigt |
| **Buff** | +20% Max HP |
| **Debuff** | -15% Feuerrate |

### 4. Elektriker (Lvl 50)

| | Detail |
|---|---|
| **Aktiv: Turret** | Setzt einen Turret der automatisch auf Zombies in 150px Radius schiesst (2 DPS). Max 2 Turrets. Turret hat 50 HP. Cooldown 20s. Zweite Aktivierung: Turret zieht Aggro — Zombies in 200px fokussieren Turret statt Spieler fuer 5s. |
| **Passiv** | Turrets reparieren sich langsam (2 HP/s) |
| **Buff** | +25% Reichweite auf alle Waffen |
| **Debuff** | -20% Move Speed |

### 5. Time Traveler (Lvl 70)

| | Detail |
|---|---|
| **Aktiv: Zeitriss** | Alles verlangsamt sich auf 20% Speed fuer 5s. Bullets die man in Slowmo schiesst bleiben eingefroren in der Luft. Nach 5s fliegen ALLE eingefrorenen Bullets gleichzeitig los + alles geht auf 150% Speed fuer 3s. Cooldown 45s. |
| **Passiv** | Bei jedem 10. Kill: 1s Mini-Slowmo (50% Speed) automatisch |
| **Buff** | +30% Move Speed |
| **Debuff** | -25% Max HP |

### 6. Juggernaut (Lvl 90)

| | Detail |
|---|---|
| **Aktiv: Unaufhaltsam** | 10s lang immun gegen Knockback, +50% Schaden, Zombies die dich beruehren nehmen 5 DPS Kontaktschaden. Cooldown 40s. |
| **Passiv** | Minigun braucht kein Reload (unendliches Magazin) |
| **Buff** | +100 Max HP, +30 Shield, -15% eingehender Schaden |
| **Debuff** | -40% Move Speed, -30% Feuerrate auf alle Waffen ausser Minigun |

## Operator-Upgrades

Jeder Operator hat 3 upgradbare Slots. Kosten sind Gold + Skill-Punkte (die uebrig sind nachdem der Skill Tree voll ist).

| Upgrade-Slot | Max Level | Effekt | Basis-Kosten pro Level |
|-------------|-----------|--------|----------------------|
| **Aktiv-Staerke** | 5 | Staerkerer Effekt, laengere Dauer, kuerzerer Cooldown | 5.000G + 3 SP |
| **Passiv-Staerke** | 5 | Staerkerer Passiv-Effekt | 3.000G + 2 SP |
| **Buff-Verstaerkung** | 3 | Hoehere Buff-Werte, leicht reduzierte Debuffs | 8.000G + 5 SP |

Kosten-Skalierung: Level N kostet N × Basis. Also Aktiv-Staerke Level 3 = 15.000G + 9 SP.

### Upgrade-Effekte pro Operator

**Soldat:**
- Aktiv +1: Kampfrausch Dauer +1.5s pro Level (8s → 15.5s bei Max)
- Aktiv +2: Cooldown -3s pro Level (35s → 20s)
- Passiv +1: Ammo-Drop-Bonus +10% pro Level (50% → 100%)
- Buff +1: Schaden-Buff +3% pro Level (15% → 24%)
- Buff-Debuff-Reduktion: Healing-Penalty -5% pro Level (-30% → -15%)

**Medic:**
- Aktiv +1: Heilfeld Dauer +2s pro Level, ab Level 3 schiesst die Zone
- Aktiv +2: Cooldown -3s pro Level
- Passiv +1: Health-Drop-Bonus +10% pro Level
- Buff +1: Max HP +10 pro Level, Regen +0.3 HP/s pro Level
- Buff-Debuff-Reduktion: Schaden-Penalty -4% pro Level

**Builder:**
- Aktiv +1: Block HP +1 Hit pro Level (5 → 10 Hits)
- Aktiv +2: Cooldown -1s pro Level, +2 Max Bloecke pro Level
- Passiv +1: Block-Selbstheilung schneller (-2s Delay pro Level)
- Buff +1: Max HP +5% pro Level
- Buff-Debuff-Reduktion: Feuerrate-Penalty -3% pro Level

**Elektriker:**
- Aktiv +1: Turret DPS +0.5 pro Level, +1 Max Turret bei Level 3 und 5
- Aktiv +2: Cooldown -2s pro Level, Turret HP +10 pro Level
- Passiv +1: Turret Regen +0.5 HP/s pro Level
- Buff +1: Reichweiten-Buff +5% pro Level
- Buff-Debuff-Reduktion: Speed-Penalty -4% pro Level

**Time Traveler:**
- Aktiv +1: Slowmo Dauer +1s pro Level (5s → 10s)
- Aktiv +2: Cooldown -4s pro Level, Speed-Phase schneller (150% → 200%)
- Passiv +1: Mini-Slowmo bei jedem 8./6./4./3./2. Kill
- Buff +1: Speed-Buff +5% pro Level
- Buff-Debuff-Reduktion: HP-Penalty -5% pro Level

**Juggernaut:**
- Aktiv +1: Unaufhaltsam Dauer +2s pro Level, Kontaktschaden +2 DPS pro Level
- Aktiv +2: Cooldown -4s pro Level
- Passiv +1: Minigun-Feuerrate +5% pro Level (nur Minigun)
- Buff +1: Max HP +20 pro Level, Shield +10 pro Level
- Buff-Debuff-Reduktion: Speed-Penalty -5% pro Level, Feuerrate-Penalty -5% pro Level

## Skill-Punkte fuer Operator-Upgrades

- Wenn der Skill Tree komplett voll ist (alle 68+ Punkte vergeben), bekommt man bei weiteren Level-Ups weiterhin Skill-Punkte
- Diese "ueberschuessigen" Punkte koennen NUR in Operator-Upgrades investiert werden
- Im Operators-Tab sieht man verfuegbare Punkte und kann sie verteilen
- Bei Tod: Operator-Upgrade-Punkte gehen verloren (Upgrades resetten), aber der Operator selbst bleibt

## Database Changes

### New Table: user_operators
```sql
CREATE TABLE IF NOT EXISTS user_operators (
  user_id INTEGER NOT NULL,
  operator_id TEXT NOT NULL,
  owned INTEGER NOT NULL DEFAULT 1,
  active_level INTEGER DEFAULT 0,
  passive_level INTEGER DEFAULT 0,
  buff_level INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, operator_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Modify users table
```sql
ALTER TABLE users ADD COLUMN active_operator TEXT DEFAULT NULL;
```

### Updated death transaction
`applyDeath` resets alle Operator-Upgrade-Levels auf 0 (aber loescht die Operator-Rows NICHT — Besitz bleibt).

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/operators` | Alle owned Operators + Upgrade-Levels + aktiver Operator |
| POST | `/api/operators/buy` | Operator kaufen `{ operatorId, currency: 'gold'|'diamonds' }` |
| POST | `/api/operators/select` | Aktiven Operator setzen `{ operatorId }` (null = keiner) |
| POST | `/api/operators/upgrade` | Upgrade-Slot upgraden `{ operatorId, slot: 'active'|'passive'|'buff' }` |

## Frontend Architecture

### OPERATORS-Tab
- Grid/Liste aller 6 Operatoren
- Jeder zeigt: Name, Icon, Level-Requirement, Kosten, Passiv/Aktiv/Buff/Debuff Beschreibung
- Owned: Auswaehlbar + Upgrade-Slots sichtbar
- Locked: Ausgegraut mit Unlock-Info
- Aktiver Operator hat visuellen Highlight

### In-Game Effekte
- `player.operator` referenziert aktiven Operator-Config
- Buffs/Debuffs werden in `getPlayerStat()` eingerechnet (neue Stats wie `weaponDamageMult`, `healingEffectiveness`)
- Aktive Faehigkeit: Gleiche Taste wie Perks? Nein — separate Taste (Q Standard, rebindable)
- Cooldown-Anzeige im HUD (links vom Spieler)
- Builder-Bloecke, Turrets, Heilzonen als eigene Entity-Arrays

### Visual Feedback
- Operator-Icon im HUD waehrend des Runs
- Aktive Faehigkeit: Screen-Effekt (z.B. Time Traveler = Blaufilter bei Slowmo)
- Cooldown als kreisfoermige Fortschrittsanzeige

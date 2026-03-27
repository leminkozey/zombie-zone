# Neue Zombie-Typen Design

## Uebersicht

6 neue Zombie-Typen die progressiv ab Wave 7-22 eingeführt werden. Jeder Typ fuellt eine taktische Nische: AoE-Gefahr, Support-Buff, Heilung, Defensive, Spawning, Ueberraschungsangriff.

## Typen

### 1. Exploder (Wave 7)

- **HP:** 3-4 + floor(wave/4) | hpScale: 0.5
- **Speed:** 1.3x | **Radius:** ZOMBIE_R * 1.1 | **XP:** 35
- **Farbe:** Orange-Rot (#cc4400), pulsierendes Gluehen
- **Mechanik:**
  - Rennt auf Spieler zu (normales Movement)
  - Bei Tod: Explosion 40px Radius, 12 Schaden an Spieler wenn in Reichweite
  - Hinterlaesst kleine Giftflaeche (30px Radius, 2s Dauer, 2 DPS)
  - Blinkt schneller je weniger HP (visuell: alpha-Puls skaliert mit HP%)
  - Screenshake bei Explosion (3px, 8 Frames)
- **Kein Spezialverhalten beim Movement** — verhält sich wie Normal

### 2. Screamer (Wave 10)

- **HP:** 4-5 + floor(wave/3) | hpScale: 1
- **Speed:** 0.6x | **Radius:** ZOMBIE_R * 0.9 | **XP:** 45
- **Farbe:** Weiss/Hellgrau (#cccccc), rote Augen (#ff2200)
- **Mechanik:**
  - Alle 300 Frames (5s): Schrei-Buff
  - Buff: alle Zombies in 120px Radius bekommen +30% Speed und +20% Damage fuer 180 Frames (3s)
  - Gebuffte Zombies bekommen `screamBuff` Timer
  - Visuell: expandierender Schallwellen-Ring (weiss, verblassend)
  - Screamer selbst ist langsam, hält Abstand wie Spitter (bleibt bei 100-180px)
- **Kein eigener Angriff** — buffed nur andere

### 3. Healer (Wave 12)

- **HP:** 5-6 + floor(wave/3) | hpScale: 1
- **Speed:** 0.7x | **Radius:** ZOMBIE_R | **XP:** 50
- **Farbe:** Hellgruen (#44dd44), heller Glow
- **Mechanik:**
  - Heilt alle Zombies in 80px Radius um 2 HP/s (pro Frame: 2/60)
  - Heilt sich NICHT selbst
  - Sichtbarer Heal-Puls alle 120 Frames (2s): gruener Ring expandiert
  - **Spawn-Limit:** Max 1 Healer gleichzeitig. `spawnZombie()` skippt Healer wenn einer lebt.
  - Hält Abstand wie Spitter (bleibt bei 80-150px)
- **Prioritaetsziel** — ohne Healer-Kill werden Tanks/Bosse unsterblich

### 4. Shielder (Wave 15)

- **HP:** 6-8 + floor(wave/2) | hpScale: 1.5
- **Speed:** 0.8x | **Radius:** ZOMBIE_R * 1.2 | **XP:** 55
- **Farbe:** Dunkelblau/Stahl (#334466), Schild-Highlight (#6688aa)
- **Mechanik:**
  - Frontschild: Schaden von vorne (±60 Grad vom Blickwinkel `z.angle`) wird um 80% reduziert
  - Schild hat eigene HP: 15, regeneriert nach 300 Frames (5s) ohne Treffer
  - Wenn Schild-HP 0: Schild zerstoert, normaler Schaden von ueberall, kein Regen mehr
  - Visuell: Halbbogen vor dem Zombie, Farbe verblasst mit Schild-HP
  - Neue Properties: `shieldHp`, `shieldMaxHp`, `shieldRegenTimer`, `shieldBroken`
- **Schadens-Check:** In allen Stellen wo Zombie-HP reduziert wird, muss der Winkel zwischen Schadensquelle und Zombie.angle geprueft werden

### 5. Broodmother (Wave 18)

- **HP:** 10-12 + floor(wave/2) | hpScale: 2
- **Speed:** 0.5x | **Radius:** ZOMBIE_R * 1.4 | **XP:** 60
- **Farbe:** Dunkelbraun/Violett (#553344), Eier (#aa8866)
- **Mechanik:**
  - Bei Tod: spawnt 4-5 Mini-Zombies
    - Mini-Zombies: 1 HP, 1.8x Speed, ZOMBIE_R * 0.6, 3 XP, type 'normal' mit isMinion: true
  - Alle 480 Frames (8s): legt ein "Ei" an aktueller Position
    - Ei: sichtbares Objekt, nach 180 Frames (3s) schlüpft ein Mini-Zombie
    - Max 3 Eier gleichzeitig pro Broodmother
    - Eier koennen zerstoert werden (3 HP, zaehlen als normaler Treffer)
  - `waveTotal` wird fuer jeden gespawnten Mini-Zombie und geschlüpften Ei-Zombie erhoeht
- **Globales Array:** `broodEggs = []` mit `{x, y, hatchTimer, hp, alive}`

### 6. Burrower (Wave 22)

- **HP:** 5-7 + floor(wave/3) | hpScale: 1
- **Speed:** 1.0x | **Radius:** ZOMBIE_R | **XP:** 55
- **Farbe:** Erdbraun/Dunkelgrau (#665533)
- **Mechanik:**
  - Alle 360 Frames (6s): grabt sich ein
    - 90 Frames (1.5s) unsichtbar + unverwundbar (`burrowed: true`)
    - Waehrend burrowed: bewegt sich unter der Erde Richtung Spieler (1.5x Speed)
    - Taucht 50-80px vom Spieler auf
  - Beim Auftauchen: AoE-Stun 40px Radius, 0.5s (30 Frames) — Spieler kann sich nicht bewegen
    - Stun-Variable: `playerStunTimer`
    - Visuell: Erdbrocken-Partikel (braun) am Auftauch-Punkt
  - Waehrend burrowed: sichtbar als Erdbewegung (kleine braune Partikel an Position)
- **Neue globale Variable:** `playerStunTimer = 0`

## Spawn-Gewichte

```js
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
```

## ZOMBIE_CONFIGS Erweiterung

```js
exploder:     { hpBase: [3, 4], hpScale: 0.5, speedMult: 1.3, xp: 35, radius: ZOMBIE_R * 1.1 },
screamer:     { hpBase: [4, 5], hpScale: 1, speedMult: 0.6, xp: 45, radius: ZOMBIE_R * 0.9 },
healer:       { hpBase: [5, 6], hpScale: 1, speedMult: 0.7, xp: 50, radius: ZOMBIE_R },
shielder:     { hpBase: [6, 8], hpScale: 1.5, speedMult: 0.8, xp: 55, radius: ZOMBIE_R * 1.2 },
broodmother:  { hpBase: [10, 12], hpScale: 2, speedMult: 0.5, xp: 60, radius: ZOMBIE_R * 1.4 },
burrower:     { hpBase: [5, 7], hpScale: 1, speedMult: 1.0, xp: 55, radius: ZOMBIE_R },
```

## ZOMBIE_TYPES Erweiterung (Visuals)

```js
exploder:    { body: '#cc4400', skin: '#ff6622', arm: '#aa3300', outline: '#883300', scale: 1.1, eyeColor: '#ffaa00', eyeGlow: '#ff8800' },
screamer:    { body: '#cccccc', skin: '#eeeeee', arm: '#aaaaaa', outline: '#999999', scale: 0.9, eyeColor: '#ff2200', eyeGlow: '#dd0000' },
healer:      { body: '#22aa44', skin: '#44dd66', arm: '#33bb55', outline: '#229944', scale: 1.0, eyeColor: '#aaffaa', eyeGlow: '#88ff88' },
shielder:    { body: '#334466', skin: '#445577', arm: '#2a3a55', outline: '#556688', scale: 1.2, eyeColor: '#88aadd', eyeGlow: '#6688bb' },
broodmother: { body: '#553344', skin: '#664455', arm: '#442233', outline: '#775566', scale: 1.4, eyeColor: '#ffaa66', eyeGlow: '#dd8844' },
burrower:    { body: '#665533', skin: '#887744', arm: '#554422', outline: '#776644', scale: 1.0, eyeColor: '#ddaa55', eyeGlow: '#cc9944' },
```

## Gold-Drops

```js
const goldDef = {
  normal: [5,10,2], runner: [10,15,3], tank: [25,40,5], spitter: [15,25,4],
  exploder: [12,18,3], screamer: [18,28,4], healer: [20,30,5],
  shielder: [22,35,5], broodmother: [30,45,6], burrower: [18,28,4]
};
```

## Minimap-Farben

```js
const minimapColors = {
  normal: '#aa2200', runner: '#cc6600', tank: '#661111', spitter: '#663399',
  exploder: '#cc4400', screamer: '#cccccc', healer: '#44dd44',
  shielder: '#4466aa', broodmother: '#664455', burrower: '#887744'
};
```

## Kill-Stats

Neue Zombie-Typen zaehlen alle unter `runStats.kills` (gesamt), aber bekommen KEINE eigenen Kill-Kategorien in der DB. Das waere zu viel Schema-Aufwand fuer wenig Wert. Die bestehenden Kategorien (normal, runner, tank, spitter, boss) bleiben. Neue Typen werden nicht einzeln getrackt.

Das heisst: `runStats[z.type + 'Kills']++` wird fuer die neuen Typen `undefined` incrementen. Fix: nur bekannte Typen tracken.

## Integration

- Alle neuen Typen nutzen das bestehende `zombies[]` Array
- Alle nutzen das bestehende Movement-System (flowfield etc.)
- Screamer und Healer nutzen Spitter-Distanzverhalten (halten Abstand)
- Broodmother-Eier brauchen ein neues `broodEggs[]` Array
- Burrower braucht neues `playerStunTimer` Global
- Screamer-Buff braucht `screamBuff` Timer pro Zombie
- Exploder-Explosion und Broodmother-Death-Spawn laufen in `onZombieKill()`
- Shielder-Schild-Check muss in alle Schadensstellen integriert werden (analog zu `applyBossDamage`)
- Healer-Heilung und Screamer-Buff laufen in einer neuen `updateSpecialZombies()` Funktion
- Burrower-Burrow-Logik laeuft ebenfalls in `updateSpecialZombies()`

# Co-op Multiplayer V2 — Server-Autoritativ

## Overview

2-4 Spieler Co-op ueber Socket.IO. **Server berechnet ALLES** — Zombie-AI, Schaden, Treffer, Bewegung, Drops. Clients senden nur Inputs und rendern den empfangenen Game-State.

## Architektur

```
Client A (Input) ──→ SERVER (Game Logic) ──→ Client A (Render)
Client B (Input) ──→                    ──→ Client B (Render)
Client C (Input) ──→                    ──→ Client C (Render)
```

### Server
- Laeuft auf dem Pi (7GB RAM frei, kaum Last)
- Socket.IO auf demselben Express-Server
- **Game Loop auf dem Server:** 20 Ticks/Sekunde
- Berechnet: Spieler-Bewegung, Zombie-AI, Flowfield, Kollision, Schaden, Treffer, Drops, Waves, Rescue
- Sendet kompletten Game-State an alle Clients pro Tick

### Client
- Sendet nur: Tastatur-Inputs (WASD, Maus-Position, Schiessen, Reload, Abilities)
- Empfaengt: Kompletter Game-State (Spieler-Positionen, Zombie-Positionen, Bullets, HP, etc.)
- Rendert den empfangenen State
- **Keine eigene Spiellogik** — rein visuell
- Interpolation zwischen Server-Updates fuer smooth Rendering

## Lobby-System

Gleich wie V1:
- MULTIPLAYER Button im Hauptmenue
- LOBBY ERSTELLEN → 4-stelliger Code
- LOBBY BEITRETEN → Code eingeben
- Max 4 Spieler
- Host kann kicken + starten
- Host-Transfer bei Disconnect

## Game-State (Server → Clients, 20/s)

```js
{
  tick: number,
  wave: number,
  waveKills: number,
  waveTotal: number,
  players: [{
    id: string,
    name: string,
    x: number, y: number, angle: number,
    hp: number, maxHp: number,
    shield: number, maxShield: number,
    ammo: number, maxAmmo: number,
    weaponId: string,
    recoil: number,
    downed: boolean,
    downedTimer: number,
    dead: boolean,
    rescued: boolean,
    score: number,
    gold: number,
  }],
  zombies: [{
    id: string,
    type: string,
    x: number, y: number, angle: number,
    hp: number, maxHp: number,
    alive: boolean,
    burrowed: boolean,
    shieldHp: number,
  }],
  bullets: [{
    x: number, y: number,
    dx: number, dy: number,
    ownerId: string,
  }],
  hitTrails: [{
    x1: number, y1: number,
    x2: number, y2: number,
    style: string,
  }],
  pickups: [{
    type: string, // 'health' | 'ammo'
    x: number, y: number,
  }],
  events: [
    // Einmalige Events pro Tick: kills, damage, pickups, wave-start, etc.
    { type: 'kill', killerId: string, zombieType: string, gold: number },
    { type: 'damage', playerId: string, amount: number },
    { type: 'pickup', playerId: string, pickupType: string },
    { type: 'wave', wave: number },
    { type: 'sound', sound: string, x: number, y: number },
  ],
}
```

## Client-Inputs (Client → Server)

```js
{
  keys: { up, down, left, right, reload, dash, shoot, rescue, ability },
  mouseAngle: number, // Winkel von Spieler zu Maus
}
```

Inputs werden **jeden Frame** gesendet (60/s). Server sammelt und verarbeitet im naechsten Tick.

## Spieler-Rendering

- **Alle Spieler sehen 1:1 gleich aus** — selber Skin, selbe drawPlayer() Funktion
- Nametag + HP-Bar ueber jedem Spieler (auch dem eigenen)
- Keine Farbunterschiede — alle sind der gleiche Soldat
- Unterscheidbar nur durch Nametag

## Zombie-System

- Server berechnet komplette Zombie-AI (Flowfield, Targeting, Movement)
- Zombies greifen den **naechsten Spieler** an (Server kennt alle Positionen)
- Melee-Schaden wird serverseitig berechnet und an betroffenen Client gesendet
- Spitter-Projektile laufen auf dem Server

## Schuss-System

- Client sendet: "ich schiesse in Richtung X"
- Server berechnet: Hitscan-Ray oder Projektil, prueft Treffer, berechnet Schaden
- Server sendet: hitTrail (visuell) + kill/damage Events
- **Alle Clients sehen die gleichen Kugeln/Trails**

## Revive-System

- Downed: 30s Timer, kann nicht bewegen/schiessen
- Revive: Taste halten (3s) neben downed Spieler
- Server berechnet Distanz + Timer
- Revived: 30% HP

## Rescue

- Individuell pro Spieler (jeder hat eigenen Rescue-State)
- Server berechnet alles

## Tod-Strafe

Gleich wie Singleplayer — nur fuer permanent Tote.

## Server-Seite Implementation

### Neue Datei: `game-server.js`

Separates Modul fuer die Game-Logik. Exportiert eine `GameRoom` Klasse:

```js
class GameRoom {
  constructor(lobbyCode, players) { ... }
  tick() { ... }           // 20x/s — update alle Entities
  handleInput(playerId, input) { ... }
  getState() { ... }       // returns serialized game state
  destroy() { ... }
}
```

### server.js Aenderungen

- Socket.IO Setup (wie vorher)
- Lobby-System (wie vorher)
- Bei Game-Start: `new GameRoom(code, players)` erstellen
- `setInterval(room.tick, 50)` — 20 Ticks/Sekunde
- Nach jedem Tick: `io.to(code).emit('state', room.getState())`
- Bei Player-Input: `room.handleInput(socketId, data)`

### Game-Logik im GameRoom

Der GameRoom enthaelt eine vereinfachte Version der Client-Game-Logik:
- Spieler-Bewegung (WASD + Kollision)
- Zombie-Spawning + AI (Flowfield zum naechsten Spieler)
- Schuss-Berechnung (Hitscan + Projektile)
- Schaden-Berechnung (Zombie-Melee, Spitter, Bullets)
- Pickup-System (Health, Ammo)
- Wave-System
- Gold/XP Tracking pro Spieler

**WICHTIG:** Die Game-Logik muss NICHT Canvas/DOM nutzen — rein mathematisch. Kein `ctx`, kein `document`, nur Zahlen.

### Client-Aenderungen

- Multiplayer-Modus: Client sendet nur Inputs, rendert empfangenen State
- `mpGameState` Variable haelt den letzten Server-State
- Rendering-Loop liest aus `mpGameState` statt aus lokalen Variablen
- Interpolation zwischen zwei States fuer smooth 60fps Rendering
- Sounds werden basierend auf Events aus dem State getriggert

## Performance-Budget

- 20 Ticks/s × 4 Spieler × ~2KB State = ~160KB/s total
- Pi hat 7GB RAM frei, CPU-Last < 5%
- GameRoom Berechnung: ~1ms pro Tick (kein Canvas, reine Mathe)

## Phasen

**Phase 1:** Server-Logik (GameRoom mit Bewegung + Zombies + Schiessen)
**Phase 2:** Client-Rendering (State empfangen + zeichnen)
**Phase 3:** Revive + Rescue + Abilities

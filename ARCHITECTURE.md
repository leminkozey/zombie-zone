# Architektur

## Ueberblick

```
Browser (Canvas Game)  <-->  Express Server  <-->  SQLite DB
     public/js/*.js          server.js            data/deadzone.db
     index.html              game-server.js       data/secret.key
                             database.js
```

Das Spiel laeuft komplett client-seitig im Canvas. Der Server ist fuer Auth, Persistenz (XP/Gold/Weapons/Skills) und Multiplayer zustaendig.

## Projektstruktur

```
zombie-zone/
├── server.js          # Express, JWT Auth, REST API, Socket.io Setup
├── game-server.js     # Authoritative Multiplayer Game Logic
├── database.js        # SQLite Schema, Prepared Statements
├── package.json
├── .gitignore
├── data/              # (gitignored) DB + JWT Secret
│   ├── deadzone.db
│   └── secret.key
└── public/
    ├── index.html     # HTML + CSS (638 Zeilen)
    └── js/
        ├── auth.js        # Login, Session, Canvas Setup
        ├── audio.js       # Web Audio SFX (prozedural)
        ├── config.js      # Konstanten, Skills, Weapons, Operators, Perks
        ├── map.js         # Map-Generierung + Flowfield Pathfinding
        ├── state.js       # Game State, init(), Wave Management
        ├── player.js      # Rescue, Input, Combat, Movement, Damage
        ├── zombies.js     # Zombie AI, Bullets, Effekte
        ├── rendering.js   # Alle Canvas Draw-Funktionen
        ├── ui.js          # HUD, Sync, Dash, Game Loop
        ├── menus.js       # Skill Tree, Arsenal, Operators, Shop
        └── multiplayer.js # Socket.io MP, Lobby, Settings
```

Alle JS-Dateien sind global-scoped (kein ES Modules). Reihenfolge der Script-Tags in index.html ist relevant.

## Backend

### server.js

Express-Server mit JWT Auth und Rate Limiting:

- `POST /api/register` — bcrypt-Hash, JWT zurueck
- `POST /api/login` — Passwort pruefen, JWT zurueck
- `GET /api/profile` — XP, Gold, Diamonds, Active Operator
- `POST /api/xp` — XP addieren
- `POST /api/gold` — Gold/Diamonds setzen
- `GET/POST /api/skills` — Skill Tree Persistenz
- `GET/POST /api/weapons` — Waffen kaufen/upgraden
- `GET/POST /api/perks` — Perks kaufen
- `GET/POST /api/operators` — Operatoren kaufen/upgraden
- `GET/POST /api/stats` — Spielstatistiken
- `POST /api/death` — Death Penalty (XP-Abzug)

JWT Secret wird beim ersten Start generiert und in `data/secret.key` persistiert. Tokens sind 24h gueltig.

### game-server.js

Authoritative Server fuer Co-op Multiplayer via Socket.io. Verwaltet GameRooms mit eigener Game Loop.

### database.js

SQLite mit WAL-Mode. Tabellen: users, user_skills, user_weapons, user_perks, user_operators, user_stats.

## Frontend

### Script-Ladereihenfolge

```
auth.js      → Session, Canvas
audio.js     → Sound System
config.js    → Alle Game-Daten
map.js       → Map + Pathfinding
state.js     → State + Init
player.js    → Player Mechanics
zombies.js   → Enemy AI
rendering.js → Draw Functions
ui.js        → HUD + Game Loop
menus.js     → Menu Screens
multiplayer.js → MP + Settings + Event Listeners
```

### Render-Pipeline (pro Frame)

1. `clearRect` — Canvas leeren
2. Camera Transform (City Map: Kamera folgt Player)
3. `drawMap` — Tiles mit Cache-Canvas
4. `drawBloodDecals` — Persistente Blutflecken
5. `drawHealthpacks` + `drawAmmopacks` — Pickups
6. `drawBuilderBlocks` + `drawTurrets` — Engineer Strukturen
7. `drawRescueCircle` — Extraction Point
8. `drawBroodEggs` + `drawToxicPools` — Boss Effekte
9. `drawParticles` — Partikel-Effekte
10. `drawBullets` + `drawHitTrails` + `drawSpitterProjectiles`
11. `drawZombie` (pro Zombie) — Typ-basiert dispatched
12. `drawPlayer` — Spieler mit Waffe + Afterimage
13. `drawFrozenBullets` — Time Traveler Effekt
14. `drawMinimap` — Uebersichtskarte
15. HUD Update

### Sprite-System

Alle Sprites prozedural gezeichnet (kein Spritesheet). Ausrichtung: positiv X = vorwaerts. Rotation = `entity.angle`.

### Kollisions-System

Tile-basiert: `wallCollide(x, y, radius)` prueft Punkte um die Entity. `applyMove()` mit Half-Step Fallback und Corner-Rounding.

### Pathfinding

- BFS Flowfield vom Player — alle Zombies folgen Gradient
- City Map: Lokaler Flowfield (Region um Player, offset-basiert)
- LOS + Flowfield Hybrid: Direkte Bewegung bei Sichtlinie
- Perpendicular Escape bei Blockade
- Spatial Hash Grid fuer O(n) Zombie-Separation

### Map-Generierung

3 Map-Typen:
- **Warehouse:** Statisches Grid-Layout mit symmetrischen Hindernissen
- **Bunker:** Perlin-Noise basiert
- **City:** Infinite prozedurale Stadt (Seed-basiert pro Tile, Camera-System)

### Datenfluss: XP

```
Zombie Kill → pendingXp += z.xp → syncXp() (alle 10s) → POST /api/xp
Game Over → syncToServer() → Final Sync
Lobby → GET /api/profile → Total XP + Level anzeigen
```

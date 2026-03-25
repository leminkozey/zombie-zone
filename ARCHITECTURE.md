# Architektur

## Überblick

```
Browser (Canvas Game)  <-->  Express Server  <-->  SQLite DB
     index.html              server.js            data/deadzone.db
                             database.js          data/secret.key
```

Das Spiel läuft komplett client-seitig im Canvas. Der Server ist nur für Auth und XP-Persistenz zuständig.

## Projektstruktur

```
zombie-shooter/
├── server.js          # Express Server, 4 API Routes, JWT Middleware
├── database.js        # SQLite Setup, prepared Statements
├── package.json
├── .gitignore
├── data/              # (gitignored) DB + JWT Secret
│   ├── deadzone.db
│   └── secret.key
└── public/
    └── index.html     # Das gesamte Spiel (1500+ Zeilen)
```

## Backend

### server.js (75 Zeilen)

Express-Server mit 4 Endpoints:

- `POST /api/register` — bcrypt-Hash, JWT zurück
- `POST /api/login` — Passwort prüfen, JWT zurück
- `GET /api/profile` — JWT validieren, XP + Name zurück
- `POST /api/xp` — XP addieren (nicht setzen)

JWT Secret wird beim ersten Start zufällig generiert und in `data/secret.key` persistiert. Tokens sind 24h gültig.

### database.js (26 Zeilen)

SQLite mit WAL-Mode. Eine Tabelle:

```sql
users (id, name, password_hash, xp, created_at)
```

4 prepared Statements: `createUser`, `findUserByName`, `addXp`, `getUser`.

## Frontend (index.html)

Alles in einer Datei — CSS, HTML, JS. Kein Build-Step, kein Bundler.

### Aufbau im Script-Block

```
Auth-System          (~80 Zeilen)   Token-Management, Login/Register/Logout
Config               (~50 Zeilen)   Tile-Size, Radien, Pickup-Konstanten
Zombie-Configs       (~30 Zeilen)   Typ-Definitionen, Spawn-Gewichtungen
Map-Generator        (~50 Zeilen)   Dynamische Map basierend auf Bildschirmgröße
Spawning             (~15 Zeilen)   Spawn-Edges am Kartenrand
State + Init         (~30 Zeilen)   Alle Game-State Variablen
Wave-System          (~30 Zeilen)   Wave-Progression, Zombie-Spawning
Input                (~30 Zeilen)   Keyboard, Mouse, Pause
Reload               (~20 Zeilen)   Nachladen mit Progress-Bar
Shooting             (~25 Zeilen)   Schuss-Logik, Muzzle-Partikel
XP-System            (~40 Zeilen)   Level-Berechnung, XP-Bar, Level-Up
Particles + Blood    (~25 Zeilen)   Partikel-System, Blut-Decals
Player Movement      (~20 Zeilen)   WASD + Diagonale + Wall-Collision
Zombie Update        (~80 Zeilen)   Movement, Wall-Avoidance, Aggression, Spitter-AI
Bullet Update        (~40 Zeilen)   Flugbahn, Treffer, Kill-Scoring
Spitter Projectiles  (~25 Zeilen)   Grüne Kugeln, Spieler-Treffer
Pickup-System        (~160 Zeilen)  Health + Ammo: Spawn, Timer, Drop, Pickup, Draw
Draw Functions       (~200 Zeilen)  Map, Player, Zombies, Bullets, Minimap, HUD
Game Over            (~20 Zeilen)   XP senden, zur Lobby
Main Loop            (~40 Zeilen)   Update + Draw Reihenfolge
```

### Render-Pipeline (pro Frame)

1. `clearRect` — Canvas leeren
2. `drawMap` — Tiles (Boden + Wände)
3. `drawBloodDecals` — Blutflecken am Boden
4. `drawHealthpacks` + `drawAmmopacks` — Pickups
5. `drawParticles` — Partikel-Effekte
6. `drawBullets` + `drawSpitterProjectiles` — Geschosse
7. `drawZombie` (für jeden Zombie) — Typ-basiertes Rendering
8. `drawPlayer` — Spieler mit Waffe
9. `drawMinimap` — Übersichtskarte
10. Hurt-Flash + Score-Text

### Sprite-System

Alle Sprites sind prozedural gezeichnet (kein Spritesheet). Ausrichtung: **positiv X = vorwärts**. Rotation = `entity.angle`, kein Offset.

Zombie-Rendering liest `z.type` und nutzt `ZOMBIE_TYPES` für Farben + Scale. Tank ist 1.5x größer, Runner 0.85x.

### Kollisions-System

Tile-basiert: `wallCollide(x, y, radius)` prüft 8 Punkte um die Entity. Jeder Zombie hat eigenen `radius` (Tank größer, Runner kleiner).

### Map-Generierung

Beim Spielstart wird die Map dynamisch erzeugt:
- `COLS` / `ROWS` basierend auf `window.innerWidth / TILE`
- Rand = Wände
- Symmetrische Hindernisse (Ecken-Cluster, Mitte-Pillars, Seiten-Blocker)

### Datenfluss: XP

```
Zombie stirbt → score += z.xp, sessionXp += z.xp → updateXpBar()
                                                          ↓
Game Over → fetch POST /api/xp {xp: sessionXp} → DB: xp = xp + sessionXp
                                                          ↓
Lobby → fetch GET /api/profile → Zeige Total XP + Level
```

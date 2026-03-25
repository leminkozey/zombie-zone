# DEAD ZONE — Redesign Spec

## Übersicht

Top-Down Zombie Survival Shooter als Browser-Game. Bestehendes HTML-Spiel wird erweitert um: Backend mit Account-System, XP-System, verschiedene Zombie-Typen, Heilungs-Items, und verbesserte Grafik/Animationen/Logik.

## Architektur

- **Frontend:** Single-Page HTML/JS/Canvas — wird vom Backend als statische Datei ausgeliefert
- **Backend:** Node.js + Express + better-sqlite3
- **Port:** 3000 (lokal)
- **Auth:** JWT Tokens, bcrypt Passwort-Hashing

### Projektstruktur

```
zombie-shooter/
├── server.js          # Express Server + API Routes
├── database.js        # SQLite DB Setup + Queries
├── package.json
├── data/              # SQLite DB File (gitignored)
└── public/
    └── index.html     # Das Spiel
```

## Backend / API

### Datenbank

SQLite mit einer Tabelle:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Endpoints

| Method | Route | Beschreibung |
|--------|-------|--------------|
| POST | `/api/register` | Account erstellen (name, password) |
| POST | `/api/login` | Login, gibt JWT zurück |
| GET | `/api/profile` | XP + Level abfragen (Auth required) |
| POST | `/api/xp` | XP nach Game-Over hochschreiben (Auth required) |

### Auth-Flow

1. User registriert/loggt ein im Hauptmenü
2. JWT wird im localStorage gespeichert (24h Gültigkeit)
3. Jeder API-Call schickt JWT im Authorization-Header (`Bearer <token>`)
4. Nach Game-Over wird gesammelte XP ans Backend gesendet
5. Bei abgelaufenem Token: automatisch zum Login-Screen zurück

### JWT Secret

Wird beim ersten Serverstart zufällig generiert und in `data/secret.key` gespeichert. Beim nächsten Start wiederverwendet.

### Error Responses

Alle API-Fehler als JSON: `{ "error": "Fehlermeldung" }`

| Situation | Status Code | Error |
|-----------|-------------|-------|
| Username existiert schon | 409 | "Name already taken" |
| Falsches Passwort | 401 | "Invalid credentials" |
| Token abgelaufen/ungültig | 401 | "Token expired" |
| Fehlende Felder | 400 | "Name and password required" |

## Frontend

### Hauptmenü

Vor dem Spiel: Login/Register-Screen im Overlay-Stil (passt zum bestehenden Design).

- Zwei Tabs: "Login" / "Registrieren"
- Input-Felder: Name, Passwort
- Nach erfolgreichem Login: Spielstart-Button wird sichtbar
- Account-Name im HUD oben sichtbar während des Spiels

### Figuren-Fix

Problem: Sprites sind seitwärts gezeichnet mit `+Math.PI/2` Rotation-Offset. Körperteile "liegen" dadurch optisch falsch.

Fix:
- Sprites komplett neu zeichnen — Kopf oben (negatives Y), Füße unten (positives Y)
- `+Math.PI/2` Offset entfernen
- Proportionen korrigieren: Kopf kleiner als Körper, Arme seitlich
- Bestehende `drawZombie()` ersetzen durch typ-basiertes Rendering (`drawZombie(z)` liest `z.type` und rendert entsprechend)
- Jeder Zombie-Typ hat eigene Farben und Größe, aber gleiche Grundstruktur (Kopf, Körper, Arme, Beine)

### Zombie-Typen

| Typ | Farbe | Speed-Mult | HP (Base) | XP | Spawn ab Wave | Besonderheit |
|-----|-------|------------|-----------|-----|---------------|--------------|
| Normal | Grün (#2d4a1e) | 1.0x | 2-3 | 10 | 1 | Standard-Verhalten |
| Runner | Orange (#cc6600) | 2.0x | 1-2 | 25 | 2 | Schnell, wenig HP |
| Tank | Dunkelrot (#661111) | 0.5x | 8-10 | 50 | 3 | Groß (1.5x Radius), langsam |
| Spitter | Lila (#663399) | 0.7x | 3-4 | 40 | 5 | Hält Abstand, schießt Projektile |

HP skaliert weiterhin mit Wave-Nummer.

Spawn-Gewichtung pro Wave:
- Wave 1: 100% Normal
- Wave 2: 70% Normal, 30% Runner
- Wave 3-4: 50% Normal, 25% Runner, 25% Tank
- Wave 5+: 40% Normal, 25% Runner, 20% Tank, 15% Spitter

### XP-System

- Minecraft-Style XP-Bar: grüner Balken am unteren Bildschirmrand
- XP-Anzeige: aktuelles Level + XP-Bar-Fortschritt
- Level-Schwellen (feste Tabelle):
  - Level 1: 0 XP
  - Level 2: 50 XP
  - Level 3: 150 XP
  - Level 4: 300 XP
  - Level 5: 500 XP
  - Danach: +250 XP pro Level
- Level-Up Effekt: kurzer Flash + Text "LEVEL UP!"
- XP wird lokal im Spiel gesammelt und bei Game-Over ans Backend gesendet (addiert auf bestehende XP)
- HP-Cap: Heilung kann nicht über maxHp (100) hinausgehen

### Heilungs-Items

- **Timer-Spawns:** Alle 15-20 Sekunden (randomisiert) spawnt ein Healthpack auf freiem Boden
- **Zombie-Drops:** 15% Chance bei jedem Kill
- **Healing:** 25 HP pro Pickup
- **Optik:** Grünes Kreuz-Symbol, pulsierend
- **Despawn:** Nach 10 Sekunden, blinkt in den letzten 3 Sekunden
- **Limit:** Max 3 gleichzeitig auf dem Spielfeld
- **Pickup-Radius:** Spieler muss drüberlaufen (Collision mit Player-Radius)
- **Spawn-Logik:** Zufällige freie Bodenkachel wählen, Mindestabstand 3 Tiles zum Spieler
- **Drop-Timing:** Healthpack erscheint sofort bei Zombie-Kill (nicht nach Tod-Animation)

### Zombie-Tod

- Zombie wird sofort als `alive = false` markiert (keine Kollision mehr, zählt als Kill)
- Tod-Animation ist rein visuell (Rotation + Fade über 0.5s), blockiert nichts
- Spitter-Projektile die bereits fliegen bleiben aktiv nach Spitter-Tod

### Animationen (verbessert)

- **Walk-Cycle:** Flüssigere Bein-Animation mit mehr Swing
- **Schuss-Rückstoß:** Arm bewegt sich kurz zurück bei Schuss
- **Zombie-Angriff:** Arme strecken sich vor beim Zuschlagen
- **Zombie-Tod:** Kurze Fall-Animation (Rotation + Fade) statt sofortiges Verschwinden
- **Spitter-Wurf:** Arm-Schwung-Animation beim Projektil-Schuss
- **Level-Up:** XP-Bar Flash + Partikel-Effekt

### Zombie-Logik (verbessert)

- **Wand-Ausweichen:** Einfache Voraus-Prüfung (1 Tile voraus checken). Bei Wand: seitlich ausweichen (zufällige Seite wählen, dann beibehalten bis frei)
- **Aggression:** Zombie-Speed erhöht sich um 20% wenn Spieler unter 30% HP
- **Spitter-KI:** Hält 150-200px Abstand zum Spieler, schießt Projektile alle 2.5 Sekunden (Speed: 5px/frame, 10 Schaden)
- **Spitter-Projektile:** Grün/lila Kugeln, werden durch Wände blockiert

## Nicht im Scope

- Multiplayer
- Waffen-Upgrades / Shop
- Sound/Musik
- Mobile Support
- Deployment (nur lokal)

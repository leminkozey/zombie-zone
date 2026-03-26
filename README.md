# DEAD ZONE

Top-Down Zombie Survival Shooter im Browser. Welle um Welle Zombies abknallen, XP sammeln, leveln.

## Features

- **4 Zombie-Typen** — Normal, Runner (schnell), Tank (fett), Spitter (Fernkampf)
- **XP-System** — Minecraft-Style XP-Bar mit Level-Ups
- **Account-System** — Login/Register mit persistenter XP-Speicherung
- **Pickups** — Healthpacks (grün) und Ammo-Packs (gelb) spawnen auf der Map
- **Dynamische Map** — Passt sich an die Bildschirmgröße an
- **Lobby** — Stats-Anzeige, letzte Runde, Account-Wechsel
- **Pause** — ESC zum Pausieren
- **Skill Tree** — 3 Pfade (Survival, Mobility, Rescue) mit 24 Skills
- **Dash** — Kurzer Sprint in Blickrichtung (Leertaste)
- **Shield** — Schutzschild das Schaden absorbiert
- **Rescue Mission** — Evakuierung anfordern um XP zu retten
- **Tod-Strafe** — 75% XP Verlust bei Tod, Skills resettet

## Schnellstart

```bash
npm install
node server.js
```

Dann im Browser: **http://localhost:4444**

## Steuerung

| Taste | Aktion |
|-------|--------|
| WASD | Bewegen |
| Maus | Zielen |
| Linksklick | Schießen |
| R | Nachladen |
| ESC | Pause |
| Leertaste | Dash (wenn freigeschaltet) |
| F halten | Rescue Mission anfordern |

## Tech Stack

- **Frontend:** HTML5 Canvas, Vanilla JS (Single-File)
- **Backend:** Node.js, Express
- **Datenbank:** SQLite (better-sqlite3)
- **Auth:** JWT + bcrypt

## Zombie-Typen

| Typ | Farbe | Geschwindigkeit | HP | XP | Ab Wave |
|-----|-------|-----------------|----|----|---------|
| Normal | Grün | 1x | 2-3 | 10 | 1 |
| Runner | Orange | 2x | 1-2 | 25 | 2 |
| Tank | Dunkelrot | 0.5x | 8-10 | 50 | 3 |
| Spitter | Lila | 0.7x | 3-4 | 40 | 5 |

## API Endpoints

| Method | Route | Beschreibung |
|--------|-------|--------------|
| POST | `/api/register` | Account erstellen |
| POST | `/api/login` | Einloggen |
| GET | `/api/profile` | Profil + XP abrufen |
| POST | `/api/xp` | XP hochschreiben |

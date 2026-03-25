# Tutorial — DEAD ZONE

## Erste Schritte

### Server starten

```bash
npm install
node server.js
```

Öffne **http://localhost:4444** im Browser.

### Account erstellen

1. Klick auf **REGISTRIEREN**
2. Name und Passwort eingeben
3. Klick auf **REGISTRIEREN**
4. Du landest in der Lobby

### Spielen

Klick auf **STARTEN**. Du stehst in der Mitte der Map, bewaffnet mit einer Pistole.

## Steuerung

- **WASD** — Bewegen (diagonal geht auch)
- **Maus** — Zielen (Fadenkreuz folgt dem Cursor)
- **Linksklick** — Schießen (gedrückt halten für Dauerfeuer)
- **R** — Manuell nachladen (passiert auch automatisch bei leerem Magazin)
- **ESC** — Pause-Menü

## Spielmechaniken

### Wellen

Zombies kommen in Wellen. Jede Welle hat mehr Zombies als die vorherige. Wenn alle Zombies einer Welle tot sind, kommt nach 2 Sekunden die nächste.

### Zombie-Typen

Ab Wave 1 kommen nur normale Zombies. Mit der Zeit tauchen neue Typen auf:

**Normal (grün)** — Langsam, wenig HP. Standard-Futter.

**Runner (orange)** — Ab Wave 2. Doppelt so schnell, aber stirbt schneller. Gefährlich in Gruppen.

**Tank (dunkelrot)** — Ab Wave 3. Groß, langsam, steckt viel ein. Halte Abstand und ballere drauf.

**Spitter (lila)** — Ab Wave 5. Hält Abstand und schießt grüne Projektile. Prioritäts-Ziel — nicht ignorieren.

### Pickups

Zwei Arten von Pickups spawnen auf der Map:

**Healthpack (grünes Kreuz)** — Heilt 25 HP. Spawnt alle 15-20 Sekunden, und Zombies droppen sie mit 15% Chance.

**Ammopack (gelbe Patrone)** — Füllt Munition komplett auf. Spawnt alle 18-25 Sekunden, 10% Drop-Chance bei Zombie-Kills.

Pickups blinken bevor sie verschwinden (nach 10 Sekunden). Auf der Minimap sind sie als farbige Punkte sichtbar.

### XP und Level

Jeder Kill gibt XP:
- Normal: 10 XP
- Runner: 25 XP
- Spitter: 40 XP
- Tank: 50 XP

Die XP-Bar am unteren Bildschirmrand füllt sich. Bei Level-Up gibt es einen grünen Partikel-Effekt.

XP wird bei Game Over automatisch auf deinem Account gespeichert. In der Lobby siehst du dein Gesamt-Level und Total-XP.

### Tipps

- **Nachladen nicht vergessen** — Warte nicht bis das Magazin leer ist, lade in ruhigen Momenten nach.
- **Wände nutzen** — Zombies können sich an Wänden festfahren. Nutze die Hindernisse als Deckung.
- **Spitter zuerst** — Ihre Projektile machen 10 Schaden auf Distanz. Nimm sie raus bevor du dich um den Rest kümmerst.
- **Tanks kiten** — Sie sind langsam. Lauf rückwärts und schieß dabei.
- **Minimap checken** — Unten links. Zeigt Zombies (farbig nach Typ), Pickups, und deine Position.
- **Bei niedrigem HP aufpassen** — Unter 30% werden ALLE Zombies 20% schneller.

## Mehrere Accounts

In der Lobby gibt es den **ABMELDEN**-Link. Damit kannst du dich ausloggen und einen neuen Account erstellen oder in einen anderen wechseln. Jeder Account hat seinen eigenen XP-Stand.

## Pause

**ESC** pausiert das Spiel. Du kannst:
- **WEITER** — Spiel fortsetzen
- **ZUR LOBBY** — Zurück zur Lobby (XP der aktuellen Runde wird gespeichert)

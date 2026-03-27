# Boss Waves Design

## Konzept

Jede 5. Wave (5, 10, 15, 20...) ist eine Boss-Wave. Boss-Waves enthalten einen oder mehrere Bosse plus normale Zombie-Adds. Gute Belohnungen motivieren zum Durchhalten.

## Boss-Anzahl pro Wave

| Wave-Bereich | Anzahl Bosse | Adds (% der normalen Wave-Groesse) |
|-------------|-------------|-------------------------------------|
| 5, 10 | 1 | 50% |
| 15, 20 | 2 | 75% |
| 25+ | 3 | 100% |

Bei mehreren Bossen: verschiedene Typen bevorzugt (kein Duplikat wenn moeglich).

## Boss-Typen

### 1. Brute

- **HP:** 80 + wave * 8
- **Speed:** 0.6x Basis-Speed
- **Groesse:** 3x ZOMBIE_R
- **Farbe:** Dunkelrot (#661515), Augen gluehendes Rot (#ff3300)
- **Abilities:**
  - **Charge:** Alle 8s — sprintet Richtung Player (3x Speed fuer 1.5s), AoE-Schaden (15 dmg) bei Aufprall im 60px Radius, Screenshake
  - **Stomp:** Alle 5s — verlangsamt Player um 50% fuer 2s im 100px Radius, visueller Bodenriss-Effekt
- **Visuell:** Massiver Koerper, Narben, kleine Faeuste, gepanzerte Platten, gluehendes Rot

### 2. Necromancer

- **HP:** 50 + wave * 5
- **Speed:** 0.8x Basis-Speed
- **Groesse:** 2x ZOMBIE_R
- **Farbe:** Dunkelviolett (#3a1866), Augen gruen (#44ff88)
- **Abilities:**
  - **Summon:** Alle 6s — beschwort 3-4 Mini-Zombies (50% HP/Speed von normalen, 5 XP). Max 8 Minions gleichzeitig.
  - **Blink:** Alle 8s — teleportiert an zufaellige Position (min 100px, max 300px Entfernung). Schatten-Trail-Effekt.
  - **Shield:** Solange Minions leben, nimmt Necromancer 50% weniger Schaden. Sichtbare lila Schild-Aura.
- **Visuell:** Schwebend, Kapuze, Runen-Markierungen, orbitierende Minions mit Tether-Lines

### 3. Abomination

- **HP:** 100 + wave * 10
- **Speed:** 0.4x Basis-Speed
- **Groesse:** 3.5x ZOMBIE_R
- **Farbe:** Giftgruen (#448822), Augen gelb-gruen (#ccff44)
- **Abilities:**
  - **Toxic Pool:** Alle 6s — spuckt Giftflaeche (50px Radius, 5s Dauer, 3 DPS bei Kontakt). Max 3 Pools gleichzeitig. Gruen pulsierend.
  - **Split:** Beim Tod spaltet sich in 3 kleinere Versionen (20% HP des Originals, 1.5x Speed, 1.5x ZOMBIE_R). Splits geben je 25% der Boss-XP.
- **Visuell:** Aufgeblaehter Koerper, Pusteln, Tentakelarme, mehrere Augen, tropfendes Gift, Stacheln

## Boss-Auswahl-Logik

```
function pickBossTypes(count) {
  const types = ['brute', 'necromancer', 'abomination'];
  shuffle(types);
  return types.slice(0, count);
}
```

## Spawning

- Bosse spawnen am Anfang der Wave (sofort, nicht ueber Intervall)
- Adds spawnen danach normal ueber das existierende Spawn-Intervall
- Add-Anzahl: `Math.floor((4 + wave * 3) * addMultiplier)` wobei addMultiplier 0.5/0.75/1.0

## Rewards pro Boss-Kill

| Wave-Bereich | Gold | Diamanten | XP |
|-------------|------|-----------|-----|
| 5-10 | 2.000 | 5 | 200 |
| 15-20 | 5.000 | 15 | 500 |
| 25+ | 10.000 | 30 | 1.000 |

**Wave-Clear-Bonus:** Wenn alle Bosse einer Boss-Wave getoetet werden, +50% auf alle Rewards (Gold, Diamanten, XP) als Bonus obendrauf. Floating Text "BOSS WAVE CLEAR! +50% BONUS" in Gold.

## Visuelles

### HP-Bar ueber Bossen
- Breite: 60px (skaliert mit Boss-Groesse)
- Farbe: Boss-spezifisch (Rot/Lila/Gruen)
- Boss-Name ueber der HP-Bar in kleiner Schrift
- Nur bei Bossen sichtbar (normale Zombies haben keine HP-Bar)

### Boss-Wave Banner
- Roter pulsierender Text: "BOSS WAVE" statt normaler Wave-Anzeige
- Laenger sichtbar als normales Banner (3s statt 1.8s)
- Subtitel: "PREPARE FOR BATTLE"

### Screenshake
- Bei Brute Charge-Aufprall: 8px, 300ms
- Bei Brute Stomp: 5px, 200ms
- Bei Abomination Split: 10px, 400ms

### Boss-Death
- Groessere Fragment-Explosion als normale Zombies (12 Fragmente statt 6)
- Laengerer Death-Timer (60 Frames statt 30)
- Flash-Effekt auf dem ganzen Screen (kurzes weisses Aufblitzen, 100ms)

## Minimap

Bosse werden als groessere Punkte auf der Minimap angezeigt:
- Brute: 6x6px dunkelrot
- Necromancer: 5x5px lila
- Abomination: 7x7px gruen

## Integration in bestehendes System

- `zombies[]` Array wird weiterhin verwendet — Bosse sind Zombies mit `isBoss: true` und `bossType` Property
- `waveTotal` zaehlt Bosse + Adds zusammen
- `waveKills` zaehlt alles (Bosse, Adds, Minions, Splits)
- Boss-Kills triggern trotzdem normale Kill-Events (Operator-Passives, Skill-Effekte etc.)
- Gold/Diamanten-Drops von Bossen werden direkt bei Kill vergeben (nicht als Pickup)
- Stats-Tracking: Boss-Kills zaehlen als der jeweilige "naechste" Zombie-Typ (Tank-Kategorie)

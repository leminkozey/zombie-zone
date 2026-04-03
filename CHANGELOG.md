# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-03-30

### Changed
- Refactored monolithic 8839-line index.html into 11 JS modules
- Extracted magic numbers into named constants across all modules

## [0.5.0] - 2026-03-28

### Added
- Multiplayer: Socket.IO lobby, server-authoritative game loop, delta compression, client-side prediction
- Bunker + City maps with map selector and wave selector
- Infinite procedural city map with detailed tile rendering
- Camera system for City open world
- Local flowfield pathfinding for City mode
- sql.js fallback for cross-platform SQLite support

### Fixed
- 10+ multiplayer crash fixes (map sync, minimap, pickups, player init)
- Aiming with camera offset and canvas scaling
- City mode crashes with infinite generation

## [0.4.0] - 2026-03-27

### Added
- Boss wave system: 3 bosses (Brute, Necromancer, Abomination) with unique abilities
- 6 new zombie types: Exploder, Shielder, Screamer, Healer, Burrower, Broodmother
- Screen shake system
- Boss HP bars, minimap markers, visual polish

### Fixed
- Zombie separation for burrowed zombies
- Operator bugs: turret aggro, timer, wall collision

## [0.3.0] - 2026-03-26 – 2026-03-27

### Added
- 6 operator classes: Soldat, Juggernaut, Medic, Time Traveler, Builder, Elektriker
- Operator abilities (Q key), buy/select/upgrade UI, passive/active buffs
- Weapon perks: 12 perks with cooldowns, shop UI, E key activation
- Settings screen: keybindings, sensitivity, password change, stats tracking
- Procedural sound system (20+ sounds, volume control, ambient drone)

### Changed
- Hybrid hitscan: SMG/AR/Minigun use instant raycast
- Gold wave multiplier (x0.5 per wave above 5)

## [0.2.0] - 2026-03-26

### Added
- Weapon system: 6 weapons (Pistol, SMG, AR, Shotgun, Sniper, Minigun)
- Arsenal UI: weapon list, stats, buy/upgrade
- Tab-based menu: Lobby, Skill Tree, Arsenal, Shop, Operators
- Gold/diamond drops with floating text
- Constellation-style skill tree with hexagonal nodes
- Rescue mission: state machine, extraction, HUD
- Dash system with charges and Bullet Time
- Shield system with damage pipeline and regen

### Changed
- Complete visual overhaul: player sprite, zombie sprites, map tiles, HUD, menus
- XP system: unified global XP, Minecraft curve, death penalty
- Zombie AI: smooth flowfield, BFS pathfinding, stuck recovery

## [0.1.0] - 2026-03-25

### Added
- Initial Dead Zone zombie shooter
- Express backend with JWT auth
- 4 zombie types (normal, fast, tank, spitter) with wave-based spawning
- Player sprite with shooting, recoil, reload
- Health/ammo pickup system
- Minecraft-style XP bar with level-up effects
- Minimap with zombie/item markers
- Lobby with stats, ESC pause menu
- Fullscreen canvas with dynamic map generation

[Unreleased]: https://github.com/leminkozey/zombie-zone/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/leminkozey/zombie-zone/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/leminkozey/zombie-zone/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/leminkozey/zombie-zone/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/leminkozey/zombie-zone/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/leminkozey/zombie-zone/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/leminkozey/zombie-zone/releases/tag/v0.1.0

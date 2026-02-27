# Architectural Decisions — Shattered Dreams

This document records all architectural decisions inferred from the project implementation. These are binding constraints for future development.

---

## D-001: Front-View Battle System with DTB

**Decision**: The game uses front-view (`optSideView: false`) with Default Turn Battle.

**Evidence**: System.json `optSideView: false`, BattleEngineCore `Default System: "dtb"`.

**Constraint**: Do not switch to side-view without migrating all enemy battler assets and testing SV actor sprites. ATB/CTB/STB plugin files exist in `js/plugins/` but are **NOT loaded** in `plugins.js` — they are completely inactive. Switching battle system requires loading the appropriate plugin AND explicit approval.

---

## D-002: Limb Damage Via SD_LimbSystem.js Plugin (Migrated from Variables)

**Decision**: The limb damage system is implemented via the `SD_LimbSystem.js` plugin, which stores per-actor limb data in `$gameSystem._limbData[actorId]`. Variables 1-7 remain reserved as **mirror variables** for backward compatibility — they reflect the party leader's limb state and are synced automatically by the plugin.

**History**: Originally implemented via game variables (1-7) and common events (1-2) with troop battle event pages. Migrated to plugin architecture to support multi-actor limb tracking, per-limb statuses, and universal battle integration.

**Evidence**: SD_LimbSystem.js hooks `executeHpDamage`, `onTurnEnd`, `onPlayerWalk`, `die`, `isEquipChangeOk`, `extractSaveContents`. Common Events 1-2 renamed to [Legacy] and no longer called. Troop limb damage pages removed from Troops 1, 5-8.

**Constraint**: Variables 1-7 remain permanently reserved for the limb system (mirror sync). The Crippled state (ID 11) must not be repurposed. States 14-17 are reserved for limb status markers (Infected, Blood Loss, Maimed, Malformed). SD_LimbSystem.js must not be modified to depend on RuneSkills.js. Limb damage is now universal — all troops automatically participate via the plugin hook, no manual troop event configuration needed.

---

## D-003: Rune Magic Uses RuneSkills.js Plugin with Notetag-Based Combinations

**Decision**: Rune combinations are defined via `<runes: X, Y>` notetags on result skills in the database. The RuneSkills.js plugin reads these at database load and manages the battle UI.

**Evidence**: RuneSkills.js source code, notetags on skills 8-10, 15, 27-30.

**Constraint**: New rune combinations must be added as notetags on the result skill, not by modifying RuneSkills.js. Skill type ID 3 ("Rune") is reserved for rune skills. The failure result skill (ID 7, "Wait") must remain valid. Rune order matters (`Ignore Order: no`).

---

## D-004: Single Protagonist with Actor Swap at Character Creation

**Decision**: The party always has exactly one member. The character builder removes the default actor (5) and adds the selected class actor (5/6/7). Actors 5, 6, 7 are the playable characters.

**Evidence**: System.json `partyMembers: [5]`, Map006 event swaps actors.

**Constraint**: Actors 1-4 are legacy/template actors (Harold, Therese, Marsha, Lucius) — do not use for gameplay. Actors 5-7 are the real protagonists. Actors 8-16 are NPCs and must not be added to the party. If party members are added later, the limb damage system (hardcoded to actor 5) must be updated.

---

## D-005: Character Builder Lives in Map006 as Single Autorun Event

**Decision**: All character creation logic is a single event (EV001) on Map006 "CharacterSelect" with trigger: Autorun.

**Evidence**: Map006.json event data.

**Constraint**: Character creation must remain in Map006. The flow (Class → Origin → Style → Glory → Motivation → Quest → Transfer) is the canonical sequence for the Knight. Hunter and Priest must follow a parallel structure when implemented.

---

## D-006: Quest Tracking Uses YEP_QuestJournal Plugin Commands + Switches

**Decision**: Quests are managed via YEP_QuestJournal plugin commands in map events. Global quest state is additionally tracked via game switches.

**Evidence**: Plugin commands in map events (`Quest Journal Open To 6`), named switches (2, 3, 4, 8, 9, 11, 12).

**Constraint**: Every quest must have both a YEP_QuestJournal entry AND a corresponding switch for event-side gating. Do not rely solely on plugin quest state for conditional branches in events.

---

## D-007: TP Is Thematically "Hope"

**Decision**: The TP resource is renamed to "Hope" in the game's terms.

**Evidence**: System.json `terms.basic[6]: "Hope"`, `terms.basic[7]: "HOPE"`.

**Constraint**: All references to TP in UI, skills, items, and documentation must use "Hope". TP display is enabled (`optDisplayTp: true`).

---

## D-008: Tiled Maps Coexist with MV-Native Maps

**Decision**: The project uses a hybrid mapping approach. Exterior and complex maps are authored in Tiled (.tmx), while simple interiors may use native MV tileset mapping.

**Evidence**: `maps/` directory contains .tmx files for 20+ maps. YED_Tiled plugin is active. Some maps (e.g., Map006) have no corresponding .tmx file.

**Constraint**: When editing Tiled-based maps, always edit the .tmx source in Tiled and re-export. Do not edit the MV map JSON directly for Tiled-managed maps. The .json in `maps/` is the Tiled export; the .json in `data/` is the MV map file.

---

## D-009: Player Starts Transparent

**Decision**: `optTransparent: true` in System.json — the player character is invisible at game start.

**Evidence**: System.json configuration.

**Constraint**: This is intentional for the character creation cutscene (Map006). The player is made visible via event command (Set Transparency OFF) after character creation and transfer. Do not change this global setting.

---

## D-010: Switch 1 Is a One-Shot Initialization Gate

**Decision**: Switch 1 ("Limb HP Initialized") is used as a one-time gate: Common Event 1 runs when Switch 1 is ON, initializes limb variables, then immediately turns Switch 1 OFF.

**Evidence**: Common Event 1 structure.

**Constraint**: Do not use Switch 1 for any other purpose. It must remain available for the limb initialization pattern.

---

## D-011: Followers Are Enabled

**Decision**: `optFollowers: true` — party followers are shown on the map.

**Evidence**: System.json configuration.

**Constraint**: Even though the party currently has one member, follower display is on for future party expansion. Map design must account for follower pathfinding (doorways, narrow passages).

---

## D-012: Custom Character Sprites Use $ Prefix Convention

**Decision**: All custom single-character spritesheets use the RPG Maker MV `$` prefix naming convention (e.g., `$Knight_Sheet.png`, `$King-Sheet.png`).

**Evidence**: Files in `img/characters/`.

**Constraint**: New character sprites must follow this convention. NPC sheets without `$` prefix use the standard 8-character grid layout (e.g., `NPC_Sheet1.png`).

---

## D-013: Weapon Type 13 Is "Rune" — Equipment-Based Runes Exist

**Decision**: Weapon type 13 is "Rune" in the system. Weapons 7-8 (Rune of Fire, Rune of Form Sphere) are rune-typed weapons.

**Evidence**: System.json `weaponTypes[13]: "Rune"`, Weapons.json entries 7-8.

**Constraint**: These rune weapons coexist with the RuneSkills system. Their intended interaction (equippable runes vs. skill-based runes) is unresolved. Do not delete them without understanding intent.

---

## D-014: All Battle Animations Reference Standard MV IDs

**Decision**: Skills reference animation IDs from the standard RPG Maker MV animation database.

**Evidence**: Skills use animation IDs 1, 3, 6, 9, 11, 41, 45, 49, 66, 78.

**Constraint**: Do not renumber or delete standard animations without updating all skill references.

---

## D-015: No Shop Economy Exists Yet

**Decision**: Items have prices defined but no shop events exist in the game maps.

**Evidence**: Items/weapons/armors have `price` values. No shop-type events found in map scans.

**Constraint**: Shop_Slums (Map 24) exists as a map but has no shop processing event. Economy design is deferred.

---

## D-016: Limb Damage Is Universal Via Plugin Hook

**Decision**: Limb damage is now a global battle mechanic, applied automatically by `SD_LimbSystem.js` through a hook on `Game_Action.prototype.executeHpDamage`. Every physical enemy attack triggers limb damage on the targeted actor. No troop-specific configuration is needed.

**History**: Was previously per-troop via copied Turn End battle event pages. Migrated to universal plugin hook.

**Evidence**: SD_LimbSystem.js hooks `executeHpDamage`. All limb damage troop event pages removed from Troops 1, 5-8. Troop quest logic pages (Turn 0 in Troops 5-7) preserved.

**Constraint**: Limb damage applies to ALL battles automatically. To exempt specific enemy skills from limb damage, use the `<limbTarget: none>` notetag on the skill. Magical skills (`hitType === 2`) default to no limb damage.

---

## D-017: Troop Battle Events Also Handle Quest Logic

**Decision**: Troops 5, 6, 7 (church dungeon monsters) contain Turn 0 battle event pages with quest-related logic — adding State 13 ("Demon") to enemies and conditional item/gold reward logic.

**Evidence**: Troop 5/6/7 Page 1: code 333 (Enemy State change), conditional branches checking enemy state and items.

**Constraint**: Troop battle events serve dual purposes (limb damage + quest logic). Do not strip troop events without understanding both layers.

---

## D-021: SD_LimbSystem.js Plugin Architecture

**Decision**: A new standalone plugin `SD_LimbSystem.js` handles all limb damage mechanics. ES5 only, no external dependencies. Loaded after YEP_BattleEngineCore (position 13 in plugins.js).

**Evidence**: Plugin file at `js/plugins/SD_LimbSystem.js`, registered in `plugins.js`.

**Constraint**: Do not modify RuneSkills.js. SD_LimbSystem must remain a single self-contained file. All limb data stored in `$gameSystem._limbData`. States 14-17 are marker states managed by the plugin (no game logic in their traits). Healing items/skills interact with limb system via notetags (`<limbHeal>`, `<limbCureInfection>`, etc.).

---

## D-022: Limb Statuses Are Per-Limb, Not Global MV States

**Decision**: Limb statuses (Infected, Blood Loss, Maimed, Malformed) are stored per-limb in `$gameSystem._limbData[actorId].limbs[limbKey].statuses`, NOT as MV states. MV States 14-17 serve only as UI markers (icons) indicating "at least one limb has this condition."

**Evidence**: SD_LimbSystem.js status engine, States.json states 14-17 with empty traits.

**Constraint**: Do not add game-logic traits to States 14-17. Their only purpose is icon display. All actual effects (damage, timers, drain) are computed by the plugin.

---

## Anti-Patterns Already Present

1. **~~Hardcoded actor ID in common events~~**: ~~Common Event 2 targets Actor 5 specifically.~~ **RESOLVED** — SD_LimbSystem.js uses dynamic actor targeting via `target.actorId()`.
2. **Identical class parameter curves**: All 4 classes have the same HP/MP/ATK/DEF/MAT/MDF/AGI/LUK growth. Classes are not mechanically differentiated.
3. **Unloaded plugin files**: 38 plugin `.js` files sit in `js/plugins/` but only 15 are registered in `plugins.js`. Several features documented as available (passive states, weapon-skill binding, victory aftermath, event location persistence, action sequences) are actually non-functional because their plugins are not loaded. This is NOT "loaded but unused" — they are completely unregistered.
4. **Zero rewards on enemies**: All enemies give 0 EXP and 0 gold, making combat pointless for progression.
5. **Incomplete character paths**: Hunter and Priest character builder paths are stubs — selecting them skips the entire background building system.

---

## What Must Remain Stable

1. **Variables 1-7**: Reserved for limb damage (mirror sync). Do not reassign.
2. **Switch 1**: Reserved for limb initialization (legacy). Do not reassign.
3. **Skill Type 3 ("Rune")**: Reserved for the rune magic system.
4. **State 11 ("Crippled")**: Reserved for limb damage consequences (traits: AGI-20, Hit 50%, DEF 65%).
5. **States 14-17**: Reserved for limb status markers (Infected, Blood Loss, Maimed, Malformed). No game-logic traits.
6. **State 12 ("Royal Bloodline")**: Tied to Noble origin choice.
7. **Actors 5-7**: The three playable protagonist variants.
8. **Map006**: Character creation flow. Must remain the starting map.
9. **Skill 7 ("Wait")**: Used as rune failure fallback. Must exist.
10. **Common Events 1-2**: Legacy limb system. Do not repurpose or delete.
11. **RuneSkills.js**: Do not modify the plugin source. Extend via notetags.
12. **SD_LimbSystem.js**: Core limb damage plugin. Do not modify RuneSkills.js from within it.
13. **Quest 6 ("Arrival")**: The first quest, opened automatically after character creation.
14. **The `<runes: X, Y>` notetag format**: Canonical way to define rune combinations.
15. **plugins.js is the ONLY source of truth for active plugins**. Plugin `.js` files in `js/plugins/` directory do NOT indicate active status. Only entries in `plugins.js` are loaded at runtime.
16. **`$gameSystem._limbData`**: Canonical storage for all limb system data. Auto-serialized via MV save system.

---

## D-018: Screen Resolution 1080x950

**Decision**: The game renders at 1080x950 pixels, overriding the MV default 816x624.

**Evidence**: YEP_CoreEngine parameters `Screen Width: 1080`, `Screen Height: 950` in plugins.js.

**Constraint**: All UI layouts, window sizes, and parallax backgrounds are designed for this resolution. Changing it will break menu layouts, battle positioning, and parallax alignment.

---

## D-019: Multi-Lane Transfer Point Pattern

**Decision**: Map exits use multiple parallel transfer events (4-5 events spanning adjacent tiles on the map edge), all pointing to the same destination.

**Evidence**: Outskirts (Map002) uses 4 transfer events at x=34, y=10-13 → Living Quarters. Slums (Map004) uses 5 transfer events at x=79, y=41-45 → Church District.

**Constraint**: When adding new map connections, follow this multi-lane pattern for consistency. Each transfer event uses Action Button trigger and plays "Move1" sound effect.

---

## D-020: Quest 6 "Arrival" Auto-Completes at Palace

**Decision**: When the player first speaks to the King in the Palace (Map018), Quest 6 is automatically marked as completed and rewards claimed, before the King's dialogue begins.

**Evidence**: Map018 EV001 (King) Page 1/2 contain `Quest Set Completed 6`, `Quest 6 Claim Reward 6`, `Quest Journal Open To 6` commands (uncommitted change on MapData branch).

**Constraint**: Quest 6 completion is tied to the King interaction, not to entering the Royal District. The King then immediately assigns Quest 4 ("Test of Strength").

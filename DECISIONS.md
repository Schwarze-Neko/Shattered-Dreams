# Architectural Decisions — Shattered Dreams

This document records all architectural decisions inferred from the project implementation. These are binding constraints for future development.

---

## D-001: Front-View Battle System with DTB

**Decision**: The game uses front-view (`optSideView: false`) with Default Turn Battle.

**Evidence**: System.json `optSideView: false`, BattleEngineCore `Default System: "dtb"`.

**Constraint**: Do not switch to side-view without migrating all enemy battler assets and testing SV actor sprites. ATB/CTB/STB plugin files exist in `js/plugins/` but are **NOT loaded** in `plugins.js` — they are completely inactive. Switching battle system requires loading the appropriate plugin AND explicit approval.

---

## D-002: Limb Damage Via Game Variables, Not Plugin

**Decision**: The limb damage system is implemented entirely through game variables (1-7) and common events (1-2), not through a dedicated plugin.

**Evidence**: Variables 1-4 store limb HP. Common Event 1 initializes them. Common Event 2 checks them and applies/removes the Crippled state.

**Constraint**: Variables 1-7 are permanently reserved for the limb system. Any extension to the limb system must continue using this variable-based approach unless a full plugin replacement is explicitly approved. The Crippled state (ID 11) must not be repurposed. In-battle limb damage is applied via troop battle event pages (Turn End) — not through common events alone. Each troop that should use limb damage must have these battle event pages manually configured.

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

## D-016: Limb Damage Is Per-Troop, Not Universal

**Decision**: Limb damage logic (random damage, random target limb, check, display) is embedded in individual troop battle event pages. It is NOT a global battle mechanic.

**Evidence**: Troops 1, 5, 6, 7, 8 have identical Turn End battle event pages with limb damage logic. Troops 2, 3, 4 do not.

**Constraint**: Any new troop that should use limb damage must have the Turn End battle event page manually replicated. This is a copy-paste pattern. If the limb system is later refactored into a plugin or YEP_BaseTroopEvents, all existing troop pages must be migrated.

---

## D-017: Troop Battle Events Also Handle Quest Logic

**Decision**: Troops 5, 6, 7 (church dungeon monsters) contain Turn 0 battle event pages with quest-related logic — adding State 13 ("Demon") to enemies and conditional item/gold reward logic.

**Evidence**: Troop 5/6/7 Page 1: code 333 (Enemy State change), conditional branches checking enemy state and items.

**Constraint**: Troop battle events serve dual purposes (limb damage + quest logic). Do not strip troop events without understanding both layers.

---

## Anti-Patterns Already Present

1. **Hardcoded actor ID in common events**: Common Event 2 targets Actor 5 specifically. This breaks if Hunter (6) or Priest (7) is the active character.
2. **Identical class parameter curves**: All 4 classes have the same HP/MP/ATK/DEF/MAT/MDF/AGI/LUK growth. Classes are not mechanically differentiated.
3. **Unloaded plugin files**: 38 plugin `.js` files sit in `js/plugins/` but only 15 are registered in `plugins.js`. Several features documented as available (passive states, weapon-skill binding, victory aftermath, event location persistence, action sequences) are actually non-functional because their plugins are not loaded. This is NOT "loaded but unused" — they are completely unregistered.
4. **Zero rewards on enemies**: All enemies give 0 EXP and 0 gold, making combat pointless for progression.
5. **Incomplete character paths**: Hunter and Priest character builder paths are stubs — selecting them skips the entire background building system.

---

## What Must Remain Stable

1. **Variables 1-7**: Reserved for limb damage. Do not reassign.
2. **Switch 1**: Reserved for limb initialization. Do not reassign.
3. **Skill Type 3 ("Rune")**: Reserved for the rune magic system.
4. **State 11 ("Crippled")**: Reserved for limb damage consequences.
5. **State 12 ("Royal Bloodline")**: Tied to Noble origin choice.
6. **Actors 5-7**: The three playable protagonist variants.
7. **Map006**: Character creation flow. Must remain the starting map.
8. **Skill 7 ("Wait")**: Used as rune failure fallback. Must exist.
9. **Common Events 1-2**: Limb damage system. Do not repurpose.
10. **RuneSkills.js**: Do not modify the plugin source. Extend via notetags.
11. **Quest 6 ("Arrival")**: The first quest, opened automatically after character creation.
12. **The `<runes: X, Y>` notetag format**: Canonical way to define rune combinations.
13. **plugins.js is the ONLY source of truth for active plugins**. Plugin `.js` files in `js/plugins/` directory do NOT indicate active status. Only entries in `plugins.js` are loaded at runtime.

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

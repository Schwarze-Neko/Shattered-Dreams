# Architecture — Shattered Dreams

## 1. System Breakdown

### 1.1 Combat System

**Mode**: Front-view, Default Turn Battle (DTB).
- `optSideView: false` in System.json.
- YEP_BattleEngineCore loaded with `Default System: "dtb"`.
- ATB, CTB, STB plugin **files** exist but are **NOT loaded** in plugins.js.
- YEP_BattleAICore loaded — provides enemy AI patterns (dynamic actions, element testing, AI level 80).
- YEP_X_ActSeqPack 1-3 **NOT loaded** — action sequence customization unavailable.
- YEP_X_AnimatedSVEnemies **NOT loaded**.
- YEP_VictoryAftermath **NOT loaded** — uses default MV victory flow.

**Damage formula convention**: `a.atk * 4 - b.def * 2` for physical, `100 + a.mat * 2 - b.mdf * 2` for magical. Variance: 20%.

**Attack skill override**: WeaponSkill.js exists in `js/plugins/` but is **NOT loaded** in `plugins.js`. Weapon-based skill overrides via `<skill_id:N>` notetag do not currently function.

### 1.2 Limb Damage System

**Architecture**: Pure event-driven via game variables and common events. No plugin code.

| Variable | Purpose |
|----------|---------|
| 1 — Left Arm HP | Tracks left arm integrity (init: 100) |
| 2 — Right Arm HP | Tracks right arm integrity (init: 100) |
| 3 — Left Leg HP | Tracks left leg integrity (init: 100) |
| 4 — Right Leg HP | Tracks right leg integrity (init: 100) |
| 5 — Limb HP Counter | Computed: count of limbs with HP > 0 |
| 6 — Damage Amount | Damage value to apply to a limb |
| 7 — Target Limb | Which limb to damage (selector) |

| Switch | Purpose |
|--------|---------|
| 1 — Limb HP Initialized | Gate for initialization; flipped once at game start |

**Common Event 1 — "Initialize Limb HP"**:
- Sets Switch 1 ON, sets all 4 limb variables to 100, then sets Switch 1 OFF.
- Triggered once (Switch 1 condition, trigger: None — must be called explicitly).

**Common Event 2 — "Limb Damage Check"**:
- Resets counter (var 5 = 0).
- For each of the 4 limb variables: if > 0, increment counter.
- If counter <= 1: apply State 11 (Crippled) to actor 5.
- Else: remove State 11 from actor 5.
- **Limitation**: hardcoded to Actor ID 5 (Knight).

**State 11 — "Crippled"**:
- AGI -20 (trait code 33, dataId 0, value -20).
- Hit Rate 50% (trait code 21, dataId 0, value 0.5).
- DEF multiplier 65% (trait code 12, dataId 3, value 0.65).
- Permanent (no auto-removal, persists after battle).

**In-Battle Implementation (Troop Events)**:
Several troops contain battle event pages that drive the limb system at runtime:

- **Page 1 (condition: Turn 0)**: Calls Common Event 1 to initialize all limb HP to 100.
- **Page 2 (condition: Turn End)**: Each turn end:
  1. `Variable 6 = Random(5, 15)` — generate random damage.
  2. `Variable 7 = Random(1, 4)` — pick random limb.
  3. Conditional branches: if Var 7 == 1 → Var 1 -= Var 6; if 2 → Var 2 -= Var 6; etc.
  4. Calls Common Event 2 (Limb Damage Check) to evaluate Crippled state.
  5. Displays all 4 limb HP values via Show Text message.

**Troops with limb damage**: 1 (Bat*2), 5 (Monster 1), 6 (Monster 2), 7 (Monster 3), 8 (Dummy).
**Troops WITHOUT limb damage**: 2 (Slime*2), 3 (Orc), 4 (Minotaur).

**Current status**: The system is functional but primitive — damage is random (not tied to actual enemy attacks), there is no player-side limb targeting, and the limb HP display is a text message popup rather than a proper HUD element. Limb damage is per-troop, not a universal mechanic (must be manually added to each troop's battle events). Not all troops have it.

### 1.3 Rune-Based Magic System

**Plugin**: RuneSkills.js (v1.2b by mjshi). Third-party, ES5 compatible.

**Skill Type ID**: 3 ("Rune" in System.json).

**How it works**:
1. During battle, selecting the "Rune" skill type opens the rune combination UI.
2. Player selects runes from their known rune skills (stypeId 3).
3. Rune combination is checked against `<runes: X, Y, ...>` notetags on result skills.
4. If match found → casts the resulting spell. If no match → fires failure result (Skill 7 "Wait").
5. MP cost determined by resulting skill's mpCost.

**Defined Runes** (Skill IDs, all stypeId 3):

| ID | Name | Category |
|----|------|----------|
| 13 | Fire Rune | Elemental |
| 14 | Rune of Form (Sphere) | Form |
| 16 | Water Rune | Elemental |
| 17 | Earth Rune | Elemental |
| 18 | Air Rune | Elemental |
| 19 | Rune of Form (Stream) | Form |
| 20 | Rune of Protection | Effect |
| 21 | Light Rune | Elemental |
| 22 | Darkness Rune | Elemental |
| 23 | Life Rune | Elemental |
| 24 | Death Rune | Elemental |
| 25 | Rune of Contact | Effect |
| 26 | Rune of Form (Area) | Form |

**Defined Combinations**:

| Result Skill | Rune Combo | Element | Scope |
|-------------|------------|---------|-------|
| 8: Lesser Healing | Life (23) | None | Single ally |
| 9: Fire Spark | Fire (13) | Fire | Single enemy |
| 10: Lightning Bolt | Fire (13) + Air (18) | Thunder | 2 random enemies |
| 15: Fire Ball | Fire (13) + Sphere (14) | Fire | Single enemy |
| 27: Mist Sphere | Water (16) + Sphere (14) | Water | Single enemy |
| 28: Stone Orb | Earth (17) + Sphere (14) | Earth | Single enemy |
| 29: Wisp of Wind | Air (18) + Sphere (14) | Wind | Single enemy |
| 30: Divine Smite | Light (21) + Fire (13) | Light | 2 random enemies |

**Configuration**:
- Order matters (`Ignore Order: no`).
- Failure allowed (produces Skill 7 "Wait").
- Min runes: 1, Max runes: 5, Max cap: 10.
- MP formula: `result` (uses resulting skill's MP cost).
- Rune memory is persisted in save data via `DataManager.makeSaveContents` hook.

**Unused runes**: Water (16), Earth (17), Stream (19), Protection (20), Darkness (22), Death (24), Contact (25), Area (26) — exist as skills but have no result combinations using them exclusively. Most appear only as components of existing combos.

### 1.4 Dialogue-Based Character Builder

**Location**: Map006 "CharacterSelect" — autorun event (trigger: 3).

**Flow** (Knight path, fully implemented):
```
Class → Origin → Fighting Style → Moment of Glory → Motivation → Quest Open → Transfer
```

| Step | Choices | Rewards |
|------|---------|---------|
| Class | Knight / Hunter / Priest | Sets actor (5/6/7) |
| Origin (Knight) | Noble | Key Item: Noble Bloodline Patent |
| Origin (Knight) | Commoner | Equip: Reinforced Armor |
| Fighting Style | Vanguard | Skills: Shield Bash; Equip: Longsword + Heavy Shield |
| Fighting Style | Defender | Skills: Guardian Stance; Equip: Tower Shield + Mace |
| Moment of Glory | Victory in Battle | Skill: Fire Rune |
| Moment of Glory | Rescuing a Village | Skill: Life Rune |
| Motivation | Summoned by King | Key Item: Sovereign's Favor + 20 gold |
| Motivation | Seeking Redemption | Key Item: Chains of Atonement |

After character creation, Quest 6 ("Arrival") opens and player transfers to Map002 (Outskirts).

**Hunter/Priest paths**: Only swap party member (remove Actor 5, add Actor 6 or 7). No further choices implemented.

### 1.5 Quest System

**Plugin**: YEP_QuestJournal (v1.02).

**Quest Types**: Main Quests, Side Quests, Character Quests, Tutorial Quests (categories defined, only Main used).

**Quest Detail Table**:

| ID | Title | From | Location | Description Status | Objectives Status | Rewards Status |
|----|-------|------|----------|--------------------|-------------------|----------------|
| 1 | Test Quest | NPC | Living Quarters | Real ("Bring the npc an apple") | Real (3 apple objectives) | Placeholder (template) |
| 2 | The Monsters Beneath | Ragatha | Church Dungeon | Real (defeat monsters, claim Tome) | Real (4 objectives) | Real (Amulet of Blessing) |
| 3 | Deathbound Duty | Voice of Naksh-Gongor | Tomb | **Placeholder** (default template) | **Placeholder** (default template) | **Placeholder** (default template) |
| 4 | Test of Strength | King | Palace | Real (prove your skills) | Real (dummies, Shadowfang, return) | Placeholder (template) |
| 5 | Holy Duty | Archbishop | Church | Partial (1 real + 1 placeholder) | Real (defeat monster, return) | Real (Talisman of Protection) |
| 6 | Arrival | Your Sovereign | Taldaria | **Placeholder** (default template) | Real (2 objectives: arrive capital, arrive palace) | Placeholder (template) |

**Named characters from quests**: King Ghatasiras II (Quest 6 objective text), Ragatha, Archbishop, Voice of Naksh-Gongor, Shadowfang (enemy).

**Quest tracking via switches**:
- Switch 2: TestQuestOn
- Switch 4: Quest Ragatha
- Switch 8: Quest King
- Switch 9: HasLibraryKey
- Switch 11: DefeatedDummies
- Switch 12: Ortasilas

**Managed via plugin commands**: `Quest Journal Open To N`, `Quest N Show Objective M`, `Quest N Set Completed`, etc.

### 1.6 Passive States

**Plugin**: YEP_AutoPassiveStates — file exists in `js/plugins/` but is **NOT loaded** in `plugins.js`. Passive state application does not currently function at runtime.

**State 12 — "Royal Bloodline"**: +10% TP(Hope) regeneration. Intended as a passive tied to Noble origin. **Non-functional** until YEP_AutoPassiveStates is loaded.

**State 13 — "Demon"**: Defined, no traits. Placeholder for future use.

## 2. Event Flow Conventions

### 2.1 Architecture Style
- **Map-specific logic**: Most game logic lives in individual map events, not common events.
- **Common events** are reserved for cross-map mechanical systems (limb damage only, currently).
- **Autorun events** used for cutscenes and the character builder (Map006).
- **Transfer events** handle map connections (doors, exits).
- **Self-switches** used for one-time interactions (items picked up, NPCs spoken to).

### 2.2 Quest Flow Pattern
1. NPC dialogue triggers quest addition via plugin command.
2. Objectives shown/completed via plugin commands in map events.
3. Switch flipped to track quest state globally.
4. Reward given via event commands, quest marked completed.

### 2.3 NPC Interaction Pattern
- NPCs are map events with Action Button trigger.
- Dialogue via Show Text commands with YEP_MessageCore formatting.
- Choice branches via Show Choices (HIME_LargeChoices for extended lists).
- Named NPC sprites use `$` prefix single-character sheets.

## 3. State Management Conventions

### 3.1 Switches (Named, IDs 1-12)

| ID | Name | Purpose |
|----|------|---------|
| 1 | Limb HP Initialized | Gate for limb system init |
| 2 | TestQuestOn | Test quest tracking |
| 3 | Apple Picked Count | Apple collection quest flag |
| 4 | Quest Ragatha | Church quest (Ragatha NPC) |
| 8 | Quest King | Palace quest (King) |
| 9 | HasLibraryKey | Library access gate |
| 11 | DefeatedDummies | Training dummies completed |
| 12 | Ortasilas | NPC interaction flag |

Switches 5-7, 10, 13-20: unused/unnamed.

### 3.2 Variables (Named, IDs 1-9)

| ID | Name | Purpose |
|----|------|---------|
| 1 | Left Arm HP | Limb system |
| 2 | Right Arm HP | Limb system |
| 3 | Left Leg HP | Limb system |
| 4 | Right Leg HP | Limb system |
| 5 | Limb HP Counter | Limb system (computed) |
| 6 | Damage Amount | Limb system (input) |
| 7 | Target Limb | Limb system (selector) |
| 8 | AppleCount | Quest counter |
| 9 | MonsterCount | Quest counter |

Variables 10-20: unused/unnamed.

### 3.3 Convention
- Variables 1-7: **reserved for limb damage system**. Do not repurpose.
- Variables 8-9: quest-specific counters.
- Switches 1: **reserved for limb initialization**. Do not repurpose.
- Switches 2-12: quest/event flags, one switch per significant game state change.

## 4. Variable and Switch Usage Patterns

- **One switch per quest gate** (not per objective — objectives tracked via plugin commands).
- **Limb HP as plain variables** (not actor stats, not plugin extensions).
- **Self-switches for map-local one-time events** (chests, single-use NPCs).
- **No variable-based branching for main story** observed — story flow is linear with quest flags.

## 5. Mapping Pipeline

### 5.1 Tiled Maps (Primary for exterior/complex maps)
- **Plugin**: YED_Tiled (v1.20).
- `.tmx` files in `maps/` directory, paired with `.json` exports.
- Maps with Tiled versions: 1, 2, 3, 4, 5, 7, 12, 13, 17, 18, 28, 29, 30, 31, 37, 38.
- Map3 has both `.tmx` and `.tmj` (Tiled JSON format) — possibly transitional.
- Player Z-layer: 3. Below player: 1. Above player: 5.
- Half-tile movement: disabled.

### 5.2 MV-Native Maps
- Some interior maps (houses, smaller rooms) appear to use native MV tileset-based mapping.
- Standard RPG Maker tilesets (Outside, Inside, Dungeon, World) present alongside custom ones.

### 5.3 Parallax Backgrounds
- Used for atmospheric outdoor scenes and large locations.
- Files in `img/parallaxes/`: sky variants (BlueSky, CloudySky, StarlitSky, Sunset, DarkSpace), Church, Tomb, Tower, Mountains (5 layers), Ocean, SeaofClouds.
- Character Select (Map006) uses `StarlitSky` parallax with scrolling.
- Parallax loop and scroll configured per-map in map JSON properties.

### 5.4 Custom Tilesets
- District-specific: `Slums Tilesets.png`, `Royal District.png`, `WizardDistrict.png`, `Church.png`, `Tower.png`, `Sewer.png`.
- House packs: `House_and_Streets.png`, `HousePackedSheet.png`, `HousesShatteredDreams.png`.
- Ground: `Grass.png`, `Ground_Autotiles.png`, `OutsideTilesNew.png`.
- Custom collision tileset: `TileCollision_48x48.png`.

## 6. Save/Load Assumptions

- **YEP_SaveCore** manages save UI (max 24 files).
- **RuneSkills** hooks into save/load to persist rune memory (`contents.runeSkillsMemory`).
- **YEP_SaveEventLocations** — file exists but is **NOT loaded**. Event positions are NOT persisted across saves.
- **Config**: saved to `config.rpgsave` (local mode).
- **Save format**: standard RPG Maker MV JSON-based save files.
- Limb damage variables (1-4) are persisted automatically as game variables.

## 7. Plugin Dependency Structure

**IMPORTANT**: Only 15 plugins are registered in `plugins.js` and actually loaded at runtime.
An additional 38 plugin `.js` files exist in `js/plugins/` but are NOT loaded. The distinction is critical.

### Active Plugins (loaded in plugins.js, in load order)

```
1.  Community_Basic          — screen resolution (816x624 base), cache limit 20
2.  CustomLogo               — startup logo (MadeWithMv)
3.  YEP_CoreEngine           — base framework, overrides resolution to 1080x950
4.  YEP_BattleAICore         — enemy AI patterns, AI level 80
5.  YEP_MessageCore          — message window, word wrap, name boxes
6.  YEP_QuestJournal         — quest system, 6 quests defined
7.  YEP_SaveCore             — save UI, 24 save slots
8.  YEP_EquipCore            — equipment slots per class
9.  ItemBook                 — item encyclopedia
10. YEP_SkillCore            — skill cost display, formatting
11. YEP_X_CoreUpdatesOpt     — core engine patches (v1.10-1.62)
12. YEP_BattleEngineCore     — battle flow control, DTB mode, visual enemy select
13. HIME_LargeChoices        — extended choice lists (used in character builder)
14. YED_Tiled                — Tiled Map Editor support (Z-layers: below=1, player=3, above=5)
15. RuneSkills               — custom rune magic (hooks Scene_Battle, DataManager)
```

### Unloaded Plugins (files exist in js/plugins/ but NOT in plugins.js)

These do NOT run at runtime. They may have been loaded in earlier project versions or are reserved for future use.

```
Yanfly (unloaded):
  YEP_AutoPassiveStates, YEP_BaseTroopEvents, YEP_BuffsStatesCore,
  YEP_ElementCore, YEP_EventChasePlayer, YEP_MainMenuManager,
  YEP_MoveRouteCore, YEP_RegionEvents, YEP_RegionRestrictions,
  YEP_SaveEventLocations, YEP_VictoryAftermath, YEP_LevelUpGrowthEffects,
  YEP_AnimateTilesOption, YEP_FpsSynchOption, YEP_KeyboardConfig,
  YEP_PatchNotes, YEP_PictureSpritesheets, YEP_ScriptCallPluginCmd,
  YEP_ItemCore, YEP_X_ItemUpgradeSlots, YEP_X_SkillCooldowns,
  YEP_X_ActSeqPack1, YEP_X_ActSeqPack2, YEP_X_ActSeqPack3,
  YEP_X_AnimatedSVEnemies, YEP_X_BattleSysATB, YEP_X_BattleSysCTB,
  YEP_X_BattleSysSTB, YEP_X_ExtMovePack1

Independent (unloaded):
  WeaponSkill, KELYEP_DragonBones, EnemyBook, AltMenuScreen,
  AltSaveScreen, SimpleMsgSideView, TitleCommandPosition, MadeWithMv,
  --------------------.js (separator)
```

### Consequences of Unloaded Plugins

| Feature | Required Plugin | Status |
|---------|----------------|--------|
| Passive states (Royal Bloodline) | YEP_AutoPassiveStates | **Broken** — state 12 won't auto-apply |
| Weapon-skill binding | WeaponSkill | **Broken** — `<skill_id:N>` notetags ignored |
| Victory screen | YEP_VictoryAftermath | **Missing** — uses default MV victory |
| Event position persistence | YEP_SaveEventLocations | **Missing** — events reset on reload |
| Action sequences | YEP_X_ActSeqPack1-3 | **Missing** — custom battle animations unavailable |
| Animated SV enemies | YEP_X_AnimatedSVEnemies | **N/A** — side-view is disabled |
| Item upgrade slots | YEP_X_ItemUpgradeSlots | **N/A** — no items configured for it |
| Region-based events/restrictions | YEP_RegionEvents/Restrictions | **Missing** — region logic won't fire |
| DragonBones animations | KELYEP_DragonBones | **Missing** — skeletal animations unavailable |
| Enemy bestiary | EnemyBook | **Missing** — only ItemBook is loaded |

### Screen Resolution

**Effective resolution**: 1080x950 (set via YEP_CoreEngine `Screen Width`/`Screen Height`).
Community_Basic base is 816x624, overridden by YEP_CoreEngine.

## 8. Elements

| ID | Name |
|----|------|
| 1 | Physical |
| 2 | Fire |
| 3 | Ice |
| 4 | Thunder |
| 5 | Water |
| 6 | Earth |
| 7 | Wind |
| 8 | Light |
| 9 | Darkness |

## 9. Map Hierarchy

```
Outskirts (2)
Living Quarters (3)
├── HouseLQ1_1 (12)
├── HouseLQ1_2 (14)
├── HouseLQ1_3 (15)
├── HouseLQ1_4 (16)
└── HouseLQ1_5 (19)
Living Quarters 2 (1)
├── HouseLQ2_01 (25)
├── HouseLQ2_02 (26)
└── HouseLQ2_03 (27)
Slums (4)
├── House_Slums01 (20)
├── House_Slums02 (21)
├── House_Slums03 (22)
├── Bar_Slums (23)
├── Shop_Slums (24)
└── Tomb (31)
Church District (5)
└── Church (17)
    └── Church Dungeon (28)
        ├── Dungeon (29)
        └── Library (30)
Wizard District (7)
├── Tower level1 (32)
├── Tower level2 (33)
├── Tower level3 (34)
├── Tower level 4 (35)
└── Tower level 7 (36)
Royal District (13)
└── Palace (18)
    ├── Left Wing (37)
    └── Right Wing (38)
Western Sewers (8)
Middle Sewers (9)
Wizard Sewers (10)
Northern Kochiryn Forest (11)
CharacterSelect (6) — starting map
```

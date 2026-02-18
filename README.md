# Shattered Dreams

A dark fantasy JRPG built in RPG Maker MV, set in the kingdom of Taldaria and the city of Kuyaba. The player takes on the role of an emissary — a Knight, Hunter, or Priest — arriving in Kuyaba on a mission shaped by their personal history.

## Current Implemented Scope

### Core Systems
- **Dialogue-based Character Builder** (game start): class selection (Knight/Hunter/Priest), origin, fighting style, moment of glory, motivation — each choice grants unique items, skills, and starting equipment. Currently fully implemented for Knight class only; Hunter and Priest paths are stubs (class swap only).
- **Rune-based Magic System**: combinatorial spellcasting via RuneSkills plugin. Players combine elemental runes (Fire, Water, Earth, Air, Light, Darkness, Life, Death) with form runes (Sphere, Stream, Area) and effect runes (Protection, Contact) during battle to produce spells. 8 rune combinations currently defined.
- **Limb Damage System**: tracks HP for 4 limbs (Left Arm, Right Arm, Left Leg, Right Leg) via game variables. When limb count drops below threshold, the "Crippled" state is applied (reduced agility, hit rate, defense). Managed through Common Events 1-2.
- **Quest Journal**: 6 quests defined via YEP_QuestJournal (4 main quests with real content, 1 test quest, 1 arrival quest).
- **TP renamed to "Hope"**: thematic resource.

### World Content
- **38 maps** across districts: Outskirts, Living Quarters (x2), Slums, Church District, Wizard District, Royal District, Sewers (x3), Northern Kochiryn Forest.
- **Interiors**: houses, a church, church dungeon with library, a tomb, wizard tower (5 levels), royal palace with wings.
- **Custom tilesets** for each district (Slums, Royal, Wizard, Church, etc.).
- **Parallax mapping** on select locations (Church, Tomb, Tower, sky backdrops).
- **Custom BGM** (28 custom OGG tracks): per-district melodies (palace, church, wizard quarter, living quarters, slums, cemetery), battle/fight themes, mood music (happy, sad, dungeon variants). Plus standard MV BGM library.

### Playable Characters
- **Knight** (Actor 5) — primary protagonist, class 1, custom sprite/portrait.
- **Hunter** (Actor 6) — selectable at start, class 2, custom sprite.
- **Priest** (Actor 7) — selectable at start, class 4, custom sprite. Has rune skills in class learnings (Fire Rune, Sphere, Life, Light).

### NPCs
- 9 generic NPC actors (IDs 8-16) using NPC_Sheet spritesheets.
- Named characters: Archbishop, King, Druid, Evoker, Master, Nuterein, Otirisas, Summoner, Sister, Voice, DeathKnight (sprites exist).

## How to Run

1. Open the project in **RPG Maker MV** (v1.6+) by loading `Game.rpgproject`.
2. Alternatively, run `index.html` in NW.js or a compatible browser environment.
3. For Tiled map editing, use **Tiled Map Editor** — `.tmx` files are in the `maps/` directory.

## Known Incomplete Systems

- **Hunter and Priest character builder paths** — only class swap implemented, no origin/style/glory/motivation choices.
- **Enemy rewards** — all enemies currently give 0 EXP and 0 gold.
- **Class stat differentiation** — all 4 classes share identical parameter curves.
- **Limb damage integration** — functional in 5 of 8 troops via battle events (random damage 5-15 to random limb each turn). Missing from 3 troops. Hardcoded to actor ID 5. No player-side limb targeting UI. Limb HP shown as text message, not HUD element.
- **State 13 "Demon"** — exists with no traits (placeholder).
- **States 14-20** — empty placeholder slots.
- **Battle system mode** — configured as DTB (Default Turn Battle). ATB/CTB/STB plugin files exist in `js/plugins/` but are **not loaded** in `plugins.js`.
- **Passive states** — YEP_AutoPassiveStates plugin file exists but is **not loaded** in `plugins.js`. State 12 "Royal Bloodline" may not function as a passive.
- **WeaponSkill** — WeaponSkill.js plugin file exists but is **not loaded** in `plugins.js`. Weapon-based skill overrides do not function.
- **Many Yanfly plugins present but unloaded** — 38 plugin `.js` files exist in `js/plugins/` directory, but only 15 are registered in `plugins.js`. The unloaded plugins include: YEP_AutoPassiveStates, YEP_VictoryAftermath, YEP_ItemCore, YEP_X_ItemUpgradeSlots, YEP_X_ActSeqPack1-3, YEP_X_AnimatedSVEnemies, YEP_BuffsStatesCore, YEP_ElementCore, YEP_MainMenuManager, YEP_SaveEventLocations, YEP_EventChasePlayer, YEP_RegionEvents, YEP_RegionRestrictions, KELYEP_DragonBones, EnemyBook, AltMenuScreen, AltSaveScreen, WeaponSkill, and others.
- **Shop system** — no shop events observed in maps. Shop_Slums (Map 24) exists as a map but has no shop processing.
- **Side-view battle** — disabled (`optSideView: false`) but SV actor/enemy sprites exist in assets.
- **Quest 6 "Arrival"** — has placeholder description text (default template). Objectives recently updated to include "Arrive to the Capital" as objective 1.
- **Quest 3 "Deathbound Duty"** — entirely placeholder (description, objectives, rewards all use default template text).
- **Quest 5 "Holy Duty"** — description has one real entry plus one placeholder. Rewards text says "Talisman of Protection" but item 7 in database is "Amulet of Blessing" (name mismatch or separate item).

/*:
 * @plugindesc v1.0 Limb Damage System for Shattered Dreams. Tracks hidden limb HP, statuses, crippling, and enemy body parts.
 * @author Shattered Dreams Team
 *
 * @param Limb Damage Ratio
 * @desc Fraction of HP damage applied to limbs (0.0 - 1.0)
 * @default 0.35
 *
 * @param Regen Steps
 * @desc Steps on map between limb regeneration ticks
 * @default 50
 *
 * @param Infection Kill Timer
 * @desc Turns/ticks before untreated infection kills actor
 * @default 10
 *
 * @param Infection Poison Threshold
 * @desc Infection timer value at which Poison state is applied
 * @default 5
 *
 * @param Blood Loss Max Stacks
 * @desc Maximum blood loss stacks per limb
 * @default 3
 *
 * @param Blood Loss Battle Drain
 * @desc HP drain per stack per turn in battle (fraction of MHP)
 * @default 0.03
 *
 * @param Blood Loss Map Drain
 * @desc HP drain per stack per regen tick on map (fraction of MHP)
 * @default 0.01
 *
 * @param Maimed Damage Threshold
 * @desc Minimum single limb damage to trigger Maimed
 * @default 30
 *
 * @param Maimed MaxHP Reduction
 * @desc How much maxHp is reduced per Maimed application
 * @default 20
 *
 * @param Malformed Chance
 * @desc Percent chance of Malformed on any limb damage (0-100)
 * @default 1
 *
 * @param Infection Base Chance
 * @desc Percent chance of Infection on any limb damage (0-100)
 * @default 10
 *
 * @param Infection Maimed Chance
 * @desc Percent chance of Infection if limb is Maimed (0-100)
 * @default 25
 *
 * @param Show Narrative Messages
 * @desc Show limb damage narrative in battle log (true/false)
 * @default true
 *
 * @param Crippled State Id
 * @desc Database State ID for Crippled
 * @default 11
 *
 * @param Infected State Id
 * @desc Database State ID for Infected marker
 * @default 14
 *
 * @param Blood Loss State Id
 * @desc Database State ID for Blood Loss marker
 * @default 15
 *
 * @param Maimed State Id
 * @desc Database State ID for Maimed marker
 * @default 16
 *
 * @param Malformed State Id
 * @desc Database State ID for Malformed marker
 * @default 17
 *
 * @param Poison State Id
 * @desc Database State ID for Poison (applied by advanced infection)
 * @default 4
 *
 * @help
 * ============================================================================
 * SD_LimbSystem.js — Limb Damage System
 * ============================================================================
 *
 * Skill Notetags (enemy skills):
 *   <limbTarget: random>     - random limb (default for physical)
 *   <limbTarget: arms>       - random arm
 *   <limbTarget: legs>       - random leg
 *   <limbTarget: leftArm>    - specific limb
 *   <limbTarget: rightArm>
 *   <limbTarget: leftLeg>
 *   <limbTarget: rightLeg>
 *   <limbTarget: weakest>    - limb with lowest HP
 *   <limbTarget: none>       - no limb damage (default for magical)
 *
 * Enemy Notetags (body part system):
 *   <bodyPart: head>   - killing this enemy kills entire troop
 *   <bodyPart: limb>   - killing this enemy debuffs remaining troop
 *   <bodyPart: body>   - standard body part
 *   <bodyPart: none>   - normal enemy (default)
 *
 * Skill/Item Notetags (healing):
 *   <limbHeal: N>            - heals N HP to most damaged limb
 *   <limbHealAll: N>         - heals N HP to all limbs
 *   <limbCureInfection>      - cures Infected on one limb
 *   <limbCureBloodLoss: N>   - removes N stacks of Blood Loss
 *   <limbCureMaimed>         - removes Maimed from one limb
 *
 * Plugin Commands:
 *   SDLimb restore <actorId> <limbKey>   - restore a crippled limb
 *   SDLimb damage <actorId> <limbKey> <amount>  - deal limb damage
 *   SDLimb status <actorId> <limbKey> <statusName>  - apply status
 *   SDLimb debug                         - print all limb data to console
 *
 * ============================================================================
 */

(function() {
'use strict';

// ============================================================================
// 1. NAMESPACE & PARAMETERS
// ============================================================================

var SDLimb = {};
window.SDLimb = SDLimb;

var parameters = PluginManager.parameters('SD_LimbSystem');
var PARAM = {
    limbDamageRatio:      parseFloat(parameters['Limb Damage Ratio'] || '0.35'),
    regenSteps:           parseInt(parameters['Regen Steps'] || '50'),
    infectionKillTimer:   parseInt(parameters['Infection Kill Timer'] || '10'),
    infectionPoisonAt:    parseInt(parameters['Infection Poison Threshold'] || '5'),
    bloodLossMaxStacks:   parseInt(parameters['Blood Loss Max Stacks'] || '3'),
    bloodLossBattleDrain: parseFloat(parameters['Blood Loss Battle Drain'] || '0.03'),
    bloodLossMapDrain:    parseFloat(parameters['Blood Loss Map Drain'] || '0.01'),
    maimedThreshold:      parseInt(parameters['Maimed Damage Threshold'] || '30'),
    maimedMaxHpReduce:    parseInt(parameters['Maimed MaxHP Reduction'] || '20'),
    malformedChance:      parseInt(parameters['Malformed Chance'] || '1'),
    infectionBaseChance:  parseInt(parameters['Infection Base Chance'] || '10'),
    infectionMaimedChance:parseInt(parameters['Infection Maimed Chance'] || '25'),
    showNarrative:        (parameters['Show Narrative Messages'] || 'true') === 'true',
    stCrippled:           parseInt(parameters['Crippled State Id'] || '11'),
    stInfected:           parseInt(parameters['Infected State Id'] || '14'),
    stBloodLoss:          parseInt(parameters['Blood Loss State Id'] || '15'),
    stMaimed:             parseInt(parameters['Maimed State Id'] || '16'),
    stMalformed:          parseInt(parameters['Malformed State Id'] || '17'),
    stPoison:             parseInt(parameters['Poison State Id'] || '4')
};
SDLimb.PARAM = PARAM;

var LIMB_KEYS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
var LIMB_NAMES = {
    leftArm:  'left arm',
    rightArm: 'right arm',
    leftLeg:  'left leg',
    rightLeg: 'right leg'
};
var LIMB_VAR_MAP = { leftArm: 1, rightArm: 2, leftLeg: 3, rightLeg: 4 };

// Threshold boundaries for narrative messages
var THRESHOLD_HEALTHY  = 76;
var THRESHOLD_WOUNDED  = 51;
var THRESHOLD_SEVERE   = 26;
var THRESHOLD_CRITICAL = 1;

// ============================================================================
// 2. DATA LAYER
// ============================================================================

SDLimb.createDefaultStatuses = function() {
    return {
        infected:  { active: false, timer: 0 },
        bloodLoss: { active: false, stacks: 0 },
        maimed:    { active: false, maxHpReduction: 0 },
        malformed: { active: false, hpMod: 0, atkMod: 0 }
    };
};

SDLimb.createDefaultLimb = function() {
    return {
        hp: 100,
        maxHp: 100,
        statuses: SDLimb.createDefaultStatuses(),
        crippled: false
    };
};

SDLimb.createDefaultData = function(actorId) {
    var limbs = {};
    for (var i = 0; i < LIMB_KEYS.length; i++) {
        limbs[LIMB_KEYS[i]] = SDLimb.createDefaultLimb();
    }
    return {
        actorId: actorId,
        limbs: limbs,
        initialized: true
    };
};

SDLimb.getData = function(actorId) {
    if (!$gameSystem._limbData) {
        $gameSystem._limbData = {};
    }
    if (!$gameSystem._limbData[actorId]) {
        $gameSystem._limbData[actorId] = SDLimb.createDefaultData(actorId);
    }
    // Ensure all limbs have proper status structure (save compat)
    var data = $gameSystem._limbData[actorId];
    for (var i = 0; i < LIMB_KEYS.length; i++) {
        var limb = data.limbs[LIMB_KEYS[i]];
        if (!limb) {
            data.limbs[LIMB_KEYS[i]] = SDLimb.createDefaultLimb();
            limb = data.limbs[LIMB_KEYS[i]];
        }
        if (!limb.statuses) {
            limb.statuses = SDLimb.createDefaultStatuses();
        }
        if (!limb.statuses.infected)  limb.statuses.infected  = { active: false, timer: 0 };
        if (!limb.statuses.bloodLoss) limb.statuses.bloodLoss = { active: false, stacks: 0 };
        if (!limb.statuses.maimed)    limb.statuses.maimed    = { active: false, maxHpReduction: 0 };
        if (!limb.statuses.malformed) limb.statuses.malformed = { active: false, hpMod: 0, atkMod: 0 };
        if (limb.crippled === undefined) limb.crippled = false;
        if (limb.maxHp === undefined) limb.maxHp = 100;
    }
    return data;
};

SDLimb.getLimb = function(actorId, limbKey) {
    return SDLimb.getData(actorId).limbs[limbKey];
};

SDLimb.countCrippledLimbs = function(actorId) {
    var data = SDLimb.getData(actorId);
    var count = 0;
    for (var i = 0; i < LIMB_KEYS.length; i++) {
        if (data.limbs[LIMB_KEYS[i]].crippled) count++;
    }
    return count;
};

SDLimb.countFunctionalLimbs = function(actorId) {
    return 4 - SDLimb.countCrippledLimbs(actorId);
};

SDLimb.hasAnyStatus = function(actorId, statusName) {
    var data = SDLimb.getData(actorId);
    for (var i = 0; i < LIMB_KEYS.length; i++) {
        if (data.limbs[LIMB_KEYS[i]].statuses[statusName] &&
            data.limbs[LIMB_KEYS[i]].statuses[statusName].active) {
            return true;
        }
    }
    return false;
};

// ============================================================================
// 3. MIRROR SYNC (Variables 1-7)
// ============================================================================

SDLimb.syncVariables = function() {
    if (!$gameParty || !$gameParty.leader()) return;
    var leaderId = $gameParty.leader().actorId();
    var data = SDLimb.getData(leaderId);
    $gameVariables.setValue(1, Math.max(0, data.limbs.leftArm.hp));
    $gameVariables.setValue(2, Math.max(0, data.limbs.rightArm.hp));
    $gameVariables.setValue(3, Math.max(0, data.limbs.leftLeg.hp));
    $gameVariables.setValue(4, Math.max(0, data.limbs.rightLeg.hp));
    $gameVariables.setValue(5, SDLimb.countFunctionalLimbs(leaderId));
};

// ============================================================================
// 4. NOTETAG PARSER
// ============================================================================

SDLimb.parseLimbTarget = function(skill) {
    if (skill._sdLimbTargetCached !== undefined) {
        return skill._sdLimbTargetCached;
    }
    var note = skill.note || '';
    var match = note.match(/<limbTarget:\s*(\w+)>/i);
    if (match) {
        skill._sdLimbTargetCached = match[1].toLowerCase();
    } else {
        // Default: physical = random, magical = none
        if (skill.hitType === 2) {
            skill._sdLimbTargetCached = 'none';
        } else {
            skill._sdLimbTargetCached = 'random';
        }
    }
    return skill._sdLimbTargetCached;
};

SDLimb.parseBodyPart = function(enemy) {
    if (enemy._sdBodyPartCached !== undefined) {
        return enemy._sdBodyPartCached;
    }
    var note = ($dataEnemies[enemy.enemyId()] || {}).note || '';
    var match = note.match(/<bodyPart:\s*(\w+)>/i);
    enemy._sdBodyPartCached = match ? match[1].toLowerCase() : 'none';
    return enemy._sdBodyPartCached;
};

SDLimb.parseLimbHeal = function(item) {
    if (item._sdLimbHealCached !== undefined) {
        return item._sdLimbHealCached;
    }
    var note = item.note || '';
    var result = {
        heal: 0,
        healAll: 0,
        cureInfection: false,
        cureBloodLoss: 0,
        cureMaimed: false
    };
    var m;
    m = note.match(/<limbHeal:\s*(\d+)>/i);
    if (m) result.heal = parseInt(m[1]);
    m = note.match(/<limbHealAll:\s*(\d+)>/i);
    if (m) result.healAll = parseInt(m[1]);
    if (/<limbCureInfection>/i.test(note)) result.cureInfection = true;
    m = note.match(/<limbCureBloodLoss:\s*(\d+)>/i);
    if (m) result.cureBloodLoss = parseInt(m[1]);
    if (/<limbCureMaimed>/i.test(note)) result.cureMaimed = true;
    item._sdLimbHealCached = result;
    return result;
};

// ============================================================================
// 5. LIMB TARGET RESOLUTION
// ============================================================================

SDLimb.resolveTarget = function(actorId, targetType) {
    var data = SDLimb.getData(actorId);
    var available = [];
    var i, key;

    // Filter to non-crippled limbs for targeting
    for (i = 0; i < LIMB_KEYS.length; i++) {
        key = LIMB_KEYS[i];
        if (!data.limbs[key].crippled) {
            available.push(key);
        }
    }
    if (available.length === 0) return null; // all crippled

    switch (targetType) {
        case 'none':
            return null;
        case 'leftarm':
            return data.limbs.leftArm.crippled ? null : 'leftArm';
        case 'rightarm':
            return data.limbs.rightArm.crippled ? null : 'rightArm';
        case 'leftleg':
            return data.limbs.leftLeg.crippled ? null : 'leftLeg';
        case 'rightleg':
            return data.limbs.rightLeg.crippled ? null : 'rightLeg';
        case 'arms':
            var arms = [];
            if (!data.limbs.leftArm.crippled) arms.push('leftArm');
            if (!data.limbs.rightArm.crippled) arms.push('rightArm');
            return arms.length > 0 ? arms[Math.floor(Math.random() * arms.length)] : null;
        case 'legs':
            var legs = [];
            if (!data.limbs.leftLeg.crippled) legs.push('leftLeg');
            if (!data.limbs.rightLeg.crippled) legs.push('rightLeg');
            return legs.length > 0 ? legs[Math.floor(Math.random() * legs.length)] : null;
        case 'weakest':
            var weakest = null;
            var minHp = 999;
            for (i = 0; i < available.length; i++) {
                key = available[i];
                if (data.limbs[key].hp < minHp) {
                    minHp = data.limbs[key].hp;
                    weakest = key;
                }
            }
            return weakest;
        case 'random':
        default:
            return available[Math.floor(Math.random() * available.length)];
    }
};

// ============================================================================
// 6. NARRATIVE MESSAGES
// ============================================================================

SDLimb.getThreshold = function(hp, maxHp) {
    if (hp <= 0) return 0;
    var pct = (hp / maxHp) * 100;
    if (pct >= THRESHOLD_HEALTHY)  return 4; // healthy
    if (pct >= THRESHOLD_WOUNDED)  return 3; // wounded
    if (pct >= THRESHOLD_SEVERE)   return 2; // severe
    if (pct >= THRESHOLD_CRITICAL) return 1; // critical
    return 0; // destroyed
};

SDLimb.showLimbMessage = function(actorName, limbKey, oldThreshold, newThreshold) {
    if (!PARAM.showNarrative) return;
    if (newThreshold >= oldThreshold) return; // no worsening
    var name = LIMB_NAMES[limbKey];
    var msg = '';
    switch (newThreshold) {
        case 3: msg = actorName + "'s " + name + ' aches from the blow.'; break;
        case 2: msg = actorName + "'s " + name + ' is seriously wounded!'; break;
        case 1: msg = actorName + "'s " + name + ' is on the verge of destruction!'; break;
        case 0: msg = actorName + "'s " + name + ' is DESTROYED!'; break;
    }
    if (msg && $gameMessage) {
        // Use battle log if in battle
        if (BattleManager._logWindow) {
            BattleManager._logWindow.push('addText', msg);
        }
    }
};

// ============================================================================
// 7. STATUS APPLICATION
// ============================================================================

SDLimb.rollChance = function(percent) {
    return Math.random() * 100 < percent;
};

SDLimb.applyInfected = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    if (limb.statuses.infected.active) {
        // Already infected — reset timer to 0 (re-infection)
        limb.statuses.infected.timer = 0;
        return;
    }
    limb.statuses.infected.active = true;
    limb.statuses.infected.timer = 0;
    SDLimb.syncMarkerStates(actorId);
};

SDLimb.applyBloodLoss = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    if (!limb.statuses.bloodLoss.active) {
        limb.statuses.bloodLoss.active = true;
        limb.statuses.bloodLoss.stacks = 1;
    } else if (limb.statuses.bloodLoss.stacks < PARAM.bloodLossMaxStacks) {
        limb.statuses.bloodLoss.stacks++;
    }
    SDLimb.syncMarkerStates(actorId);
};

SDLimb.applyMaimed = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    limb.statuses.maimed.active = true;
    limb.statuses.maimed.maxHpReduction += PARAM.maimedMaxHpReduce;
    limb.maxHp = Math.max(0, 100 - limb.statuses.maimed.maxHpReduction);
    // If maxHp dropped to 0 or below, destroy the limb
    if (limb.maxHp <= 0) {
        limb.hp = 0;
        SDLimb.triggerCrippled(actorId, limbKey);
    } else if (limb.hp > limb.maxHp) {
        limb.hp = limb.maxHp;
    }
    SDLimb.syncMarkerStates(actorId);
};

SDLimb.applyMalformed = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    var roll = Math.floor(Math.random() * 4) + 1;
    var hpMod = 0, atkMod = 0;
    switch (roll) {
        case 1: hpMod = 15;  atkMod = -5; break; // Swelling
        case 2: hpMod = -15; atkMod = 5;  break; // Fracture
        case 3: hpMod = 10;  atkMod = 3;  break; // Mutation
        case 4: hpMod = -20; atkMod = -8; break; // Necrosis
    }
    // Remove previous malformed atkMod from actor
    var actor = $gameActors.actor(actorId);
    if (actor && limb.statuses.malformed.active) {
        // Undo old atkMod — handled via paramPlus override
    }
    limb.statuses.malformed.active = true;
    limb.statuses.malformed.hpMod = hpMod;
    limb.statuses.malformed.atkMod = atkMod;

    // Apply hpMod to limb HP
    limb.hp = Math.min(limb.hp + hpMod, limb.maxHp);
    if (limb.hp <= 0) {
        limb.hp = 0;
        SDLimb.triggerCrippled(actorId, limbKey);
    }
    SDLimb.syncMarkerStates(actorId);
};

// ============================================================================
// 8. CRIPPLED CASCADE
// ============================================================================

SDLimb.triggerCrippled = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    if (limb.crippled) return; // already crippled

    limb.crippled = true;
    limb.hp = 0;

    var actor = $gameActors.actor(actorId);
    if (!actor) return;

    // 1. Apply State 11 (Crippled) to actor
    actor.addState(PARAM.stCrippled);

    // 2. 100% Infected on this limb
    SDLimb.applyInfected(actorId, limbKey);

    // 3. 100% Blood Loss (1 stack)
    SDLimb.applyBloodLoss(actorId, limbKey);

    // 4. Force unequip blocked slot
    SDLimb.forceUnequipForLimb(actorId, limbKey);

    // 5. Narrative
    if (PARAM.showNarrative && BattleManager._logWindow) {
        var name = actor.name();
        var limbName = LIMB_NAMES[limbKey];
        BattleManager._logWindow.push('addText', name + "'s " + limbName + ' is DESTROYED!');
    }

    // 6. Check for 4 crippled limbs → knockout
    var crippledCount = SDLimb.countCrippledLimbs(actorId);
    if (crippledCount >= 4) {
        actor.setHp(0);
        actor.addState(1); // Knockout
    }

    SDLimb.syncVariables();
    SDLimb.syncMarkerStates(actorId);
};

SDLimb.forceUnequipForLimb = function(actorId, limbKey) {
    var actor = $gameActors.actor(actorId);
    if (!actor) return;
    // Mapping: which equip slot to force-unequip
    // leftArm → slot 0 (weapon), rightArm → slot 1 (shield)
    // legs → accessory slot 4
    var slotId = -1;
    if (limbKey === 'leftArm')  slotId = 0; // Weapon
    if (limbKey === 'rightArm') slotId = 1; // Shield
    if (limbKey === 'leftLeg' || limbKey === 'rightLeg') slotId = 4; // Accessory

    if (slotId >= 0 && actor.equips()[slotId]) {
        actor.changeEquip(slotId, null);
    }
};

// ============================================================================
// 9. MARKER STATE SYNC
// ============================================================================

SDLimb.syncMarkerStates = function(actorId) {
    var actor = $gameActors.actor(actorId);
    if (!actor) return;

    // Infected marker
    if (SDLimb.hasAnyStatus(actorId, 'infected')) {
        if (!actor.isStateAffected(PARAM.stInfected)) actor.addState(PARAM.stInfected);
    } else {
        actor.removeState(PARAM.stInfected);
    }
    // Blood Loss marker
    if (SDLimb.hasAnyStatus(actorId, 'bloodLoss')) {
        if (!actor.isStateAffected(PARAM.stBloodLoss)) actor.addState(PARAM.stBloodLoss);
    } else {
        actor.removeState(PARAM.stBloodLoss);
    }
    // Maimed marker
    if (SDLimb.hasAnyStatus(actorId, 'maimed')) {
        if (!actor.isStateAffected(PARAM.stMaimed)) actor.addState(PARAM.stMaimed);
    } else {
        actor.removeState(PARAM.stMaimed);
    }
    // Malformed marker
    if (SDLimb.hasAnyStatus(actorId, 'malformed')) {
        if (!actor.isStateAffected(PARAM.stMalformed)) actor.addState(PARAM.stMalformed);
    } else {
        actor.removeState(PARAM.stMalformed);
    }
    // Crippled — check if any limb is crippled
    if (SDLimb.countCrippledLimbs(actorId) > 0) {
        if (!actor.isStateAffected(PARAM.stCrippled)) actor.addState(PARAM.stCrippled);
    } else {
        actor.removeState(PARAM.stCrippled);
    }
};

// ============================================================================
// 10. CORE DAMAGE APPLICATION
// ============================================================================

SDLimb.applyLimbDamage = function(target, skill, hpDamage) {
    if (!target.isActor()) return;
    var actorId = target.actorId();
    var targetType = SDLimb.parseLimbTarget(skill);
    var limbKey = SDLimb.resolveTarget(actorId, targetType);
    if (!limbKey) return; // no valid limb to target

    var limb = SDLimb.getLimb(actorId, limbKey);
    if (limb.crippled) return; // already destroyed

    // Calculate limb damage
    var limbDamage = Math.floor(hpDamage * PARAM.limbDamageRatio);
    if (limbDamage <= 0) limbDamage = 1; // minimum 1

    // Modifiers
    if (limb.statuses.maimed.active) {
        limbDamage = Math.floor(limbDamage * 1.5);
    }
    // Critical hit check — use the action's critical flag
    if (target._lastActionCritical) {
        limbDamage = Math.floor(limbDamage * 2.0);
    }

    // Record old threshold for narrative
    var oldThreshold = SDLimb.getThreshold(limb.hp, limb.maxHp);

    // Apply damage
    limb.hp = Math.max(0, limb.hp - limbDamage);

    // Mirror sync for temp variables
    $gameVariables.setValue(6, limbDamage);
    var limbIndex = LIMB_KEYS.indexOf(limbKey) + 1;
    $gameVariables.setValue(7, limbIndex);

    // Check destruction
    if (limb.hp <= 0) {
        SDLimb.triggerCrippled(actorId, limbKey);
    } else {
        // Check status chances
        // Infected
        var infChance = limb.statuses.maimed.active ? PARAM.infectionMaimedChance : PARAM.infectionBaseChance;
        if (SDLimb.rollChance(infChance)) {
            SDLimb.applyInfected(actorId, limbKey);
        }
        // Blood Loss — only if HP < 50%
        if (limb.hp < limb.maxHp * 0.5) {
            var blChance = limb.hp < limb.maxHp * 0.25 ? 40 : 20;
            if (SDLimb.rollChance(blChance)) {
                SDLimb.applyBloodLoss(actorId, limbKey);
            }
        }
        // Maimed — if single hit >= threshold
        if (limbDamage >= PARAM.maimedThreshold) {
            SDLimb.applyMaimed(actorId, limbKey);
        }
        // Malformed
        if (SDLimb.rollChance(PARAM.malformedChance)) {
            SDLimb.applyMalformed(actorId, limbKey);
        }
    }

    // Narrative message
    var newThreshold = SDLimb.getThreshold(limb.hp, limb.maxHp);
    SDLimb.showLimbMessage(target.name(), limbKey, oldThreshold, newThreshold);

    // Sync variables
    SDLimb.syncVariables();
};

// ============================================================================
// 11. HOOKS — DAMAGE
// ============================================================================

var _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
Game_Action.prototype.executeHpDamage = function(target, value) {
    // Store critical flag on target for limb system to read
    target._lastActionCritical = this._critical || false;
    _Game_Action_executeHpDamage.call(this, target, value);
    if (target.isActor() && value > 0) {
        SDLimb.applyLimbDamage(target, this.item(), value);
    }
};

// ============================================================================
// 12. HOOKS — TURN END (status ticking in battle)
// ============================================================================

var _Game_Battler_onTurnEnd = Game_Battler.prototype.onTurnEnd;
Game_Battler.prototype.onTurnEnd = function() {
    _Game_Battler_onTurnEnd.call(this);
    if (this.isActor()) {
        SDLimb.processActorTurnEnd(this);
    }
};

SDLimb.processActorTurnEnd = function(actor) {
    var actorId = actor.actorId();
    var data = SDLimb.getData(actorId);
    var totalBloodLossStacks = 0;

    for (var i = 0; i < LIMB_KEYS.length; i++) {
        var key = LIMB_KEYS[i];
        var limb = data.limbs[key];

        // Infection tick
        if (limb.statuses.infected.active) {
            limb.statuses.infected.timer++;
            if (limb.statuses.infected.timer >= PARAM.infectionPoisonAt &&
                limb.statuses.infected.timer < PARAM.infectionKillTimer) {
                // Apply Poison state
                if (!actor.isStateAffected(PARAM.stPoison)) {
                    actor.addState(PARAM.stPoison);
                }
            }
            if (limb.statuses.infected.timer >= PARAM.infectionKillTimer) {
                // Kill actor from infection
                if (PARAM.showNarrative && BattleManager._logWindow) {
                    BattleManager._logWindow.push('addText',
                        actor.name() + ' succumbs to infection!');
                }
                actor.setHp(0);
                actor.addState(1); // Knockout
                break; // Actor is dead, stop processing
            }
        }

        // Blood Loss stacks accumulation
        if (limb.statuses.bloodLoss.active) {
            totalBloodLossStacks += limb.statuses.bloodLoss.stacks;
        }
    }

    // Apply blood loss drain (all stacks combined)
    if (totalBloodLossStacks > 0 && actor.hp > 0) {
        var drain = Math.floor(actor.mhp * PARAM.bloodLossBattleDrain * totalBloodLossStacks);
        drain = Math.max(1, drain);
        var newHp = Math.max(1, actor.hp - drain); // Blood loss doesn't kill (min 1 HP)
        actor.setHp(newHp);
        if (PARAM.showNarrative && BattleManager._logWindow) {
            BattleManager._logWindow.push('addText',
                actor.name() + ' bleeds... (-' + drain + ' HP)');
        }
    }

    SDLimb.syncVariables();
};

// ============================================================================
// 13. HOOKS — MAP REGENERATION & STATUS TICKING
// ============================================================================

var _Game_Party_onPlayerWalk = Game_Party.prototype.onPlayerWalk;
Game_Party.prototype.onPlayerWalk = function() {
    _Game_Party_onPlayerWalk.call(this);
    SDLimb.processMapStep();
};

SDLimb._stepAccumulator = 0;

SDLimb.processMapStep = function() {
    SDLimb._stepAccumulator++;
    if (SDLimb._stepAccumulator < PARAM.regenSteps) return;
    SDLimb._stepAccumulator = 0;

    // Process every N steps
    var members = $gameParty.allMembers();
    for (var m = 0; m < members.length; m++) {
        var actor = members[m];
        var actorId = actor.actorId();
        var data = SDLimb.getData(actorId);
        var totalBloodLossStacks = 0;

        for (var i = 0; i < LIMB_KEYS.length; i++) {
            var key = LIMB_KEYS[i];
            var limb = data.limbs[key];

            // Infection map tick
            if (limb.statuses.infected.active) {
                // Infection ticks every 2 regen cycles on map (100 steps)
                // We use a sub-counter. On map, tick every other regen cycle.
                if (!limb.statuses.infected._mapSubTick) {
                    limb.statuses.infected._mapSubTick = 0;
                }
                limb.statuses.infected._mapSubTick++;
                if (limb.statuses.infected._mapSubTick >= 2) {
                    limb.statuses.infected._mapSubTick = 0;
                    limb.statuses.infected.timer++;
                    if (limb.statuses.infected.timer >= PARAM.infectionKillTimer) {
                        actor.setHp(0);
                        actor.addState(1);
                    } else if (limb.statuses.infected.timer >= PARAM.infectionPoisonAt) {
                        if (!actor.isStateAffected(PARAM.stPoison)) {
                            actor.addState(PARAM.stPoison);
                        }
                    }
                }
            }

            // Blood loss accumulation
            if (limb.statuses.bloodLoss.active) {
                totalBloodLossStacks += limb.statuses.bloodLoss.stacks;
            }

            // Regeneration (only non-crippled, non-infected limbs)
            if (!limb.crippled && limb.hp < limb.maxHp) {
                if (limb.statuses.infected.active) {
                    // Blocked by infection
                } else if (limb.statuses.bloodLoss.active) {
                    // Slowed: 1 HP per 2 regen cycles (100 steps)
                    if (!limb._regenSubTick) limb._regenSubTick = 0;
                    limb._regenSubTick++;
                    if (limb._regenSubTick >= 2) {
                        limb._regenSubTick = 0;
                        limb.hp = Math.min(limb.hp + 1, limb.maxHp);
                    }
                } else {
                    // Normal regen: 1 HP per cycle
                    limb.hp = Math.min(limb.hp + 1, limb.maxHp);
                }
            }
        }

        // Blood loss map drain
        if (totalBloodLossStacks > 0 && actor.hp > 1) {
            var drain = Math.floor(actor.mhp * PARAM.bloodLossMapDrain * totalBloodLossStacks);
            drain = Math.max(1, drain);
            var newHp = Math.max(1, actor.hp - drain);
            actor.setHp(newHp);
        }
    }

    SDLimb.syncVariables();
};

// ============================================================================
// 14. HOOKS — EQUIP LOCK
// ============================================================================

var _Game_Actor_isEquipChangeOk = Game_Actor.prototype.isEquipChangeOk;
Game_Actor.prototype.isEquipChangeOk = function(slotId) {
    if (!_Game_Actor_isEquipChangeOk.call(this, slotId)) return false;

    var actorId = this.actorId();
    if (!$gameSystem._limbData || !$gameSystem._limbData[actorId]) return true;

    var data = SDLimb.getData(actorId);
    // Slot 0 (Weapon) blocked by left arm crippled
    if (slotId === 0 && data.limbs.leftArm.crippled) return false;
    // Slot 1 (Shield) blocked by right arm crippled
    if (slotId === 1 && data.limbs.rightArm.crippled) return false;
    // Slot 4 (Accessory) blocked by both legs crippled
    if (slotId === 4 && (data.limbs.leftLeg.crippled || data.limbs.rightLeg.crippled)) return false;

    return true;
};

// ============================================================================
// 15. HOOKS — CRIPPLED STAT SCALING (multi-limb loss)
// ============================================================================

var _Game_Actor_paramPlus = Game_Actor.prototype.paramPlus;
Game_Actor.prototype.paramPlus = function(paramId) {
    var value = _Game_Actor_paramPlus.call(this, paramId);
    var actorId = this.actorId();
    if (!$gameSystem || !$gameSystem._limbData || !$gameSystem._limbData[actorId]) {
        return value;
    }

    var crippledCount = SDLimb.countCrippledLimbs(actorId);
    var data = SDLimb.getData(actorId);

    // ATK scaling from crippled limbs (Section 6.5)
    if (paramId === 2) { // ATK
        if (crippledCount === 2) {
            value = Math.floor(value * 0.7);
        } else if (crippledCount >= 3) {
            value = Math.floor(value * 0.5);
        }
    }
    // AGI scaling from 3+ crippled (Section 6.5)
    if (paramId === 6) { // AGI
        if (crippledCount >= 3) {
            value = Math.floor(value * 0.5);
        }
    }

    // Malformed ATK modifier (sum from all limbs)
    if (paramId === 2) { // ATK
        for (var i = 0; i < LIMB_KEYS.length; i++) {
            var limb = data.limbs[LIMB_KEYS[i]];
            if (limb.statuses.malformed && limb.statuses.malformed.active) {
                value += limb.statuses.malformed.atkMod;
            }
        }
    }

    return value;
};

// ============================================================================
// 16. HOOKS — ENEMY BODY PARTS (head-kill, limb-kill)
// ============================================================================

var _Game_Enemy_die = Game_Enemy.prototype.die;
Game_Enemy.prototype.die = function() {
    var bodyPart = SDLimb.parseBodyPart(this);

    _Game_Enemy_die.call(this);

    if (bodyPart === 'head') {
        SDLimb.headKill(this);
    } else if (bodyPart === 'limb') {
        SDLimb.limbKill(this);
    }
};

SDLimb.headKill = function(deadEnemy) {
    // Kill all other enemies in the troop
    var members = $gameTroop.members();
    for (var i = 0; i < members.length; i++) {
        var enemy = members[i];
        if (enemy !== deadEnemy && enemy.isAlive()) {
            enemy.setHp(0);
            enemy.addState(1); // Knockout
        }
    }
    if (PARAM.showNarrative && BattleManager._logWindow) {
        BattleManager._logWindow.push('addText',
            'The head is severed! The body goes limp.');
    }
};

SDLimb.limbKill = function(deadEnemy) {
    // Debuff remaining enemies: ATK -15% via buff manipulation
    var members = $gameTroop.members();
    for (var i = 0; i < members.length; i++) {
        var enemy = members[i];
        if (enemy !== deadEnemy && enemy.isAlive()) {
            // Apply ATK debuff (paramId 2)
            enemy.addDebuff(2, 5); // 5 turns
        }
    }
    if (PARAM.showNarrative && BattleManager._logWindow) {
        BattleManager._logWindow.push('addText',
            'A limb is torn off! The creature weakens.');
    }
};

// ============================================================================
// 17. HOOKS — ITEM/SKILL HEALING
// ============================================================================

var _Game_Action_apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target) {
    _Game_Action_apply.call(this, target);
    if (target.isActor()) {
        SDLimb.processHealingItem(target, this.item());
    }
};

SDLimb.processHealingItem = function(actor, item) {
    var heal = SDLimb.parseLimbHeal(item);
    if (!heal) return;
    var actorId = actor.actorId();
    var data = SDLimb.getData(actorId);
    var i, key, limb;

    // <limbHeal: N> — heal most damaged non-crippled limb
    if (heal.heal > 0) {
        var worstKey = null;
        var worstHp = 999;
        for (i = 0; i < LIMB_KEYS.length; i++) {
            key = LIMB_KEYS[i];
            limb = data.limbs[key];
            if (!limb.crippled && limb.hp < limb.maxHp && limb.hp < worstHp) {
                worstHp = limb.hp;
                worstKey = key;
            }
        }
        if (worstKey) {
            data.limbs[worstKey].hp = Math.min(data.limbs[worstKey].hp + heal.heal, data.limbs[worstKey].maxHp);
        }
    }

    // <limbHealAll: N> — heal all non-crippled limbs
    if (heal.healAll > 0) {
        for (i = 0; i < LIMB_KEYS.length; i++) {
            key = LIMB_KEYS[i];
            limb = data.limbs[key];
            if (!limb.crippled) {
                limb.hp = Math.min(limb.hp + heal.healAll, limb.maxHp);
            }
        }
    }

    // <limbCureInfection> — cure infection on most infected limb
    if (heal.cureInfection) {
        var worstInfKey = null;
        var worstTimer = -1;
        for (i = 0; i < LIMB_KEYS.length; i++) {
            key = LIMB_KEYS[i];
            limb = data.limbs[key];
            if (limb.statuses.infected.active && limb.statuses.infected.timer > worstTimer) {
                worstTimer = limb.statuses.infected.timer;
                worstInfKey = key;
            }
        }
        if (worstInfKey) {
            data.limbs[worstInfKey].statuses.infected.active = false;
            data.limbs[worstInfKey].statuses.infected.timer = 0;
        }
    }

    // <limbCureBloodLoss: N> — remove N stacks from most bleeding limb
    if (heal.cureBloodLoss > 0) {
        var worstBlKey = null;
        var worstStacks = 0;
        for (i = 0; i < LIMB_KEYS.length; i++) {
            key = LIMB_KEYS[i];
            limb = data.limbs[key];
            if (limb.statuses.bloodLoss.active && limb.statuses.bloodLoss.stacks > worstStacks) {
                worstStacks = limb.statuses.bloodLoss.stacks;
                worstBlKey = key;
            }
        }
        if (worstBlKey) {
            data.limbs[worstBlKey].statuses.bloodLoss.stacks -= heal.cureBloodLoss;
            if (data.limbs[worstBlKey].statuses.bloodLoss.stacks <= 0) {
                data.limbs[worstBlKey].statuses.bloodLoss.active = false;
                data.limbs[worstBlKey].statuses.bloodLoss.stacks = 0;
            }
        }
    }

    // <limbCureMaimed> — remove maimed from most damaged maimed limb
    if (heal.cureMaimed) {
        var worstMKey = null;
        var worstMReduce = 0;
        for (i = 0; i < LIMB_KEYS.length; i++) {
            key = LIMB_KEYS[i];
            limb = data.limbs[key];
            if (limb.statuses.maimed.active && limb.statuses.maimed.maxHpReduction > worstMReduce) {
                worstMReduce = limb.statuses.maimed.maxHpReduction;
                worstMKey = key;
            }
        }
        if (worstMKey) {
            data.limbs[worstMKey].statuses.maimed.active = false;
            data.limbs[worstMKey].statuses.maimed.maxHpReduction = 0;
            data.limbs[worstMKey].maxHp = 100;
        }
    }

    SDLimb.syncMarkerStates(actorId);
    SDLimb.syncVariables();
};

// ============================================================================
// 18. HOOKS — BATTLE END (sync)
// ============================================================================

var _BattleManager_endBattle = BattleManager.endBattle;
BattleManager.endBattle = function(result) {
    _BattleManager_endBattle.call(this, result);
    SDLimb.syncVariables();
};

// ============================================================================
// 19. HOOKS — SAVE/LOAD MIGRATION
// ============================================================================

var _DataManager_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function(contents) {
    _DataManager_extractSaveContents.call(this, contents);
    // Migration from old variable-based saves
    if (!$gameSystem._limbData) {
        if ($gameParty && $gameParty.leader()) {
            var leaderId = $gameParty.leader().actorId();
            var data = SDLimb.createDefaultData(leaderId);
            var v1 = $gameVariables.value(1);
            var v2 = $gameVariables.value(2);
            var v3 = $gameVariables.value(3);
            var v4 = $gameVariables.value(4);
            // Only migrate if variables have been initialized (not all zero from fresh)
            if (v1 > 0 || v2 > 0 || v3 > 0 || v4 > 0) {
                data.limbs.leftArm.hp  = Math.max(0, Math.min(100, v1));
                data.limbs.rightArm.hp = Math.max(0, Math.min(100, v2));
                data.limbs.leftLeg.hp  = Math.max(0, Math.min(100, v3));
                data.limbs.rightLeg.hp = Math.max(0, Math.min(100, v4));
                // Check for crippled limbs from migration
                for (var i = 0; i < LIMB_KEYS.length; i++) {
                    if (data.limbs[LIMB_KEYS[i]].hp <= 0) {
                        data.limbs[LIMB_KEYS[i]].crippled = true;
                        data.limbs[LIMB_KEYS[i]].hp = 0;
                    }
                }
            }
            $gameSystem._limbData = {};
            $gameSystem._limbData[leaderId] = data;
        }
    }
    SDLimb.syncVariables();
};

// ============================================================================
// 20. FUTURE: RESTORE LIMB (not called in v1.0)
// ============================================================================

SDLimb.restoreLimb = function(actorId, limbKey) {
    var limb = SDLimb.getLimb(actorId, limbKey);
    if (!limb.crippled) return false;

    limb.crippled = false;
    limb.hp = 1; // Restored but barely
    limb.maxHp = 100;
    limb.statuses = SDLimb.createDefaultStatuses();

    var actor = $gameActors.actor(actorId);
    // Remove Crippled state if no limbs are crippled anymore
    if (actor && SDLimb.countCrippledLimbs(actorId) === 0) {
        actor.removeState(PARAM.stCrippled);
    }
    SDLimb.syncMarkerStates(actorId);
    SDLimb.syncVariables();
    return true;
};

// ============================================================================
// 21. PLUGIN COMMANDS
// ============================================================================

var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command.toLowerCase() !== 'sdlimb') return;

    var sub = (args[0] || '').toLowerCase();
    switch (sub) {
        case 'restore':
            var rActorId = parseInt(args[1]);
            var rLimb = args[2] || '';
            SDLimb.restoreLimb(rActorId, rLimb);
            break;
        case 'damage':
            var dActorId = parseInt(args[1]);
            var dLimb = args[2] || '';
            var dAmount = parseInt(args[3] || '0');
            if (dLimb && dAmount > 0) {
                var dl = SDLimb.getLimb(dActorId, dLimb);
                if (dl && !dl.crippled) {
                    dl.hp = Math.max(0, dl.hp - dAmount);
                    if (dl.hp <= 0) {
                        SDLimb.triggerCrippled(dActorId, dLimb);
                    }
                    SDLimb.syncVariables();
                }
            }
            break;
        case 'status':
            var sActorId = parseInt(args[1]);
            var sLimb = args[2] || '';
            var sName = (args[3] || '').toLowerCase();
            if (sName === 'infected') SDLimb.applyInfected(sActorId, sLimb);
            if (sName === 'bloodloss') SDLimb.applyBloodLoss(sActorId, sLimb);
            if (sName === 'maimed') SDLimb.applyMaimed(sActorId, sLimb);
            if (sName === 'malformed') SDLimb.applyMalformed(sActorId, sLimb);
            break;
        case 'debug':
            if ($gameSystem._limbData) {
                console.log('=== SD Limb System Debug ===');
                console.log(JSON.stringify($gameSystem._limbData, null, 2));
            } else {
                console.log('SD Limb System: No data initialized.');
            }
            break;
    }
};

// ============================================================================
// END
// ============================================================================

})();

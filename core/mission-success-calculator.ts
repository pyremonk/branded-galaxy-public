/**
 * MissionSuccessCalculator — Pure function mission probability engine.
 *
 * Calculates mission success probability from character stats, opposition
 * resistance, and faction modifiers. Stateless and independently testable.
 *
 * Spec: 011-mission-success-calculation-spec.md
 */

import { SeededRandom } from './seeded-random.js';

// FR-MSC-001: Mission type → stat mapping
export const MISSION_STAT_MAP = {
  'diplomatic':        { primary: 'diplomacy',  secondary: 'leadership' },
  'diplomacy':         { primary: 'diplomacy',  secondary: 'leadership' },
  'espionage':         { primary: 'espionage',  secondary: null },
  'sabotage':          { primary: 'espionage',  secondary: 'combat' },
  'recruitment':       { primary: 'diplomacy',  secondary: null },
  'research-assist':   { primary: 'research',   secondary: 'diplomacy' },
  'incite-uprising':   { primary: 'diplomacy',  secondary: 'espionage' },
  'abduction':         { primary: 'espionage',  secondary: 'combat' },
  'assassination':     { primary: 'espionage',  secondary: 'combat' },
  'reconnaissance':    { primary: 'espionage',  secondary: null },
  'rescue':            { primary: 'combat',     secondary: 'espionage' }
};

// FR-MSC-004: Faction-level mission modifiers (from faction definitions)
const FACTION_MISSION_MODIFIERS = {
  brandAuthority: { sabotage: -0.10 },
  union:          { _lowLoyaltyEnemySystem: +0.05 },  // +0.05 on missions in enemy systems w/ loyalty < 50%
  autoforge:      { espionage: +0.05 }               // only with droid-interface chars
};

// FR-MSC-005: XP rewards by outcome tier
export const OUTCOME_XP = {
  'critical-success': 25,
  'success':          15,
  'failure':          5,
  'critical-failure': 0
};

/**
 * Calculate the success probability for a mission.
 *
 * @param {Object} params
 * @param {Object}  params.leadCharacter       - Lead character (must have .stats and .specializations)
 * @param {Object}  [params.supportCharacter]  - Optional support character (for 2-char missions)
 * @param {string}  params.missionType         - Key from MISSION_STAT_MAP
 * @param {number}  [params.oppositionResistance=3] - System resistance value (0–10)
 * @param {string}  params.factionId           - Attacking faction ID
 * @param {boolean} [params.isEnemySystem=false]
 * @param {number}  [params.enemySystemLoyalty=100] - Loyalty % of defending faction in this system
 * @param {boolean} [params.enemySpyNetworkActive=false]
 * @param {Object}  [params.characterStateManager] - CharacterStateManager for effective stat lookups
 * @returns {{
 *   baseProbability: number,
 *   finalProbability: number,
 *   factors: Object[],
 *   missionType: string,
 *   primaryStat: string,
 *   secondaryStat: string|null
 * }}
 */
export function calculateMissionProbability(params: any) {
  const {
    leadCharacter,
    supportCharacter = null,
    missionType,
    oppositionResistance = 3,
    factionId,
    isEnemySystem = false,
    enemySystemLoyalty = 100,
    enemySpyNetworkActive = false,
    characterStateManager = null
  } = params;

  const mapping = (MISSION_STAT_MAP as Record<string, any>)[missionType] ?? (MISSION_STAT_MAP as Record<string, any>)['espionage'];
  const { primary: primaryStat, secondary: secondaryStat } = mapping;

  const factors = [];

  // ── Effective stats (with specialization bonuses) ──
  const context = {
    missionType,
    isEnemySystem,
    factionId
  };

  const primaryStatValue = _getEffectiveStat(
    leadCharacter, primaryStat, context, characterStateManager
  );

  // FR-MSC-002: base_prob = (effective_stat / 10) × 0.6 + 0.2
  let probability = (primaryStatValue / 10) * 0.6 + 0.2;
  factors.push({ label: `${primaryStat} (${primaryStatValue})`, delta: probability });

  // Secondary stat modifier
  if (secondaryStat) {
    const sourceChar = supportCharacter ?? leadCharacter;
    const secStatValue = _getEffectiveStat(sourceChar, secondaryStat, context, characterStateManager);
    const secMod = (secStatValue / 10) * 0.15;
    probability += secMod;
    factors.push({ label: `${secondaryStat} bonus (${secStatValue})`, delta: secMod });
  }

  const baseProbability = probability;

  // FR-MSC-003: Opposition Resistance
  const resistancePenalty = (Math.max(0, Math.min(10, oppositionResistance)) / 10) * 0.35;
  probability -= resistancePenalty;
  if (resistancePenalty !== 0) {
    factors.push({ label: `Opposition resistance (${oppositionResistance})`, delta: -resistancePenalty });
  }

  // FR-MSC-004: Faction modifiers
  const factionMods = (FACTION_MISSION_MODIFIERS as Record<string, any>)[factionId] ?? {};

  // Brand Authority sabotage penalty
  if (factionMods.sabotage !== undefined && missionType === 'sabotage') {
    probability += factionMods.sabotage;
    factors.push({ label: 'Brand Authority sabotage restriction', delta: factionMods.sabotage });
  }

  // Union low-loyalty enemy-system bonus
  if (factionMods._lowLoyaltyEnemySystem !== undefined && isEnemySystem && enemySystemLoyalty < 50) {
    probability += factionMods._lowLoyaltyEnemySystem;
    factors.push({ label: 'Union: enemy system low loyalty', delta: factionMods._lowLoyaltyEnemySystem });
  }

  // Autoforge droid-interface espionage bonus
  if (factionId === 'autoforge' && (missionType === 'espionage' || missionType === 'reconnaissance')) {
    const hasDroidInterface = leadCharacter?.specializations?.includes('droid-interface');
    if (hasDroidInterface) {
      const bonus = factionMods.espionage ?? 0.05;
      probability += bonus;
      factors.push({ label: 'Autoforge: droid-interface espionage', delta: bonus });
    }
  }

  // FR-MSC-007: Multi-character level bonus
  if (supportCharacter) {
    const avgLevel = ((leadCharacter?.level ?? 1) + (supportCharacter?.level ?? 1)) / 2;
    const levelBonus = (avgLevel - 1) * 0.01;
    if (levelBonus > 0) {
      probability += levelBonus;
      factors.push({ label: `Multi-char level bonus (avg ${avgLevel.toFixed(1)})`, delta: levelBonus });
    }
  }

  // Clamp to [0.05, 0.95]
  const finalProbability = Math.max(0.05, Math.min(0.95, probability));

  return {
    baseProbability,
    finalProbability,
    factors,
    missionType,
    primaryStat,
    secondaryStat
  };
}

/**
 * Roll the mission outcome using seeded randomness.
 *
 * @param {Object} calcResult     - Result from calculateMissionProbability()
 * @param {number} turnNumber     - For seed construction
 * @param {string} missionId      - For seed construction
 * @param {string} characterId    - For seed construction
 * @param {boolean} [enemySpyNetworkActive=false]
 * @param {string[]} [specializations=[]] - Lead character specializations (for detection roll)
 * @returns {{
 *   tier: 'critical-success'|'success'|'failure'|'critical-failure',
 *   roll: number,
 *   xpReward: number,
 *   detected: boolean,
 *   captureRisk: boolean
 * }}
 */
export function rollMissionOutcome(calcResult: any, turnNumber: any, missionId: any, characterId: any, enemySpyNetworkActive = false, specializations = []) {
  const seed = `${turnNumber}-${missionId}-${characterId}`;
  const rng = new SeededRandom(seed);
  const roll = rng.next();

  const prob = calcResult.finalProbability;

  // FR-MSC-005: Outcome tier determination
  let tier;
  if (roll < prob * 0.15) {
    tier = 'critical-success';
  } else if (roll < prob) {
    tier = 'success';
  } else if (roll < prob + 0.20) {
    tier = 'failure';
  } else {
    tier = 'critical-failure';
  }

  const xpReward = (OUTCOME_XP as Record<string, number>)[tier];
  const captureRisk = tier === 'critical-failure';

  // FR-MSC-006: Detection probability
  let detected = false;
  if (tier === 'failure' || tier === 'critical-failure') {
    let detectionBase = tier === 'failure' ? 0.25 : 0.75;
    if (enemySpyNetworkActive) detectionBase += 0.15;
    const hasStealthSpec = specializations.some(s => s === 'covert-ops' || s === 'assassin');
    if (hasStealthSpec) detectionBase -= 0.10;
    detectionBase = Math.max(0, Math.min(1, detectionBase));
    detected = rng.chance(detectionBase);
  }

  return { tier, roll, xpReward, detected, captureRisk };
}

/**
 * Calculate opposition resistance for a system.
 *
 * @param {Object} system        - Galaxy system object
 * @param {string} attackingFactionId
 * @param {Object} [context={}]  - { enemyFleetCount?, enemySpyNetworkActive? }
 * @returns {number} Resistance value (0–10)
 */
export function calculateOppositionResistance(system: any, attackingFactionId: any, context = {}) {
  const systemFaction = system?.loyalty;
  if (!systemFaction || systemFaction === 'neutral' || systemFaction === attackingFactionId) {
    return 0;
  }

  let resistance = system.baseResistance ?? 3;

  // +2 per enemy fleet present
  const enemyFleetCount = (context as any).enemyFleetCount ?? 0;
  resistance += enemyFleetCount * 2;

  // +3 if homeworld
  if (system.isHomeworld) resistance += 3;

  // +2 if enemy spy network active
  if ((context as any).enemySpyNetworkActive) resistance += 2;

  // -2 if low loyalty (enemy faction's hold is weak)
  const loyaltyValue = system.loyaltyValue ?? system.loyaltyScore ?? 75;
  if (loyaltyValue <= 30) resistance -= 2;

  return Math.max(0, Math.min(10, resistance));
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _getEffectiveStat(character: any, statName: any, context: any, characterStateManager: any) {
  if (!character) return 1;

  if (characterStateManager && character.id) {
    return characterStateManager.getEffectiveStat(character.id, statName, context);
  }

  // Inline fallback if no state manager provided
  const base = character.stats?.[statName] ?? 1;
  let bonus = 0;
  for (const tag of (character.specializations ?? [])) {
    if (tag === 'covert-ops'      && statName === 'espionage'  && ['sabotage','infiltration'].includes(context.missionType)) bonus += 2;
    if (tag === 'negotiator'      && statName === 'diplomacy'  && ['loyalty','negotiation','diplomatic'].includes(context.missionType)) bonus += 2;
    if (tag === 'fleet-commander' && statName === 'leadership' && context.isFleetCommander) bonus += 2;
    if (tag === 'researcher'      && statName === 'research'   && context.facilityType === 'research') bonus += 2;
    if (tag === 'recruiter'       && statName === 'diplomacy'  && context.missionType === 'recruitment') bonus += 2;
    if (tag === 'assassin'        && statName === 'espionage'  && ['assassination','abduction'].includes(context.missionType)) bonus += 2;
    if (tag === 'guerrilla'       && statName === 'combat'     && context.isEnemySystem) bonus += 2;
    if (tag === 'droid-interface' && statName === 'espionage') bonus += 2;
  }
  return base + bonus;
}

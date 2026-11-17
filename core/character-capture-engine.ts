/**
 * CharacterCaptureEngine — Capture probability, rescue, execution, intel leakage.
 *
 * Pure calculation and event-firing logic for the capture & rescue lifecycle.
 * Works alongside CharacterStateManager (which owns the state mutations).
 *
 * Spec: 012-character-capture-rescue-spec.md
 */

import { SeededRandom } from './seeded-random.js';

// FR-CCR-002: Base capture probabilities by trigger
const BASE_CAPTURE_PROBABILITY = {
  'critical-mission-failure': 0.50,
  'fleet-destruction':        0.30,
  'system-invasion':          0.40
};

// FR-CCR-007: Influence change on execution
const EXECUTION_INFLUENCE_PENALTY = 50;   // Owning faction loses 50 influence
const EXECUTION_HIGH_STAT_BONUS   = 20;   // Capturing faction gains 20 influence if avg stat ≥ 7

// Average stat threshold for "high-stat" execution bonus
const HIGH_STAT_THRESHOLD = 7;

export class CharacterCaptureEngine {
  // ─── Capture Probability ─────────────────────────────────────────────────────

  /**
   * Calculate capture probability for a character.
   * FR-CCR-002
   *
   * @param {Object} character         - Character object with .stats and .specializations
   * @param {string} captureType       - 'critical-mission-failure' | 'fleet-destruction' | 'system-invasion'
   * @param {Object} [context={}]      - { enemySpyNetworkActive?: boolean }
   * @returns {number} Clamped probability [0.05, 0.90]
   */
  calculateCaptureProbability(character: any, captureType: any, context = {}) {
    let prob = (BASE_CAPTURE_PROBABILITY as Record<string, number>)[captureType] ?? 0.50;

    // -5% per Combat point above 5
    const combatAbove5 = Math.max(0, (character.stats?.combat ?? 5) - 5);
    prob -= combatAbove5 * 0.05;

    // +10% if enemy spy network active
    if ((context as any).enemySpyNetworkActive) {
      prob += 0.10;
    }

    // -10% if character has covert-ops, guerrilla, or assassin specialization
    const hasEvasionSpec = (character.specializations ?? []).some(
      (s: any) => s === 'covert-ops' || s === 'guerrilla' || s === 'assassin'
    );
    if (hasEvasionSpec) {
      prob -= 0.10;
    }

    return Math.max(0.05, Math.min(0.90, prob));
  }

  /**
   * Roll for capture using a seeded RNG.
   *
   * @param {Object} character    - Character object
   * @param {string} captureType  - Capture trigger type
   * @param {Object} context      - Context modifiers
   * @param {string|number} seed  - Unique seed (e.g. `${turn}-${missionId}-${charId}-capture`)
   * @returns {boolean} True if character is captured
   */
  rollCapture(character: any, captureType: any, context: any, seed: any) {
    const prob = this.calculateCaptureProbability(character, captureType, context);
    const rng = new SeededRandom(seed);
    return rng.chance(prob);
  }

  // ─── Intel Leakage ───────────────────────────────────────────────────────────

  /**
   * Determine what intel a captured character leaks.
   * FR-CCR-004
   *
   * @param {Object} capturedCharacter  - The captured character
   * @param {Object} [galaxyState=null] - Galaxy state for context (systems, missions, etc.)
   * @param {SeededRandom} [rng=null]   - Optional RNG for randomized selection
   * @returns {{ type: string, description: string } | null}
   */
  generateIntelLeak(capturedCharacter: any, galaxyState = null, rng = null) {
    if (!capturedCharacter || capturedCharacter.status !== 'captured') return null;

    const stats = capturedCharacter.stats ?? {};
    const maxStatValue = Math.max(stats.combat ?? 0, stats.espionage ?? 0, stats.diplomacy ?? 0, stats.leadership ?? 0, stats.research ?? 0);

    // Determine intel type based on highest stat
    let intelType;
    if ((stats.combat ?? 0) === maxStatValue || (stats.leadership ?? 0) === maxStatValue) {
      intelType = 'fleet-position';
    } else if ((stats.espionage ?? 0) === maxStatValue) {
      intelType = 'mission-intel';
    } else if ((stats.diplomacy ?? 0) === maxStatValue) {
      intelType = 'loyalty-operation';
    } else {
      intelType = 'research-intel';
    }

    const factionName = capturedCharacter.faction ?? 'Unknown Faction';
    let description;

    switch (intelType) {
      case 'fleet-position':
        description = `Intelligence from ${capturedCharacter.name}: A ${factionName} fleet is operating near ${this._randomSystemHint(galaxyState, capturedCharacter.faction, rng)}.`;
        break;
      case 'mission-intel':
        description = `Intelligence from ${capturedCharacter.name}: ${factionName} has an active covert operation targeting ${this._randomSystemHint(galaxyState, null, rng)}.`;
        break;
      case 'loyalty-operation':
        description = `Intelligence from ${capturedCharacter.name}: ${factionName} is conducting loyalty operations in ${this._randomSystemHint(galaxyState, capturedCharacter.faction, rng)}.`;
        break;
      case 'research-intel': {
        description = `Intelligence from ${capturedCharacter.name}: ${factionName} is actively researching advanced technology.`;
        break;
      }
    }

    return {
      type: intelType,
      description,
      source: 'prisoner',
      sourceName: capturedCharacter.name,
      characterId: capturedCharacter.id,
      factionId: capturedCharacter.faction
    };
  }

  /**
   * Generate two intel items for an interrogation event.
   * FR-CCR-005
   *
   * @param {Object} capturedCharacter
   * @param {Object} [galaxyState=null]
   * @param {SeededRandom} [rng=null]
   * @returns {Array<{ type: string, description: string }>}
   */
  generateInterrogationIntel(capturedCharacter: any, galaxyState = null, rng = null) {
    if (capturedCharacter.interrogatedThisTurn) {
      return [];
    }
    capturedCharacter.interrogatedThisTurn = true;

    const items = [];
    for (let i = 0; i < 2; i++) {
      const item = this.generateIntelLeak(capturedCharacter, galaxyState, rng);
      if (item) items.push({ ...item, type: `${item.type}-interrogation-${i + 1}` });
    }
    return items;
  }

  // ─── Execution ───────────────────────────────────────────────────────────────

  /**
   * Calculate influence effects of executing a captured character.
   * FR-CCR-007
   *
   * @param {Object} executedCharacter  - The character being executed
   * @returns {{ owningFactionPenalty: number, capturingFactionBonus: number }}
   */
  calculateExecutionEffects(executedCharacter: any) {
    const stats = executedCharacter.stats ?? {};
    const avgStat = (
      (stats.combat ?? 0) + (stats.espionage ?? 0) + (stats.diplomacy ?? 0) +
      (stats.leadership ?? 0) + (stats.research ?? 0)
    ) / 5;

    const isHighStat = avgStat >= HIGH_STAT_THRESHOLD;
    return {
      owningFactionPenalty:   EXECUTION_INFLUENCE_PENALTY,
      capturingFactionBonus:  isHighStat ? EXECUTION_HIGH_STAT_BONUS : 0
    };
  }

  // ─── Rescue ──────────────────────────────────────────────────────────────────

  /**
   * Get the opposition resistance modifier for a rescue mission.
   * FR-CCR-006: Opposition resistance for rescue is system resistance + 2
   *
   * @param {number} systemResistance - Base system opposition resistance
   * @returns {number}
   */
  getRescueMissionResistance(systemResistance: any) {
    return Math.min(10, systemResistance + 2);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** @private */
  _randomSystemHint(galaxyState: any, preferFactionId: any, rng: any) {
    if (!galaxyState?.systems?.length) return 'an unknown system';

    const candidates = preferFactionId
      ? galaxyState.systems.filter((s: any) => s.loyalty === preferFactionId)
      : galaxyState.systems;

    if (!candidates.length) return 'a remote system';

    if (!rng) throw new Error('CharacterCaptureEngine._randomSystemHint requires an rng param (spec 055 FR-DET-001)');
    const system = rng.choice(candidates);

    return system.name ?? system.id ?? 'an unknown system';
  }
}

export const characterCaptureEngine = new CharacterCaptureEngine();

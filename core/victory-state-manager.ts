/**
 * VictoryStateManager - Per-faction victory progress state initialization,
 * serialization, and deserialization.
 *
 * Operates as a stateless utility class (all static methods).
 */

const VICTORY_STATE_VERSION = 1;

export class VictoryStateManager {
  /**
   * Initialize the full victory progress object for a faction.
   * @param {string} factionId - 'brandAuthority' | 'union' | 'autoforge'
   * @returns {Object} Per-condition victory progress map
   */
  static initializeFactionState(factionId: any, thresholdModifier = 1.0) {
    // Helper: scale a numeric threshold and round to nearest integer
    const t = (n: any) => Math.round(n * thresholdModifier);

    const stateMap = {
      brandAuthority: {
        'vc-ba-territorial-control': {
          type: 'percentage',
          current: 0,
          required: t(70),
          unlocked: true,
          notifiedAt: []
        },
        'vc-ba-military-elimination': {
          type: 'boolean-composite',
          current: false,
          conditions: {
            unionBaseDestroyed:       false,
            unionFleetsDestroyed:     false,
            autoforgeCapitalsCaptured: false,
            autoforgeFleetsDestroyed: false
          },
          unlocked: true,
          notifiedAt: []
        },
        'vc-ba-economic-dominance': {
          type: 'threshold-with-secondary',
          current: 0,
          required: t(500000),
          secondaryCurrent: 0,
          secondaryRequired: t(50),
          unlocked: false,        // Unlocked by galactic-administration tech
          notifiedAt: []
        },
        'vc-ba-discovery': {
          type: 'boolean-composite',
          current: false,
          conditions: {
            secretBaseKnown:    false,
            secretBaseDestroyed: false
          },
          unlocked: true,
          notifiedAt: []
        }
      },

      union: {
        'vc-un-cumulative-loyalty': {
          type: 'counter',
          current: 0,
          required: t(5000),
          unlocked: true,
          notifiedAt: []
        },
        'vc-un-survival': {
          type: 'composite',
          current: {
            turns:            0,
            secretBaseIntact: true,
            territoryControl: 0
          },
          required: {
            turns:            t(100),
            secretBaseIntact: true,
            territoryControl: t(30)
          },
          unlocked: true,
          notifiedAt: []
        },
        'vc-un-liberation': {
          type: 'counter',
          current: 0,
          required: t(50),
          unlocked: true,
          notifiedAt: []
        },
        'vc-un-heroic': {
          type: 'mission-chain',
          current: 0,
          required: 5,
          missionChain: [
            { id: 'inspire-hope',        completed: false, order: 1 },
            { id: 'sabotage-propaganda', completed: false, order: 2 },
            { id: 'rescue-champion',     completed: false, order: 3 },
            { id: 'rally-people',        completed: false, order: 4 },
            { id: 'revolutionary-spark', completed: false, order: 5 }
          ],
          unlocked: false,        // Unlocked by revolutionary-spark tech
          notifiedAt: []
        }
      },

      autoforge: {
        'vc-af-system-dependency': {
          type: 'percentage',
          current: 0,
          required: t(60),
          unlocked: true,
          notifiedAt: []
        },
        'vc-af-research': {
          type: 'percentage',
          current: 0,
          required: 100,
          unlocked: true,
          notifiedAt: []
        },
        'vc-af-manufacturing': {
          type: 'counter',
          current: 0,
          required: t(1000),
          unlocked: true,
          notifiedAt: []
        },
        'vc-af-peaceful': {
          type: 'composite',
          current: {
            nonAggressionTurns: 0,
            territoryControl:   0
          },
          required: {
            nonAggressionTurns: t(75),
            territoryControl:   t(25)
          },
          unlocked: true,
          notifiedAt: []
        }
      }
    };

    const state = (stateMap as Record<string, any>)[factionId];
    if (!state) {
      console.warn(`[VictoryStateManager] Unknown factionId: ${factionId}`);
      return {};
    }

    // Meta-fields (computed each turn, not persisted)
    state._closest = null;         // { conditionId, progressPercent }
    state._turnsToVictory = null;  // number | null

    return state;
  }

  /**
   * Unlock a locked victory condition and initialize progress tracking from
   * the current game state baseline.
   *
   * @param {Object} victoryProgress - The faction's victoryProgress object
   * @param {string} conditionId - The condition ID to unlock
   * @returns {{ conditionId: string } | null} Notification payload or null if not found
   */
  static unlockCondition(victoryProgress: any, conditionId: any) {
    const condition = victoryProgress[conditionId];
    if (!condition) {
      console.warn(`[VictoryStateManager] Cannot unlock unknown conditionId: ${conditionId}`);
      return null;
    }
    if (condition.unlocked) return null;  // Already unlocked

    condition.unlocked = true;
    console.log(`[VictoryStateManager] Unlocked victory condition: ${conditionId}`);
    return { conditionId };
  }

  /**
   * Serialize victory progress to a plain object for storage.
   * Meta-fields (_closest, _turnsToVictory) are intentionally excluded.
   * @param {Object} victoryProgress
   * @returns {Object} Plain JS object (safe to embed in JSONB)
   */
  static serialize(victoryProgress: any) {
    const toSave: Record<string, any> = {};
    for (const [key, value] of (Object.entries(victoryProgress) as [string, any][])) {
      if (key.startsWith('_')) continue;  // Skip computed meta-fields
      (toSave as Record<string, any>)[key] = value;
    }
    return { _version: VICTORY_STATE_VERSION, conditions: toSave };
  }

  /**
   * Deserialize victory progress from a plain object or JSON string.
   * Missing condition keys are re-initialized to defaults.
   * Accepts both formats for backward compatibility with older saves.
   * @param {Object|string} data - Plain object or JSON string from serialize()
   * @param {string} factionId - Used to fill in missing condition defaults
   * @returns {Object} Restored victoryProgress object
   */
  static deserialize(data: any, factionId: any) {
    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      console.warn('[VictoryStateManager] Failed to parse victory state, using defaults');
      return VictoryStateManager.initializeFactionState(factionId);
    }

    // Version check — re-initialize if unknown schema
    if (!parsed || parsed._version !== VICTORY_STATE_VERSION) {
      console.warn('[VictoryStateManager] Incompatible victory state version, re-initializing');
      return VictoryStateManager.initializeFactionState(factionId);
    }

    const defaults = VictoryStateManager.initializeFactionState(factionId);
    const restored = { ...defaults };

    // Merge in saved conditions, falling back to defaults for any missing keys
    for (const [conditionId, savedCondition] of (Object.entries(parsed.conditions ?? {}) as [string, any][])) {
      if (restored[conditionId]) {
        // Deep merge: preserve saved values, fill in defaults for any new fields
        restored[conditionId] = { ...restored[conditionId], ...savedCondition };
      }
    }

    console.log(`[VictoryStateManager] Deserialized victory state for ${factionId}`);
    return restored;
  }

  /**
   * Validate that a victoryProgress object contains all expected condition keys
   * for the given faction.
   * @param {Object} victoryProgress
   * @param {string} factionId
   * @returns {{ valid: boolean, missing: string[] }}
   */
  static validate(victoryProgress: any, factionId: any) {
    const defaults = VictoryStateManager.initializeFactionState(factionId);
    const expectedKeys = Object.keys(defaults).filter(k => !k.startsWith('_'));
    const missing = expectedKeys.filter(k => !(k in victoryProgress));
    return { valid: missing.length === 0, missing };
  }
}

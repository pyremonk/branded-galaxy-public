/**
 * IntelligenceFilter - Restricts opponent victory progress visibility
 * based on espionage / intelligence level.
 *
 * Phase 1A: Espionage network always returns false (no spy system yet).
 * Phase 1B: Integrate with Mission System.
 */
import { victoryNotificationEngine } from './victory-notification-engine.js';

export class IntelligenceFilter {
  /**
   * Return a redacted copy of targetFaction's victoryProgress as visible
   * to viewerFactionId.
   *
   * Rules (Phase 1A):
   * - Own faction:            always full visibility
   * - Opponent at ≥80%:       always visible to all players (auto-revealed)
   * - Hidden counters:         hidden until they reach hiddenUntilPercent threshold
   * - Espionage network:       full visibility (Phase 1A: never triggered)
   * - Default:                 show tier bracket (0-25, 25-50, 50-75, 75-100), not exact value
   *
   * @param {string} viewerFactionId
   * @param {Object} targetFaction - { id, victoryProgress }
   * @param {Object} gameState
   * @returns {Object} Filtered victoryProgress copy (safe to send to UI)
   */
  filterOpponentProgress(viewerFactionId: any, targetFaction: any, gameState: any) {
    const vp = targetFaction.victoryProgress;
    if (!vp) return {};

    // Own faction: no filtering
    if (viewerFactionId === targetFaction.id) {
      return JSON.parse(JSON.stringify(vp));
    }

    const hasEspionage = this.hasEspionageNetwork(viewerFactionId, targetFaction.id, gameState);
    const result: Record<string, any> = {};

    for (const [conditionId, condition] of (Object.entries(vp) as [string, any][])) {
      if (conditionId.startsWith('_')) continue;
      if (!condition.unlocked) {
        // Locked conditions are never shown to opponents
        result[conditionId] = { type: condition.type, unlocked: false, hidden: true };
        continue;
      }

      const pct = victoryNotificationEngine.getProgressPercent(condition);

      // Auto-reveal at ≥80%
      if (pct >= 80) {
        result[conditionId] = { ...JSON.parse(JSON.stringify(condition)), _visibility: 'full' };
        continue;
      }

      // Full visibility via espionage
      if (hasEspionage) {
        result[conditionId] = { ...JSON.parse(JSON.stringify(condition)), _visibility: 'espionage' };
        continue;
      }

      // Hidden counters: obscured below their hiddenUntilPercent
      const hiddenThreshold = this._getHiddenUntilPercent(conditionId);
      if (hiddenThreshold != null && pct < hiddenThreshold) {
        result[conditionId] = {
          type:        condition.type,
          unlocked:    true,
          hidden:      true,
          _visibility: 'hidden'
        };
        continue;
      }

      // Default: show tier bracket only
      result[conditionId] = this._redactToTier(condition, pct);
    }

    return result;
  }

  /**
   * Check whether viewerFactionId has an active espionage network in
   * targetFactionId's territory.
   *
   * Phase 1A: Always returns false (no spy system yet).
   * Phase 1B: Check Mission System for active spy assets.
   *
   * @param {string} viewerFactionId
   * @param {string} targetFactionId
   * @param {Object} gameState
   * @returns {boolean}
   */
  hasEspionageNetwork(viewerFactionId: any, targetFactionId: any, gameState: any) {
    // Phase 1A stub — espionage system not yet implemented
    return false;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Return the hiddenUntilPercent threshold for a given condition ID, or null.
   * These match the hiddenUntilPercent fields in victory-conditions.json.
   * @param {string} conditionId
   * @returns {number|null}
   * @private
   */
  _getHiddenUntilPercent(conditionId: any) {
    const HIDDEN_THRESHOLDS = {
      'vc-un-cumulative-loyalty':  50,
      'vc-un-liberation':          50,
      'vc-af-manufacturing':       50
    };
    return (HIDDEN_THRESHOLDS as Record<string, any>)[conditionId] ?? null;
  }

  /**
   * Return a redacted condition showing only tier bracket info (not exact value).
   * Tiers: 0 | 25 | 50 | 75  (lower bound of the 25% bucket)
   * @param {Object} condition
   * @param {number} pct - 0-100
   * @returns {Object}
   * @private
   */
  _redactToTier(condition: any, pct: any) {
    const tier = Math.floor(pct / 25) * 25;
    return {
      type:        condition.type,
      unlocked:    true,
      tierBracket: tier,         // e.g. 25 means "25-49% progress"
      _visibility: 'tier'
    };
  }
}

// Singleton instance
export const intelligenceFilter = new IntelligenceFilter();

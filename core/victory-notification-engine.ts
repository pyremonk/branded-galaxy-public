/**
 * VictoryNotificationEngine - Fires threshold alerts at 80%, 95%, and 100%
 * progress for all victory conditions across all factions.
 *
 * Notifications are sent to all players (opponent awareness is key).
 * Each threshold fires exactly once per condition per game (guarded by notifiedAt[]).
 */
import { victoryConfigLoader } from './victory-config-loader.js';

export class VictoryNotificationEngine {
  /**
   * Check all factions' conditions for threshold crossings.
   * Call this after VictoryProgressUpdater.updateAll() each turn.
   *
   * @param {Object} gameState - { factions, currentTurn }
   * @returns {Array<Object>} Array of notification payloads fired this turn
   */
  checkThresholds(gameState: any) {
    const fired = [];

    for (const faction of (Object.values(gameState.factions ?? {}) as any[])) {
      if (!faction.victoryProgress) continue;

      for (const [conditionId, condition] of (Object.entries(faction.victoryProgress) as [string, any][])) {
        if (conditionId.startsWith('_')) continue;
        if (!condition.unlocked) continue;

        const pct = this.getProgressPercent(condition);

        // 80% threshold
        if (pct >= 80 && !(condition.notifiedAt ?? []).includes(80)) {
          condition.notifiedAt = condition.notifiedAt ?? [];
          condition.notifiedAt.push(80);
          const payload = this._buildPayload(faction.id, conditionId, pct, 'approaching');
          this._fire(payload);
          fired.push(payload);
        }

        // 95% threshold
        if (pct >= 95 && !(condition.notifiedAt ?? []).includes(95)) {
          condition.notifiedAt = condition.notifiedAt ?? [];
          condition.notifiedAt.push(95);
          const payload = this._buildPayload(faction.id, conditionId, pct, 'imminent');
          this._fire(payload);
          fired.push(payload);
        }
      }
    }

    return fired;
  }

  /**
   * Fire a notification when a tech-gated victory condition becomes unlocked.
   * Call this from the tech system when a qualifying tech completes.
   *
   * @param {string} factionId
   * @param {string} conditionId
   * @param {string} unlockedByTechId - The tech ID that triggered the unlock
   */
  notifyVictoryUnlocked(factionId: any, conditionId: any, unlockedByTechId: any) {
    const conditionDef = victoryConfigLoader.getCondition(conditionId);
    const conditionName = conditionDef?.name ?? conditionId;

    const payload = {
      type: 'victory-unlocked',
      factionId,
      conditionId,
      conditionName,
      unlockedBy: unlockedByTechId
    };

    this._fire(payload);
    return payload;
  }

  // ─── Progress Normalization ────────────────────────────────────────────────

  /**
   * Compute normalized 0-100 progress percentage for any condition type.
   * Never returns a value over 100.
   *
   * @param {Object} condition - Victory progress condition object
   * @returns {number} 0-100
   */
  getProgressPercent(condition: any) {
    switch (condition.type) {
      case 'percentage':
        return Math.min(100, Math.max(0, condition.current ?? 0));

      case 'counter':
        if (!condition.required) return 0;
        return Math.min(100, Math.floor(((condition.current ?? 0) / condition.required) * 100));

      case 'threshold-with-secondary': {
        const primaryPct   = condition.required
          ? Math.min(100, Math.floor(((condition.current ?? 0) / condition.required) * 100))
          : 0;
        const secondaryPct = condition.secondaryRequired
          ? Math.min(100, Math.floor(((condition.secondaryCurrent ?? 0) / condition.secondaryRequired) * 100))
          : 0;
        return Math.floor((primaryPct + secondaryPct) / 2);
      }

      case 'boolean-composite': {
        const vals = (Object.values(condition.conditions ?? {}) as any[]);
        if (!vals.length) return 0;
        return Math.floor((vals.filter(Boolean).length / vals.length) * 100);
      }

      case 'composite': {
        const req  = condition.required ?? {};
        const cur  = condition.current  ?? {};
        const keys = Object.keys(req);
        if (!keys.length) return 0;

        const pcts = keys.map(k => {
          const r = req[k];
          if (typeof r === 'boolean') return (cur[k] === r) ? 100 : 0;
          return Math.min(100, Math.floor(((cur[k] ?? 0) / r) * 100));
        });

        return Math.floor(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }

      case 'mission-chain':
        if (!condition.required) return 0;
        return Math.min(100, Math.floor(((condition.current ?? 0) / condition.required) * 100));

      default:
        return 0;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Build a notification payload.
   * @private
   */
  _buildPayload(factionId: any, conditionId: any, progressPercent: any, level: any) {
    const conditionDef  = victoryConfigLoader.getCondition(conditionId);
    const conditionName = conditionDef?.name ?? conditionId;

    return {
      type:            'victory-warning',
      factionId,
      conditionId,
      conditionName,
      progressPercent: Math.round(progressPercent),
      level             // 'approaching' (80-94%) | 'imminent' (95%+)
    };
  }

  /**
   * Dispatch notification via window event and log.
   * @private
   */
  _fire(payload: any) {
    console.log(`[VictoryNotification] ${payload.type} — ${payload.factionId} / ${payload.conditionId} (${payload.progressPercent ?? ''}%)`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('game:victoryNotification', { detail: payload }));
    }
  }
}

// Singleton instance
export const victoryNotificationEngine = new VictoryNotificationEngine();

/**
 * VictoryValidator - Evaluates win conditions each turn and triggers victory.
 * Reads faction victoryProgress state, never mutates it (except writing gameOver).
 */

export class VictoryValidator {
  /**
   * Check all factions for victory.  Runs after VictoryProgressUpdater.updateAll().
   * Returns on the first victory found.
   *
   * @param {Object} gameState - { factions, currentTurn, ... }
   * @returns {{ victory: true, factionId: string, conditionId: string } | null}
   */
  checkAll(gameState: any) {
    if (gameState.gameOver) return null;  // Already ended

    const victories = [];

    for (const faction of (Object.values(gameState.factions ?? {}) as any[])) {
      if (!faction.victoryProgress) continue;

      for (const [conditionId, condition] of (Object.entries(faction.victoryProgress) as [string, any][])) {
        if (conditionId.startsWith('_')) continue;
        if (!condition.unlocked) continue;
        if (!this.checkPrerequisites(condition, gameState)) continue;

        if (this.evaluateCondition(condition)) {
          victories.push({ factionId: faction.id, conditionId });
        }
      }
    }

    if (victories.length === 0) return null;

    const winner = victories.length === 1
      ? victories[0]
      : this.resolveTie(victories, gameState);

    this.triggerVictory(winner.factionId, winner.conditionId, gameState);
    return { victory: true, ...winner };
  }

  // ─── Condition Type Evaluators ─────────────────────────────────────────────

  /**
   * Dispatch to the correct evaluator based on condition.type.
   * @param {Object} condition
   * @returns {boolean}
   */
  evaluateCondition(condition: any) {
    switch (condition.type) {
      case 'percentage':                return this.evaluatePercentage(condition);
      case 'counter':                   return this.evaluateCounter(condition);
      case 'boolean-composite':         return this.evaluateBooleanComposite(condition);
      case 'threshold-with-secondary':  return this.evaluateThresholdWithSecondary(condition);
      case 'composite':                 return this.evaluateComposite(condition);
      case 'mission-chain':             return this.evaluateMissionChain(condition);
      default:
        console.warn(`[VictoryValidator] Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  /** @param {Object} condition */
  evaluatePercentage(condition: any) {
    return condition.current >= condition.required;
  }

  /** @param {Object} condition */
  evaluateCounter(condition: any) {
    return condition.current >= condition.required;
  }

  /** @param {Object} condition */
  evaluateBooleanComposite(condition: any) {
    return (Object.values(condition.conditions ?? {}) as any[]).every(v => v === true);
  }

  /** @param {Object} condition */
  evaluateThresholdWithSecondary(condition: any) {
    return condition.current >= condition.required &&
           condition.secondaryCurrent >= condition.secondaryRequired;
  }

  /**
   * Evaluate composite condition — each key in required must be satisfied.
   * Numeric keys: current >= required.
   * Boolean keys: current === required.
   * @param {Object} condition
   */
  evaluateComposite(condition: any) {
    const required = condition.required ?? {};
    const current  = condition.current  ?? {};

    for (const [key, req] of (Object.entries(required) as [string, any][])) {
      const cur = current[key];
      if (typeof req === 'boolean') {
        if (cur !== req) return false;
      } else {
        if ((cur ?? 0) < req) return false;
      }
    }
    return true;
  }

  /** @param {Object} condition */
  evaluateMissionChain(condition: any) {
    return condition.current >= condition.required;
  }

  // ─── Prerequisites ─────────────────────────────────────────────────────────

  /**
   * Check implied prerequisites before evaluating a condition.
   * Survival requires min 100 turns, Peaceful requires min 75 turns, etc.
   * Most prerequisites are encoded in the composite condition itself,
   * but this guard prevents early false positives.
   *
   * @param {Object} condition
   * @param {Object} gameState
   * @returns {boolean}
   */
  checkPrerequisites(condition: any, gameState: any) {
    const turn = gameState.currentTurn ?? 0;

    // Survival Victory — must actually be turn 100+
    if (condition.type === 'composite' && condition.required?.turns != null) {
      if (turn < condition.required.turns) return false;
    }

    return true;
  }

  // ─── Tie-Breaking ─────────────────────────────────────────────────────────

  /**
   * Resolve ties when multiple factions achieve victory on the same turn.
   * Primary: more conditions met → wins.
   * Secondary: earlier in canonical turn order → wins.
   *
   * @param {Array<{factionId: string, conditionId: string}>} victories
   * @param {Object} gameState
   * @returns {{ factionId: string, conditionId: string }}
   */
  resolveTie(victories: any, gameState: any) {
    const TURN_ORDER = ['brandAuthority', 'union', 'autoforge'];

    // Count conditions met per faction
    const counts: Record<string, number> = {};
    for (const { factionId } of victories) {
      (counts as Record<string, number>)[factionId] = ((counts as Record<string, number>)[factionId] ?? 0) + 1;
    }

    const maxCount = Math.max(...(Object.values(counts) as any[]));
    const topFactions = (Object.entries(counts) as [string, any][])
      .filter(([, c]) => c === maxCount)
      .map(([id]) => id);

    // Among tied factions, pick earliest in turn order
    const winner = TURN_ORDER.find(id => topFactions.includes(id)) ?? topFactions[0];

    // Return the first victory for the winning faction
    return victories.find((v: any) => v.factionId === winner);
  }

  // ─── Victory Trigger ───────────────────────────────────────────────────────

  /**
   * Mark game as over and dispatch victory event.
   * @param {string} factionId
   * @param {string} conditionId
   * @param {Object} gameState
   */
  triggerVictory(factionId: any, conditionId: any, gameState: any) {
    gameState.gameOver = true;
    gameState.winner   = { factionId, conditionId, turnNumber: gameState.currentTurn ?? 0 };

    console.log(`[VictoryValidator] 🏆 VICTORY — faction: ${factionId}, condition: ${conditionId}, turn: ${gameState.currentTurn}`);

    // Collect final stats snapshot
    gameState.finalStats = this._collectFinalStats(gameState);

    // Dispatch browser event so React/Phaser layers can respond
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('game:victory', {
        detail: { factionId, conditionId, turnNumber: gameState.currentTurn, finalStats: gameState.finalStats }
      }));
    }
  }

  // ─── Final Stats Collection ────────────────────────────────────────────────

  /**
   * Build a snapshot of end-game statistics.
   * @param {Object} gameState
   * @returns {Object}
   * @private
   */
  _collectFinalStats(gameState: any) {
    const winner   = gameState.winner;
    const factions = gameState.factions ?? {};
    const systems  = gameState.systems  ?? [];

    const perFactionStats: Record<string, any> = {};
    for (const [factionId, faction] of (Object.entries(factions) as [string, any][])) {
      const controlled = systems.filter((s: any) => s.loyalty === factionId).length;
      (perFactionStats as Record<string, any>)[factionId] = {
        finalSystemsControlled:  controlled,
        peakSystemsControlled:   faction.peakSystems ?? controlled,
        totalResourcesGenerated: faction.totalResourcesGenerated ?? {},
        technologiesCompleted:   (faction.techState?.completedTechnologies ?? faction.technologies ?? []).length,
        unitsProduced:           faction.victoryProgress?.['vc-af-manufacturing']?.current ?? 0,
        // Closest victory (for defeated factions)
        closestVictory:          this._getClosestVictory(faction.victoryProgress)
      };
    }

    return {
      winnerId:       winner.factionId,
      conditionId:    winner.conditionId,
      turnNumber:     winner.turnNumber,
      galaxySize:     systems.length,
      factionCount:   Object.keys(factions).length,
      gameDurationMs: gameState._startTime ? Date.now() - gameState._startTime : null,
      perFact:        perFactionStats
    };
  }

  /**
   * @param {Object|null} victoryProgress
   * @returns {{ conditionId: string, progressPercent: number } | null}
   * @private
   */
  _getClosestVictory(victoryProgress: any) {
    if (!victoryProgress) return null;

    let best = null;
    for (const [id, condition] of (Object.entries(victoryProgress) as [string, any][])) {
      if (id.startsWith('_') || !condition.unlocked) continue;
      const pct = this._progressPercent(condition);
      if (!best || pct > best.progressPercent) {
        best = { conditionId: id, progressPercent: pct };
      }
    }
    return best;
  }

  /**
   * Normalized 0-100 for any condition type.
   * @param {Object} condition
   * @returns {number}
   * @private
   */
  _progressPercent(condition: any) {
    switch (condition.type) {
      case 'percentage':
        return Math.min(100, condition.current);
      case 'counter':
        return Math.min(100, Math.floor((condition.current / condition.required) * 100));
      case 'threshold-with-secondary': {
        const p = Math.min(100, Math.floor((condition.current / condition.required) * 100));
        const s = Math.min(100, Math.floor((condition.secondaryCurrent / condition.secondaryRequired) * 100));
        return Math.floor((p + s) / 2);
      }
      case 'boolean-composite': {
        const vals = (Object.values(condition.conditions ?? {}) as any[]);
        return vals.length ? Math.floor((vals.filter(Boolean).length / vals.length) * 100) : 0;
      }
      case 'composite': {
        const req = condition.required ?? {};
        const cur = condition.current  ?? {};
        const pcts = (Object.entries(req) as [string, any][]).map(([k, r]) => {
          if (typeof r === 'boolean') return (cur[k] === r) ? 100 : 0;
          return Math.min(100, Math.floor(((cur[k] ?? 0) / r) * 100));
        });
        return pcts.length ? Math.floor(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
      }
      case 'mission-chain':
        return Math.min(100, Math.floor((condition.current / condition.required) * 100));
      default:
        return 0;
    }
  }
}

// Singleton instance
export const victoryValidator = new VictoryValidator();

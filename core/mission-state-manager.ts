/**
 * MissionStateManager — Per-faction mission queue and log.
 *
 * Manages:
 *  - Pending missions (staged for the current turn, not yet resolved)
 *  - Active missions (multi-turn, currently in progress)
 *  - Mission log (last 30 completed reports per faction)
 *  - Revolt tracking (systems currently under temporary revolt)
 *
 * Spec: 022-mission-execution-spec.md, 023-mission-outcomes-spec.md
 */

import { applyVariance } from './timescale-config.js';

const MAX_MISSION_LOG_SIZE = 30;
const MISSION_STATE_VERSION = 1;

export class MissionStateManager {
  state: any;

  constructor() {
    this.state = {
      version: MISSION_STATE_VERSION,
      /**
       * Active multi-turn missions: missionId → mission data
       * @type {Object<string, Object>}
       */
      activeMissions: {},
      /**
       * Mission log per faction: factionId → Array of report objects
       * @type {Object<string, Array>}
       */
      missionLog: {},
      /**
       * System revolt tracking: systemId → { duration, originalFaction, startTurn }
       * @type {Object<string, Object>}
       */
      systemRevolts: {},
      /**
       * Temporary stat penalties: characterId → { stat, amount, expiresOnTurn }
       * @type {Object<string, Object>}
       */
      statPenalties: {},
      /** Monotonic counter for mission IDs */
      _nextMissionId: 1
    };
  }

  // ─── Mission ID Generation ────────────────────────────────────────────────────

  /** @returns {string} */
  generateMissionId() {
    return `mission-${this.state._nextMissionId++}`;
  }

  // ─── Active Multi-Turn Missions ───────────────────────────────────────────────

  /**
   * Register a multi-turn mission as active.
   * Called when a mission with duration > 1 is staged.
   * @param {Object} missionData - Full mission payload (from staged action)
   * @param {number} totalTurns
   * @param {number} [currentQuarterTurn] - Current quarter-turn float (sync mode only).
   *   When provided, completionTurn is set to currentQuarterTurn + applyVariance(totalTurns).
   *   When absent (async mode), turnsRemaining decrement is used instead.
   */
  registerActiveMission(missionData: any, totalTurns: any, currentQuarterTurn: any) {
    const entry = {
      ...missionData,
      totalTurns,
      turnsRemaining: totalTurns,
      completionTurn: null,
    };
    if (currentQuarterTurn != null) {
      entry.completionTurn = currentQuarterTurn + applyVariance(totalTurns, missionData.missionId);
    }
    (this.state.activeMissions as Record<string, any>)[missionData.missionId] = entry;
  }

  /**
   * Get all active multi-turn missions (or filtered by faction).
   * @param {string} [factionId]
   * @returns {Object[]}
   */
  getActiveMissions(factionId = null) {
    const all = Object.values((this.state.activeMissions as Record<string, any>));
    return factionId ? all.filter(m => m.factionId === factionId) : all;
  }

  /**
   * Advance all active multi-turn missions by one turn.
   * Returns missions whose turnsRemaining has reached 0 (ready to resolve).
   * Used in async (turn-based) mode.  In sync mode use getReadyMissionsAtQuarterTurn().
   * @param {number} currentTurn
   * @returns {Object[]} Missions ready to resolve this turn
   */
  advanceTurn(currentTurn: any) {
    const ready = [];
    for (const [id, mission] of Object.entries((this.state.activeMissions as Record<string, any>))) {
      // Skip missions tracked by completionTurn (sync mode) — handled by sub-turn pass
      if (mission.completionTurn != null) continue;
      mission.turnsRemaining--;
      if (mission.turnsRemaining <= 0) {
        ready.push({ ...mission });
        delete (this.state.activeMissions as Record<string, any>)[id];
      }
    }
    return ready;
  }

  /**
   * Return and remove all active missions whose completionTurn <= quarterTurn.
   * Used in sync mode by resolveCompletions().
   * @param {number} quarterTurn
   * @returns {Object[]}
   */
  getReadyMissionsAtQuarterTurn(quarterTurn: any) {
    const ready = [];
    for (const [id, mission] of Object.entries((this.state.activeMissions as Record<string, any>))) {
      if (mission.completionTurn != null && mission.completionTurn <= quarterTurn) {
        ready.push({ ...mission });
        delete (this.state.activeMissions as Record<string, any>)[id];
      }
    }
    return ready;
  }

  /**
   * Remove an active multi-turn mission (e.g. cancelled or aborted).
   * @param {string} missionId
   */
  removeActiveMission(missionId: any) {
    delete (this.state.activeMissions as Record<string, any>)[missionId];
  }

  // ─── Mission Log ─────────────────────────────────────────────────────────────

  /**
   * Record a completed mission report into the faction's log.
   * @param {string} factionId
   * @param {Object} report - Mission report object
   */
  recordReport(factionId: any, report: any) {
    if (!(this.state.missionLog as Record<string, any>)[factionId]) {
      (this.state.missionLog as Record<string, any>)[factionId] = [];
    }
    (this.state.missionLog as Record<string, any>)[factionId].unshift(report);
  }

  /**
   * Purge old reports so each faction's log retains at most MAX_MISSION_LOG_SIZE entries.
   * Called at end of Maintenance Phase (FR-MO-007).
   */
  purgeOldReports() {
    for (const factionId of Object.keys(this.state.missionLog)) {
      if ((this.state.missionLog as Record<string, any>)[factionId].length > MAX_MISSION_LOG_SIZE) {
        (this.state.missionLog as Record<string, any>)[factionId] = (this.state.missionLog as Record<string, any>)[factionId].slice(0, MAX_MISSION_LOG_SIZE);
      }
    }
  }

  /**
   * Get the mission log for a faction (most recent first).
   * @param {string} factionId
   * @param {number} [limit=30]
   * @returns {Object[]}
   */
  getMissionLog(factionId: any, limit = MAX_MISSION_LOG_SIZE) {
    return ((this.state.missionLog as Record<string, any>)[factionId] ?? []).slice(0, limit);
  }

  // ─── System Revolt Tracking ───────────────────────────────────────────────────

  /**
   * Register a system revolt.
   * @param {string} systemId
   * @param {string} originalFaction - Faction that controlled the system before revolt
   * @param {number} duration - Number of turns the revolt lasts
   * @param {number} startTurn
   */
  registerRevolt(systemId: any, originalFaction: any, duration: any, startTurn: any) {
    this.state.systemRevolts[systemId] = { originalFaction, duration, startTurn, turnsRemaining: duration };
    console.log(`[MissionStateManager] System revolt registered: ${systemId} for ${duration} turns`);
  }

  /**
   * Advance revolt counters. Returns systems whose revolt has expired.
   * @returns {{ systemId: string, originalFaction: string }[]}
   */
  advanceRevolts() {
    const expired = [];
    for (const [systemId, revolt] of (Object.entries(this.state.systemRevolts) as [string, any][])) {
      revolt.turnsRemaining--;
      if (revolt.turnsRemaining <= 0) {
        expired.push({ systemId, originalFaction: revolt.originalFaction });
        delete this.state.systemRevolts[systemId];
      }
    }
    return expired;
  }

  /** @param {string} systemId @returns {boolean} */
  isInRevolt(systemId: any) {
    return systemId in this.state.systemRevolts;
  }

  // ─── Temporary Stat Penalties ─────────────────────────────────────────────────

  /**
   * Apply a temporary stat penalty to a character.
   * @param {string} characterId
   * @param {string} stat
   * @param {number} amount - Amount to reduce (positive number = reduction)
   * @param {number} expiresOnTurn
   */
  applyStatPenalty(characterId: any, stat: any, amount: any, expiresOnTurn: any) {
    this.state.statPenalties[characterId] = { stat, amount, expiresOnTurn };
  }

  /**
   * Get current stat penalty for a character if active.
   * @param {string} characterId
   * @param {number} currentTurn
   * @returns {{ stat: string, amount: number } | null}
   */
  getStatPenalty(characterId: any, currentTurn: any) {
    const penalty = this.state.statPenalties[characterId];
    if (!penalty || penalty.expiresOnTurn <= currentTurn) {
      if (penalty) delete this.state.statPenalties[characterId];
      return null;
    }
    return { stat: penalty.stat, amount: penalty.amount };
  }

  /**
   * Clear expired stat penalties.
   * @param {number} currentTurn
   */
  clearExpiredPenalties(currentTurn: any) {
    for (const [charId, penalty] of (Object.entries(this.state.statPenalties) as [string, any][])) {
      if (penalty.expiresOnTurn <= currentTurn) {
        delete this.state.statPenalties[charId];
      }
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize state to a plain object for persistence.
   * @returns {Object} Plain JS object (safe to embed in JSONB)
   */
  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Deserialize state from a plain object or JSON string.
   * Accepts both formats for backward compatibility with older saves.
   * @param {Object|string} data - Plain object or JSON string from serialize()
   * @returns {MissionStateManager}
   */
  static deserialize(data: any) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const instance = new MissionStateManager();
    instance.state = {
      version:        parsed.version        ?? MISSION_STATE_VERSION,
      activeMissions: parsed.activeMissions ?? {},
      missionLog:     parsed.missionLog     ?? {},
      systemRevolts:  parsed.systemRevolts  ?? {},
      statPenalties:  parsed.statPenalties  ?? {},
      _nextMissionId: parsed._nextMissionId ?? 1
    };
    return instance;
  }
}

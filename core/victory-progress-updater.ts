/**
 * VictoryProgressUpdater - Recalculates per-turn victory condition progress
 * for all active factions. Operates as a pure observer — reads game state,
 * writes only to faction.victoryProgress. Never mutates other game state.
 *
 * Turn-based updates are called from updateAll().
 * Event-driven updates (cumulative counters) are called directly by their
 * respective systems via the named methods.
 */

import { SeededRandom } from './seeded-random.js';

export class VictoryProgressUpdater {
  /**
   * Run all progress updates for every faction in the game state.
   * Call this once per turn, after resource production.
   *
   * @param {Object} gameState - { systems, factions, currentTurn, unionSecretBase,
   *                              unionSecretBaseLocation }
   * @returns {{ updated: string[] }} IDs of conditions that changed value
   */
  updateAll(gameState: any) {
    const updated = [];

    for (const faction of (Object.values(gameState.factions ?? {}) as any[])) {
      if (!faction.victoryProgress) continue;

      const factionId = faction.id;
      const vp = faction.victoryProgress;

      switch (factionId) {
        case 'brandAuthority':
          if (this._update(vp, 'vc-ba-territorial-control',
              this.updateTerritorialControl(faction, vp, gameState))) updated.push('vc-ba-territorial-control');
          if (this._update(vp, 'vc-ba-military-elimination',
              this.updateMilitaryElimination(faction, vp, gameState))) updated.push('vc-ba-military-elimination');
          if (this._update(vp, 'vc-ba-economic-dominance',
              this.updateEconomicDominance(faction, vp, gameState))) updated.push('vc-ba-economic-dominance');
          if (this._update(vp, 'vc-ba-discovery',
              this.updateDiscoveryVictory(faction, vp, gameState))) updated.push('vc-ba-discovery');
          break;

        case 'union':
          if (this._update(vp, 'vc-un-cumulative-loyalty',
              this.updateCumulativeLoyalty(faction, vp, gameState))) updated.push('vc-un-cumulative-loyalty');
          if (this._update(vp, 'vc-un-survival',
              this.updateSurvivalVictory(faction, vp, gameState))) updated.push('vc-un-survival');
          // Liberation counter is event-driven (incrementLiberationCounter)
          if (vp['vc-un-heroic']?.unlocked) {
            this.updateHeroicVictory(faction, vp, gameState);
          }
          break;

        case 'autoforge':
          if (this._update(vp, 'vc-af-system-dependency',
              this.updateSystemDependency(faction, vp, gameState))) updated.push('vc-af-system-dependency');
          if (this._update(vp, 'vc-af-research',
              this.updateResearchVictory(faction, vp, gameState))) updated.push('vc-af-research');
          // Manufacturing counter is event-driven (incrementManufacturingCounter)
          if (this._update(vp, 'vc-af-peaceful',
              this.updatePeacefulVictory(faction, vp, gameState))) updated.push('vc-af-peaceful');
          break;
      }
    }

    return { updated };
  }

  // ─── Brand Authority ────────────────────────────────────────────────────────

  /**
   * Update Brand Authority Territorial Control progress.
   * Counts systems with loyalty === 'brandAuthority' and loyaltyValue >= 60.
   */
  updateTerritorialControl(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-ba-territorial-control'];
    if (!condition || !condition.unlocked) return false;

    const systems = gameState.systems ?? [];
    const totalSystems = systems.length;
    if (totalSystems === 0) return false;

    const qualifying = systems.filter((s: any) =>
      s.loyalty === 'brandAuthority' && (s.loyaltyValue ?? s.loyaltyScore ?? 0) >= 60
    ).length;

    const newValue = Math.floor((qualifying / totalSystems) * 100);
    if (newValue !== condition.current) {
      condition.current = newValue;
      return true;
    }
    return false;
  }

  /**
   * Update Brand Authority Military Elimination progress.
   * Tracks each sub-condition independently.
   */
  updateMilitaryElimination(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-ba-military-elimination'];
    if (!condition || !condition.unlocked) return false;

    const prev = JSON.stringify(condition.conditions);

    // Union base destroyed
    condition.conditions.unionBaseDestroyed =
      gameState.unionSecretBase?.destroyed === true;

    // All Union fleets eliminated
    const unionFleets = (gameState.fleets ?? []).filter((f: any) => f.factionId === 'union');
    condition.conditions.unionFleetsDestroyed = unionFleets.length === 0;

    // All Autoforge capital systems captured
    const afCapitals = (gameState.systems ?? []).filter((s: any) => s.isCapital && s.homeFaction === 'autoforge');
    condition.conditions.autoforgeCapitalsCaptured =
      afCapitals.length > 0 && afCapitals.every((s: any) => s.loyalty !== 'autoforge');

    // All Autoforge fleets eliminated
    const afFleets = (gameState.fleets ?? []).filter((f: any) => f.factionId === 'autoforge');
    condition.conditions.autoforgeFleetsDestroyed = afFleets.length === 0;

    // Overall current = true only if ALL conditions met
    condition.current = (Object.values(condition.conditions) as any[]).every(v => v === true);

    return JSON.stringify(condition.conditions) !== prev;
  }

  /**
   * Update Brand Authority Economic Dominance progress.
   * Skipped when condition is locked.
   */
  updateEconomicDominance(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-ba-economic-dominance'];
    if (!condition || !condition.unlocked) return false;

    const prevPrimary   = condition.current;
    const prevSecondary = condition.secondaryCurrent;

    // Primary: credits
    condition.current = faction.resources?.credits ?? 0;

    // Secondary: trade hub percentage
    const systems = gameState.systems ?? [];
    const tradeHubs = systems.filter((s: any) => s.specialType === 'tradeHub');
    const controlled = tradeHubs.filter((s: any) => s.loyalty === 'brandAuthority').length;
    condition.secondaryCurrent = tradeHubs.length > 0
      ? Math.floor((controlled / tradeHubs.length) * 100)
      : 0;

    return condition.current !== prevPrimary || condition.secondaryCurrent !== prevSecondary;
  }

  /**
   * Update Brand Authority Discovery Victory conditions.
   */
  updateDiscoveryVictory(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-ba-discovery'];
    if (!condition || !condition.unlocked) return false;

    const prev = JSON.stringify(condition.conditions);

    const revealedTo = gameState.unionSecretBaseLocation?.revealedTo ?? [];
    condition.conditions.secretBaseKnown    = revealedTo.includes('brandAuthority');
    condition.conditions.secretBaseDestroyed = gameState.unionSecretBase?.destroyed === true;

    // Overall: true when base is destroyed (known is implied by destroyed)
    condition.current = condition.conditions.secretBaseDestroyed;

    return JSON.stringify(condition.conditions) !== prev;
  }

  /**
   * Roll for passive secret base discovery (5% per turn).
   * Called during turn resolution for Brand Authority.
   * @param {Object} gameState
   * @returns {boolean} Whether discovery occurred this turn
   */
  rollSecretBaseDiscovery(gameState: any) {
    if (gameState.unionSecretBase?.destroyed) return false;
    const revealedTo = gameState.unionSecretBaseLocation?.revealedTo ?? [];
    if (revealedTo.includes('brandAuthority')) return false;  // Already known

    // Seeded RNG for discovery roll — deterministic simulation (spec 055 FR-DET-001)
    const rng = new SeededRandom(`${gameState.currentTurn ?? 0}-secretBaseDiscovery`);
    const roll = rng.next();
    if (roll < 0.05) {
      gameState.unionSecretBaseLocation = gameState.unionSecretBaseLocation ?? {};
      gameState.unionSecretBaseLocation.revealedTo = [...revealedTo, 'brandAuthority'];
      console.log('[VictoryProgressUpdater] Passive intercept: Union secret base location revealed to Brand Authority');
      return true;
    }
    return false;
  }

  // ─── Union ─────────────────────────────────────────────────────────────────

  /**
   * Update Union Cumulative Loyalty counter.
   * Each turn, sum max(0, system.loyaltyValue - 50) for all Union-influenced systems.
   */
  updateCumulativeLoyalty(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-un-cumulative-loyalty'];
    if (!condition || !condition.unlocked) return false;

    const systems = gameState.systems ?? [];
    let delta = 0;

    for (const system of systems) {
      if (system.loyalty === 'union' || system.unionInfluence > 0) {
        const loyaltyVal = system.loyaltyValue ?? system.loyaltyScore ?? 50;
        delta += Math.max(0, loyaltyVal - 50);
      }
    }

    if (delta > 0) {
      condition.current += delta;
      return true;
    }
    return false;
  }

  /**
   * Update Union Survival Victory composite state.
   */
  updateSurvivalVictory(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-un-survival'];
    if (!condition || !condition.unlocked) return false;

    const prev = JSON.stringify(condition.current);

    condition.current.turns           = gameState.currentTurn ?? 0;
    condition.current.secretBaseIntact = !gameState.unionSecretBase?.destroyed;

    const systems = gameState.systems ?? [];
    const totalSystems = systems.length;
    const controlled = systems.filter((s: any) => s.loyalty === 'union').length;
    condition.current.territoryControl = totalSystems > 0
      ? Math.floor((controlled / totalSystems) * 100)
      : 0;

    return JSON.stringify(condition.current) !== prev;
  }

  /**
   * Increment the Liberation Victory counter.
   * Call this when a system transitions loyalty FROM brandAuthority TO union.
   * Event-driven — NOT called from updateAll().
   *
   * @param {string} fromFactionId - Must be 'brandAuthority' to count
   * @param {Object} victoryProgress - Union faction's victoryProgress
   */
  incrementLiberationCounter(fromFactionId: any, victoryProgress: any) {
    if (fromFactionId !== 'brandAuthority') return;  // Only BA→Union transitions count

    const condition = victoryProgress['vc-un-liberation'];
    if (!condition || !condition.unlocked) return;

    condition.current += 1;
    console.log(`[VictoryProgressUpdater] Liberation counter: ${condition.current}`);
  }

  /**
   * Update Union Heroic Victory mission chain progress.
   * Counts completed steps in order.
   */
  updateHeroicVictory(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-un-heroic'];
    if (!condition || !condition.unlocked) return false;

    const completedCount = condition.missionChain.filter((step: any) => step.completed).length;
    if (completedCount !== condition.current) {
      condition.current = completedCount;
      return true;
    }
    return false;
  }

  /**
   * Complete a Heroic Victory mission chain step.
   * Steps must be completed in order (step N requires step N-1 done).
   * Called by Mission System on step completion.
   *
   * @param {Object} victoryProgress - Union faction's victoryProgress
   * @param {string} stepId - Mission step ID (e.g. 'inspire-hope')
   * @returns {boolean} Whether the step was successfully completed
   */
  completeMissionChainStep(victoryProgress: any, stepId: any) {
    const condition = victoryProgress['vc-un-heroic'];
    if (!condition || !condition.unlocked) return false;

    const stepIndex = condition.missionChain.findIndex((s: any) => s.id === stepId);
    if (stepIndex < 0) {
      console.warn(`[VictoryProgressUpdater] Unknown mission chain step: ${stepId}`);
      return false;
    }

    // Enforce ordering — all prior steps must be complete
    if (stepIndex > 0 && !condition.missionChain[stepIndex - 1].completed) {
      console.warn(`[VictoryProgressUpdater] Cannot complete step ${stepId}: prior step not yet complete`);
      return false;
    }

    condition.missionChain[stepIndex].completed = true;
    condition.current = condition.missionChain.filter((s: any) => s.completed).length;
    console.log(`[VictoryProgressUpdater] Heroic Victory step completed: ${stepId} (${condition.current}/${condition.required})`);
    return true;
  }

  // ─── Autoforge ─────────────────────────────────────────────────────────────

  /**
   * Update Autoforge System Dependency progress.
   * Calculates a dependency score per system and counts systems >= 50.
   */
  updateSystemDependency(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-af-system-dependency'];
    if (!condition || !condition.unlocked) return false;

    const systems = gameState.systems ?? [];
    const totalSystems = systems.length;
    if (totalSystems === 0) return false;

    let dependentCount = 0;

    for (const system of systems) {
      let score = 0;

      // +15 per Autoforge facility
      const afFacilities = (system.facilities ?? []).filter((f: any) => f.faction === 'autoforge').length;
      score += afFacilities * 15;

      // +20 if trade agreement with Autoforge
      if ((system.tradeAgreements ?? []).includes('autoforge')) score += 20;

      // +10 if low population and not Autoforge-owned
      if ((system.population ?? Infinity) < 4 && system.loyalty !== 'autoforge') score += 10;

      // +15 if importing Autoforge goods
      if (system.imports?.autoforgeGoods === true) score += 15;

      // Cap at 100
      score = Math.min(100, score);

      if (score >= 50) dependentCount++;
    }

    const newValue = Math.floor((dependentCount / totalSystems) * 100);
    if (newValue !== condition.current) {
      condition.current = newValue;
      return true;
    }
    return false;
  }

  /**
   * Update Autoforge Research Victory progress.
   * Reads completed tech count vs total Autoforge tree size.
   *
   * @param {Object} faction - Must have faction.techState.completedTechnologies array
   * @param {number} [totalAutoforgeTechs=15] - Total techs in the tree (override if needed)
   */
  updateResearchVictory(faction: any, victoryProgress: any, gameState: any, totalAutoforgeTechs = 15) {
    const condition = victoryProgress['vc-af-research'];
    if (!condition || !condition.unlocked) return false;

    const completed = (faction.techState?.completedTechnologies ?? faction.technologies ?? []).length;
    const total     = totalAutoforgeTechs;

    const newValue = Math.floor((completed / total) * 100);
    if (newValue !== condition.current) {
      condition.current = newValue;
      return true;
    }
    return false;
  }

  /**
   * Increment the Manufacturing Victory counter.
   * Event-driven — called when a ship, facility, or droid unit is produced.
   * Counter is cumulative and never decrements.
   *
   * @param {Object} victoryProgress - Autoforge faction's victoryProgress
   * @param {string} type - 'ship' | 'facility' | 'droid' | other
   */
  incrementManufacturingCounter(victoryProgress: any, type: any) {
    const condition = victoryProgress['vc-af-manufacturing'];
    if (!condition || !condition.unlocked) return;

    condition.current += 1;
    console.log(`[VictoryProgressUpdater] Manufacturing counter (+1 ${type}): ${condition.current}`);
  }

  /**
   * Update Autoforge Peaceful Victory composite state.
   */
  updatePeacefulVictory(faction: any, victoryProgress: any, gameState: any) {
    const condition = victoryProgress['vc-af-peaceful'];
    if (!condition || !condition.unlocked) return false;

    const prev = JSON.stringify(condition.current);

    // Non-aggression counter increments passively each turn
    condition.current.nonAggressionTurns += 1;

    // Territory control recalculated
    const systems = gameState.systems ?? [];
    const totalSystems = systems.length;
    const controlled = systems.filter((s: any) => s.loyalty === 'autoforge').length;
    condition.current.territoryControl = totalSystems > 0
      ? Math.floor((controlled / totalSystems) * 100)
      : 0;

    return JSON.stringify(condition.current) !== prev;
  }

  /**
   * Reset the Autoforge non-aggression counter to 0.
   * Call this on any Autoforge aggressive act (attack, declare war, sabotage).
   * @param {Object} victoryProgress - Autoforge faction's victoryProgress
   */
  resetNonAggressionCounter(victoryProgress: any) {
    const condition = victoryProgress['vc-af-peaceful'];
    if (!condition) return;

    if (condition.current.nonAggressionTurns > 0) {
      condition.current.nonAggressionTurns = 0;
      console.log('[VictoryProgressUpdater] Autoforge non-aggression counter reset');
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Internal helper: apply an update result and return whether a change occurred.
   * @param {Object} vp - victoryProgress object
   * @param {string} conditionId
   * @param {boolean} changed
   * @returns {boolean}
   * @private
   */
  _update(vp: any, conditionId: any, changed: any) {
    return changed === true;
  }
}

// Singleton instance
export const victoryProgressUpdater = new VictoryProgressUpdater();

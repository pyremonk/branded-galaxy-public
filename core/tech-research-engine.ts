/**
 * TechResearchEngine - Research start, turn advancement, completion, and queue logic.
 *
 * Depends on:
 *   TechTreeLoader   - Provides tech definitions
 *   TechEffectApplier - Applies stat bonuses and content unlocks on completion
 *   ResourceEngine   - Spends resources when research begins
 *
 * Faction cost modifiers:
 *   brandAuthority +10%, union ×1.00, autoforge -20%
 *
 * Research Facility discount:
 *   -10% per controlled Research Facility system with loyalty ≥ 51 (max -50%)
 *
 * Combined modifier floor: -60% (minimum cost = 40% of base)
 */

import { TechEffectApplier } from './tech-effect-applier.js';
import { applyVariance } from './timescale-config.js';

/** Faction cost modifiers (applied to credit and influence costs). */
const FACTION_COST_MODIFIERS = {
  brandAuthority: 1.10,
  union:          1.00,
  autoforge:      0.80
};

/** Per-Research-Facility cost discount (multiplicative with faction modifier). */
const FACILITY_DISCOUNT_PER_SYSTEM = 0.10;
const FACILITY_DISCOUNT_CAP        = 0.50;

/** Minimum combined modifier — no tech can cost less than 40% of base. */
const MINIMUM_COST_MULTIPLIER = 0.40;

/** Maximum items allowed in the research queue. */
const MAX_QUEUE_SIZE = 3;

export class TechResearchEngine {
  techLoader: any;
  resourceEngine: any;
  /**
   * @param {typeof import('./tech-loader.js').TechTreeLoader} techLoader - TechTreeLoader class (static)
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine - ResourceEngine instance
   */
  constructor(techLoader: any, resourceEngine: any) {
    this.techLoader     = techLoader;
    this.resourceEngine = resourceEngine;
  }

  // ─── Begin Research ──────────────────────────────────────────────────────────

  /**
   * Attempt to start researching a technology for a faction.
   *
   * @param {Object} faction           - Faction state object (has .id, .bonuses, .controlledSystems, etc.)
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {Object} resourceState     - ResourceStateManager state object
   * @param {string} techId
   * @param {number} currentTurn
   * @returns {{ success: boolean, error?: string }}
   */
  beginResearch(faction: any, techState: any, resourceState: any, techId: any, currentTurn: any, currentQuarterTurn: any) {
    const tech = this.techLoader.getTech(faction.id, techId);

    if (!tech) {
      return { success: false, error: `Unknown tech ID "${techId}"` };
    }
    if (techState.isCompleted(techId)) {
      return { success: false, error: 'Already researched' };
    }
    if (techState.isResearching(techId)) {
      return { success: false, error: 'Already researching' };
    }
    if (!techState.hasOpenResearchSlot()) {
      return { success: false, error: 'Research slots full — queue instead' };
    }

    const prerequisiteCheck = this.checkPrerequisites(techState, tech);
    if (!prerequisiteCheck.met) {
      return { success: false, error: `Prerequisites not met: ${prerequisiteCheck.missing.join(', ')}` };
    }

    const finalCost = this.calculateFinalCost(tech, faction.id, faction.controlledSystems ?? []);

    // Verify sufficient resources before spending
    const hasCredits   = (resourceState.resources?.credits   ?? 0) >= finalCost.credits;
    const hasInfluence = (resourceState.resources?.influence  ?? 0) >= finalCost.influence;
    if (!hasCredits || !hasInfluence) {
      const shortfalls = [];
      if (!hasCredits)   shortfalls.push(`Need ${finalCost.credits - (resourceState.resources?.credits ?? 0)} more Credits`);
      if (!hasInfluence) shortfalls.push(`Need ${finalCost.influence - (resourceState.resources?.influence ?? 0)} more Influence`);
      return { success: false, error: shortfalls.join(', ') };
    }

    // Spend resources
    const spendResult = this.resourceEngine.spendResources(
      resourceState,
      { credits: finalCost.credits, influence: finalCost.influence },
      `research:${techId}`,
      currentTurn
    );
    if (!spendResult?.success) {
      return { success: false, error: spendResult?.error ?? 'Insufficient resources' };
    }

    // Add to active research
    techState.state.activeResearchProjects.push({
      techId,
      turnsRemaining: finalCost.turns,
      totalTurns:     finalCost.turns,
      startedOnTurn:  currentTurn,
      completesOnTurn: currentTurn + finalCost.turns,
      completionQuarterTurn: currentQuarterTurn != null
        ? currentQuarterTurn + applyVariance(finalCost.turns, techId)
        : null
    });

    return { success: true };
  }

  // ─── Turn Advancement ────────────────────────────────────────────────────────

  /**
   * Advance all active research projects by one turn.
   * Completes finished projects and auto-starts queued techs.
   *
   * @param {Object} faction
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {Object} resourceState
   * @param {number} currentTurn
   * @returns {string[]} IDs of techs completed this turn
   */
  advanceResearch(faction: any, techState: any, resourceState: any, currentTurn: any) {
    const completed = [];

    for (const project of techState.state.activeResearchProjects) {
      project.turnsRemaining -= 1;
      if (project.turnsRemaining <= 0) {
        completed.push(project.techId);
      }
    }

    for (const techId of completed) {
      // Remove from active projects BEFORE completeTechnology (which also does this via markCompleted)
      techState.state.activeResearchProjects =
        techState.state.activeResearchProjects.filter((p: any) => p.techId !== techId);
      this.completeTechnology(faction, techState, techId);

      // Auto-start from queue while slots are open
      while (
        techState.state.researchQueue.length > 0 &&
        techState.hasOpenResearchSlot()
      ) {
        const nextId = techState.state.researchQueue.shift();

        // Validate the queued item is still researchable
        if (techState.isCompleted(nextId)) continue; // already completed via another path
        const nextTech = this.techLoader.getTech(faction.id, nextId);
        if (!nextTech) continue;
        if (!this.checkPrerequisites(techState, nextTech).met) {
          console.warn(`[TechResearchEngine] Queued tech "${nextId}" prerequisites no longer met — skipping`);
          continue;
        }

        const autoStart = this.beginResearch(faction, techState, resourceState, nextId, currentTurn, 0);
        if (!autoStart.success) {
          console.warn(`[TechResearchEngine] Auto-start of queued tech "${nextId}" failed: ${autoStart.error}`);
          // Put it back at front of queue so it will be attempted next turn
          techState.state.researchQueue.unshift(nextId);
          break;
        }
      }
    }

    return completed;
  }

  /**
   * Complete a technology: mark done, apply effects, unlock content.
   *
   * @param {Object} faction
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {string} techId
   * @returns {{ techId: string, techName: string }}
   */
  completeTechnology(faction: any, techState: any, techId: any) {
    const tech = this.techLoader.getTech(faction.id, techId);
    if (!tech) {
      console.error(`[TechResearchEngine] completeTechnology: tech "${techId}" not found for faction "${faction.id}"`);
      return { techId, techName: techId };
    }

    techState.markCompleted(techId);
    TechEffectApplier.applyEffects(faction, techState, tech);
    TechEffectApplier.unlockContent(faction, tech.unlocks);

    // Special handling: Autoforge Singularity Protocol auto-completes Tier 1-4 techs
    if (techId === 'singularity-protocol') {
      this._autoCompleteLowerTiers(faction, techState);
    }

    console.log(`[TechResearchEngine] ${faction.id}: "${tech.name}" research complete`);
    return { techId, techName: tech.name };
  }

  // ─── Queue Management ────────────────────────────────────────────────────────

  /**
   * Add a technology to the research queue.
   *
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {string} factionId
   * @param {string} techId
   * @returns {{ success: boolean, error?: string }}
   */
  queueTechnology(techState: any, factionId: any, techId: any) {
    const tech = this.techLoader.getTech(factionId, techId);
    if (!tech) {
      return { success: false, error: `Unknown tech ID "${techId}"` };
    }
    if (techState.isCompleted(techId)) {
      return { success: false, error: 'Already researched' };
    }
    if (techState.isResearching(techId)) {
      return { success: false, error: 'Already in active research' };
    }
    if (techState.isQueued(techId)) {
      return { success: false, error: 'Already queued' };
    }
    if (techState.state.researchQueue.length >= MAX_QUEUE_SIZE) {
      return { success: false, error: `Queue full — max ${MAX_QUEUE_SIZE} technologies` };
    }

    techState.state.researchQueue.push(techId);
    return { success: true };
  }

  /**
   * Replace the research queue with a reordered version.
   * All IDs must match the existing queue exactly.
   *
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {string[]} orderedTechIds
   * @returns {{ success: boolean, error?: string }}
   */
  reorderQueue(techState: any, orderedTechIds: any) {
    const current = new Set(techState.state.researchQueue);
    const provided = new Set(orderedTechIds);

    if (current.size !== provided.size || ![...current].every(id => provided.has(id))) {
      return { success: false, error: 'Reordered queue must contain exactly the same tech IDs' };
    }

    techState.state.researchQueue = [...orderedTechIds];
    return { success: true };
  }

  /**
   * Remove a technology from the research queue (no penalty).
   *
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {string} techId
   * @returns {{ success: boolean, error?: string }}
   */
  removeFromQueue(techState: any, techId: any) {
    const idx = techState.state.researchQueue.indexOf(techId);
    if (idx === -1) {
      return { success: false, error: `"${techId}" is not in the queue` };
    }
    techState.state.researchQueue.splice(idx, 1);
    return { success: true };
  }

  // ─── Cost Calculation ────────────────────────────────────────────────────────

  /**
   * Calculate the final credits, influence, and turns cost for a technology.
   * Applies faction modifier and Research Facility discount.
   *
   * @param {Object} tech                - Tech definition (has .cost)
   * @param {string} factionId
   * @param {Object[]} controlledSystems - Faction's controlled systems array
   * @returns {{ credits: number, influence: number, turns: number }}
   */
  calculateFinalCost(tech: any, factionId: any, controlledSystems: any) {
    const factionMod  = this.getFactionCostModifier(factionId);
    const facilityDiscount = this.getResearchFacilityDiscount(controlledSystems);
    // Combined: factionMod × (1 - facilityDiscount), but floor the result at MINIMUM_COST_MULTIPLIER
    const combined = Math.max(factionMod * (1 - facilityDiscount), MINIMUM_COST_MULTIPLIER);

    return {
      credits:   Math.max(1, Math.floor(tech.cost.credits   * combined)),
      influence: Math.max(1, Math.floor(tech.cost.influence * combined)),
      turns:     tech.cost.turns  // Turn count not modified in Phase 1A
    };
  }

  /**
   * Get the faction-specific research cost modifier.
   * @param {string} factionId
   * @returns {number}
   */
  getFactionCostModifier(factionId: any) {
    return (FACTION_COST_MODIFIERS as Record<string, number>)[factionId] ?? 1.00;
  }

  /**
   * Calculate the Research Facility discount for a faction's controlled systems.
   * Each Research Facility system with loyalty ≥ 51 provides -10%, capped at -50%.
   *
   * @param {Object[]} controlledSystems
   * @returns {number} Discount fraction (0.0–0.50)
   */
  getResearchFacilityDiscount(controlledSystems: any) {
    const facilityCount = (controlledSystems ?? []).filter(
      (sys: any) => sys.specialType === 'researchFacility' && (sys.loyaltyValue ?? 0) >= 51
    ).length;
    return Math.min(facilityCount * FACILITY_DISCOUNT_PER_SYSTEM, FACILITY_DISCOUNT_CAP);
  }

  // ─── Prerequisite Checking ───────────────────────────────────────────────────

  /**
   * Check whether all prerequisites for a tech are satisfied.
   *
   * @param {import('./tech-state-manager.js').TechStateManager} techState
   * @param {Object} tech
   * @returns {{ met: boolean, missing: string[] }}
   */
  checkPrerequisites(techState: any, tech: any) {
    const missing = (tech.prerequisites ?? []).filter(
      (reqId: any) => !techState.isCompleted(reqId)
    );
    return { met: missing.length === 0, missing };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * When Singularity Protocol completes, auto-complete all Tier 1-4 Autoforge techs
   * that have not yet been researched (without spending resources or consuming turns).
   * @private
   */
  _autoCompleteLowerTiers(faction: any, techState: any) {
    const allTechs = this.techLoader.getAllTechs(faction.id);
    for (const tech of allTechs) {
      if (tech.tier <= 4 && !techState.isCompleted(tech.id)) {
        techState.markCompleted(tech.id);
        TechEffectApplier.applyEffects(faction, techState, tech);
        TechEffectApplier.unlockContent(faction, tech.unlocks);
        console.log(`[TechResearchEngine] Singularity Protocol auto-completed "${tech.name}"`);
      }
    }
  }
}

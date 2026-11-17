/**
 * TechEffectApplier - Applies technology effects to faction state.
 *
 * All methods are static. The applier dispatches on effect.type and mutates
 * the faction object in place. It also records each applied effect in techState.
 *
 * Effect types supported:
 *   production-bonus    – Multiplicative bonus to a named faction bonus target
 *   military-bonus      – Multiplicative bonus to a named military bonus target
 *   storage-cap-bonus   – Percentage increase to resource caps
 *   mission-bonus       – Multiplicative bonus to a named mission bonus target
 *   research-bonus      – Multiplicative bonus to a named research bonus target
 *   cost-reduction      – Percentage reduction to a named cost category
 *   unique-capability   – Sets a boolean flag on faction.uniqueCapabilities
 *   multi-research      – Increases research slot count in techState
 */
export class TechEffectApplier {

  /**
   * Apply all effects from a completed technology to the faction and record them.
   *
   * @param {Object} faction      - Faction state object (from FactionStateManager.state or equivalent)
   * @param {Object} techState    - TechStateManager instance
   * @param {Object} tech         - Tech definition object (from TechTreeLoader)
   */
  static applyEffects(faction: any, techState: any, tech: any) {
    TechEffectApplier._ensureFactionBonusObjects(faction);

    for (const effect of tech.effects) {
      switch (effect.type) {
        case 'production-bonus':
          TechEffectApplier._applyProductionBonus(faction, effect);
          break;

        case 'military-bonus':
          TechEffectApplier._applyMilitaryBonus(faction, effect);
          break;

        case 'storage-cap-bonus':
          TechEffectApplier._applyStorageCapBonus(faction, effect);
          break;

        case 'mission-bonus':
          TechEffectApplier._applyMissionBonus(faction, effect);
          break;

        case 'research-bonus':
          TechEffectApplier._applyResearchBonus(faction, effect);
          break;

        case 'cost-reduction':
          TechEffectApplier._applyCostReduction(faction, effect);
          break;

        case 'unique-capability':
          faction.uniqueCapabilities[effect.target] = true;
          break;

        case 'multi-research':
          techState.state.multiResearchSlots = Math.max(
            techState.state.multiResearchSlots,
            effect.value
          );
          break;

        default:
          console.warn(`[TechEffectApplier] Unknown effect type "${effect.type}" on tech "${tech.id}"`);
      }
    }

    // Record all applied effects in techState
    techState.recordAppliedEffects(tech.id, tech.effects);
  }

  /**
   * Unlock units, buildings, missions, and victory conditions for the faction.
   *
   * @param {Object} faction  - Faction state object
   * @param {Object} unlocks  - Tech's unlocks object
   */
  static unlockContent(faction: any, unlocks: any) {
    if (!faction.unlockedUnits)         faction.unlockedUnits = [];
    if (!faction.unlockedBuildings)     faction.unlockedBuildings = [];
    if (!faction.unlockedMissions)      faction.unlockedMissions = [];
    if (!faction.victoryProgress)       faction.victoryProgress = {};

    faction.unlockedUnits     = [...new Set([...faction.unlockedUnits,     ...(unlocks.units     ?? [])])];
    faction.unlockedBuildings = [...new Set([...faction.unlockedBuildings, ...(unlocks.buildings ?? [])])];
    faction.unlockedMissions  = [...new Set([...faction.unlockedMissions,  ...(unlocks.missions  ?? [])])];

    for (const vc of (unlocks.victoryConditions ?? [])) {
      if (!(vc in faction.victoryProgress)) {
        faction.victoryProgress[vc] = { current: 0, target: 1, achieved: false };
      }
    }
  }

  /**
   * Check whether a faction has a specific unique capability.
   *
   * @param {Object} faction
   * @param {string} capabilityId
   * @returns {boolean}
   */
  static hasCapability(faction: any, capabilityId: any) {
    return !!(faction.uniqueCapabilities?.[capabilityId]);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Ensure all bonus container objects exist on the faction.
   * @private
   */
  static _ensureFactionBonusObjects(faction: any) {
    if (!faction.bonuses)             faction.bonuses             = {};
    if (!faction.militaryBonuses)     faction.militaryBonuses     = {};
    if (!faction.missionBonuses)      faction.missionBonuses      = {};
    if (!faction.researchBonuses)     faction.researchBonuses     = {};
    if (!faction.costReductions)      faction.costReductions      = {};
    if (!faction.uniqueCapabilities)  faction.uniqueCapabilities  = {};
    if (!faction.resourceCaps)        faction.resourceCaps        = {};
  }

  /**
   * Apply a production-bonus effect multiplicatively.
   * @private
   */
  static _applyProductionBonus(faction: any, effect: any) {
    const current = faction.bonuses[effect.target] ?? 1.0;
    faction.bonuses[effect.target] = current * (1 + effect.value);
  }

  /**
   * Apply a military-bonus effect multiplicatively.
   * @private
   */
  static _applyMilitaryBonus(faction: any, effect: any) {
    const current = faction.militaryBonuses[effect.target] ?? 1.0;
    faction.militaryBonuses[effect.target] = current * (1 + effect.value);
  }

  /**
   * Apply a storage-cap-bonus effect.
   * If target is "all", applies to all resource types.
   * @private
   */
  static _applyStorageCapBonus(faction: any, effect: any) {
    const RESOURCE_TYPES = ['credits', 'materials', 'recruits', 'influence'];
    const targets = effect.target === 'all' ? RESOURCE_TYPES : [effect.target];

    for (const resource of targets) {
      const current = faction.resourceCaps[resource] ?? 0;
      faction.resourceCaps[resource] = Math.floor(current * (1 + effect.value));
    }
  }

  /**
   * Apply a mission-bonus effect multiplicatively.
   * @private
   */
  static _applyMissionBonus(faction: any, effect: any) {
    const current = faction.missionBonuses[effect.target] ?? 1.0;
    faction.missionBonuses[effect.target] = current * (1 + effect.value);
  }

  /**
   * Apply a research-bonus effect multiplicatively.
   * @private
   */
  static _applyResearchBonus(faction: any, effect: any) {
    const current = faction.researchBonuses[effect.target] ?? 1.0;
    faction.researchBonuses[effect.target] = current * (1 + effect.value);
  }

  /**
   * Apply a cost-reduction effect.
   * Stored as a raw multiplier reduction; e.g. 0.15 → 15% cheaper.
   * Combined reductions are summed additively (e.g. two 10% = 20% total reduction).
   * Final effective cost is floored at 10% of base (no free construction).
   * @private
   */
  static _applyCostReduction(faction: any, effect: any) {
    const current = faction.costReductions[effect.target] ?? 0;
    // Sum additively and cap at 90% max reduction
    faction.costReductions[effect.target] = Math.min(current + effect.value, 0.90);
  }
}

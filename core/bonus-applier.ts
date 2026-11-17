/**
 * BonusApplier - Applies faction bonuses and restriction checks to game mechanics
 * All methods are static - no instantiation required
 */

// Maps resource types to their bonus keys in faction definitions
const RESOURCE_BONUS_MAP = {
  credits: 'creditIncome',
  materials: 'resourceProduction',
  recruits: 'recruitGeneration',
  influence: 'influenceGeneration'
};

// Maps location types to their bonus keys
const LOCATION_BONUS_MAP = {
  tradeHub: 'tradeHubBonus',
  manufacturingCenter: 'manufacturingCenterBonus'
};

export class BonusApplier {
  // ─── Resource Bonuses ─────────────────────────────────────────────────────────

  /**
   * Apply faction resource income bonus to a base value.
   * @param {Object} faction - Faction state (from FactionStateManager.getState())
   * @param {string} resource - Resource type: 'credits', 'materials', 'recruits', 'influence'
   * @param {number} baseValue - Base production value
   * @returns {number} Modified value (floored integer)
   */
  static applyResourceBonus(faction: any, resource: any, baseValue: any) {
    const bonusKey = (RESOURCE_BONUS_MAP as Record<string, string>)[resource];
    if (!bonusKey) return baseValue;
    const multiplier = faction.bonuses?.[bonusKey] ?? 1.0;
    return Math.floor(baseValue * multiplier);
  }

  /**
   * Apply construction cost bonus (lower = cheaper).
   * @param {Object} faction - Faction state
   * @param {string} buildingType - 'defensive' or other building category
   * @param {number} baseCost - Base construction cost
   * @returns {number} Modified cost (floored)
   */
  static applyConstructionBonus(faction: any, buildingType: any, baseCost: any) {
    let multiplier = 1.0;
    if (buildingType === 'defensive') {
      multiplier = faction.bonuses?.defensiveConstruction ?? 1.0;
    }
    return Math.floor(baseCost * multiplier);
  }

  /**
   * Apply research cost modifier.
   * @param {Object} faction - Faction state
   * @param {number} baseCost - Base research cost
   * @returns {number} Modified cost (floored)
   */
  static applyResearchBonus(faction: any, baseCost: any) {
    // researchSpeed reduces duration; researchCostModifier increases cost
    const speedMult = 1 / (faction.bonuses?.researchSpeed ?? 1.0);
    const costMult = faction.restrictions?.researchCostModifier ?? 1.0;
    return Math.floor(baseCost * speedMult * costMult);
  }

  /**
   * Apply fleet production speed bonus (lower return = faster production).
   * @param {Object} faction - Faction state
   * @param {number} baseTime - Base production turns
   * @returns {number} Modified production time (floored, minimum 1)
   */
  static applyFleetProductionBonus(faction: any, baseTime: any) {
    const multiplier = 1 / (faction.bonuses?.fleetProduction ?? 1.0);
    return Math.max(1, Math.floor(baseTime * multiplier));
  }

  /**
   * Apply special location type bonus (trade hub, manufacturing center, etc.).
   * @param {Object} faction - Faction state
   * @param {string} locationType - Special location type
   * @param {number} baseValue - Base value to modify
   * @returns {number} Modified value (floored)
   */
  static applySpecialLocationBonus(faction: any, locationType: any, baseValue: any) {
    const bonusKey = (LOCATION_BONUS_MAP as Record<string, string>)[locationType];
    if (!bonusKey) return baseValue;
    const multiplier = faction.bonuses?.[bonusKey] ?? 1.0;
    return Math.floor(baseValue * multiplier);
  }

  /**
   * Apply facility maintenance cost (Autoforge has zero maintenance).
   * @param {Object} faction - Faction state
   * @param {number} baseMaintenance - Base maintenance cost per turn
   * @returns {number} Actual maintenance cost
   */
  static applyMaintenanceCost(faction: any, baseMaintenance: any) {
    if (faction.bonuses?.facilityMaintenance === 0) return 0;
    return baseMaintenance;
  }

  /**
   * Apply fleet maintenance cost bonus.
   * @param {Object} faction - Faction state
   * @param {number} baseMaintenance - Base fleet maintenance
   * @returns {number} Modified maintenance cost (floored)
   */
  static applyFleetMaintenanceCost(faction: any, baseMaintenance: any) {
    const multiplier = faction.bonuses?.fleetMaintenance ?? 1.0;
    return Math.floor(baseMaintenance * multiplier);
  }

  /**
   * Apply espionage/sabotage success rate modifier.
   * @param {Object} faction - Faction state
   * @param {number} baseChance - Base success probability (0–1)
   * @returns {number} Modified probability, clamped 0–1
   */
  static applyEspionageBonus(faction: any, baseChance: any) {
    const bonusMult = faction.bonuses?.espionageSuccess ?? 1.0;
    const restrictionDelta = faction.restrictions?.sabotageSuccessModifier ?? 0;
    const modified = baseChance * bonusMult + restrictionDelta;
    return Math.max(0, Math.min(1, modified));
  }

  /**
   * Apply loyalty gain modifier for diplomatic missions.
   * @param {Object} faction - Faction state
   * @param {number} baseLoyaltyGain - Base loyalty gain amount
   * @returns {number} Modified loyalty gain (floored)
   */
  static applyLoyaltyGainBonus(faction: any, baseLoyaltyGain: any) {
    const multiplier = faction.bonuses?.loyaltyGain ?? 1.0;
    return Math.floor(baseLoyaltyGain * multiplier);
  }

  /**
   * Apply loyalty decay rate modifier.
   * @param {Object} faction - Faction state
   * @param {number} baseDecay - Base loyalty decay rate per turn
   * @returns {number} Modified decay rate
   */
  static applyLoyaltyDecayRate(faction: any, baseDecay: any) {
    const multiplier = faction.bonuses?.loyaltyDecayRate ?? 1.0;
    return baseDecay * multiplier;
  }

  /**
   * Apply diplomatic mission influence cost.
   * @param {Object} faction - Faction state
   * @param {number} baseCost - Base influence cost
   * @returns {number} Modified cost (floored)
   */
  static applyDiplomaticCost(faction: any, baseCost: any) {
    const multiplier = faction.restrictions?.diplomaticMissionCost ?? 1.0;
    return Math.floor(baseCost * multiplier);
  }

  // ─── Restriction Checks ───────────────────────────────────────────────────────

  /**
   * Check a boolean or value restriction for a faction.
   * @param {Object} faction - Faction state
   * @param {string} restrictionType - Restriction key name
   * @returns {*} The restriction value, or undefined if not set
   */
  static checkRestriction(faction: any, restrictionType: any) {
    return faction.restrictions?.[restrictionType];
  }

  /**
   * Check if faction can build secret bases.
   * @param {Object} faction - Faction state
   * @returns {boolean} True if allowed
   */
  static canBuildSecretBase(faction: any) {
    return faction.restrictions?.canBuildSecretBases !== false;
  }

  /**
   * Get maximum fleet size for this faction as a fraction (0–1).
   * Default 1.0 = no cap.
   * @param {Object} faction - Faction state
   * @returns {number} Fleet size cap multiplier
   */
  static getFleetSizeCap(faction: any) {
    return faction.restrictions?.fleetSizeCap ?? 1.0;
  }

  /**
   * Check if organic characters can be recruited by this faction.
   * @param {Object} faction - Faction state
   * @returns {boolean} True if organic characters are allowed
   */
  static canRecruitOrganicCharacters(faction: any) {
    return faction.restrictions?.organicCharactersAllowed !== false;
  }

  /**
   * Check if loyalty mechanics apply to this faction (Autoforge may be exempt).
   * @param {Object} faction - Faction state
   * @returns {boolean} True if loyalty mechanics apply
   */
  static loyaltyMechanicsApply(faction: any) {
    return faction.restrictions?.loyaltyMechanicsApply !== false;
  }

  /**
   * Check if faction can operate in zero-population systems.
   * @param {Object} faction - Faction state
   * @returns {boolean} True if allowed
   */
  static canOperateInEmptySystems(faction: any) {
    return faction.bonuses?.zeroPopulationOperation === true;
  }

  /**
   * Check if Ultimate Mobilization event should trigger.
   * The Union triggers this when they control more than the trigger threshold.
   * @param {Object} faction - Faction state
   * @param {number} controlFraction - Current control fraction (0–1)
   * @returns {boolean} True if event should trigger
   */
  static shouldTriggerMobilization(faction: any, controlFraction: any) {
    const trigger = faction.restrictions?.mobilizationTrigger;
    return trigger !== undefined && controlFraction >= trigger;
  }

  /**
   * Apply defection influence cost multiplier.
   * Brand Authority pays more influence when systems defect/are captured.
   * @param {Object} faction - Faction state
   * @param {number} baseInfluenceLoss - Base influence loss on defection
   * @returns {number} Actual influence loss
   */
  static applyDefectionInfluenceCost(faction: any, baseInfluenceLoss: any) {
    const multiplier = faction.restrictions?.defectionInfluenceCost ?? 1.0;
    return Math.floor(baseInfluenceLoss * multiplier);
  }

  /**
   * Format a bonus key/value pair as a human-readable string.
   * @param {string} key - Bonus key
   * @param {*} value - Bonus value
   * @returns {string} Formatted string
   */
  static formatBonus(key: any, value: any) {
    const labels = {
      fleetProduction: 'Fleet Production Speed',
      creditIncome: 'Credit Income',
      defensiveConstruction: 'Defensive Construction Cost',
      tradeHubBonus: 'Trade Hub Income Bonus',
      espionageSuccess: 'Espionage Success Rate',
      loyaltyGain: 'Loyalty Gain from Diplomacy',
      fleetMaintenance: 'Fleet Maintenance Cost',
      loyaltyDecayRate: 'Loyalty Decay Rate',
      resourceProduction: 'Resource Production Efficiency',
      researchSpeed: 'Research Speed',
      facilityMaintenance: 'Facility Maintenance Cost',
      manufacturingCenterBonus: 'Manufacturing Center Bonus',
      zeroPopulationOperation: 'Can operate in empty systems',
      visibilityRange: 'Visibility Range',
      secretBaseVisibility: 'Secret Base Visibility',
      recruitGeneration: 'Recruit Generation Rate',
      influenceGeneration: 'Influence Generation Rate'
    };

    const label = (labels as Record<string, string>)[key] || key;

    if (typeof value === 'boolean') {
      return value ? `✓ ${label}` : `✗ ${label}`;
    }
    if (typeof value === 'string') {
      return `${label}: ${value}`;
    }
    if (value === 0) {
      return `${label}: Free (zero cost)`;
    }

    const pct = Math.round((value - 1) * 100);
    const sign = pct >= 0 ? '+' : '';
    return `${label}: ${sign}${pct}%`;
  }

  /**
   * Format a restriction key/value pair as a human-readable string.
   * @param {string} key - Restriction key
   * @param {*} value - Restriction value
   * @returns {string} Formatted string
   */
  static formatRestriction(key: any, value: any) {
    const labels = {
      canBuildSecretBases: 'Build Secret Bases',
      sabotageSuccessModifier: 'Sabotage Success Rate',
      defectionInfluenceCost: 'Influence Cost on System Defection',
      researchCostModifier: 'Research Cost',
      fleetSizeCap: 'Maximum Fleet Size',
      maxSecretBases: 'Maximum Secret Bases',
      mobilizationTrigger: 'Ultimate Mobilization threshold',
      baseResourceProduction: 'Base Resource Production',
      recruitGeneration: 'Recruit Generation Rate',
      diplomaticMissionCost: 'Diplomatic Mission Cost',
      organicCharactersAllowed: 'Can recruit organic characters',
      loyaltyMechanicsApply: 'Loyalty mechanics active'
    };

    const label = (labels as Record<string, string>)[key] || key;

    if (typeof value === 'boolean') {
      return value ? `✓ ${label}` : `✗ ${label} (disabled)`;
    }
    if (typeof value === 'number' && value <= 1 && key !== 'maxSecretBases' && key !== 'mobilizationTrigger') {
      const pct = Math.round((value - 1) * 100);
      const sign = pct >= 0 ? '+' : '';
      return `${label}: ${sign}${pct}%`;
    }
    if (key === 'mobilizationTrigger') {
      return `${label}: at ${Math.round(value * 100)}% galaxy control`;
    }
    return `${label}: ${value}`;
  }
}

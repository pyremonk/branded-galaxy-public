/**
 * IntelEngine — Stateless intel processing engine.
 *
 * Handles:
 *  - Fleet patrol intel generation (FR-IS-003, FR-CI-006)
 *  - Outpost passive intel generation (FR-IS-005)
 *  - Reconnaissance mission intel (FR-CI-005)
 *  - False intel planting (FR-CI-004)
 *  - Counter-intelligence presence management (FR-CI-001, FR-CI-002)
 *  - Spy detection checks (FR-CI-003)
 *  - Intel expiry (purged via IntelStateManager.purgeExpired)
 *
 * Specs: 042-intel-system-spec.md, 043-intelligence-reports-spec.md,
 *        044-counter-intelligence-spec.md
 */

import { INTEL_TYPES, INTEL_BASE_DURATION } from './intel-state-manager.js';

// CI presence per character espionage threshold (FR-CI-001)
const CI_ESPIONAGE_MIN = 6;
// CI presence reduction per point (FR-CI-002)
const CI_PROB_REDUCTION_PER_POINT = 0.015;
const CI_PROB_REDUCTION_MAX = 0.15;
// CI detection base probability (FR-CI-003)
const CI_DETECTION_BASE = 0.05;
const CI_DETECTION_PER_POINT = 0.08;
// Training Facility passive CI bonus (FR-CI-001)
const TRAINING_FACILITY_CI_BONUS = 2;
// CI decay per turn (FR-CI-001)
const CI_DECAY_PER_TURN = 1;

export class IntelEngine {
  constructor() {
    // nothing to initialize — stateless
  }

  // ─── Fleet Patrol Intel (FR-IS-003, FR-CI-006) ───────────────────────────────

  /**
   * Generate intel items for all systems visited by a patrolling fleet.
   * @param {Object}   fleet - Fleet object from FleetStateManager
   * @param {Object}   galaxy - Galaxy state
   * @param {string}   ownerFactionId - Faction that owns the fleet
   * @param {number}   currentTurn
   * @returns {Object[]} Array of intel items (not yet stored)
   */
  buildPatrolIntel(fleet: any, galaxy: any, ownerFactionId: any, currentTurn: any) {
    const items: any[] = [];
    const patrolRoute = fleet.command?.route ?? [];
    const visitedSystems = new Set([fleet.systemId, ...patrolRoute]);

    for (const systemId of visitedSystems) {
      const system = galaxy?.systems?.find((s: any) => s.id === systemId);
      if (!system) continue;
      // Only generate intel on non-own systems (own systems are always visible)
      if (system.loyalty === ownerFactionId) continue;

      items.push(this._buildFleetCompositionItem(system, ownerFactionId, currentTurn, 'patrol'));
      items.push(this._buildFacilityStatusItem(system, ownerFactionId, currentTurn, 'patrol'));
    }

    return items.filter(Boolean);
  }

  // ─── Outpost Passive Intel (FR-IS-005) ───────────────────────────────────────

  /**
   * Generate passive intel for all Autoforge Outpost systems (per turn).
   * @param {Object}   galaxy
   * @param {Object}   constructionStateManager
   * @param {string}   ownerFactionId - Faction that owns the outposts
   * @param {number}   currentTurn
   * @returns {Object[]} Array of intel items (not yet stored)
   */
  buildOutpostIntel(galaxy: any, constructionStateManager: any, ownerFactionId: any, currentTurn: any) {
    const items: any[] = [];
    if (!constructionStateManager) return items;

    const bases = constructionStateManager.getBases(ownerFactionId) ?? [];
    const outpostBases = bases.filter((b: any) => b.baseTypeId === 'outpost');

    for (const base of outpostBases) {
      const system = galaxy?.systems?.find((s: any) => s.id === base.systemId);
      if (!system) continue;
      // Outpost intel is for the host system — own systems are always visible
      if (system.loyalty === ownerFactionId) continue;

      items.push(this._buildResourceOutputItem(system, ownerFactionId, currentTurn, 'outpost'));
      items.push(this._buildFleetCompositionItem(system, ownerFactionId, currentTurn, 'outpost'));
    }

    return items.filter(Boolean);
  }

  // ─── Reconnaissance Intel (FR-CI-005) ───────────────────────────────────────

  /**
   * Build intel items for a recon mission outcome.
   * @param {string}  outcomeTier - 'critical-success' | 'success' | 'failure' | 'critical-failure'
   * @param {Object}  system - Target galaxy system
   * @param {string}  factionId - Scouting faction
   * @param {number}  currentTurn
   * @param {Object}  characterStates - factionId → CharacterStateManager
   * @returns {Object[]} Intel items (not yet stored)
   */
  buildReconIntel(outcomeTier: any, system: any, factionId: any, currentTurn: any, characterStates: any) {
    const items: any[] = [];
    if (!system) return items;

    const expiryBonus = outcomeTier === 'critical-success' ? 1 : 0;

    if (outcomeTier === 'critical-success') {
      // All 5 intel types (FR-CI-005)
      items.push(this._buildSystemLoyaltyItem(system, factionId, currentTurn, 'mission', expiryBonus));
      items.push(this._buildFleetCompositionItem(system, factionId, currentTurn, 'mission', expiryBonus));
      items.push(this._buildFacilityStatusItem(system, factionId, currentTurn, 'mission', expiryBonus));
      items.push(this._buildCharacterLocationItem(system, factionId, currentTurn, characterStates, 'mission'));
      items.push(this._buildResourceOutputItem(system, factionId, currentTurn, 'mission'));
    } else if (outcomeTier === 'success') {
      items.push(this._buildSystemLoyaltyItem(system, factionId, currentTurn, 'mission'));
      items.push(this._buildFleetCompositionItem(system, factionId, currentTurn, 'mission'));
      items.push(this._buildFacilityStatusItem(system, factionId, currentTurn, 'mission'));
    }
    // failure and critical-failure: no intel gained (FR-CI-005)

    return items.filter(Boolean);
  }

  // ─── False Intel (FR-CI-004) ─────────────────────────────────────────────────

  /**
   * Build a false intel item to be planted in a target faction's store.
   * @param {string}  type - Intel type to fabricate
   * @param {Object}  system - Target system
   * @param {string}  targetFactionId - Faction to deceive
   * @param {number}  currentTurn
   * @returns {Object} False intel item
   */
  buildFalseIntelItem(type: any, system: any, targetFactionId: any, currentTurn: any) {
    const baseDuration = INTEL_BASE_DURATION[type] ?? 3;
    return {
      type,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            this._buildFakeData(type, system, currentTurn),
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration,
      source:          'mission',
      false:           true,
    };
  }

  // ─── Counter-Intelligence (FR-CI-001 through FR-CI-003) ─────────────────────

  /**
   * Get the CI presence for a faction at a system.
   * @param {string}  systemId
   * @param {string}  factionId
   * @param {Object}  galaxy
   * @returns {number} 0–10
   */
  getCIPresence(systemId: any, factionId: any, galaxy: any) {
    const system = galaxy?.systems?.find((s: any) => s.id === systemId);
    if (!system) return 0;
    system.ciPresence = system.ciPresence ?? {};
    return system.ciPresence[factionId] ?? 0;
  }

  /**
   * Calculate CI probability reduction for an attacking mission (FR-CI-002).
   * @param {number}  ciPresence
   * @returns {number} Probability delta (negative)
   */
  getCIReduction(ciPresence: any) {
    return -Math.min(CI_PROB_REDUCTION_MAX, ciPresence * CI_PROB_REDUCTION_PER_POINT);
  }

  /**
   * Roll spy detection after a Failure or Critical Failure (FR-CI-003).
   * @param {string}  systemId
   * @param {string}  defendingFactionId
   * @param {string}  outcomeTier - 'failure' | 'critical-failure'
   * @param {Object}  galaxy
   * @param {string}  rollSeed - For reproducibility
   * @returns {boolean} True if operative detected
   */
  rollDetection(systemId: any, defendingFactionId: any, outcomeTier: any, galaxy: any, rollSeed = '') {
    const ciPresence = this.getCIPresence(systemId, defendingFactionId, galaxy);
    let prob = CI_DETECTION_BASE + ciPresence * CI_DETECTION_PER_POINT;
    if (outcomeTier === 'critical-failure') prob *= 2;
    prob = Math.min(1, prob);
    // Use a simple deterministic hash from the seed for reproducibility
    const rng = this._seededRoll(rollSeed);
    return rng < prob;
  }

  /**
   * Advance CI presence for all systems: handle decay and character CI Duty (FR-CI-001).
   * Call once per Maintenance Phase.
   * @param {Object}  galaxy
   * @param {Object}  characterStates - factionId → CharacterStateManager
   * @param {Object}  constructionStateManager - For Training Facility bonus
   */
  advanceCIPresence(galaxy: any, characterStates: any, constructionStateManager: any) {
    for (const system of (galaxy?.systems ?? [])) {
      system.ciPresence = system.ciPresence ?? {};

      const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
      for (const factionId of FACTION_IDS) {
        let ci = system.ciPresence[factionId] ?? 0;

        // Check if any character with ESP ≥ CI_ESPIONAGE_MIN is on CI Duty here
        const csm = characterStates?.[factionId];
        const ciChar = csm?.getAllCharacters()?.find(
          (c: any) => c.status === 'stationed'
            && c.assignedFacility?.systemId === system.id
            && c.assignedFacility?.facilityType === 'ci-duty'
            && (c.stats?.espionage ?? 0) >= CI_ESPIONAGE_MIN
        );

        if (ciChar) {
          // Character on CI Duty: presence is set to their espionage rating (capped at 10)
          ci = Math.min(10, c_espionage(ciChar));
        } else {
          // Decay by 1 per turn (FR-CI-001)
          ci = Math.max(0, ci - CI_DECAY_PER_TURN);
        }

        // Training Facility passive bonus (FR-CI-001)
        const hasTF = this._hasTrainingFacility(system.id, factionId, constructionStateManager);
        if (hasTF) {
          ci = Math.min(10, ci + TRAINING_FACILITY_CI_BONUS);
        }

        system.ciPresence[factionId] = ci;
      }
    }
  }

  // ─── Private item builders ────────────────────────────────────────────────────

  /** @private */
  _buildSystemLoyaltyItem(system: any, factionId: any, currentTurn: any, source: any, expiryBonus = 0) {
    const baseDuration = INTEL_BASE_DURATION[INTEL_TYPES.SYSTEM_LOYALTY];
    return {
      type:            INTEL_TYPES.SYSTEM_LOYALTY,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            { loyaltyValue: system.loyaltyValue ?? 50, controlledBy: system.loyalty },
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration + expiryBonus,
      source,
      false:           false,
    };
  }

  /** @private */
  _buildFleetCompositionItem(system: any, factionId: any, currentTurn: any, source: any, expiryBonus = 0) {
    const baseDuration = INTEL_BASE_DURATION[INTEL_TYPES.FLEET_COMPOSITION];
    return {
      type:            INTEL_TYPES.FLEET_COMPOSITION,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            { controlledBy: system.loyalty, fleetPresent: true },
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration + expiryBonus,
      source,
      false:           false,
    };
  }

  /** @private */
  _buildFacilityStatusItem(system: any, factionId: any, currentTurn: any, source: any, expiryBonus = 0) {
    const baseDuration = INTEL_BASE_DURATION[INTEL_TYPES.FACILITY_STATUS];
    const facilities = (system.facilities ?? []).map((f: any) => ({
      type: f.type ?? f.facilityId,
      level: f.level ?? 1,
    }));
    return {
      type:            INTEL_TYPES.FACILITY_STATUS,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            { facilities, controlledBy: system.loyalty },
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration + expiryBonus,
      source,
      false:           false,
    };
  }

  /** @private */
  _buildCharacterLocationItem(system: any, factionId: any, currentTurn: any, characterStates: any, source: any) {
    const baseDuration = INTEL_BASE_DURATION[INTEL_TYPES.CHARACTER_LOCATION];
    // Find characters of enemy factions at this system
    const charSummaries: any[] = [];
    for (const [cfid, csm] of (Object.entries(characterStates ?? {}) as [string, any][])) {
      if (cfid === factionId) continue;
      const chars = csm.getAllCharacters().filter(
        (c: any) => c.locationSystemId === system.id
          && c.status !== 'dead'
          && c.status !== 'captured'
      );
      chars.forEach((c: any) => charSummaries.push({ name: c.name, faction: cfid, status: c.status }));
    }
    if (charSummaries.length === 0) return null;
    return {
      type:            INTEL_TYPES.CHARACTER_LOCATION,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            { characters: charSummaries },
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration,
      source,
      false:           false,
    };
  }

  /** @private */
  _buildResourceOutputItem(system: any, factionId: any, currentTurn: any, source: any) {
    const baseDuration = INTEL_BASE_DURATION[INTEL_TYPES.RESOURCE_OUTPUT];
    return {
      type:            INTEL_TYPES.RESOURCE_OUTPUT,
      systemId:        system.id,
      targetFactionId: system.loyalty ?? 'neutral',
      data:            {
        credits:   system.creditOutput   ?? system.credits   ?? 0,
        materials: system.materialOutput ?? system.materials ?? 0,
        population:system.population     ?? 0,
      },
      revealedOnTurn:  currentTurn,
      expiresOnTurn:   currentTurn + baseDuration,
      source,
      false:           false,
    };
  }

  /**
   * Build plausibly false data for a given intel type.
   * Uses deterministic _seededRoll instead of Math.random() (spec 055 FR-DET-001).
   * @private
   * @param {string} type - Intel type
   * @param {Object} system - Target system
   * @param {number} currentTurn - Turn number for seed derivation
   */
  _buildFakeData(type: any, system: any, currentTurn: any) {
    const seedBase = `intel-fake-${type}-${system.id}-t${currentTurn}`;
    switch (type) {
      case INTEL_TYPES.SYSTEM_LOYALTY:
        return { loyaltyValue: Math.floor(this._seededRoll(`${seedBase}-loyalty`) * 60) + 20, controlledBy: system.loyalty };
      case INTEL_TYPES.FLEET_COMPOSITION:
        return { controlledBy: system.loyalty, fleetPresent: true, shipCount: Math.floor(this._seededRoll(`${seedBase}-ships`) * 8) + 2 };
      case INTEL_TYPES.FACILITY_STATUS:
        return { facilities: [{ type: 'shipyard', level: 1 }], controlledBy: system.loyalty };
      case INTEL_TYPES.RESOURCE_OUTPUT:
        return { credits: Math.floor(this._seededRoll(`${seedBase}-credits`) * 300) + 100, materials: Math.floor(this._seededRoll(`${seedBase}-materials`) * 200) + 50, population: system.population ?? 0 };
      default:
        return {};
    }
  }

  /** @private — Check if a Training Facility exists at a system for a faction */
  _hasTrainingFacility(systemId: any, factionId: any, constructionStateManager: any) {
    if (!constructionStateManager) return false;
    const state = constructionStateManager.getSystemState(systemId);
    return (state?.facilities ?? []).some((f: any) => f.facilityId === 'trainingFacility' || f.type === 'trainingFacility');
  }

  /**
   * Very lightweight seeded pseudo-random [0,1) from a string seed.
   * Not cryptographic — just deterministic enough for detection rolls.
   * @private
   */
  _seededRoll(seed: any) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0) / 4294967296;
  }
}

/** @private helper used in advanceCIPresence */
function c_espionage(char: any) {
  return char.stats?.espionage ?? 0;
}

/** Singleton export */
export const intelEngine = new IntelEngine();

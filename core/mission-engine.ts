/**
 * MissionEngine — Stateless mission resolver.
 *
 * Consumes a staged mission action, calculates the outcome using
 * MissionSuccessCalculator, and applies the correct effects from
 * mission-config.json to the game state.
 *
 * Pure function interface: all state mutations are explicit parameters.
 * No side-effects outside the provided state objects.
 *
 * Spec: 021-mission-types-spec.md, 022-mission-execution-spec.md,
 *       023-mission-outcomes-spec.md
 */

import missionConfig from './mission-config.json';
import { calculateMissionProbability, rollMissionOutcome, OUTCOME_XP } from './mission-success-calculator.js';
import { characterCaptureEngine } from './character-capture-engine.js';
import { SeededRandom } from './seeded-random.js';
import { intelEngine } from './intel-engine.js';

// Resolve order weights for sorting within a tier
const TIER_RESOLVE_ORDER = { recon: 0, defensive: 1, offensive: 2, support: 3 };

// Map config underscore keys to calculator dash keys
const CONFIG_TIER_TO_CALC = {
  critical_success: 'critical-success',
  success:          'success',
  failure:          'failure',
  critical_failure: 'critical-failure'
};

// Map calculator dash keys to config underscore keys
const CALC_TIER_TO_CONFIG = {
  'critical-success': 'critical_success',
  'success':          'success',
  'failure':          'failure',
  'critical-failure': 'critical_failure'
};

// Loyalty clamp bounds (FR-MO-005)
const LOYALTY_MIN = 0;
const LOYALTY_MAX = 100;
const LOYALTY_PER_MISSION_CAP = 25;

// Counter-intelligence probability reduction (FR-ME-004)
const COUNTER_INTEL_REDUCTION = 0.15;

// Intel item expiry in turns (FR-MO-006)
const INTEL_EXPIRY_TURNS = 5;

/**
 * Map legacy intel_reveal item types (from old espionage mission format) to
 * the new IntelStateManager schema types (FR-IS-002).
 * This ensures that existing espionage missions store their items consistently
 * in the intel store alongside new reconnaissance/outpost intel.
 * @param {string} legacyType - Old item type from _buildIntelItems()
 * @returns {string} New IntelStateManager type
 */
function _legacyIntelTypeMap(legacyType: any) {
  switch (legacyType) {
    case 'troop_count':    return 'facility_status';
    case 'facility':       return 'facility_status';
    case 'facility_count': return 'facility_status';
    case 'fleet_position': return 'fleet_composition';
    default:               return 'facility_status';
  }
}

export class MissionEngine {
  _types: Map<string, any>;

  constructor() {
    /** @type {Map<string, Object>} id → mission type definition */
    this._types = new Map(missionConfig.missionTypes.map(t => [t.id, t]));
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Get all available mission type definitions.
   * @returns {Object[]}
   */
  getMissionTypes() {
    return [...this._types.values()];
  }

  /**
   * Get a single mission type definition by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getMissionType(id: any) {
    return this._types.get(id) ?? null;
  }

  /**
   * Get mission types available to a faction, optionally filtered by target type.
   * @param {string} factionId
   * @param {string} [targetType]
   * @returns {Object[]}
   */
  getAvailableMissions(factionId: any, targetType = null) {
    return this.getMissionTypes().filter(t => {
      if (t.factionRestrictions?.length > 0 && !t.factionRestrictions.includes(factionId)) return false;
      if (targetType && t.targetType !== targetType) return false;
      return true;
    });
  }

  /**
   * Validate a mission payload before staging.
   * @param {Object} payload - { missionType, factionId, characterIds, targetId, targetType, ... }
   * @param {Object} context - { characterStates, galaxy, techStates }
   * @returns {{ valid: boolean, error?: string }}
   */
  validateMission(payload: any, context: any) {
    const typeDef = this.getMissionType(payload.missionType);
    if (!typeDef) return { valid: false, error: `Unknown mission type: ${payload.missionType}` };

    // Min character check
    const charIds = payload.characterIds ?? [];
    if (charIds.length < typeDef.minCharacters) {
      return { valid: false, error: `${typeDef.name} requires at least ${typeDef.minCharacters} character(s)` };
    }

    // Roster full check for recruitment
    if (typeDef.id === 'recruitment') {
      const csm = context.characterStates?.[payload.factionId];
      if (csm && csm.getActiveCount() >= 12) {
        return { valid: false, error: 'Roster is full — cannot recruit' };
      }
    }

    // Own-faction-only check for research-assist
    if (typeDef.ownFactionOnly) {
      const system = context.galaxy?.systems?.find((s: any) => s.id === payload.targetId);
      if (system && system.loyalty !== payload.factionId) {
        return { valid: false, error: 'Research Assist may only target own-faction systems' };
      }
      // Must have active research
      const techState = context.techStates?.[payload.factionId];
      if (techState && (!techState.state?.activeResearchProjects?.length)) {
        return { valid: false, error: 'No active research project to assist' };
      }
    }

    return { valid: true };
  }

  /**
   * Calculate success probability for a mission (client-side, no RNG).
   * Exposed for live display during planning (FR-ME-002).
   *
   * @param {Object} payload - Mission payload
   * @param {Object} context - { characterStates, galaxy }
   * @returns {Object} Result from calculateMissionProbability()
   */
  calculateProbability(payload: any, context: any) {
    const csm = context.characterStates?.[payload.factionId];
    const leadChar = csm?.getCharacter(payload.characterIds?.[0]) ?? null;
    const supportChar = payload.characterIds?.length >= 2
      ? (csm?.getCharacter(payload.characterIds[1]) ?? null) : null;

    const system = context.galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
    const isEnemySystem = system ? system.loyalty !== payload.factionId && system.loyalty !== 'neutral' : false;
    const loyaltyValue  = system?.loyaltyValue ?? system?.loyaltyScore ?? 75;

    const resistance = system
      ? this._calcResistance(system, payload.factionId, context)
      : 3;

    return calculateMissionProbability({
      leadCharacter:         leadChar,
      supportCharacter:      supportChar,
      missionType:           payload.missionType,
      oppositionResistance:  resistance,
      factionId:             payload.factionId,
      isEnemySystem,
      enemySystemLoyalty:    loyaltyValue,
      characterStateManager: csm
    });
  }

  /**
   * Resolve a staged mission action.
   * Mutates game state objects and returns a report.
   *
   * @param {Object} action - Staged action { id, type: 'mission', payload }
   * @param {Object} context - {
   *   galaxy, resourceStates, techStates, characterStates,
   *   missionStateManager, currentTurn, initiativeOrder
   * }
   * @returns {{ report: Object, aborted: boolean, notifications: Object[] }}
   */
  resolve(action: any, context: any) {
    const payload   = action.payload;
    const typeDef   = this.getMissionType(payload.missionType);
    const { missionStateManager, characterStates, galaxy, currentTurn } = context;

    // ── Check if target is still valid (may have been destroyed/captured this turn)
    const abortReason = this._checkTargetAborted(payload, context);
    if (abortReason) {
      this._releaseCharacters(payload, characterStates);
      const report = this._buildReport(payload, null, [], [], currentTurn, true, abortReason);
      return { report, aborted: true, notifications: [] };
    }

    // ── Counter-intelligence (FR-ME-004, FR-CI-002) — CI presence reduces success probability
    const targetSystem = galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
    const spyNetworkRating = targetSystem?.spyNetworkRating ?? 0;
    // Seeded RNG for counter-intel roll — deterministic simulation (spec 055 FR-DET-001)
    const ciRng = new SeededRandom(`${currentTurn}-${payload.missionId}-counterintel`);
    const counterIntelActive = spyNetworkRating > 0 && ciRng.next() < spyNetworkRating * 0.15;

    // CI presence-based reduction (FR-CI-002)
    const targetSystemId = payload.targetSystemId ?? payload.targetId;
    const defenderFactionId = targetSystem?.loyalty;
    const ciPresence = (defenderFactionId && defenderFactionId !== payload.factionId && defenderFactionId !== 'neutral')
      ? intelEngine.getCIPresence(targetSystemId, defenderFactionId, galaxy)
      : 0;

    // ── Probability calculation
    const probResult = this.calculateProbability(payload, context);

    // Apply counter-intel reduction to effective probability before rolling
    if (counterIntelActive && probResult.finalProbability > 0.05) {
      probResult.finalProbability = Math.max(0.05, probResult.finalProbability - COUNTER_INTEL_REDUCTION);
    }
    // Apply CI presence reduction (FR-CI-002)
    if (ciPresence > 0 && probResult.finalProbability > 0.05) {
      const ciReduction = intelEngine.getCIReduction(ciPresence);
      probResult.finalProbability = Math.max(0.05, probResult.finalProbability + ciReduction);
    }

    // ── Roll outcome
    const csm        = characterStates?.[payload.factionId];
    const leadChar   = csm?.getCharacter(payload.characterIds?.[0]);
    const outcomeRoll = rollMissionOutcome(
      probResult,
      currentTurn,
      payload.missionId,
      payload.characterIds?.[0] ?? 'unknown',
      false, // enemy spy network visibility hidden from attacker
      leadChar?.specializations ?? []
    );

    // ── Apply effects for the outcome tier
    const configTierKey = (CALC_TIER_TO_CONFIG as Record<string, string>)[outcomeRoll.tier] ?? 'failure';
    const effects = ((typeDef?.effects ?? {}) as any)[configTierKey] ?? [];
    const effectsApplied = this._applyEffects(effects, payload, outcomeRoll.tier, context);

    // ── Capture risk (if flagged in effects or critical-failure)
    const captureEvents = this._processCaptureRisk(effects, payload, outcomeRoll, context);
    effectsApplied.push(...(captureEvents as any[]));

    // ── CI Spy Detection (FR-CI-003) — on Failure or Critical Failure for espionage/recon/false_intel
    const isEspionageMission = ['espionage', 'reconnaissance', 'false_intel', 'sabotage', 'incite-uprising'].includes(payload.missionType);
    const isFailureTier = outcomeRoll.tier === 'failure' || outcomeRoll.tier === 'critical-failure';
    if (isEspionageMission && isFailureTier && ciPresence > 0 && defenderFactionId && defenderFactionId !== 'neutral') {
      const detectSeed = `${currentTurn}-${payload.missionId}-cidetect`;
      const detected = intelEngine.rollDetection(targetSystemId, defenderFactionId, outcomeRoll.tier, galaxy, detectSeed);
      if (detected) {
        // Capture the lead character (if not already captured)
        const leadCharId = payload.characterIds?.[0];
        const csm = (characterStates as any)?.[payload.factionId];
        if (leadCharId && csm && !captureEvents.find(e => e.characterId === leadCharId)) {
          csm.capture(leadCharId, targetSystemId, defenderFactionId);
          captureEvents.push({ type: 'character_captured', characterId: leadCharId, factionId: payload.factionId, holdSystemId: targetSystemId });
          effectsApplied.push(({ type: 'ci_detection', characterId: leadCharId, systemId: targetSystemId, defenderFactionId } as any));
          // Notify defender
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: { tier: 'alert', message: `Enemy operative detected in ${targetSystem?.name ?? targetSystemId}`, locationId: targetSystemId }
          }));
        }
      }
    }

    // ── XP awards (FR-MO-008)
    const xpAwarded = outcomeRoll.xpReward;
    this._awardXP(payload.characterIds ?? [], xpAwarded, characterStates, payload.factionId);

    // ── Release characters (unless captured)
    const capturedCharIds = captureEvents.filter(e => e.type === 'character_captured').map(e => e.characterId);
    this._releaseCharacters(payload, characterStates, capturedCharIds);

    // ── Build report
    const report = this._buildReport(
      payload,
      outcomeRoll,
      effectsApplied,
      captureEvents,
      currentTurn,
      false,
      null
    );

    // ── Store report
    if (missionStateManager) {
      missionStateManager.recordReport(payload.factionId, report);
    }

    // ── Build notifications
    const notifications = this._buildNotifications(report, outcomeRoll, effectsApplied);

    console.log(`[MissionEngine] Resolved ${payload.missionType} for ${payload.factionId}: ${outcomeRoll.tier}`);
    return { report, aborted: false, notifications };
  }

  // ─── Effect Application ───────────────────────────────────────────────────────

  /**
   * Apply all effects from the outcome tier.
   * @private
   */
  _applyEffects(effects: any, payload: any, tier: any, context: any) {
    const applied = [];
    const { galaxy, resourceStates, techStates, characterStates, missionStateManager, currentTurn } = context;

    for (const effect of effects) {
      try {
        const result = this._applySingleEffect(effect, payload, tier, context);
        if (result) applied.push(result);
      } catch (err) {
        console.warn(`[MissionEngine] Error applying effect ${effect.type}:`, err);
      }
    }
    return applied;
  }

  /** @private */
  _applySingleEffect(effect: any, payload: any, tier: any, context: any) {
    const { galaxy, resourceStates, techStates, characterStates, missionStateManager, currentTurn, intelStateManager } = context;

    switch (effect.type) {

      // ── Loyalty Shift (FR-MO-002, FR-MO-005) ──────────────────────────────────
      case 'loyalty_shift': {
        const system = galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
        if (!system) return null;

        // Determine which faction's loyalty to shift
        const loyaltyTarget = effect.target === 'controlling' ? system.loyalty : payload.factionId;
        if (!loyaltyTarget || loyaltyTarget === 'neutral') return null;

        // Revolt takes priority — discard loyalty shift if system is in revolt (FR-MO-003)
        if (missionStateManager?.isInRevolt(system.id)) return null;

        const currentLoyalty = this._getSystemLoyaltyFor(system, loyaltyTarget);
        const rawShift = effect.amount;
        const cappedShift = Math.sign(rawShift) * Math.min(Math.abs(rawShift), LOYALTY_PER_MISSION_CAP);
        const newLoyalty  = Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, currentLoyalty + cappedShift));
        const actualShift = newLoyalty - currentLoyalty;

        // Apply: for own faction, increase loyaltyValue; for enemy, decrease their loyalty
        if (effect.target === 'controlling') {
          // Shift toward or away from controlling faction
          system.loyaltyValue = (system.loyaltyValue ?? 75) + cappedShift;
          system.loyaltyValue = Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, system.loyaltyValue));
        } else {
          // Shift toward caster's faction = increase loyaltyValue if system is ours, or flip if neutral/enemy
          system.loyaltyValue = (system.loyaltyValue ?? 75) + cappedShift;
          system.loyaltyValue = Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, system.loyaltyValue));
        }

        return { type: 'loyalty_shift', systemId: system.id, amount: actualShift, targetFaction: loyaltyTarget };
      }

      // ── Intel Reveal (FR-MO-006) ───────────────────────────────────────────────
      case 'intel_reveal': {
        const systemId = payload.targetSystemId ?? payload.targetId;
        const system   = galaxy?.systems?.find((s: any) => s.id === systemId);
        if (!system) return null;

        const items = this._buildIntelItems(effect.items, system, payload.factionId, currentTurn, galaxy);
        if (items.length > 0) {
          window.dispatchEvent(new CustomEvent('game:intelRevealed', {
            detail: { factionId: payload.factionId, systemId, items }
          }));
          // Store in IntelStateManager if available (FR-IS-004)
          if (intelStateManager) {
            for (const legacyItem of items) {
              intelStateManager.addIntelItem(payload.factionId, {
                type:            _legacyIntelTypeMap(legacyItem.type),
                systemId:        legacyItem.systemId ?? systemId,
                targetFactionId: system.loyalty ?? 'neutral',
                data:            legacyItem,
                revealedOnTurn:  currentTurn,
                source:          'mission',
              });
            }
            window.dispatchEvent(new CustomEvent('galaxy:intelUpdate', {
              detail: { factionId: payload.factionId }
            }));
          }
        }
        return { type: 'intel_reveal', systemId, itemCount: items.length, items };
      }

      // ── Facility Damage (FR-MO-002) ────────────────────────────────────────────
      case 'facility_damage': {
        const system = galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
        if (!system) return null;

        // Target specific facility or first available
        const facilityType = payload.facilityType;
        let facility = facilityType
          ? (system.facilities ?? []).find((f: any) => f.type === facilityType)
          : (system.facilities ?? [])[0];

        if (!facility) return null;

        facility.hp = (facility.hp ?? 3) - effect.amount;
        const destroyed = facility.hp <= 0;
        if (destroyed) {
          system.facilities = (system.facilities ?? []).filter((f: any) => f !== facility);
          window.dispatchEvent(new CustomEvent('game:facilityDestroyed', {
            detail: { systemId: system.id, facilityType: facility.type, factionId: payload.factionId }
          }));
        }
        return { type: 'facility_damage', systemId: system.id, facilityType: facility.type, amount: effect.amount, destroyed };
      }

      // ── Recruit Character (FR-MT-005) ──────────────────────────────────────────
      case 'recruit_character': {
        const csm = (characterStates as any)?.[payload.factionId];
        if (!csm) return null;
        const leadChar = csm.getCharacter(payload.characterIds?.[0]);
        const seed = new SeededRandom(`${currentTurn}-${payload.missionId}-recruit`);

        // Temporarily bump diplomacy to match recruitment tier
        const tierDiplomacy = effect.tier === 3 ? 9 : effect.tier === 2 ? 6 : 3;
        const fakeChar = leadChar ? { ...leadChar, stats: { ...(leadChar.stats ?? {}), diplomacy: tierDiplomacy } } : { stats: { diplomacy: tierDiplomacy } };
        const result = csm.recruitCharacter(fakeChar, seed);
        if (!result.success) return { type: 'recruit_character', success: false, error: result.error };
        return { type: 'recruit_character', success: true, characterId: result.character.id, tier: effect.tier };
      }

      // ── Research Advance (FR-MT-006) ───────────────────────────────────────────
      case 'research_advance': {
        const techState = techStates?.[payload.factionId];
        if (!techState) return null;
        const active = techState.state?.activeResearchProjects ?? [];
        if (active.length === 0) return null;
        // Advance/retard the first active project
        const project = active[0];
        const originalProgress = project.progressTurns ?? 0;
        project.progressTurns = Math.max(0, originalProgress + effect.turns);
        return { type: 'research_advance', turns: effect.turns, techId: project.techId };
      }

      // ── System Revolt (FR-MT-007) ──────────────────────────────────────────────
      case 'system_revolt': {
        const system = galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
        if (!system) return null;
        const prevFaction = system.loyalty;
        if (prevFaction === 'neutral') return null;

        system.loyalty = 'neutral';
        system.loyaltyValue = 50;
        if (missionStateManager) {
          missionStateManager.registerRevolt(system.id, prevFaction, effect.duration, currentTurn);
        }
        window.dispatchEvent(new CustomEvent('game:systemRevolt', {
          detail: { systemId: system.id, previousFaction: prevFaction, duration: effect.duration }
        }));
        return { type: 'system_revolt', systemId: system.id, duration: effect.duration, previousFaction: prevFaction };
      }

      // ── Troop Reduction ────────────────────────────────────────────────────────
      case 'troop_reduction': {
        const system = galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
        if (!system) return null;
        const before = system.troops ?? 0;
        system.troops = Math.max(0, before - effect.amount);
        return { type: 'troop_reduction', systemId: system.id, amount: effect.amount };
      }

      // ── Character Status Change ────────────────────────────────────────────────
      case 'character_status': {
        if (effect.target === 'mission_characters') {
          // Abduction critical failure: mission chars captured
          return null; // handled in _processCaptureRisk
        }
        const targetCharId = effect.target === 'held_character'
          ? payload.heldCharacterId
          : payload.targetCharacterId;
        if (!targetCharId) return null;

        const targetFactionId = this._findCharacterFaction(targetCharId, characterStates);
        if (!targetFactionId) return null;
        const targetCsm = characterStates[targetFactionId];

        if (effect.status === 'dead') {
          targetCsm.execute(targetCharId);
          return { type: 'character_killed', characterId: targetCharId, factionId: targetFactionId };
        }

        if (effect.status === 'wounded') {
          // Force to Available; apply temporary stat penalty
          targetCsm.completeMission(targetCharId, 0);
          if (missionStateManager && effect.statPenalty) {
            missionStateManager.applyStatPenalty(targetCharId, 'espionage', effect.statPenalty, currentTurn + (effect.penaltyDuration ?? 1));
          }
          return { type: 'character_wounded', characterId: targetCharId, factionId: targetFactionId, statPenalty: effect.statPenalty ?? 0 };
        }

        if (effect.status === 'captured') {
          const holdSystemId = effect.location === 'abductor_base'
            ? this._findNearestBase(payload.factionId, galaxy)
            : (payload.targetSystemId ?? payload.targetId);
          targetCsm.capture(targetCharId, holdSystemId, payload.factionId);
          return { type: 'character_captured', characterId: targetCharId, factionId: targetFactionId, holdSystemId };
        }

        if (effect.status === 'rescued') {
          targetCsm.rescue(targetCharId, payload.targetSystemId ?? payload.targetId);
          return { type: 'character_rescued', characterId: targetCharId, factionId: targetFactionId };
        }

        return null;
      }

      // ── Diplomatic Consequence (FR-MT-009) ─────────────────────────────────────
      case 'diplomatic_consequence': {
        // Find the opposing faction
        const opposingFaction = this._findOpposingFaction(payload, context);
        if (!opposingFaction) return null;
        const rsm = resourceStates?.[opposingFaction];
        if (!rsm) return null;
        // Add influence to opposing faction
        rsm.state.resources.influence = Math.min(
          rsm.state.resourceCaps?.influence ?? 1000,
          (rsm.state.resources.influence ?? 0) + effect.amount
        );
        window.dispatchEvent(new CustomEvent('game:diplomaticConsequence', {
          detail: { factionId: opposingFaction, amount: effect.amount, sourceMission: payload.missionType }
        }));
        return { type: 'diplomatic_consequence', factionId: opposingFaction, amount: effect.amount };
      }

      // ── XP Gain on Failure (FR-MT-005) ─────────────────────────────────────────
      case 'xp_gain': {
        // Applied separately in _awardXP but recorded here for report
        return { type: 'xp_gain', amount: effect.amount };
      }

      // ── Target Alert (FR-MT-009) ───────────────────────────────────────────────
      case 'target_alert': {
        const rng  = new SeededRandom(`${currentTurn}-${payload.missionId}-alert`);
        if (!rng.chance(effect.probability ?? 0.10)) return null;
        const targetCharId   = payload.targetCharacterId;
        const targetFactionId = this._findCharacterFaction(targetCharId, characterStates);
        if (!targetFactionId) return null;
        const targetCsm = characterStates[targetFactionId];
        const targetChar = targetCsm?.getCharacter(targetCharId);
        if (!targetChar) return null;
        // Permanently increase stat
        if (targetChar.stats?.[effect.stat] !== undefined) {
          targetChar.stats[effect.stat] = Math.min(10, targetChar.stats[effect.stat] + effect.amount);
        }
        return { type: 'target_alert', characterId: targetCharId, stat: effect.stat, amount: effect.amount };
      }

      // ── Detection / Capture risk — handled outside
      case 'detection_chance':
      case 'capture_risk':
        return null;

      // ── Reconnaissance Intel (FR-CI-005) ──────────────────────────────────────
      case 'recon_intel': {
        const systemId = payload.targetSystemId ?? payload.targetId;
        const system   = galaxy?.systems?.find((s: any) => s.id === systemId);
        if (!system || !intelStateManager) return null;

        const reconTier = effect.tier ?? tier;
        const items = intelEngine.buildReconIntel(reconTier, system, payload.factionId, currentTurn, characterStates);
        for (const item of items) {
          intelStateManager.addIntelItem(payload.factionId, item);
        }
        if (items.length > 0) {
          window.dispatchEvent(new CustomEvent('galaxy:intelUpdate', {
            detail: { factionId: payload.factionId }
          }));
        }
        return { type: 'recon_intel', systemId, itemCount: items.length };
      }

      // ── False Intel Plant (FR-CI-004) ─────────────────────────────────────────
      case 'plant_false_intel': {
        const systemId = payload.targetSystemId ?? payload.targetId;
        const system   = galaxy?.systems?.find((s: any) => s.id === systemId);
        if (!system || !intelStateManager) return null;

        const targetFactionId = system.loyalty;
        if (!targetFactionId || targetFactionId === 'neutral' || targetFactionId === payload.factionId) return null;

        const falseItem = intelEngine.buildFalseIntelItem(
          effect.intelType ?? 'fleet_composition',
          system,
          targetFactionId,
          currentTurn
        );
        intelStateManager.addIntelItem(targetFactionId, falseItem);
        window.dispatchEvent(new CustomEvent('galaxy:intelUpdate', {
          detail: { factionId: targetFactionId }
        }));
        return { type: 'plant_false_intel', systemId, intelType: effect.intelType, targetFactionId };
      }

      default:
        console.warn(`[MissionEngine] Unknown effect type: ${effect.type}`);
        return null;
    }
  }

  // ─── Capture Risk Processing ──────────────────────────────────────────────────

  /** @private */
  _processCaptureRisk(effects: any, payload: any, outcomeRoll: any, context: any) {
    const events: any[] = [];
    const { characterStates, currentTurn, galaxy } = context;
    const csm = (characterStates as any)?.[payload.factionId];

    // Abduction critical failure: capture mission characters
    const missionCharCapture = effects.find((e: any) => e.type === 'character_status' && e.target === 'mission_characters');
    if (missionCharCapture) {
      const targetSystem = payload.targetSystemId ?? payload.targetId;
      const targetFaction = galaxy?.systems?.find((s: any) => s.id === targetSystem)?.loyalty ?? 'neutral';
      for (const charId of (payload.characterIds ?? [])) {
        csm?.capture(charId, targetSystem, targetFaction);
        events.push({ type: 'character_captured', characterId: charId, factionId: payload.factionId, holdSystemId: targetSystem });
      }
      return events;
    }

    // Generic capture risk on critical failure (or elevated chance on abduction failure)
    const captureRiskEffect = effects.find((e: any) => e.type === 'capture_risk');
    if (!captureRiskEffect) return events;

    const seed = `${currentTurn}-${payload.missionId}-capture`;
    const targetSystemId = payload.targetSystemId ?? payload.targetId;
    const capturingFactionId = galaxy?.systems?.find((s: any) => s.id === targetSystemId)?.loyalty ?? 'neutral';

    const charIds = captureRiskEffect.affectsTeam ? (payload.characterIds ?? []) : [payload.characterIds?.[0]].filter(Boolean);

    for (const charId of charIds) {
      const char = csm?.getCharacter(charId);
      if (!char) continue;

      const prob = captureRiskEffect.probability ?? undefined; // use default if not specified
      let captured;
      if (prob !== undefined) {
        const rng = new SeededRandom(`${seed}-${charId}`);
        captured = rng.chance(prob);
      } else {
        captured = characterCaptureEngine.rollCapture(char, 'critical-mission-failure', {}, `${seed}-${charId}`);
      }

      if (captured) {
        csm.capture(charId, targetSystemId, capturingFactionId);
        events.push({ type: 'character_captured', characterId: charId, factionId: payload.factionId, holdSystemId: targetSystemId });
      }
    }

    return events;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /** @private */
  _checkTargetAborted(payload: any, context: any) {
    const { characterStates } = context;
    // Rescue missions target a captured character — 'captured' is the EXPECTED status
    if (payload.missionType === 'rescue') {
      const targetCharId = payload.heldCharacterId ?? payload.targetCharacterId;
      if (!targetCharId) return null;
      const factionId = this._findCharacterFaction(targetCharId, characterStates);
      if (!factionId) return `Rescue target character no longer exists`;
      const char = characterStates[factionId]?.getCharacter(targetCharId);
      // Abort only if character is freed or dead (no longer in captivity)
      if (!char || char.status === 'dead' || char.status === 'available') {
        return `Rescue target no longer needs rescue (${char?.status ?? 'gone'})`;
      }
      return null;
    }

    // All other missions targeting a character: abort if dead or captured this turn
    if (payload.targetCharacterId) {
      const factionId = this._findCharacterFaction(payload.targetCharacterId, characterStates);
      if (!factionId) return `Target character no longer exists`;
      const char = characterStates[factionId]?.getCharacter(payload.targetCharacterId);
      if (!char || char.status === 'dead' || char.status === 'captured') {
        return `Target character unavailable (${char?.status ?? 'gone'})`;
      }
    }
    return null;
  }

  /** @private */
  _releaseCharacters(payload: any, characterStates: any, capturedCharIds: string[] = []) {
    const csm = (characterStates as any)?.[payload.factionId];
    if (!csm) return;
    for (const charId of (payload.characterIds ?? [])) {
      if (!capturedCharIds.includes(charId)) {
        csm.completeMission(charId, 0); // XP already awarded separately
      }
    }
  }

  /** @private */
  _awardXP(characterIds: any, xpAmount: any, characterStates: any, factionId: any) {
    if (!xpAmount) return;
    const csm = characterStates?.[factionId];
    if (!csm) return;
    for (const charId of characterIds) {
      csm.addXP(charId, xpAmount);
    }
  }

  /** @private */
  _buildReport(payload: any, outcomeRoll: any, effectsApplied: any, captureEvents: any, currentTurn: any, aborted: any, abortReason: any) {
    return {
      missionId:        payload.missionId,
      missionType:      payload.missionType,
      characterIds:     payload.characterIds ?? [],
      targetId:         payload.targetId ?? null,
      targetType:       payload.targetType ?? null,
      outcomeTier:      outcomeRoll?.tier ?? null,
      effectsApplied:   effectsApplied.filter(Boolean),
      captureEvents,
      detectionOccurred: outcomeRoll?.detected ?? false,
      xpAwarded:        outcomeRoll?.xpReward ?? 0,
      turn:             currentTurn,
      aborted:          aborted ?? false,
      abortReason:      abortReason ?? null,
      factionId:        payload.factionId
    };
  }

  /** @private */
  _buildNotifications(report: any, outcomeRoll: any, effectsApplied: any) {
    const notes = [];
    if (report.aborted) {
      notes.push({ tier: 'warning', message: `Mission aborted: ${report.abortReason}` });
      return notes;
    }
    const tier = outcomeRoll?.tier ?? 'failure';
    const isUrgent = tier === 'critical-failure' || report.captureEvents.length > 0;
    notes.push({
      tier: isUrgent ? 'alert' : (tier === 'critical-success' ? 'success' : 'info'),
      message: this._describeOutcome(report),
      urgent: isUrgent
    });
    return notes;
  }

  /** @private */
  _describeOutcome(report: any) {
    if (report.aborted) return `Mission aborted — ${report.abortReason}`;
    const tierLabels = {
      'critical-success': 'Critical Success',
      'success':          'Success',
      'failure':          'Failure',
      'critical-failure': 'Critical Failure'
    };
    const tierLabel = (tierLabels as Record<string, string>)[report.outcomeTier] ?? report.outcomeTier;
    const typeDef   = this.getMissionType(report.missionType);
    const name      = typeDef?.name ?? report.missionType;
    return `${name}: ${tierLabel}`;
  }

  /** @private */
  _buildIntelItems(items: any, system: any, factionId: any, currentTurn: any, galaxy: any) {
    const result = [];
    for (const itemType of (items ?? [])) {
      switch (itemType) {
        case 'troop_count':
          result.push({ type: 'troop_count', systemId: system.id, faction: system.loyalty, value: system.troops ?? 0, turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          break;
        case 'facilities':
          (system.facilities ?? []).forEach((f: any) => {
            result.push({ type: 'facility', systemId: system.id, faction: system.loyalty, value: f.type, turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          });
          if ((system.facilities ?? []).length === 0) {
            result.push({ type: 'facility', systemId: system.id, faction: system.loyalty, value: 'none', turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          }
          break;
        case 'facility_count':
          result.push({ type: 'facility_count', systemId: system.id, faction: system.loyalty, value: (system.facilities ?? []).length, turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          break;
        case 'fleet_details':
          result.push({ type: 'fleet_position', systemId: system.id, faction: system.loyalty, value: 'detailed', turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          break;
        case 'fleet_positions':
          result.push({ type: 'fleet_position', systemId: system.id, faction: system.loyalty, value: 'present', turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
          break;
        case 'fleet_positions_2hop': {
          // Reveal fleet positions within 2 hops
          const connections = galaxy?.connections ?? [];
          const visited = new Set([system.id]);
          let frontier = [system.id];
          for (let hop = 0; hop < 2; hop++) {
            const next = [];
            for (const sysId of frontier) {
              const neighbors = connections.filter((c: any) => c.from === sysId || c.to === sysId)
                .map((c: any) => c.from === sysId ? c.to : c.from);
              for (const n of neighbors) {
                if (!visited.has(n)) {
                  visited.add(n);
                  next.push(n);
                  result.push({ type: 'fleet_position', systemId: n, faction: null, value: 'nearby', turnRevealed: currentTurn, expiresAfterTurns: INTEL_EXPIRY_TURNS });
                }
              }
            }
            frontier = next;
          }
          break;
        }
        default:
          break;
      }
    }
    return result;
  }

  /** @private */
  _getSystemLoyaltyFor(system: any, factionId: any) {
    return system.loyaltyValue ?? system.loyaltyScore ?? 75;
  }

  /** @private */
  _findCharacterFaction(characterId: any, characterStates: any) {
    if (!characterStates) return null;
    for (const [factionId, csm] of (Object.entries(characterStates) as [string, any][])) {
      if (csm.getCharacter(characterId)) return factionId;
    }
    return null;
  }

  /** @private */
  _findNearestBase(factionId: any, galaxy: any) {
    const ownSystems = (galaxy?.systems ?? []).filter((s: any) => s.loyalty === factionId);
    return ownSystems[0]?.id ?? null;
  }

  /** @private */
  _findOpposingFaction(payload: any, context: any) {
    const targetSystem = context.galaxy?.systems?.find((s: any) => s.id === (payload.targetSystemId ?? payload.targetId));
    if (targetSystem?.loyalty && targetSystem.loyalty !== payload.factionId && targetSystem.loyalty !== 'neutral') {
      return targetSystem.loyalty;
    }
    // For character-targeted missions, find the character's faction
    if (payload.targetCharacterId) {
      return this._findCharacterFaction(payload.targetCharacterId, context.characterStates);
    }
    return null;
  }

  /** @private */
  _calcResistance(system: any, attackingFactionId: any, context: any) {
    if (!system) return 3;
    const systemFaction = system.loyalty;
    if (!systemFaction || systemFaction === 'neutral' || systemFaction === attackingFactionId) return 0;

    let resistance = system.baseResistance ?? 3;
    if (system.isHomeworld) resistance += 3;
    const loyaltyValue = system.loyaltyValue ?? system.loyaltyScore ?? 75;
    if (loyaltyValue <= 30) resistance -= 2;
    return Math.max(0, Math.min(10, resistance));
  }
}

/** Singleton export for easy use in TurnResolutionEngine. */
export const missionEngine = new MissionEngine();

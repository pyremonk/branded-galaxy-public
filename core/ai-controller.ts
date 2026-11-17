/**
 * AIController — One instance per AI-controlled faction.
 *
 * Implements faction-appropriate decision making with configurable
 * difficulty (Easy/Medium/Hard). Operates within the same resource
 * and action rules as human players — no fog-of-war cheating.
 *
 * Specs: 032-ai-strategy-spec.md, 033-ai-actions-spec.md
 */

import { TechTreeLoader } from './tech-loader.js';
import { SeededRandom } from './seeded-random.js';
import { CMD, makeCommand } from './command-types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_STATE_VERSION = 1;

// Resource reserve thresholds (FR-AIA-006)
const RESOURCE_RESERVES = {
  credits:   200,
  materials: 100,
  influence:  50
};

// ─── Macro Goal IDs (FR-AIS-004) ─────────────────────────────────────────────

export const MACRO_GOAL = {
  EXPAND:   'expand',
  FORTIFY:  'fortify',
  SUPPRESS: 'suppress',
  STRIKE:   'strike',
  RESEARCH: 'research',
  SURVIVE:  'survive'
};

// ─── Faction Personality Configurations (FR-AIS-001) ─────────────────────────

const FACTION_PERSONALITIES = {
  brandAuthority: {
    defaultGoals: [MACRO_GOAL.EXPAND, MACRO_GOAL.FORTIFY, MACRO_GOAL.RESEARCH],
    weights: {
      [MACRO_GOAL.EXPAND]:   1.4,
      [MACRO_GOAL.FORTIFY]:  1.3,
      [MACRO_GOAL.SUPPRESS]: 0.6,
      [MACRO_GOAL.STRIKE]:   0.8,
      [MACRO_GOAL.RESEARCH]: 0.9,
      [MACRO_GOAL.SURVIVE]:  0.5
    }
  },
  union: {
    defaultGoals: [MACRO_GOAL.SUPPRESS, MACRO_GOAL.SURVIVE, MACRO_GOAL.EXPAND],
    weights: {
      [MACRO_GOAL.EXPAND]:   0.7,
      [MACRO_GOAL.FORTIFY]:  0.6,
      [MACRO_GOAL.SUPPRESS]: 1.5,
      [MACRO_GOAL.STRIKE]:   0.7,
      [MACRO_GOAL.RESEARCH]: 0.8,
      [MACRO_GOAL.SURVIVE]:  1.4
    }
  },
  autoforge: {
    defaultGoals: [MACRO_GOAL.FORTIFY, MACRO_GOAL.EXPAND, MACRO_GOAL.RESEARCH],
    weights: {
      [MACRO_GOAL.EXPAND]:   1.3,
      [MACRO_GOAL.FORTIFY]:  1.4,
      [MACRO_GOAL.SUPPRESS]: 0.5,
      [MACRO_GOAL.STRIKE]:   0.8,
      [MACRO_GOAL.RESEARCH]: 1.3,
      [MACRO_GOAL.SURVIVE]:  0.4
    }
  }
};

// ─── Difficulty Configuration (FR-AIS-002) ───────────────────────────────────

const DIFFICULTY_CONFIG = {
  easy:   { scoringNoise: 0.30, goalReevalFrequency: 5, maxActionsPerTurn: 3 },
  medium: { scoringNoise: 0.05, goalReevalFrequency: 3, maxActionsPerTurn: 3 },
  hard:   { scoringNoise: 0.00, goalReevalFrequency: 1, maxActionsPerTurn: 3 }
};

// ─── Reactive Strategy Thresholds (FR-AIS-005) ───────────────────────────────

const REACTIVE_THRESHOLDS = {
  baLoyaltyControlPct:  0.40,  // BA controls > 40% → Union/Autoforge increase Suppress + Strike
  autoforgeOutpostCount: 12    // Autoforge systems > 12 → Brand Authority increases Suppress
};

const REACTIVE_OVERRIDE_DURATION = 8; // turns

// ─── Mission Metadata ─────────────────────────────────────────────────────────

const MISSION_STAT_MAP = {
  espionage:       'espionage',
  sabotage:        'espionage',
  diplomatic:      'diplomacy',
  recon:           'espionage',
  'research-assist': 'research'
};

const MISSION_TIER_MAP = {
  espionage:       'offensive',
  sabotage:        'offensive',
  diplomatic:      'support',
  recon:           'recon',
  'research-assist': 'support'
};

const GOAL_MISSION_TYPES = {
  [MACRO_GOAL.SUPPRESS]: ['espionage', 'sabotage'],
  [MACRO_GOAL.EXPAND]:   ['diplomatic'],
  [MACRO_GOAL.SURVIVE]:  ['recon', 'espionage'],
  [MACRO_GOAL.STRIKE]:   ['recon'],
  [MACRO_GOAL.FORTIFY]:  ['recon'],
  [MACRO_GOAL.RESEARCH]: ['research-assist']
};

// ─── AIController ─────────────────────────────────────────────────────────────

export class AIController {
  factionId: any;
  difficulty: any;
  _personality: any;
  _diffConfig: any;
  _state: any;
  /**
   * @param {string} factionId - The AI-controlled faction ID
   * @param {string} [difficulty='medium'] - 'easy' | 'medium' | 'hard'
   */
  constructor(factionId: any, difficulty = 'medium') {
    this.factionId   = factionId;
    this.difficulty  = (difficulty ?? 'medium').toLowerCase();
    this._personality = (FACTION_PERSONALITIES as Record<string, any>)[factionId] ?? FACTION_PERSONALITIES.brandAuthority;
    this._diffConfig  = (DIFFICULTY_CONFIG as Record<string, any>)[this.difficulty]  ?? DIFFICULTY_CONFIG.medium;

    this._state = this._initState();
    console.log(`[AIController] Created for ${factionId} (${this.difficulty})`);
  }

  /** @private */
  _initState() {
    return {
      version:                    AI_STATE_VERSION,
      currentGoals:               [...this._personality.defaultGoals],
      goalWeights:                { ...this._personality.weights },
      reactiveOverrides:          {},
      reactiveOverrideTurnsLeft:  0,
      intelModel:                 {},
      lastGoalEvalTurn:           0
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Execute the AI faction's turn. Stages actions into TurnStateManager.
   * Must complete within 500ms (FR-AIS-003 constraint).
   *
   * @param {Object} context - Shared game context (same shape as TurnResolutionEngine context)
   * @param {import('./turn-state-manager.js').TurnStateManager} turnStateManager
   */
  takeTurn(context: any, turnStateManager: any) {
    const startTime = Date.now();
    const turn = context.currentTurn ?? 1;

    // 1. Re-evaluate macro goals on schedule (FR-AIS-004)
    const reevalFreq = this._diffConfig.goalReevalFrequency;
    if (turn - this._state.lastGoalEvalTurn >= reevalFreq || this._state.lastGoalEvalTurn === 0) {
      this._evaluateMacroGoals(context);
      this._state.lastGoalEvalTurn = turn;
    }

    // 2. Apply reactive strategy adjustments (FR-AIS-005)
    this._applyReactiveAdjustments(context);

    // 3. Non-action-point decisions (tech research, ship production)
    this._decideTechResearch(context);
    this._decideShipProduction(context);

    // 4. Collect and score action candidates (FR-AIS-003)
    const effectiveWeights = this._getEffectiveWeights();
    const candidates = this._collectActionCandidates(context, effectiveWeights);

    // 5. Apply Easy difficulty scoring noise ±30% (FR-AIS-002)
    //    Seeded RNG ensures deterministic simulation (spec 055 FR-DET-001)
    if (this.difficulty === 'easy') {
      const noiseRng = new SeededRandom(`${turn}-${this.factionId}-ai-noise`);
      for (const c of candidates) {
        const noise = 1 + (noiseRng.nextFloat(-1, 1)) * this._diffConfig.scoringNoise;
        c.score = Math.max(0, c.score * noise);
      }
    }

    // 6. Sort by score descending and stage top N actions
    candidates.sort((a, b) => b.score - a.score);
    let actionCount = 0;
    for (const candidate of candidates) {
      if (actionCount >= this._diffConfig.maxActionsPerTurn) break;
      const result = this._executeCandidate(candidate, context, turnStateManager);
      if (result.staged) actionCount++;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[AIController] ${this.factionId} (${this.difficulty}) turn ${turn}: ${actionCount} action(s) in ${elapsed}ms`);
  }

  // ─── Sync Mode: Per-Tick Command Generation (spec 058 FR-STL-010) ────────────

  /**
   * Generate serializable Command objects for the current sync-mode tick.
   * Called by SyncTickManager each tick in solo mode (or at tick boundaries for
   * multiplayer). Must complete within the tick budget (250ms at 4 Hz).
   *
   * Unlike takeTurn(), this method does NOT mutate state managers directly;
   * instead it returns Command[] that SyncTickManager.applyInputBundle() will
   * apply deterministically.
   *
   * @param {Object} context  - Same shape as takeTurn context
   * @param {number} tickNumber
   * @returns {Array<{type: string, payload: Object, seq: number}>}
   */
  generateTickCommands(context: any, tickNumber: any) {
    const commands: any[] = [];
    let seq = 0;
    const turn = context.currentTurn ?? 1;

    // Use a seeded RNG keyed to tick+faction for determinism (spec 055)
    const rng = new SeededRandom(`${tickNumber}-${this.factionId}-tick`);

    // Re-evaluate macro goals periodically (every N ticks approximating reevalFreq turns)
    const reevalFreq = this._diffConfig.goalReevalFrequency;
    const tickGoalThreshold = reevalFreq * 10; // ~10 ticks per turn
    if (tickNumber % tickGoalThreshold === 0 || this._state.lastGoalEvalTurn === 0) {
      this._evaluateMacroGoals(context);
      this._state.lastGoalEvalTurn = turn;
    }

    // Apply reactive adjustments once per turn boundary
    // (Turn boundaries are at tickNumber % TICKS_PER_TURN === 0, handled externally)

    const effectiveWeights = this._getEffectiveWeights();
    const galaxy    = context.galaxy;
    const fleetMgr  = context.fleetStateManager;
    const rsm       = context.resourceStates?.[this.factionId];
    if (!rsm || !galaxy) return commands;

    const allSystems   = galaxy.systems ?? [];
    const ownedSystems = allSystems.filter((s: any) => s.loyalty === this.factionId);

    // ── Fleet movement commands (every tick) ─────────────────────────────
    if (fleetMgr) {
      const expandWeight = effectiveWeights[MACRO_GOAL.EXPAND] ?? 1.0;
      const strikeWeight = effectiveWeights[MACRO_GOAL.STRIKE] ?? 1.0;

      const fleets = fleetMgr.getFleetsForFaction(this.factionId);
      const idleFleets = fleets.filter((f: any) => !f.inTransit && !f.command);

      for (const fleet of idleFleets) {
        // Probability gate: don't move every fleet every tick
        if (rng.nextFloat(0, 1) > 0.3) continue;

        // EXPAND: move to neutral neighbor
        const currentSys = allSystems.find((s: any) => s.id === fleet.systemId);
        if (!currentSys) continue;

        const connections = currentSys.connections ?? [];
        const neutralNeighbors = connections.filter((nId: any) => {
          const n = allSystems.find((s: any) => s.id === nId);
          return n && (n.loyalty === 'neutral' || !n.loyalty);
        });
        const enemyNeighbors = connections.filter((nId: any) => {
          const n = allSystems.find((s: any) => s.id === nId);
          return n && n.loyalty && n.loyalty !== this.factionId && n.loyalty !== 'neutral';
        });

        let destinationId = null;
        if (neutralNeighbors.length > 0 && expandWeight >= strikeWeight) {
          // Pick random neutral neighbor
          const idx = Math.floor(rng.nextFloat(0, 1) * neutralNeighbors.length);
          destinationId = neutralNeighbors[idx];
        } else if (enemyNeighbors.length > 0 && this._getFleetPower(fleet, fleetMgr) > 50) {
          const idx = Math.floor(rng.nextFloat(0, 1) * enemyNeighbors.length);
          destinationId = enemyNeighbors[idx];
        }

        if (destinationId) {
          commands.push(makeCommand(CMD.MOVE_FLEET, {
            fleetId: fleet.id,
            destinationId,
            travelMode: 'lane',
          }, seq++));
        }
      }
    }

    // ── Construction commands (every ~5 ticks) ──────────────────────────
    if (tickNumber % 5 === 0 && context.constructionEngine && this._aboveReserves(rsm, RESOURCE_RESERVES)) {
      const fortifyWeight = effectiveWeights[MACRO_GOAL.FORTIFY] ?? 1.0;
      const facilityType  = fortifyWeight > 1.0 ? 'garrison' : 'factory';
      const csm           = context.constructionStateManager;
      const target        = this._pickConstructionTarget(ownedSystems, facilityType, csm);

      if (target) {
        commands.push(makeCommand(CMD.QUEUE_CONSTRUCTION, {
          systemId:     target.id,
          facilityType,
          factionId:    this.factionId,
          action:       'build',
        }, seq++));
      }
    }

    // ── Research commands (every ~10 ticks, i.e. roughly per turn) ───────
    if (tickNumber % 10 === 0) {
      const techState  = context.techStates?.[this.factionId];
      const techEngine = context.techResearchEngine;
      if (techState?.hasOpenResearchSlot?.() && techEngine) {
        // Reuse existing research logic (doesn't need Command — fires directly)
        // For now, research is a non-action-point decision handled at turn boundary
        // via the headless resolution path. Skip here.
      }
    }

    // ── Mission commands (every ~3 ticks) ────────────────────────────────
    if (tickNumber % 3 === 0 && this._aboveReserves(rsm, RESOURCE_RESERVES)) {
      const csm = context.characterStates?.[this.factionId];
      if (csm) {
        const assignable = csm.getAssignable?.() ?? [];
        const enemySystems = allSystems.filter((s: any) =>
          s.loyalty && s.loyalty !== this.factionId && s.loyalty !== 'neutral'
        );

        if (assignable.length > 0 && enemySystems.length > 0) {
          // Pick one character + one target per tick cycle
          const charIdx = Math.floor(rng.nextFloat(0, 1) * assignable.length);
          const sysIdx  = Math.floor(rng.nextFloat(0, 1) * enemySystems.length);
          const charId  = assignable[charIdx].id;
          const targetSys = enemySystems[sysIdx];

          commands.push(makeCommand(CMD.STAGE_MISSION, {
            factionId:      this.factionId,
            missionType:    'sabotage',
            tier:           'espionage',
            targetSystemId: targetSys.id,
            characterId:    charId,
            costs:          {},
          }, seq++));
        }
      }
    }

    return commands;
  }

  // ─── Macro Goal Evaluation (FR-AIS-004) ──────────────────────────────────────

  /** @private */
  _evaluateMacroGoals(context: any) {
    const galaxy    = context.galaxy;
    const factionId = this.factionId;
    const fleetMgr  = context.fleetStateManager;

    const allSystems   = galaxy?.systems ?? [];
    const totalSystems = allSystems.length || 1;
    const ownedCount   = allSystems.filter((s: any) => s.loyalty === factionId).length;
    const ownershipRatio = ownedCount / totalSystems;

    const dominantEnemy    = this._getDominantEnemy(galaxy, factionId);
    const totalFleetPower  = this._getTotalFleetPower(factionId, fleetMgr);

    // Score each goal based on game state
    const goalScores = {
      [MACRO_GOAL.EXPAND]:   ownershipRatio < 0.4 ? 1.0 : 0.5,
      [MACRO_GOAL.FORTIFY]:  ownedCount > 3 ? 0.8 : 0.3,
      [MACRO_GOAL.SUPPRESS]: dominantEnemy ? 0.9 : 0.4,
      [MACRO_GOAL.STRIKE]:   totalFleetPower > 100 ? 0.8 : 0.3,
      [MACRO_GOAL.RESEARCH]: 0.7,
      [MACRO_GOAL.SURVIVE]:  factionId === 'union' ? 0.8 : 0.2
    };

    // Weight by personality
    for (const goal of Object.keys(goalScores)) {
      goalScores[goal] *= (this._personality.weights[goal] ?? 1.0);
    }

    // Pick top 3 goals
    this._state.currentGoals = (Object.entries(goalScores) as [string, any][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    console.log(`[AIController] ${factionId} macro goals → ${this._state.currentGoals.join(', ')}`);
  }

  // ─── Reactive Strategy Adjustments (FR-AIS-005) ──────────────────────────────

  /** @private */
  _applyReactiveAdjustments(context: any) {
    // Decrement remaining override turns
    if (this._state.reactiveOverrideTurnsLeft > 0) {
      this._state.reactiveOverrideTurnsLeft--;
      if (this._state.reactiveOverrideTurnsLeft === 0) {
        this._state.reactiveOverrides = {};
      }
    }

    const galaxy       = context.galaxy;
    const allSystems   = galaxy?.systems ?? [];
    const totalSystems = allSystems.length || 1;

    // Threshold 1: Brand Authority controls > 40% → Union/Autoforge increase Suppress + Strike
    if (this.factionId === 'union' || this.factionId === 'autoforge') {
      const baCount = allSystems.filter((s: any) => s.loyalty === 'brandAuthority').length;
      if (baCount / totalSystems > REACTIVE_THRESHOLDS.baLoyaltyControlPct) {
        this._state.reactiveOverrides = {
          [MACRO_GOAL.SUPPRESS]: 1.5,
          [MACRO_GOAL.STRIKE]:   1.3
        };
        this._state.reactiveOverrideTurnsLeft = REACTIVE_OVERRIDE_DURATION;
      }
    }

    // Threshold 2: Autoforge system count > 12 → Brand Authority increases Suppress
    if (this.factionId === 'brandAuthority') {
      const autoforgeCount = allSystems.filter((s: any) => s.loyalty === 'autoforge').length;
      if (autoforgeCount > REACTIVE_THRESHOLDS.autoforgeOutpostCount) {
        this._state.reactiveOverrides = {
          [MACRO_GOAL.SUPPRESS]: 1.5
        };
        this._state.reactiveOverrideTurnsLeft = REACTIVE_OVERRIDE_DURATION;
      }
    }
  }

  /** @private */
  _getEffectiveWeights() {
    return { ...this._state.goalWeights, ...this._state.reactiveOverrides };
  }

  // ─── Non-Action-Point Decisions ───────────────────────────────────────────────

  /**
   * Queue/start tech research aligned with active macro goals (FR-AIA-007).
   * @private
   */
  _decideTechResearch(context: any) {
    const techState  = context.techStates?.[this.factionId];
    const rsm        = context.resourceStates?.[this.factionId];
    const techEngine = context.techResearchEngine;
    if (!techState || !rsm || !techEngine) return;
    if (!techState.hasOpenResearchSlot()) return;

    // Tech goal-alignment keyword map
    const GOAL_TECH_KEYWORDS = {
      [MACRO_GOAL.STRIKE]:   ['military', 'fleet', 'combat', 'ship'],
      [MACRO_GOAL.EXPAND]:   ['diplomatic', 'mission', 'loyalty'],
      [MACRO_GOAL.SURVIVE]:  ['diplomatic', 'mission', 'espionage'],
      [MACRO_GOAL.FORTIFY]:  ['production', 'defense', 'facility'],
      [MACRO_GOAL.RESEARCH]: [],  // any tech is fine
      [MACRO_GOAL.SUPPRESS]: ['mission', 'espionage', 'sabotage']
    };

    const allTechs   = TechTreeLoader.getAllTechs(this.factionId);
    const uncompleted = allTechs.filter(t =>
      !techState.isCompleted(t.id) &&
      !techState.isResearching(t.id) &&
      !techState.isQueued(t.id) &&
      techEngine.checkPrerequisites(techState, t).met
    );
    if (uncompleted.length === 0) return;

    const activeGoals = this._state.currentGoals;
    let bestTech  = null;
    let bestScore = -1;

    for (const tech of uncompleted) {
      // Lower tier = higher base priority
      let score = (5 - (tech.tier ?? 1)) * 10;

      for (const goal of activeGoals) {
        const keywords = GOAL_TECH_KEYWORDS[goal] ?? [];
        if (keywords.length === 0) {
          score += 4; // RESEARCH goal — any tech gets a small bonus
          continue;
        }
        const descLower = (tech.name + ' ' + tech.description).toLowerCase();
        for (const kw of keywords) {
          if (descLower.includes(kw)) { score += 6; break; }
        }
        // Bonus for techs that unlock units (Hard AI: unlocks faction ships earlier)
        if (this.difficulty === 'hard' && (tech.unlocks?.units?.length ?? 0) > 0) {
          score += 6;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTech  = tech;
      }
    }

    if (!bestTech) return;

    const faction = this._buildFactionForTech(context);
    const result  = techEngine.beginResearch(faction, techState, rsm.state, bestTech.id, context.currentTurn ?? 1);
    if (result.success) {
      console.log(`[AIController] ${this.factionId} started research: ${bestTech.id}`);
    }
  }

  /**
   * Queue ships at idle Shipyards aligned with FR-AIA-004.
   * @private
   */
  _decideShipProduction(context: any) {
    const fleetMgr = context.fleetStateManager;
    const rsm      = context.resourceStates?.[this.factionId];
    if (!fleetMgr || !rsm) return;

    // Maintain minimum resource reserve (FR-AIA-006)
    if (!this._aboveReserves(rsm, RESOURCE_RESERVES)) return;

    const allFleets       = fleetMgr.getFleetsForFaction(this.factionId);
    const totalFleetPower = allFleets.reduce((sum: any, f: any) => sum + this._getFleetPower(f, fleetMgr), 0);
    const techState       = context.techStates?.[this.factionId];
    const completedTechs  = techState?.state?.completedTechnologies ?? [];

    // Determine desired ship type (FR-AIA-004)
    let shipTypeId;
    if (allFleets.length < 2) {
      shipTypeId = 'corvette';
    } else if (totalFleetPower < 150) {
      shipTypeId = 'cruiser';
    } else if (totalFleetPower >= 150 && allFleets.some((f: any) => f.ships.length > 8)) {
      shipTypeId = 'capitalShip';
    } else {
      shipTypeId = 'fighter';
    }

    // Check tech requirements; fall back to fighter if not met
    const shipType = fleetMgr.getShipType(shipTypeId);
    if (!shipType) return;
    if (shipType.requiresTech && !completedTechs.includes(shipType.requiresTech)) {
      shipTypeId = 'fighter';
    }

    // Verify we can afford it above the reserve threshold
    const shipCost = fleetMgr.getShipType(shipTypeId)?.productionCost ?? {};
    if (!this._aboveReserves(rsm, { ...RESOURCE_RESERVES, ...shipCost })) return;

    // Find an idle Shipyard system
    const ownedSystems = (context.galaxy?.systems ?? []).filter((s: any) => s.loyalty === this.factionId);
    const idleShipyardSys = ownedSystems.find((s: any) => {
      const hasShipyard    = s.facilities?.some((f: any) => f.type === 'shipyard');
      const hasActiveQueue = (fleetMgr.productionQueues?.[s.id] ?? [])
        .some((q: any) => q.factionId === this.factionId);
      return hasShipyard && !hasActiveQueue;
    });
    if (!idleShipyardSys) return;

    const result = fleetMgr.enqueueProduction(this.factionId, idleShipyardSys.id, shipTypeId);
    if (result.success) {
      console.log(`[AIController] ${this.factionId} queued ${shipTypeId} at ${idleShipyardSys.id}`);
    }
  }

  // ─── Action Candidate Collection (FR-AIS-003) ─────────────────────────────────

  /** @private */
  _collectActionCandidates(context: any, effectiveWeights: any) {
    const candidates: any[] = [];
    const goals      = this._state.currentGoals;
    const rsm        = context.resourceStates?.[this.factionId];
    if (!rsm) return candidates;

    // Resource reserve guard (FR-AIA-006): if below minimums, only fleet actions proceed
    if (!this._aboveReserves(rsm, RESOURCE_RESERVES)) {
      console.log(`[AIController] ${this.factionId} below reserve thresholds — limiting to fleet actions`);
      this._addFleetCandidates(candidates, context, effectiveWeights, goals);
      return candidates;
    }

    this._addMissionCandidates(candidates, context, effectiveWeights, goals);
    this._addFleetCandidates(candidates, context, effectiveWeights, goals);
    this._addConstructionCandidates(candidates, context, effectiveWeights, goals);
    this._addDiplomaticCandidates(candidates, context, effectiveWeights, goals);

    return candidates;
  }

  // ─── Mission Candidates (FR-AIA-001) ─────────────────────────────────────────

  /** @private */
  _addMissionCandidates(candidates: any, context: any, effectiveWeights: any, goals: any) {
    const csm = context.characterStates?.[this.factionId];
    if (!csm) return;

    const assignable = csm.getAssignable();
    if (assignable.length === 0) return;

    const galaxy       = context.galaxy;
    const allSystems   = galaxy?.systems ?? [];
    const ownedSystems = allSystems.filter((s: any) => s.loyalty === this.factionId);
    const enemySystems = allSystems.filter((s: any) => s.loyalty && s.loyalty !== this.factionId && s.loyalty !== 'neutral');

    // Track which characters have been tentatively assigned in this pass
    const assignedCharIds = new Set();

    // FR-AIA-001: never leave more than 50% unassigned if targets exist
    const targetAssignCount = Math.ceil(assignable.length * 0.5);

    for (const goal of goals) {
      const goalWeight   = effectiveWeights[goal] ?? 1.0;
      const missionTypes = (GOAL_MISSION_TYPES as Record<string, any>)[goal] ?? [];

      for (const missionType of missionTypes) {
        // Choose target pool based on mission type
        let targetPool;
        if (missionType === 'diplomatic') {
          targetPool = allSystems.filter((s: any) =>
            s.loyalty !== this.factionId &&
            s.loyaltyValue != null &&
            s.loyaltyValue >= 30 && s.loyaltyValue <= 60
          );
        } else if (missionType === 'research-assist') {
          targetPool = ownedSystems;
        } else {
          targetPool = enemySystems;
        }
        if (targetPool.length === 0) continue;

        const targetSystem = this._pickBestTargetSystem(targetPool);
        if (!targetSystem) continue;

        // Best available character by relevant stat
        const statKey = (MISSION_STAT_MAP as Record<string,string>)[missionType] ?? 'espionage';
        const bestChar = assignable
          .filter((c: any) => !assignedCharIds.has(c.id))
          .sort((a: any, b: any) =>
            csm.getEffectiveStat(b.id, statKey, { missionType, factionId: this.factionId }) -
            csm.getEffectiveStat(a.id, statKey, { missionType, factionId: this.factionId })
          )[0];
        if (!bestChar) continue;

        // Score: goal weight + character stat + urgency if below 50% assignment
        const statVal = csm.getEffectiveStat(bestChar.id, statKey, { missionType });
        let score = 50 + (goalWeight * 20) + (statVal * 2);
        if (assignedCharIds.size < targetAssignCount) score += 30;

        candidates.push({
          type: 'mission',
          score,
          payload: {
            factionId:      this.factionId,
            missionType,
            tier:           (MISSION_TIER_MAP as Record<string,any>)[missionType] ?? 'support',
            targetSystemId: targetSystem.id,
            characterId:    bestChar.id,
            costs:          {}
          }
        });
        assignedCharIds.add(bestChar.id);
      }
    }
  }

  // ─── Fleet Candidates (FR-AIA-002) ───────────────────────────────────────────

  /** @private */
  _addFleetCandidates(candidates: any, context: any, effectiveWeights: any, goals: any) {
    const fleetMgr = context.fleetStateManager;
    if (!fleetMgr) return;

    const galaxy          = context.galaxy;
    const isStrikeActive  = goals.includes(MACRO_GOAL.STRIKE);
    const isSurviveActive = goals.includes(MACRO_GOAL.SURVIVE);

    const fleets = fleetMgr.getFleetsForFaction(this.factionId).filter((f: any) => !f.inTransit);

    for (const fleet of fleets) {
      const fleetPower = this._getFleetPower(fleet, fleetMgr);

      if (isSurviveActive || !isStrikeActive) {
        // Survive/Fortify: assign patrol among owned systems (only if no command)
        if (fleet.command) continue;
        const currentSys = galaxy.systems.find((s: any) => s.id === fleet.systemId);
        if (!currentSys) continue;
        const neighborOwned = (currentSys.connections ?? [])
          .map((id: any) => galaxy.systems.find((s: any) => s.id === id))
          .filter((s: any) => s && s.loyalty === this.factionId)[0];
        if (!neighborOwned) continue;

        candidates.push({
          type:  'fleet-patrol',
          score: 20 * (effectiveWeights[MACRO_GOAL.SURVIVE] ?? effectiveWeights[MACRO_GOAL.FORTIFY] ?? 1.0),
          payload: {
            fleetId:   fleet.id,
            waypoints: [neighborOwned.id, fleet.systemId]  // patrol route (A→B→A)
          }
        });
        continue;
      }

      // Strike: move toward highest-value reachable enemy system
      if (isStrikeActive) {
        const target = this._findBestStrikeTarget(fleet, galaxy, fleetMgr);
        if (!target) continue;

        const { estimatedEnemyPower, path } = target;
        if (!path || path.length === 0) continue;

        // FR-AIA-002: do not attack if enemy power ≥ 1.5× own fleet power
        if (estimatedEnemyPower >= fleetPower * 1.5) {
          console.log(`[AIController] ${this.factionId} fleet ${fleet.id} stands down — enemy too strong`);
          continue;
        }
        // FR-AIA-002: fleet eligible if fleet_power > 0.7 × estimated_enemy_power
        if (fleetPower <= estimatedEnemyPower * 0.7) continue;

        candidates.push({
          type:  'fleet-move',
          score: 60 * (effectiveWeights[MACRO_GOAL.STRIKE] ?? 1.0),
          payload: {
            fleetId:   fleet.id,
            waypoints: path
          }
        });
      }
    }
  }

  // ─── Construction Candidates (FR-AIA-003) ────────────────────────────────────

  /** @private */
  _addConstructionCandidates(candidates: any, context: any, effectiveWeights: any, goals: any) {
    const rsm    = context.resourceStates?.[this.factionId];
    const galaxy = context.galaxy;
    const ce     = context.constructionEngine;      // may be undefined in tests
    const csm    = context.constructionStateManager;
    if (!rsm || !galaxy) return;

    const ownedSystems = galaxy.systems.filter((s: any) => s.loyalty === this.factionId);
    if (ownedSystems.length === 0) return;

    const fortifyWeight = effectiveWeights[MACRO_GOAL.FORTIFY] ?? 1.0;

    // Helper: true if any owned system already has a facility of this type built
    const hasAnyFacility = (typeKey: any) =>
      ownedSystems.some((s: any) => {
        if (s.facilities?.some((f: any) => f.type === typeKey)) return true;
        if (csm && csm.getFacilities(s.id).some((f: any) => f.facilityId === typeKey)) return true;
        return false;
      });

    // Total ships count (for upgrade condition FR-AIA-003 priority 6)
    const totalShips = (context.fleetStateManager?.getFleetsForFaction(this.factionId) ?? [])
      .reduce((sum: any, f: any) => sum + (f.ships?.length ?? 0), 0);

    // FR-AIA-003: priority order
    const priorities = [
      {
        type:      'shipyard',
        action:    'build',
        baseScore: 90,
        costs:     ce ? ce.getEffectiveCost('shipyard', this.factionId)  : { credits: 400, materials: 150 },
        condition: () =>
          ownedSystems.length >= 3 && !hasAnyFacility('shipyard')
      },
      {
        type:      'training',
        action:    'build',
        baseScore: 75,
        costs:     ce ? ce.getEffectiveCost('training', this.factionId)  : { credits: 300, materials: 100 },
        condition: () =>
          (rsm.state.productionThisTurn?.recruits ?? 0) < 5
      },
      {
        type:      'defense',
        action:    'build',
        baseScore: 70,
        costs:     ce ? ce.getEffectiveCost('defense', this.factionId)   : { credits: 350, materials: 150 },
        condition: () =>
          ownedSystems.some((s: any) => s.loyaltyValue != null && s.loyaltyValue < 60)
      },
      {
        type:      'research',
        action:    'build',
        baseScore: 65,
        costs:     ce ? ce.getEffectiveCost('research', this.factionId)  : { credits: 500, materials: 200 },
        condition: () => goals.includes(MACRO_GOAL.RESEARCH)
      },
      {
        type:      'extractor',
        action:    'build',
        baseScore: 60,
        costs:     ce ? ce.getEffectiveCost('extractor', this.factionId) : { credits: 400, materials: 100 },
        condition: () =>
          (rsm.state.productionThisTurn?.credits ?? 0) < 200
      },
      // Priority #6: Shipyard level upgrade (FR-AIA-003 priority 6)
      {
        type:      'shipyard',
        action:    'upgrade',
        baseScore: 55,
        costs:     ce ? ce.getUpgradeCost('shipyard', this.factionId)    : { credits: 200, materials: 75 },
        condition: () =>
          totalShips > 8 &&
          ownedSystems.some((s: any) =>
            csm?.getFacilities(s.id).some((f: any) => f.facilityId === 'shipyard' && f.level === 1)
          )
      }
    ];

    let constructionCount = 0;
    for (const priority of priorities) {
      if (constructionCount >= 3) break; // FR-AIA-003: max 3 systems per turn
      if (!priority.condition()) continue;
      if (!this._aboveReserves(rsm, priority.costs)) continue;

      const targetSys = this._pickConstructionTarget(ownedSystems, priority.type, csm);
      if (!targetSys) continue;

      // Guard: validate queue acceptance before adding candidate (build actions only)
      if (ce && priority.action === 'build') {
        const check = ce.canQueueFacility(targetSys.id, priority.type, this.factionId);
        if (!check.allowed) continue;
      }

      candidates.push({
        type:  'construction',
        score: priority.baseScore * fortifyWeight,
        payload: {
          factionId:    this.factionId,
          facilityType: priority.type,
          action:       priority.action,
          systemId:     targetSys.id,
          costs:        priority.costs
        }
      });
      constructionCount++;
    }
  }

  // ─── Diplomatic Candidates (FR-AIA-005) ──────────────────────────────────────

  /** @private */
  _addDiplomaticCandidates(candidates: any, context: any, effectiveWeights: any, goals: any) {
    const rsm      = context.resourceStates?.[this.factionId];
    const galaxy   = context.galaxy;
    const fleetMgr = context.fleetStateManager;
    if (!rsm || !galaxy) return;

    const expandWeight = effectiveWeights[MACRO_GOAL.EXPAND] ?? 1.0;

    // Systems with loyalty in range 30–60 toward AI (worth pushing past 60)
    const diplomaticTargets = (galaxy.systems ?? [])
      .filter((s: any) =>
        s.loyalty !== this.factionId &&
        s.loyaltyValue != null &&
        s.loyaltyValue >= 30 && s.loyaltyValue <= 60
      )
      .slice(0, 3);

    for (const targetSys of diplomaticTargets) {
      // FR-AIA-005: only act on systems we intend to hold (fleet nearby)
      const hasNearbyFleet = !fleetMgr || this._hasFleetNearSystem(targetSys.id, galaxy, fleetMgr);
      if (!hasNearbyFleet) continue;

      let actionType = 'propaganda-campaign';
      let costs: Record<string,number> = { influence: 30 };

      if (targetSys.population >= 4) {
        actionType = 'trade-agreement';
        costs      = { credits: 150, influence: 50 };
      }

      // Resource investment when surplus materials available
      if ((rsm.state.resources?.materials ?? 0) > 300 + RESOURCE_RESERVES.materials &&
          targetSys.population >= 4) {
        actionType = 'resource-investment';
        costs      = { materials: 100, influence: 30 };
      }

      if (!this._aboveReserves(rsm, costs)) continue;

      candidates.push({
        type:  'diplomatic',
        score: 40 * expandWeight,
        payload: {
          factionId:      this.factionId,
          type:           actionType,
          targetSystemId: targetSys.id,
          costs
        }
      });
    }

    // Autoforge: Alliance Proposals for eligible neutral systems pop >= 2 (FR-AIA-005)
    if (this.factionId === 'autoforge') {
      const neutralTargets = (galaxy.systems ?? [])
        .filter((s: any) => s.loyalty === 'neutral' && (s.population ?? 0) >= 2)
        .slice(0, 2);

      for (const sys of neutralTargets) {
        const costs = { influence: 60 };
        if (!this._aboveReserves(rsm, costs)) continue;

        candidates.push({
          type:  'diplomatic',
          score: 55 * expandWeight,
          payload: {
            factionId:      this.factionId,
            type:           'alliance-proposal',
            targetSystemId: sys.id,
            costs
          }
        });
      }
    }
  }

  // ─── Execute Candidate ────────────────────────────────────────────────────────

  /** @private */
  _executeCandidate(candidate: any, context: any, turnStateManager: any) {
    const { type, payload } = candidate;

    if (type === 'fleet-move') {
      const fleetMgr = context.fleetStateManager;
      if (!fleetMgr) return { staged: false };
      // payload.waypoints is a BFS lane path; last element is the destination
      const waypoints    = payload.waypoints ?? [];
      const destinationId = payload.destinationId ?? waypoints[waypoints.length - 1];
      if (!destinationId) return { staged: false };
      const result = fleetMgr.stageMoveFleet(payload.fleetId, destinationId, 'lane', context.galaxy);
      return { staged: result.success };
    }

    if (type === 'fleet-patrol') {
      const fleetMgr = context.fleetStateManager;
      if (!fleetMgr) return { staged: false };
      const result = fleetMgr.assignCommand(payload.fleetId, 'patrol', { route: payload.waypoints });
      return { staged: result.success };
    }

    if (type === 'mission') {
      const csm = context.characterStates?.[this.factionId];
      if (!csm) return { staged: false };

      const char = csm.getCharacter(payload.characterId);
      if (!char || (char.status !== 'available' && char.status !== 'stationed')) {
        return { staged: false };
      }

      const result = turnStateManager.stageAction('mission', payload);
      if (result.success) {
        csm.assignToMission(payload.characterId, result.id, payload.targetSystemId);
      }
      return { staged: result.success };
    }

    if (type === 'construction') {
      const rsm = context.resourceStates?.[this.factionId];
      const ce  = context.constructionEngine;
      const re  = context.resourceEngine;
      if (!rsm || !ce || !re) return { staged: false };
      // Re-validate affordability at execution time
      if (!this._canAfford(rsm, payload.costs ?? {})) return { staged: false };

      let result;
      if (payload.action === 'upgrade') {
        const csm  = context.constructionStateManager;
        const inst = csm?.getFacilities(payload.systemId)
          .find((f: any) => f.facilityId === payload.facilityType && f.level === 1);
        if (!inst) return { staged: false };
        result = ce.queueFacilityUpgrade(
          payload.systemId, inst.id, payload.factionId,
          rsm.state, re, context.currentTurn
        );
      } else {
        result = ce.queueFacilityBuild(
          payload.systemId, payload.facilityType, payload.factionId,
          rsm.state, re, context.currentTurn
        );
      }

      if (result.success) {
        console.log(`[AIController] ${payload.factionId} queued ${payload.action ?? 'build'} ${payload.facilityType} at ${payload.systemId}`);
      } else {
        console.warn(`[AIController] Construction failed for ${payload.factionId}: ${result.error}`);
      }
      return { staged: result.success };
    }

    if (type === 'diplomatic') {
      const rsm = context.resourceStates?.[this.factionId];
      if (!rsm) return { staged: false };
      // Re-validate affordability at execution time
      if (!this._canAfford(rsm, payload.costs ?? {})) return { staged: false };
      const result = turnStateManager.stageAction(type, payload);
      return { staged: result.success };
    }

    return { staged: false };
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────────

  /** @private */
  _getFleetPower(fleet: any, fleetMgr: any) {
    if (!fleetMgr) return 0;
    return fleetMgr.getTotalCombatPower(fleet);
  }

  /** @private */
  _getTotalFleetPower(factionId: any, fleetMgr: any) {
    if (!fleetMgr) return 0;
    return fleetMgr.getFleetsForFaction(factionId)
      .reduce((sum: any, f: any) => sum + this._getFleetPower(f, fleetMgr), 0);
  }

  /** @private */
  _getDominantEnemy(galaxy: any, factionId: any) {
    const counts: Record<string,number> = {};
    for (const sys of (galaxy?.systems ?? [])) {
      if (sys.loyalty && sys.loyalty !== factionId && sys.loyalty !== 'neutral') {
        counts[sys.loyalty] = (counts[sys.loyalty] ?? 0) + 1;
      }
    }
    const sorted = (Object.entries(counts) as [string, any][]).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  /**
   * Check whether resources (+ minimum reserves) are available.
   * @private
   */
  _aboveReserves(rsm: any, amounts: any) {
    const res = rsm.state.resources;
    for (const [type, needed] of (Object.entries(amounts) as [string, any][])) {
      const reserve = (RESOURCE_RESERVES as Record<string,number>)[type] ?? 0;
      if ((res[type] ?? 0) < (needed ?? 0) + reserve) return false;
    }
    return true;
  }

  /** @private */
  _canAfford(rsm: any, costs: any) {
    const res = rsm.state.resources;
    for (const [type, needed] of (Object.entries(costs) as [string, any][])) {
      if ((res[type] ?? 0) < (needed ?? 0)) return false;
    }
    return true;
  }

  /**
   * BFS pathfinding through hyperspace connections.
   * Returns waypoints list (not including start system), or null if unreachable.
   * @private
   */
  _findPath(fromId: any, toId: any, galaxy: any) {
    if (fromId === toId) return [];
    const systems = galaxy?.systems ?? [];
    const visited = new Set([fromId]);
    const queue   = [[fromId, []]];

    while (queue.length > 0) {
      const shifted = queue.shift(); if (!shifted) break; const [current, path] = shifted;
      const sys = systems.find((s: any) => s.id === current);
      if (!sys) continue;

      for (const neighborId of (sys.connections ?? [])) {
        if (neighborId === toId) return [...path, neighborId];
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([neighborId, [...path, neighborId]]);
        }
      }
    }
    return null;
  }

  /**
   * Find the best Strike target for a fleet.
   * Returns { system, estimatedEnemyPower, path } or null.
   * @private
   */
  _findBestStrikeTarget(fleet: any, galaxy: any, fleetMgr: any) {
    const enemySystems = (galaxy?.systems ?? []).filter((s: any) =>
      s.loyalty && s.loyalty !== this.factionId && s.loyalty !== 'neutral'
    );
    if (enemySystems.length === 0) return null;

    let best      = null;
    let bestScore = -1;

    for (const sys of enemySystems) {
      const path = this._findPath(fleet.systemId, sys.id, galaxy);
      if (!path || path.length === 0) continue;

      const value    = (sys.population ?? 1) * 10 + (sys.resources?.credits ?? 0) * 0.1;
      const sysScore = value / Math.max(1, path.length);

      if (sysScore > bestScore) {
        const enemyFleets = fleetMgr.getFleetsForFaction(sys.loyalty)
          .filter((f: any) => f.systemId === sys.id);
        const estimatedEnemyPower = enemyFleets
          .reduce((sum: any, f: any) => sum + this._getFleetPower(f, fleetMgr), 0);

        bestScore = sysScore;
        best      = { system: sys, estimatedEnemyPower, path };
      }
    }
    return best;
  }

  /** @private */
  _pickBestTargetSystem(systems: any) {
    if (systems.length === 0) return null;
    return [...systems].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  }

  /** @private */
  _pickConstructionTarget(ownedSystems: any, facilityType: any, csm: any = null) {
    const withoutFacility = ownedSystems.filter((s: any) => {
      // Legacy galaxy-generator format: s.facilities[].type
      if (s.facilities?.some((f: any) => f.type === facilityType)) return false;
      // CSM-built facility format: facilityId
      if (csm && csm.getFacilities(s.id).some((f: any) => f.facilityId === facilityType)) return false;
      return true;
    });
    if (withoutFacility.length === 0) return null;
    return [...withoutFacility].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  }

  /** @private */
  _hasFleetNearSystem(systemId: any, galaxy: any, fleetMgr: any) {
    const sys      = galaxy.systems.find((s: any) => s.id === systemId);
    const nearbyIds = new Set([systemId, ...(sys?.connections ?? [])]);
    return fleetMgr.getFleetsForFaction(this.factionId)
      .some((f: any) => nearbyIds.has(f.systemId));
  }

  /** @private */
  _buildFactionForTech(context: any) {
    const factionData  = context.galaxy?.factionData?.[this.factionId] ?? {};
    const ownedSystems = (context.galaxy?.systems ?? []).filter((s: any) => s.loyalty === this.factionId);
    return {
      id:                this.factionId,
      bonuses:           { ...(factionData.bonuses ?? {}) },
      controlledSystems: ownedSystems,
      costReductions:    {}
    };
  }

  // ─── Serialization (FR-AIS-007) ───────────────────────────────────────────────

  /**
   * Serialize AI state for save/load persistence.
   * @returns {Object}
   */
  serialize() {
    return {
      _version:  AI_STATE_VERSION,
      factionId: this.factionId,
      difficulty: this.difficulty,
      state:     JSON.parse(JSON.stringify(this._state))
    };
  }

  /**
   * Restore an AIController from serialized data.
   * @param {Object} data - Output of serialize()
   * @returns {AIController}
   */
  static deserialize(data: any) {
    if (!data || data._version !== AI_STATE_VERSION) {
      throw new Error('[AIController] Cannot deserialize: missing or incompatible data');
    }
    const ctrl = new AIController(data.factionId, data.difficulty ?? 'medium');
    Object.assign(ctrl._state, data.state);
    console.log(`[AIController] Deserialized AI state for ${data.factionId} (${data.difficulty})`);
    return ctrl;
  }
}

/**
 * TurnResolutionEngine — Synchronous sequencer for the Resolution Phase.
 *
 * Processes all staged actions in the defined spec order:
 *  1. Fleet movement arrivals      (Phase 1B: wired to FleetStateManager)
 *  2. Space combat                 (Phase 1B: wired to CombatEngine)
 *  3. Planetary invasions          (Phase 1C: wired to GroundCombatEngine)
 *  4. Mission resolution           (Phase 1B: wired to MissionEngine + MissionStateManager)
 *  5. Construction completions     (Phase 1B: wired to ConstructionEngine)
 *  6. Diplomatic action effects    (Phase 1B: wired to DiplomacyEngine)
 *  7. Intel updates and expiry     (stub — Phase 1C intel integration)
 *  8. Dynamic events               (Phase 1C: wired to EventEngine)
 *
 * Each step records its results via TurnStateManager.recordEvent().
 * Spec: 028-turn-structure-spec.md (FR-TS-003)
 */

import { missionEngine } from './mission-engine.js';
import { FactionDefinitionLoader } from './faction-loader.js';
import { CharacterCaptureEngine } from './character-capture-engine.js';
import { CHARACTER_STATUS } from './character-state-manager.js';

// ─── Display label maps ──────────────────────────────────────────────────────

/** Human-readable labels for mission type IDs (used in alerts + turn summary). */
const MISSION_TYPE_LABELS = {
  reconnaissance:  'Reconnaissance',
  espionage:       'Espionage',
  sabotage:        'Sabotage',
  false_intel:     'False Intelligence',
  incite_uprising: 'Incite Uprising',
  diplomatic:      'Diplomatic',
  recruitment:     'Recruitment',
};

/** Human-readable labels for mission effect type IDs used in outcome detail rows. */
const EFFECT_TYPE_LABELS = {
  resource_delta:     'Resource Change',
  loyalty_delta:      'Loyalty Change',
  intel_reveal:       'Intel Revealed',
  character_captured: 'Character Captured',
  character_killed:   'Character Killed',
  tech_reveal:        'Tech Revealed',
  stat_change:        'Stat Change',
};

export class TurnResolutionEngine {
  turnStateManager: any;
  initiativeOrder: any;
  fleetStateManager: any;
  combatEngine: any;
  diplomacyEngine: any;
  missionStateManager: any;
  characterStates: any;
  groundCombatEngine: any;
  eventEngine: any;
  intelStateManager: any;
  intelEngine: any;
  constructionEngine: any;
  /**
   * @param {import('./turn-state-manager.js').TurnStateManager} turnStateManager
   * @param {string[]} initiativeOrder - Faction IDs sorted by initiative (highest first)
   * @param {import('./fleet-state-manager.js').FleetStateManager} [fleetStateManager]
   * @param {import('./combat-engine.js').CombatEngine} [combatEngine]
   * @param {import('./diplomacy-engine.js').DiplomacyEngine} [diplomacyEngine]  
   * @param {import('./mission-state-manager.js').MissionStateManager} [missionStateManager]
   * @param {Object} [characterStates] - factionId → CharacterStateManager
   * @param {import('./ground-combat-engine.js').GroundCombatEngine} [groundCombatEngine]
   * @param {import('./event-engine.js').EventEngine} [eventEngine]
   * @param {import('./intel-state-manager.js').IntelStateManager} [intelStateManager]
   * @param {import('./intel-engine.js').IntelEngine} [intelEngine]
   */
  constructor(turnStateManager: any, initiativeOrder: any, fleetStateManager: any, combatEngine: any, diplomacyEngine: any, missionStateManager: any, characterStates: any, groundCombatEngine: any, eventEngine: any, intelStateManager: any, intelEngine: any) {
    this.turnStateManager    = turnStateManager;
    this.initiativeOrder     = initiativeOrder     ?? [];
    this.fleetStateManager   = fleetStateManager   ?? null;
    this.combatEngine        = combatEngine        ?? null;
    this.diplomacyEngine   = diplomacyEngine   ?? null;
    this.missionStateManager = missionStateManager ?? null;
    this.characterStates     = characterStates     ?? {};
    this.groundCombatEngine  = groundCombatEngine  ?? null;
    this.eventEngine         = eventEngine         ?? null;
    this.intelStateManager   = intelStateManager   ?? null;
    this.intelEngine         = intelEngine         ?? null;
  }

  /**
   * Run the full Resolution Phase pipeline.
   * @param {Object} context - Shared game context from MainStage
   * @param {Object} context.galaxy - Galaxy state (systems, connections, factionData)
   * @param {Object} context.resourceStates - factionId → ResourceStateManager
   * @param {Object} context.techStates - factionId → TechStateManager
   * @param {Object} context.characterStates - factionId → CharacterStateManager
   * @param {Object} context.victoryGameState - Shared victory game state object
   * @param {number} context.currentTurn - Current turn number
   * @param {Function} context.onProductionComplete - Callback: () => void, to notify React after resource changes
   * @returns {void}
   */
  runResolutionPhase(context: any) {
    console.log(`[TurnResolutionEngine] Resolution Phase start — Turn ${context.currentTurn}`);
    this.runPreInvasionPhase(context);
    this.runPostInvasionPhase(context);
    console.log('[TurnResolutionEngine] Resolution Phase complete');
  }

  /**
   * Run Resolution Phase steps 1–2: fleet arrivals, fleet commands, space combat.
   * After this call, fleetStateManager.getPendingInvasions() contains any queued invasions.
   * Used by MainStage to collect player invasion choices before proceeding.
   * Spec: 048-ground-combat-spec.md (FR-GC-001)
   * @param {Object} context
   */
  /**
   * Run Resolution Phase steps 1–2: fleet arrivals, fleet commands, space combat.
   * After this call, fleetStateManager.getPendingInvasions() contains any queued invasions.
   * Used by MainStage to collect player invasion choices before proceeding.
   *
   * Returns the raw arrivals and combatResults arrays so MainStage can present
   * them sequentially to the player before advancing.
   *
   * Spec: 048-ground-combat-spec.md (FR-GC-001)
   * @param {Object} context
   * @returns {{ arrivals: Object[], combatResults: Object[] }}
   */
  runPreInvasionPhase(context: any) {
    const arrivals      = this._resolveFleetArrivals(context);
    this._resolveFleetCommands(context);
    const combatResults = this._resolveSpaceCombat(context);
    return { arrivals, combatResults };
  }

  /**
   * Run Resolution Phase steps 3–9: invasions, missions, construction, diplomacy, intel, events.
   * Invasion choices must be recorded on fleetStateManager before calling this.
   * Spec: 048-ground-combat-spec.md (FR-GC-001)
   * @param {Object} context
   */
  runPostInvasionPhase(context: any) {
    this._resolvePlanetaryInvasions(context);
    this._resolveCharacterAssignments(context);
    this._resolveMissions(context);
    this._resolveConstruction(context);
    this._resolveDiplomaticEffects(context);
    this._resolveIntelUpdates(context);
    this._resolveEvents(context);
  }

  // ─── Step 1: Fleet Arrivals ──────────────────────────────────────────────────

  /**
   * Process fleet movement arrivals in initiative order.
   * Records turn events but does NOT dispatch game:fleetMoved — MainStage handles
   * that during its async sequential presentation so the camera can pan and the
   * player can confirm each arrival before the next.
   * Spec: 014-fleet-movement-spec.md (FR-FM-004)
   * @param {Object} context
   * @returns {Object[]} arrivals array (each item: { fromSystemId, toSystemId, factionId, … })
   * @private
   */
  _resolveFleetArrivals(context: any) {
    if (!this.fleetStateManager) return [];

    const arrivals = this.fleetStateManager.resolveFleetArrivals(context.galaxy);
    if (arrivals.length === 0) return [];

    for (const arrival of arrivals) {
      const toSystem = (context.galaxy?.systems ?? []).find((s: any) => s.id === arrival.toSystemId);
      const arrFleetRec     = this.fleetStateManager.getFleetById?.(arrival.fleetId);
      const arrFleetNameRec = arrFleetRec?.name ?? 'Fleet';
      const arrToName       = this._getSystemName(arrival.toSystemId, context);
      const arrFromName     = this._getSystemName(arrival.fromSystemId, context);
      this.turnStateManager.recordEvent(
        'resolution',
        `${arrFleetNameRec} has arrived at ${arrToName} (from ${arrFromName})`,
        {
          systemId: arrival.toSystemId,
          factionId: arrival.factionId,
          outcome: 'info',
          domain: 'fleet',
          systemOwnerFactionId: toSystem?.loyalty ?? null,
        }
      );
      // Dispatch player alert for fleet arrival (spec 063 FR-PA-009)
      if (arrival.factionId) {
        window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
          detail: {
            category:  'fleet',
            factionId: arrival.factionId,
            message:   `${arrFleetNameRec} has arrived at ${arrToName}`,
            outcome:   {
              summary:    `${arrFleetNameRec} arrived at ${arrToName}`,
              details:    [
                { label: 'Fleet', value: arrFleetNameRec },
                { label: 'Destination', value: arrToName },
                { label: 'Origin', value: arrFromName },
              ],
              systemId:   arrival.toSystemId,
              systemName: arrToName,
            },
            turn: context.currentTurn ?? 0,
          }
        }));
      }
      // NOTE: game:fleetMoved is dispatched by MainStage during sequential presentation.
    }
    console.log(`[TurnResolutionEngine] Fleet arrivals resolved: ${arrivals.length}`);
    return arrivals;
  }

  // ─── Step 1b: Fleet Standing Commands ────────────────────────────────────────

  /**
   * Execute standing fleet commands (Patrol, Raid).
   * Spec: 016-fleet-commands-spec.md (FR-FLC-002, FR-FLC-004)
   * @param {Object} context
   * @private
   */
  _resolveFleetCommands(context: any) {
    if (!this.fleetStateManager) return;

    const events = this.fleetStateManager.resolveFleetCommands(context.galaxy);
    for (const event of events) {
      const sys = (context.galaxy?.systems ?? []).find((s: any) => s.id === event.systemId);
      this.turnStateManager.recordEvent(
        'resolution',
        event.message,
        {
          systemId: event.systemId,
          factionId: event.factionId ?? null,
          outcome: 'info',
          domain: 'fleet',
          systemOwnerFactionId: sys?.loyalty ?? null,
        }
      );
    }

    // Generate patrol intel for all fleets with PATROL command (FR-IS-003)
    if (this.intelStateManager && this.intelEngine && context.galaxy) {
      const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
      for (const factionId of FACTION_IDS) {
        const fleets = this.fleetStateManager.getFleetsForFaction(factionId);
        for (const fleet of fleets) {
          if (fleet.command?.type !== 'patrol') continue;
          const items = this.intelEngine.buildPatrolIntel(fleet, context.galaxy, factionId, context.currentTurn);
          for (const item of items) {
            this.intelStateManager.addIntelItem(factionId, item);
          }
        }
      }
    }
  }

  // ─── Step 2: Space Combat ────────────────────────────────────────────────────

  /**
   * Resolve space combat at systems where hostile fleets co-occupy.
   * Dispatches game:combatFlash immediately (particle effect + audio).
   * Does NOT dispatch game:combatResult — MainStage dispatches that during its
   * async sequential presentation so the CombatResultModal can be awaited.
   * Spec: 015-space-combat-spec.md, 047-combat-mechanics-spec.md
   * @param {Object} context
   * @returns {Object[]} combat result objects ready for game:combatResult dispatch
   * @private
   */
  _resolveSpaceCombat(context: any) {
    if (!this.combatEngine || !this.fleetStateManager) return [];

    const results = this.combatEngine.resolveAllCombats(
      context.galaxy,
      this.initiativeOrder,
      context.techStates ?? {},
      `turn-${context.currentTurn}`,
      {
        currentTurn:     context.currentTurn ?? 0,
        characterStates: this.characterStates ?? context.characterStates ?? {}
      }
    );

    const combatPayloads = [];

    for (const result of results) {
      const systemId = result.systemId;
      const sysName = this._getSystemName(systemId, context);
      const atkDisplayName = this._getFactionName(result.attackerFactionId);
      const defDisplayName = this._getFactionName(result.defenderFactionId);
      const msg = result.outcome === 'attackerVictory'
        ? `${atkDisplayName} defeated ${defDisplayName} at ${sysName}`
        : result.outcome === 'defenderVictory'
          ? `${defDisplayName} repelled ${atkDisplayName} at ${sysName}`
          : `Combat draw at ${sysName} — ${atkDisplayName} retreated`;

      const systemBeforeCombat = (context.galaxy?.systems ?? []).find((s: any) => s.id === systemId);
      this.turnStateManager.recordEvent('resolution', msg, {
        systemId,
        urgent: true,
        factionId: result.attackerFactionId,
        outcome: result.outcome === 'attackerVictory' ? 'success'
               : result.outcome === 'defenderVictory' ? 'failure'
               : 'info',
        domain: 'combat',
        systemOwnerFactionId: systemBeforeCombat?.loyalty ?? null,
      });

      // Fire combat flash immediately for particle effect and audio (spec 051 FR-VS-007, spec 052 FR-AU-004)
      window.dispatchEvent(new CustomEvent('game:combatFlash', {
        detail: { systemId, attackerFactionId: result.attackerFactionId, defenderFactionId: result.defenderFactionId }
      }));

      // Build payload for game:combatResult — dispatched by MainStage sequentially
      combatPayloads.push({
        systemId:            result.systemId,
        systemName:          result.systemName ?? sysName,
        outcome:             result.outcome,
        attackerFactionId:   result.attackerFactionId,
        defenderFactionId:   result.defenderFactionId,
        attackerLosses:      result.attackerLosses ?? 0,
        defenderLosses:      result.defenderLosses ?? 0,
        rounds:              result.rounds ?? 1,
        playerFactionId:     context.playerFactionId ?? null
      });
    }

    // Clean up 0-ship fleets; process any assigned commanders (capture or relocate).
    this._handleDestroyedFleets(results, context);

    if (results.length > 0) {
      console.log(`[TurnResolutionEngine] Space combat resolved: ${results.length} engagement(s)`);
    }
    return combatPayloads;
  }

  // ─── Step 3: Planetary Invasions ─────────────────────────────────────────────

  /**
   * Resolve planetary invasions at systems where attacker won space combat.
   * In Auto-Resolve mode, invasions are resolved automatically (spec 048 FR-GC-008).
   * Spec: 048-ground-combat-spec.md (FR-GC-001 through FR-GC-008)
   * @param {Object} context
   * @private
   */
  _resolvePlanetaryInvasions(context: any) {
    if (!this.fleetStateManager) return;

    const pendingInvasions = this.fleetStateManager.getPendingInvasions?.() ?? [];
    if (pendingInvasions.length === 0) return;

    for (const invasion of pendingInvasions) {
      // Check player's Invade/Blockade choice (spec 048 FR-GC-001)
      const choice = this.fleetStateManager.getInvasionChoice?.(invasion.systemId) ?? 'invade';
      if (choice === 'blockade') {
        // Player chose blockade — assign fleet command and skip ground combat
        const attackerFleets = this.fleetStateManager.getFleetsForFactionAtSystem(
          invasion.attackerFactionId, invasion.systemId
        );
        for (const fleet of attackerFleets) {
          this.fleetStateManager.assignCommand(fleet.id, 'blockade');
        }
        const blockadeMsg = `${this._getFactionName(invasion.attackerFactionId)} established a blockade at ${this._getSystemName(invasion.systemId, context)}`;
        this.turnStateManager.recordEvent('resolution', blockadeMsg, {
          systemId: invasion.systemId,
          factionId: invasion.attackerFactionId,
          outcome: 'info',
          domain: 'invasion',
          playerChoice: 'Blockade',
          systemOwnerFactionId: invasion.defenderFactionId ?? null,
        });
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: { tier: 'info', message: blockadeMsg, locationId: invasion.systemId, locationCategory: 'combat' }
        }));
        continue;
      }

      let result;

      if (this.groundCombatEngine) {
        // Phase 1C: use spec-compliant GroundCombatEngine (spec 048)
        result = this.groundCombatEngine.resolve({
          systemId:          invasion.systemId,
          attackerFactionId: invasion.attackerFactionId,
          defenderFactionId: invasion.defenderFactionId,
          attackerFleetPower: invasion.attackerFleetPower ?? 10,
          galaxy:            context.galaxy,
          techStates:        context.techStates ?? {},
          turnNumber:        context.currentTurn ?? 0
        });
      } else if (this.constructionEngine) {
        // Fallback: legacy ConstructionEngine invasion (Phase 1B)
        const seed = `invasion-${invasion.systemId}-turn-${context.currentTurn}`;
        result = this.constructionEngine.resolvePlanetaryInvasion({
          systemId:           invasion.systemId,
          attackerFactionId:  invasion.attackerFactionId,
          defenderFactionId:  invasion.defenderFactionId,
          attackerFleetPower: invasion.attackerFleetPower ?? 10,
          galaxy:             context.galaxy,
          techStates:         context.techStates ?? {},
          seed
        });
      } else {
        continue;
      }

      // FR-GC-006: Ground Combat Report is appended to the Space Combat Report
      const groundOutcome = result.outcome === 'attacker_wins' ? 'attackerWins' : 'defenderWins';
      const sysNameGround = this._getSystemName(invasion.systemId, context);
      const msg = groundOutcome === 'attackerWins'
        ? `${this._getFactionName(invasion.attackerFactionId)} captured ${sysNameGround} (${result.rounds ?? result.roundsFought} ground rounds)`
        : `Invasion of ${sysNameGround} repelled by ${this._getFactionName(invasion.defenderFactionId)} — ${result.defenderLosses ?? 0} defender losses`;

      this.turnStateManager.recordEvent('resolution', msg, {
        systemId: invasion.systemId,
        urgent: true,
        factionId: invasion.attackerFactionId,
        outcome: groundOutcome === 'attackerWins' ? 'success' : 'failure',
        domain: 'invasion',
        playerChoice: 'Invade',
        systemOwnerFactionId: invasion.defenderFactionId ?? null,
      });

      // FR-GC-004: on failure, attacker stays at system as blockade
      if (groundOutcome !== 'attackerWins') {
        const attackerFleets = this.fleetStateManager.getFleetsForFactionAtSystem(
          invasion.attackerFactionId, invasion.systemId
        );
        for (const fleet of attackerFleets) {
          if (!fleet.command || fleet.command.type !== 'blockade') {
            this.fleetStateManager.assignCommand(fleet.id, 'blockade');
          }
        }
      }

      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             groundOutcome === 'attackerWins' ? 'warning' : 'info',
          message:          msg,
          locationId:       invasion.systemId,
          locationCategory: 'combat'
        }
      }));

      // Fire system captured event for particle effect and audio (spec 051 FR-VS-007, spec 052 FR-AU-004)
      if (groundOutcome === 'attackerWins') {
        // Relocate stationed characters before firing the capture event (spec 010 FR-CA-004)
        this._handleCapturedSystemCharacters(invasion.systemId, invasion.attackerFactionId, context);
        window.dispatchEvent(new CustomEvent('game:systemCaptured', {
          detail: { systemId: invasion.systemId, factionId: invasion.attackerFactionId }
        }));
        // Player alert for system capture (spec 063 FR-PA-009)
        {
          const capSysName = sysNameGround;
          const capAtk = this._getFactionName(invasion.attackerFactionId);
          const capDef = invasion.defenderFactionId ? this._getFactionName(invasion.defenderFactionId) : null;
          // Alert for the attacker (capture victory)
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'capture',
              factionId: invasion.attackerFactionId,
              message:   `${capSysName} is now under ${capAtk} control`,
              outcome:   {
                summary:    `${capSysName} captured by ${capAtk}`,
                details:    [
                  { label: 'Attacker', value: capAtk },
                  ...(capDef ? [{ label: 'Previous controller', value: capDef }] : []),
                ],
                systemId:   invasion.systemId,
                systemName: capSysName,
              },
              turn: context.currentTurn ?? 0,
            }
          }));
          // Also alert the defender if different
          if (invasion.defenderFactionId && invasion.defenderFactionId !== invasion.attackerFactionId) {
            window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
              detail: {
                category:       'capture',
                factionId:      invasion.defenderFactionId,
                actorFactionId: invasion.attackerFactionId,
                message:   `${capSysName} has been captured by ${capAtk}`,
                outcome:   {
                  summary:    `${capSysName} lost to ${capAtk}`,
                  details:    [
                    { label: 'Attacker', value: capAtk },
                    { label: 'Previous controller', value: capDef ?? invasion.defenderFactionId },
                  ],
                  systemId:   invasion.systemId,
                  systemName: capSysName,
                },
                turn: context.currentTurn ?? 0,
              }
            }));
          }
        }
        // Critical alert for the player if their system was captured (spec 036 FR-NA-003)
        if (invasion.defenderFactionId === context.playerFactionId) {
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: {
              tier:             'critical',
              message:          `${sysNameGround} has been captured by ${invasion.attackerFactionId}!`,
              locationId:       invasion.systemId,
              locationCategory: 'system'
            }
          }));
        }
      }
    }

    // Clear resolved invasions
    this.fleetStateManager.clearPendingInvasions?.();

    console.log(`[TurnResolutionEngine] Planetary invasions resolved: ${pendingInvasions.length}`);
  }

  // ─── Step 4: Mission Resolution ──────────────────────────────────────────────

  /**
   * Resolve missions in Recon → Defensive → Offensive → Support order,
   * within each tier sorted by initiative order.
   * Spec: 022-mission-execution-spec.md (FR-ME-005)
   * @param {Object} context
   * @private
   */
  _resolveMissions(context: any) {
    const MISSION_TIER_ORDER = ['recon', 'defensive', 'offensive', 'support'];
    const stagedMissions = this.turnStateManager.getStagedActions('mission');

    // Also include any multi-turn missions ready to resolve this turn
    const readyMultiTurn = this.missionStateManager
      ? this.missionStateManager.advanceTurn(context.currentTurn)
      : [];

    const allMissions = [
      ...stagedMissions,
      ...readyMultiTurn.map((m: any) => ({ id: m.missionId, type: 'mission', payload: m }))
    ];

    if (allMissions.length === 0) return;

    // Resolved target IDs to detect cross-mission aborts (FR-ME-005)
    const destroyedThisTurn = new Set();
    const capturedThisTurn  = new Set();

    // Build resolution context (merge characterStates from engine or context)
    const resolutionContext = {
      ...context,
      characterStates:     this.characterStates ?? context.characterStates ?? {},
      missionStateManager: this.missionStateManager,
      intelStateManager:   this.intelStateManager ?? null,
    };

    MISSION_TIER_ORDER.forEach(tier => {
      const tierMissions = allMissions.filter(a => a.payload?.tier === tier);

      // Sort by initiative order within each tier (FR-ME-005)
      tierMissions.sort((a, b) => {
        const ai = this.initiativeOrder.indexOf(a.payload?.factionId);
        const bi = this.initiativeOrder.indexOf(b.payload?.factionId);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      tierMissions.forEach(action => {
        const payload = action.payload;
        // Normalise: player UI sends targetId; AI sends targetSystemId. Support both.
        const targetSysId = payload?.targetSystemId ?? payload?.targetId ?? null;

        // Abort if target was destroyed/captured by an earlier mission this turn (FR-ME-005)
        const charTarget = payload?.targetCharacterId;
        if (charTarget && (destroyedThisTurn.has(charTarget) || capturedThisTurn.has(charTarget))) {
          const abortTargetSys = (context.galaxy?.systems ?? []).find((s: any) => s.id === targetSysId);
          this.turnStateManager.recordEvent('resolution',
            `Mission aborted — target already neutralized this turn (${payload?.factionId})`,
            {
              systemId: targetSysId,
              urgent: false,
              factionId: payload?.factionId ?? null,
              outcome: 'info',
              domain: 'mission',
              systemOwnerFactionId: abortTargetSys?.loyalty ?? null,
            }
          );
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: { tier: 'warning', message: `Mission aborted: target neutralized this turn`, locationId: targetSysId, locationCategory: 'mission' }
          }));
          return;
        }

        // Resolve mission via MissionEngine
        const { report, aborted, notifications } = missionEngine.resolve(action, resolutionContext);

        // Track destroyed/captured targets for later missions
        for (const evt of (report.captureEvents ?? [])) {
          if (evt.type === 'character_captured') {
            capturedThisTurn.add(evt.characterId);
            // Critical alert if the player's character was captured (spec 036 FR-NA-003)
            const playerChars = resolutionContext.characterStates?.[context.playerFactionId]?.characters ?? {};
            if (playerChars[evt.characterId]) {
              const charName = playerChars[evt.characterId].name ?? evt.characterId;
              window.dispatchEvent(new CustomEvent('galaxy:notify', {
                detail: {
                  tier:             'critical',
                  message:          `${charName} has been captured and is being held at ${this._getSystemName(targetSysId, context)}`,
                  locationId:       targetSysId,
                  locationCategory: 'mission'
                }
              }));
            }
          }
        }
        for (const fx of (report.effectsApplied ?? [])) {
          if (fx?.type === 'character_killed') {
            destroyedThisTurn.add(fx.characterId);
            // Critical alert if the player's character was killed (spec 036 FR-NA-003)
            const playerChars = resolutionContext.characterStates?.[context.playerFactionId]?.characters ?? {};
            if (playerChars[fx.characterId]) {
              const charName = playerChars[fx.characterId].name ?? fx.characterId;
              window.dispatchEvent(new CustomEvent('galaxy:notify', {
                detail: {
                  tier:             'critical',
                  message:          `${charName} has been killed`,
                  locationId:       targetSysId,
                  locationCategory: 'mission'
                }
              }));
            }
          }
        }

        // Record turn event
        const tierLabel  = tier.charAt(0).toUpperCase() + tier.slice(1);
        const missionTargetSys = (context.galaxy?.systems ?? []).find((s: any) => s.id === targetSysId);
        const atSystem = missionTargetSys?.name ? ` at ${missionTargetSys.name}` : '';
        const mTypeRecordLabel = (MISSION_TYPE_LABELS as Record<string, any>)[payload?.missionType] ?? payload?.missionType ?? 'Mission';
        const mActorCsm   = resolutionContext.characterStates?.[payload?.factionId];
        const mCharIdsRec = Array.isArray(payload?.characterIds) ? payload.characterIds : [];
        const mActorName  = mCharIdsRec.length > 0
          ? (mActorCsm?.getCharacter?.(mCharIdsRec[0])?.name ?? mCharIdsRec[0])
          : this._getFactionName(payload?.factionId);
        const missionOutcomeLabel = report.outcomeTier === 'critical-success' ? 'Critical Success'
          : report.outcomeTier === 'success'       ? 'Success'
          : report.outcomeTier === 'critical-failure' ? 'Critical Failure'
          : report.outcomeTier === 'failure'       ? 'Failure'
          : 'Resolved';
        const outcomeMsg = aborted
          ? `${mTypeRecordLabel} mission aborted (${this._getFactionName(payload?.factionId)})${atSystem}`
          : `${mActorName} \u2014 ${mTypeRecordLabel} ${missionOutcomeLabel}${atSystem}`;
        const missionOutcome = aborted ? 'info' : (
          report.outcomeTier === 'critical-success' ? 'critical_success'
          : report.outcomeTier === 'success'         ? 'success'
          : report.outcomeTier === 'failure'         ? 'failure'
          : report.outcomeTier === 'critical-failure'? 'critical_failure'
          : 'info'
        );

        this.turnStateManager.recordEvent(
          'resolution',
          outcomeMsg,
          {
            systemId: targetSysId,
            urgent: report.captureEvents?.length > 0,
            factionId: payload?.factionId ?? null,
            outcome: missionOutcome,
            domain: 'mission',
            missionType: payload?.missionType ?? null,
            systemOwnerFactionId: missionTargetSys?.loyalty ?? null,
          }
        );

        // Dispatch notifications from MissionEngine result
        for (const note of notifications) {
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: {
              tier: note.tier ?? 'info',
              message: note.message,
              locationId: targetSysId,
              locationCategory: 'mission'
            }
          }));
        }

        // Player alert for mission outcome (spec 063 FR-PA-009)
        if (!aborted && payload?.factionId) {
          const mFactionId  = payload.factionId;
          const mType       = (MISSION_TYPE_LABELS as Record<string, any>)[payload.missionType] ?? payload.missionType ?? 'Mission';
          const mSysName    = missionTargetSys?.name ?? targetSysId;
          const mCharIds    = Array.isArray(payload.characterIds) ? payload.characterIds : [];
          const mCsm        = resolutionContext.characterStates?.[mFactionId];
          const mCharName   = mCharIds.length > 0
            ? (mCsm?.getCharacter?.(mCharIds[0])?.name ?? mCharIds[0])
            : this._getFactionName(mFactionId);
          const ot = report.outcomeTier ?? '';
          const verb = (ot === 'success' || ot === 'critical-success')
            ? 'successfully completed'
            : (ot === 'critical-failure' ? 'critically failed' : 'failed');
          const alertTierLabel = ot === 'critical-success' ? 'Critical Success'
            : ot === 'success' ? 'Success'
            : ot === 'critical-failure' ? 'Critical Failure'
            : 'Failure';
          const mEffects = (report.effectsApplied ?? []).map((fx: any) => ({
            label: (EFFECT_TYPE_LABELS as Record<string, string>)[fx.type] ?? fx.type ?? 'Effect',
            value: fx.amount != null ? String(fx.amount) : (fx.value ?? ''),
          }));
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'mission',
              factionId: mFactionId,
              message:   `${mCharName} has ${verb} ${mType} at ${mSysName}`,
              outcome:   {
                summary:    `${mType} Mission \u2014 ${alertTierLabel}`,
                tier:       alertTierLabel,
                details:    mEffects,
                systemId:   targetSysId,
                systemName: mSysName,
              },
              turn: context.currentTurn ?? 0,
            }
          }));

          // Mirror alert for the system's owning faction if it differs from attacker,
          // so defenders see enemy missions against their systems in Alert History.
          const isSuccess = ot === 'success' || ot === 'critical-success';
          if (missionTargetSys?.loyalty && missionTargetSys.loyalty !== mFactionId) {
            const defFactionId  = missionTargetSys.loyalty;
            const defMessage    = isSuccess
              ? `${mType} operation by ${this._getFactionName(mFactionId)} succeeded at ${mSysName}`
              : `${mType} operation by ${this._getFactionName(mFactionId)} was thwarted at ${mSysName}`;
            window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
              detail: {
                category:       'mission',
                factionId:      defFactionId,
                actorFactionId: mFactionId,
                message:   defMessage,
                outcome:   {
                  summary:    `${mType} \u2014 ${alertTierLabel}`,
                  tier:       alertTierLabel,
                  details:    [
                    { label: 'Attacker', value: this._getFactionName(mFactionId) },
                    { label: 'Type', value: mType },
                    { label: 'Result', value: isSuccess ? alertTierLabel : 'Thwarted' },
                  ],
                  systemId:   targetSysId,
                  systemName: mSysName,
                },
                turn: context.currentTurn ?? 0,
              }
            }));
          }
        }

        // Critical mission outcomes are now surfaced via galaxy:notify critical dispatches above.
        // game:missionAlert is no longer used.

        // Fire mission success/failure events for audio (spec 052 FR-AU-004)
        if (!aborted) {
          const ot = report.outcomeTier ?? '';
          if (ot === 'success' || ot === 'critical-success') {
            window.dispatchEvent(new CustomEvent('game:missionSuccess', { detail: { factionId: payload?.factionId } }));
          } else if (ot === 'failure' || ot === 'critical-failure') {
            window.dispatchEvent(new CustomEvent('game:missionFailed', { detail: { factionId: payload?.factionId } }));
          }
        }

        // Fire character captured event for audio (spec 052 FR-AU-004)
        for (const evt of (report.captureEvents ?? [])) {
          if (evt.type === 'character_captured') {
            window.dispatchEvent(new CustomEvent('game:characterCaptured', {
              detail: { characterId: evt.characterId, factionId: evt.factionId }
            }));
          }
        }
      });
    });

    console.log(`[TurnResolutionEngine] Mission resolution complete — ${allMissions.length} mission(s)`);
  }

  // ─── Step 5: Construction Completions ────────────────────────────────────────

  /**
   * Complete any construction items that have finished their build time.
   * Spec: 018-facility-construction-spec.md (FR-FC2-004)
   * @param {Object} context
   * @private
   */
  _resolveConstruction(context: any) {
    if (!this.constructionEngine) return;

    const completed = this.constructionEngine.resolveCompletions(context, this.turnStateManager);
    if (completed.length > 0) {
      console.log(`[TurnResolutionEngine] Construction completions: ${completed.length}`);
    }
  }

  // ─── Step 6: Diplomatic Action Effects ───────────────────────────────────────

  /**
   * Apply effects from diplomatic actions staged this turn.
   * Spec: 025-diplomatic-actions-spec.md
   * @param {Object} context
   * @private
   */
  _resolveDiplomaticEffects(context: any) {
    const stagedDiplomatic = this.turnStateManager.getStagedActions('diplomatic');
    if (stagedDiplomatic.length === 0) return;

    // Sort by initiative order; higher-initiative faction's action applies first
    stagedDiplomatic.sort((a: any, b: any) => {
      const ai = this.initiativeOrder.indexOf(a.payload?.factionId);
      const bi = this.initiativeOrder.indexOf(b.payload?.factionId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    if (this.diplomacyEngine) {
      this.diplomacyEngine.resetTurnTracking();
    }

    stagedDiplomatic.forEach((action: any) => {
      if (this.diplomacyEngine) {
        const result = this.diplomacyEngine.resolveAction(action, context);
        const diploSys = (context.galaxy?.systems ?? []).find((s: any) => s.id === result.systemId);
        this.turnStateManager.recordEvent('resolution', result.message, {
          systemId: result.systemId,
          urgent: !result.applied,
          factionId: action.payload?.factionId ?? null,
          outcome: result.applied ? 'success' : 'failure',
          domain: 'diplomacy',
          systemOwnerFactionId: diploSys?.loyalty ?? null,
        });
        // Player alert for diplomatic action (spec 063)
        if (action.payload?.factionId) {
          const diploSysName = result.systemId ? this._getSystemName(result.systemId, context) : null;
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'diplomacy',
              factionId: action.payload.factionId,
              message:   result.message,
              outcome:   {
                summary:    result.message,
                tier:       result.applied ? 'Success' : 'Failure',
                details:    diploSysName ? [{ label: 'System', value: diploSysName }] : [],
                systemId:   result.systemId ?? null,
                systemName: diploSysName,
              },
              turn: context.currentTurn ?? 0,
            }
          }));
        }
        if (result.applied) {
          window.dispatchEvent(new CustomEvent('galaxy:loyaltyUpdate', {
            detail: { systemId: result.systemId }
          }));
        }
      } else {
        this.turnStateManager.recordEvent('resolution',
          `Diplomatic action staged for ${this._getFactionName(action.payload?.factionId)}`,
          {
            systemId: action.payload?.targetSystemId,
            factionId: action.payload?.factionId ?? null,
            outcome: 'info',
            domain: 'diplomacy',
          }
        );
      }
    });

    if (stagedDiplomatic.length > 0) {
      console.log(`[TurnResolutionEngine] Diplomatic effects resolved: ${stagedDiplomatic.length} action(s)`);
    }
  }

  // ─── Step 7: Intel Updates & Expiry ──────────────────────────────────────────

  /**
   * Purge expired intel items and generate passive outpost intel.
   * Spec: 042-intel-system-spec.md (FR-IS-002, FR-IS-005)
   * @param {Object} context
   * @private
   */
  _resolveIntelUpdates(context: any) {
    if (!this.intelStateManager) return;

    // Purge expired items (FR-IS-002)
    const purged = this.intelStateManager.purgeExpired(context.currentTurn);
    if (purged > 0) {
      this.turnStateManager?.recordEvent(
        'resolution',
        `Intel: ${purged} expired item(s) purged`,
        { factionId: null, outcome: 'info', domain: 'intel' }
      );
    }

    // Generate outpost passive intel (FR-IS-005)
    if (this.intelEngine && context.constructionStateManager && context.galaxy) {
      const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
      for (const factionId of FACTION_IDS) {
        const items = this.intelEngine.buildOutpostIntel(
          context.galaxy,
          context.constructionStateManager,
          factionId,
          context.currentTurn
        );
        for (const item of items) {
          this.intelStateManager.addIntelItem(factionId, item);
        }
      }
    }

    console.log(`[TurnResolutionEngine] Intel updates complete (${purged} purged)`);
  }

  // ─── Step 8: Dynamic Events ───────────────────────────────────────────────────

  /**
   * Roll random events per faction and evaluate scripted event conditions.
   * Non-choice events have effects applied immediately.
   * Choice events for the player faction are dispatched as galaxy:choiceEvent
   * to be resolved by the React EventChoiceModal before the next Action Phase.
   * Spec: 045-event-system-spec.md (FR-ES-002, FR-ES-003)
   * @param {Object} context
   * @private
   */
  _resolveEvents(context: any) {
    if (!this.eventEngine) return;

    const { pendingPlayerChoices, appliedEvents } = this.eventEngine.resolveEvents(context);

    // Record applied non-choice events in the turn summary and dispatch player alerts
    for (const { event, factionId } of appliedEvents) {
      const factionLabel = this._getFactionName(factionId);
      this.turnStateManager?.recordEvent(
        'resolution',
        `Event: ${event.title} (${factionLabel})`,
        { urgent: false, factionId, outcome: 'info', domain: 'event' }
      );
      // Player alert so events appear in the Alert Bar and Alert History (spec 063)
      const resolvedDesc = this.eventEngine?.resolveTokens
        ? this.eventEngine.resolveTokens(event.description ?? '', factionId, context, context.currentTurn ?? 0)
        : (event.description ?? '');
      window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
        detail: {
          category:  'event',
          factionId,
          message:   event.title,
          outcome:   {
            summary:    event.title,
            details:    resolvedDesc
              ? [{ label: 'Description', value: resolvedDesc }]
              : [],
            systemId:   null,
            systemName: null,
          },
          turn: context.currentTurn ?? 0,
        }
      }));
      // Show informational modal to the player for non-choice events (non-blocking)
      if (factionId === context.playerFactionId) {
        window.dispatchEvent(new CustomEvent('galaxy:noneChoiceEvent', {
          detail: { event, factionId, resolvedDescription: resolvedDesc }
        }));
      }
    }

    // Spec 058: In headless mode (sync), resolve choice events using pre-submitted
    // choices from the input bundle instead of dispatching to React modals.
    if (context.headless && context.eventChoices) {
      for (const item of pendingPlayerChoices) {
        const choiceIndex = context.eventChoices[item.event.id];
        if (choiceIndex !== undefined && item.event.choices?.[choiceIndex]) {
          // Apply the chosen option via the correct EventEngine method
          const chosen = item.event.choices[choiceIndex];
          this.eventEngine.resolvePlayerChoice(item.event.id, item.factionId, choiceIndex, context);
          const choiceLabel = chosen.label ?? `Option ${choiceIndex + 1}`;
          this.turnStateManager?.recordEvent(
            'resolution',
            `Event resolved: ${item.event.title} \u2014 chose "${choiceLabel}"`,
            { urgent: false, factionId: item.factionId, outcome: 'info', domain: 'event' }
          );
          // Alert for the resolved choice
          const resolvedChoiceDesc = this.eventEngine?.resolveTokens
            ? this.eventEngine.resolveTokens(item.event.description ?? '', item.factionId, context, context.currentTurn ?? 0)
            : (item.event.description ?? '');
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'event',
              factionId: item.factionId,
              message:   `Event resolved: ${item.event.title} — chose "${choiceLabel}"`,
              outcome:   {
                summary:    item.event.title,
                details:    [
                  ...(resolvedChoiceDesc ? [{ label: 'Description', value: resolvedChoiceDesc }] : []),
                  { label: 'Choice', value: choiceLabel },
                ],
                systemId:   null,
                systemName: null,
              },
              turn: context.currentTurn ?? 0,
            }
          }));
        } else {
          // No choice submitted — auto-select first option as default
          this.eventEngine.resolvePlayerChoice(item.event.id, item.factionId, 0, context);
          const defaultLabel = item.event.choices?.[0]?.label ?? 'Default';
          this.turnStateManager?.recordEvent(
            'resolution',
            `Event auto-resolved: ${item.event.title} \u2014 default choice`,
            { urgent: false, factionId: item.factionId, outcome: 'info', domain: 'event' }
          );
          // Alert for auto-resolved choice
          const resolvedAutoDesc = this.eventEngine?.resolveTokens
            ? this.eventEngine.resolveTokens(item.event.description ?? '', item.factionId, context, context.currentTurn ?? 0)
            : (item.event.description ?? '');
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'event',
              factionId: item.factionId,
              message:   `Event auto-resolved: ${item.event.title} — default choice`,
              outcome:   {
                summary:    item.event.title,
                details:    [
                  ...(resolvedAutoDesc ? [{ label: 'Description', value: resolvedAutoDesc }] : []),
                  { label: 'Choice', value: defaultLabel },
                ],
                systemId:   null,
                systemName: null,
              },
              turn: context.currentTurn ?? 0,
            }
          }));
        }
      }
    } else {
      // Async mode: Dispatch player choice events to React (resolved before next Action Phase).
      // The recordEvent is intentionally NOT added here — the choiceEventResolved handler in
      // main-stage.js adds the entry after the player selects, so the turn summary shows what
      // was actually chosen rather than a "pending" placeholder.
      for (const item of pendingPlayerChoices) {
        const resolvedEventDesc = this.eventEngine?.resolveTokens
          ? this.eventEngine.resolveTokens(item.event.description ?? '', item.factionId, context, context.currentTurn ?? 0)
          : (item.event.description ?? '');
        window.dispatchEvent(new CustomEvent('galaxy:choiceEvent', {
          detail: {
            event: item.event,
            factionId: item.factionId,
            resolvedDescription: resolvedEventDesc,
          }
        }));
      }
    }

    const total = appliedEvents.length + pendingPlayerChoices.length;
    if (total > 0) {
      console.log(`[TurnResolutionEngine] Events resolved: ${appliedEvents.length} applied, ${pendingPlayerChoices.length} pending player choice(s)`);
    }
  }

  // ─── Character Assignment Resolution (spec 010 FR-CA-009) ──────────────────

  /**
   * Validate staged fleet/facility character assignments at resolution time.
   * Characters have their status locked in at staging; this step rolls back
   * any assignments that are no longer valid (e.g. fleet destroyed).
   * Spec: 010-character-assignment-spec.md (FR-CA-009)
   * @param {Object} context
   * @private
   */
  _resolveCharacterAssignments(context: any) {
    const staged = this.turnStateManager.getStagedActions('characterAssignment');
    if (staged.length === 0) return;

    for (const action of staged) {
      const { factionId, characterId, assignmentType, targetId } = action.payload;
      const csm = this.characterStates[factionId];
      if (!csm) continue;
      const char = csm.getCharacter(characterId);
      if (!char) continue;

      // Validate fleet commander target still exists
      if (assignmentType === 'fleet' && targetId) {
        const fleet = this.fleetStateManager?.getFleet?.(targetId);
        if (!fleet) {
          csm.unassign(characterId);
          this.turnStateManager.recordEvent(
            'resolution',
            `${char.name}'s fleet command assignment rolled back — fleet ${targetId} no longer exists`,
            { urgent: false, factionId, outcome: 'info', domain: 'character' }
          );
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: { tier: 'warning', message: `${char.name}'s fleet assignment was cancelled — fleet destroyed` }
          }));
        }
      }
    }

    console.log(`[TurnResolutionEngine] Character assignments resolved: ${staged.length}`);
  }

  /**
   * Disband all 0-ship fleets produced by combat, processing any assigned
   * fleet commander: losing-side commanders risk capture (FR-CCR-002); all
   * survivors are unassigned and relocated to the nearest friendly system.
   * Fleet objects are fully removed from FleetStateManager after processing.
   * Spec: 016-fleet-commander-spec.md, 012-character-capture-rescue-spec.md
   * @param {Object[]} results  - raw results from CombatEngine.resolveAllCombats()
   * @param {Object}   context  - shared resolution context
   * @private
   */
  _handleDestroyedFleets(results: any, context: any) {
    if (!this.fleetStateManager || results.length === 0) return;

    const galaxy    = context.galaxy;
    const systems   = galaxy?.systems ?? [];
    const systemMap = Object.fromEntries(systems.map((s: any) => [s.id, s]));
    const turn      = context.currentTurn ?? 0;

    // Build a map of defeated factionId → { capturingFactionId, systemId }
    const defeatMap: Record<string, any> = {};
    for (const result of results) {
      if (result.outcome === 'attackerVictory') {
        defeatMap[result.defenderFactionId] = {
          capturingFactionId: result.attackerFactionId,
          systemId:           result.systemId,
        };
      } else if (result.outcome === 'defenderVictory') {
        defeatMap[result.attackerFactionId] = {
          capturingFactionId: result.defenderFactionId,
          systemId:           result.systemId,
        };
      }
      // draw: both sides retreated; neither is considered a captor
    }

    const involvedFactions = new Set(results.flatMap((r: any) => [r.attackerFactionId, r.defenderFactionId]));

    for (const factionId of involvedFactions) {
      const allFleets   = this.fleetStateManager.fleets?.[factionId as string] ?? [];
      const emptyFleets = allFleets.filter((f: any) => f.ships.length === 0);
      if (emptyFleets.length === 0) continue;

      const csm        = this.characterStates?.[factionId as string];
      const defeatInfo = defeatMap[factionId as string] ?? null; // null = winner or draw

      for (const fleet of emptyFleets) {
        // ---- Process assigned fleet commander ----
        if (csm) {
          const commanders = csm.getAllCharacters().filter(
            (c: any) => c.assignedFleetId === fleet.id && c.status === CHARACTER_STATUS.IN_FLEET
          );

          for (const char of commanders) {
            let captured = false;
            if (defeatInfo) {
              // Losing side: roll capture probability
              const seed          = `${turn}-${fleet.id}-${char.id}-capture`;
              const captureEngine = new CharacterCaptureEngine();
              captured = captureEngine.rollCapture(char, 'fleet-destruction', {}, seed);
            }

            if (captured) {
              csm.capture(char.id, defeatInfo.systemId, defeatInfo.capturingFactionId);
              this.turnStateManager.recordEvent(
                'resolution',
                `${char.name} was captured after fleet destruction at ${this._getSystemName(defeatInfo.systemId, context)}`,
                { urgent: true, factionId, outcome: 'failure', domain: 'character',
                  systemOwnerFactionId: defeatInfo.capturingFactionId }
              );
              window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
                detail: {
                  category:       'character',
                  factionId,
                  actorFactionId: defeatInfo.capturingFactionId ?? null,
                  message:   `${char.name} was captured at ${this._getSystemName(defeatInfo.systemId, context)}`,
                  outcome:   'failure',
                  turn,
                }
              }));
            } else {
              // Safe — unassign and relocate to nearest friendly system
              const fromSystemId = fleet.systemId ?? defeatInfo?.systemId ?? null;
              csm.unassign(char.id);
              const nearestId = this._findNearestFriendlySystem(fromSystemId, factionId, systemMap, systems);
              if (nearestId) {
                const c = csm.getCharacter(char.id);
                if (c) c.locationSystemId = nearestId;
              }
              if (defeatInfo) {
                this.turnStateManager.recordEvent(
                  'resolution',
                  `${char.name} escaped fleet destruction at ${this._getSystemName(defeatInfo.systemId, context)}`,
                  { urgent: false, factionId, outcome: 'info', domain: 'character',
                    systemOwnerFactionId: defeatInfo.capturingFactionId }
                );
                window.dispatchEvent(new CustomEvent('galaxy:notify', {
                  detail: {
                    tier:       'warning',
                    message:    `${char.name} escaped the destruction of their fleet — relocated${nearestId ? ` to ${this._getSystemName(nearestId, context)}` : ''}`,
                    locationId: defeatInfo.systemId,
                  }
                }));
              }
            }
          }
        }

        // ---- Fully remove the empty fleet ----
        this.fleetStateManager.disbandFleet(fleet.id);
      }
    }
  }

  /**
   * Relocate stationed characters when a system is captured.
   * Characters stationed at the captured system are unassigned and their
   * locationSystemId is updated to the nearest friendly system via BFS.
   * Spec: 010-character-assignment-spec.md (FR-CA-004)
   * @param {string} systemId - Captured system ID
   * @param {string} newOwnerFactionId - Faction that captured the system
   * @param {Object} context
   * @private
   */
  _handleCapturedSystemCharacters(systemId: any, newOwnerFactionId: any, context: any) {
    const galaxy  = context.galaxy;
    const systems = galaxy?.systems ?? [];
    const systemMap = Object.fromEntries(systems.map((s: any) => [s.id, s]));

    for (const [factionId, csm] of (Object.entries(this.characterStates) as [string, any][])) {
      const stationed = csm.getAllCharacters().filter(
        (c: any) => c.status === 'stationed' && c.assignedFacility?.systemId === systemId
      );
      for (const char of stationed) {
        const prevSystem = char.locationSystemId;
        csm.unassign(char.id);

        // Update location to nearest remaining friendly system
        const nearestId = this._findNearestFriendlySystem(prevSystem, factionId, systemMap, systems);
        if (nearestId) {
          const c = csm.getCharacter(char.id);
          if (c) c.locationSystemId = nearestId;
        }

        this.turnStateManager.recordEvent(
          'resolution',
          `${char.name} displaced from ${this._getSystemName(systemId, context)} — relocated to nearest friendly system`,
          { urgent: false, factionId, outcome: 'info', domain: 'character', systemOwnerFactionId: newOwnerFactionId }
        );
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: {
            tier:       'warning',
            message:    `${char.name} was stationed at ${this._getSystemName(systemId, context)} — displaced by capture, relocated${nearestId ? ` to ${this._getSystemName(nearestId, context)}` : ''}`,
            locationId: systemId
          }
        }));
      }
    }
  }

  /**
   * BFS to find the closest system controlled by factionId starting from fromId.
   * Falls back to any owned system if no reachable friendly system is found.
   * @param {string|null} fromId
   * @param {string} factionId
   * @param {Object} systemMap - id → system
   * @param {Array}  systems   - all system objects
   * @returns {string|null}
   * @private
   */
  // ─── Sub-Turn Completions ────────────────────────────────────────────────────

  /**
   * Lightweight pass run at each .25/.50/.75 quarter-turn checkpoint during sync mode.
   * Checks missions, construction, ship production, and tech research for items whose
   * `completionTurn` has been reached.  Does NOT run resources, events, loyalty, combat,
   * or victory checks — those remain whole-turn only.
   *
   * @param {number} quarterTurn  – current quarter-turn float, e.g. 3.75
   * @param {Object} context      – subset of the full resolution context
   * @returns {Array<{category, factionId, message, outcome}>} completed items for alert dispatch
   */
  resolveCompletions(quarterTurn: any, context: any) {
    const completed = [];

    // — Missions —
    if (this.missionStateManager) {
      const readyMissions = this.missionStateManager.getReadyMissionsAtQuarterTurn(quarterTurn);
      for (const mission of readyMissions) {
        const typeName = (MISSION_TYPE_LABELS as Record<string, any>)[mission.type] ?? mission.type ?? 'Mission';
        completed.push({
          category:  'success',
          factionId: mission.factionId,
          message:   `${typeName} mission completed.`,
          outcome:   { summary: `${typeName} mission ready to resolve.`, details: [], systemId: null, systemName: null },
        });
      }
    }

    // — Construction —
    if (context.constructionStateManager) {
      const readyItems = context.constructionStateManager.getCompletedAtQuarterTurn(quarterTurn);
      for (const { systemId, qitem } of readyItems) {
        const sysName = this._getSystemName(systemId, context);
        completed.push({
          category:  'success',
          factionId: qitem.factionId ?? null,
          message:   `Construction complete at ${sysName}.`,
          outcome:   { summary: `${qitem.facilityId ?? 'Facility'} completed at ${sysName}.`, details: [], systemId, systemName: sysName },
        });
      }
    }

    // — Ship Production —
    if (context.fleetStateManager) {
      const readyShips = context.fleetStateManager.getProductionCompletedAtQuarterTurn(quarterTurn);
      for (const entry of readyShips) {
        const sysName = this._getSystemName(entry.systemId, context);
        completed.push({
          category:  'success',
          factionId: entry.factionId,
          message:   `${entry.shipTypeId ?? 'Ship'} production complete at ${sysName}.`,
          outcome:   { summary: `${entry.shipTypeId ?? 'Ship'} ready at ${sysName}.`, details: [], systemId: entry.systemId, systemName: sysName },
        });
      }
    }

    // — Tech Research —
    if (context.techStates) {
      for (const [factionId, techState] of (Object.entries(context.techStates) as [string, any][])) {
        const readyTechs = (techState.state?.activeResearchProjects ?? [])
          .filter((p: any) => p.completionQuarterTurn != null && p.completionQuarterTurn <= quarterTurn);
        for (const project of readyTechs) {
          techState.state.activeResearchProjects =
            techState.state.activeResearchProjects.filter((p: any) => p.techId !== project.techId);
          if (!techState.state.completedTechnologies.includes(project.techId)) {
            techState.state.completedTechnologies.push(project.techId);
          }
          completed.push({
            category:  'success',
            factionId,
            message:   `Research complete: ${project.techId}.`,
            outcome:   { summary: `Technology "${project.techId}" researched.`, details: [], systemId: null, systemName: null },
          });
        }
      }
    }

    return completed;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  /**
   * Look up the human-readable name of a system by ID.
   * Falls back to the raw ID if the system is not found in the context.
   * @param {string} systemId
   * @param {Object} context
   * @returns {string}
   * @private
   */
  _getFactionName(factionId: any) {
    if (!factionId) return factionId;
    return FactionDefinitionLoader.getFactionById(factionId)?.displayName ?? factionId;
  }

  /**
   * Return the human-readable system name from galaxy context.
   * @param {string} systemId
   * @param {Object} context
   * @returns {string}
   * @private
   */
  _getSystemName(systemId: any, context: any) {
    if (!systemId) return systemId;
    const system = (context.galaxy?.systems ?? []).find((s: any) => s.id === systemId);
    return system?.name ?? systemId;
  }

  _findNearestFriendlySystem(fromId: any, factionId: any, systemMap: any, systems: any) {
    if (!fromId) {
      return systems.find((s: any) => s.loyalty === factionId)?.id ?? null;
    }
    const visited = new Set([fromId]);
    const queue   = [fromId];
    while (queue.length > 0) {
      const curr = queue.shift();
      const sys  = (systemMap as Record<string, any>)[curr];
      if (!sys) continue;
      for (const neighbor of (sys.connections ?? [])) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        const ns = (systemMap as Record<string, any>)[neighbor];
        if (!ns) continue;
        if (ns.loyalty === factionId) return neighbor;
        queue.push(neighbor);
      }
    }
    // Fallback: any owned system
    return systems.find((s: any) => s.loyalty === factionId)?.id ?? null;
  }
}

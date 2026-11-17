/**
 * EventEngine — Dynamic narrative event system.
 *
 * Manages a pool of random and scripted events loaded from core/events.json.
 * Called during the Resolution Phase (step 8) to roll random events per faction,
 * check scripted event conditions, and apply effects or queue player choice events.
 *
 * Key custom events:
 *  galaxy:choiceEvent         — dispatched when a player faction choice event fires
 *  galaxy:choiceEventResolved — dispatched by React when the player makes a selection
 *
 * Spec: 045-event-system-spec.md
 */

import { SeededRandom } from './seeded-random.js';

// Number of turns before the same event can re-fire for a faction (FR-ES-002)
const EVENT_COOLDOWN_TURNS = 3;

export class EventEngine {
  _factionIds: any[] = [];
  _events: any[] = [];
  _randomEvents: any[] = [];
  _scriptedEvents: any[] = [];
  _cooldowns: any = {};
  _firedScriptedOnce: Set<any> = new Set();
  _eventLog: any[] = [];
  /**
   * @param {string[]} [factionIds=[]] - Active faction IDs
   */
  constructor(factionIds: any[] = []) {
    this._factionIds = factionIds;

    /** All validated events (populated by loadEvents) */
    this._events = [];
    this._randomEvents   = [];
    this._scriptedEvents = [];

    /**
     * Per-faction random event cooldown map.
     * { factionId: { eventId: lastFiredTurnNumber } }
     */
    this._cooldowns = {};
    for (const fId of factionIds) {
      this._cooldowns[fId] = {};
    }

    /**
     * Set of event IDs for scripted events that have already fired once per game.
     * Used to enforce the default "once per game" behavior and first_time condition.
     */
    this._firedScriptedOnce = new Set();

    /**
     * Full event log for this game session.
     * @type {Array<{turnNumber:number, factionId:string, eventId:string, choiceIndex:number, effectsApplied:Object[]}>}
     */
    this._eventLog = [];
  }

  // ─── Loading & Validation ─────────────────────────────────────────────────────

  /**
   * Load and validate event definitions from the events array.
   * Malformed entries are skipped with a console warning (FR-ES constraint).
   * @param {Object[]} eventsArray
   */
  loadEvents(eventsArray: any) {
    this._events = [];
    for (const evt of (eventsArray ?? [])) {
      if (!this._validateEvent(evt)) {
        console.warn(`[EventEngine] Skipping malformed event: ${evt?.id ?? '(no id)'}`);
        continue;
      }
      this._events.push(evt);
    }
    this._randomEvents   = this._events.filter((e: any) => e.type === 'random');
    this._scriptedEvents = this._events.filter((e: any) => e.type === 'scripted');
    console.log(
      `[EventEngine] Loaded ${this._events.length} events` +
      ` (${this._randomEvents.length} random, ${this._scriptedEvents.length} scripted)`
    );
  }

  /** @private */
  _validateEvent(evt: any) {
    return (
      evt != null &&
      typeof evt.id      === 'string' && evt.id.length > 0 &&
      typeof evt.title   === 'string' &&
      (evt.type === 'random' || evt.type === 'scripted') &&
      Array.isArray(evt.effects ?? []) &&
      Array.isArray(evt.choices ?? [])
    );
  }

  // ─── Main Resolution Entry Point ──────────────────────────────────────────────

  /**
   * Resolve events for all factions during Resolution Phase step 8.
   *
   * Returns two lists:
   *  - pendingPlayerChoices: choice events that need player input
   *  - appliedEvents: non-choice events (effects already applied)
   *
   * @param {Object} context - Shared game context (same shape as TurnResolutionEngine context)
   * @returns {{ pendingPlayerChoices: Object[], appliedEvents: Object[] }}
   */
  resolveEvents(context: any) {
    const { currentTurn } = context;
    const playerFactionId = context.playerFactionId ?? null;

    const pendingPlayerChoices: any[] = [];
    const appliedEvents: any[] = [];

    for (const factionId of this._factionIds) {
      if (!this._cooldowns[factionId]) this._cooldowns[factionId] = {};

      // ── Scripted events take priority (FR-ES-003); only the first match fires ──
      const scriptedEvents = this._checkScriptedEvents(factionId, currentTurn, context);
      if (scriptedEvents.length > 0) {
        const evt = scriptedEvents[0];
        this._handleFiredEvent(
          evt, factionId, playerFactionId,
          currentTurn, context,
          pendingPlayerChoices, appliedEvents
        );
        // Mark non-choice scripted events as fired immediately
        if (!evt.choices?.length && !evt.repeatable) {
          this._firedScriptedOnce.add(evt.id);
        }
        continue; // slot consumed — skip random roll for this faction this turn
      }

      // ── Random event roll (max 1 per faction per turn, FR-ES-002) ──
      const randomEvent = this._rollRandomEvent(factionId, currentTurn, context);
      if (randomEvent) {
        this._handleFiredEvent(
          randomEvent, factionId, playerFactionId,
          currentTurn, context,
          pendingPlayerChoices, appliedEvents
        );
        if (!randomEvent.choices?.length) {
          this._setCooldown(factionId, randomEvent.id, currentTurn);
        }
      }
    }

    return { pendingPlayerChoices, appliedEvents };
  }

  /**
   * Apply a player's choice selection for a previously queued choice event.
   * Called by MainStage when galaxy:choiceEventResolved is received.
   *
   * @param {string} eventId
   * @param {string} factionId
   * @param {number} choiceIndex
   * @param {Object} context
   */
  resolvePlayerChoice(eventId: any, factionId: any, choiceIndex: any, context: any) {
    const evt = this._events.find((e: any) => e.id === eventId);
    if (!evt) {
      console.warn(`[EventEngine] resolvePlayerChoice: unknown event "${eventId}"`);
      return;
    }

    const effects = this._getEffectsForChoice(evt, choiceIndex);
    this._applyEffects(effects, context, factionId);
    this._logEvent(context.currentTurn, factionId, eventId, choiceIndex, effects);

    if (evt.type === 'random') {
      this._setCooldown(factionId, eventId, context.currentTurn);
    } else if (!evt.repeatable) {
      this._firedScriptedOnce.add(eventId);
    }
  }

  // ─── Event Handling Helpers ───────────────────────────────────────────────────

  /** @private */
  _handleFiredEvent(evt: any, factionId: any, playerFactionId: any, currentTurn: any, context: any, pendingPlayerChoices: any, appliedEvents: any) {
    const isChoiceEvent  = Array.isArray(evt.choices) && evt.choices.length > 0;
    const isPlayerFaction = factionId === playerFactionId;

    if (isChoiceEvent && isPlayerFaction) {
      // Queue for player presentation; effects applied after choice (FR-ES-004)
      pendingPlayerChoices.push({ event: evt, factionId });
    } else if (isChoiceEvent) {
      // AI auto-selects choice (FR-ES-004)
      const choiceIndex = this._aiSelectChoice(evt, factionId, context);
      const effects     = this._getEffectsForChoice(evt, choiceIndex);
      this._applyEffects(effects, context, factionId);
      this._logEvent(currentTurn, factionId, evt.id, choiceIndex, effects);
      appliedEvents.push({ event: evt, factionId, choiceIndex });
    } else {
      // Non-choice event: apply base effects immediately (FR-ES-005)
      const effects = this._getEffectsForChoice(evt, -1);
      this._applyEffects(effects, context, factionId);
      this._logEvent(currentTurn, factionId, evt.id, -1, effects);
      appliedEvents.push({ event: evt, factionId, choiceIndex: -1 });

      // Non-choice events fire a warning notification (FR-ES-006)
      const description = this._resolveTokens(evt.description ?? evt.title, factionId, context, context.currentTurn ?? 0);
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'warning',
          message:          `${evt.title}: ${description}`,
          locationCategory: 'event'
        }
      }));
    }
  }

  // ─── Random Event Roll (FR-ES-002) ────────────────────────────────────────────

  /** @private */
  _rollRandomEvent(factionId: any, currentTurn: any, context: any) {
    const seed = `${currentTurn}${factionId}event`;
    const rng  = new SeededRandom(seed);

    // Build eligible pool: conditions pass AND not on cooldown AND faction allowed
    const eligible = this._randomEvents.filter((evt: any) => {
      const lastFired = this._cooldowns[factionId]?.[evt.id] ?? -999;
      if (currentTurn - lastFired < EVENT_COOLDOWN_TURNS) return false;
      // Faction restriction: if factionRestriction array is set, only fire for listed factions
      if (Array.isArray(evt.factionRestriction) && evt.factionRestriction.length > 0) {
        if (!evt.factionRestriction.includes(factionId)) return false;
      }
      return this._checkConditions(evt.conditions ?? [], factionId, currentTurn, context, evt.id);
    });

    if (eligible.length === 0) return null;

    // Weighted random selection
    const totalWeight = eligible.reduce((s: any, e: any) => s + (e.weight ?? 1), 0);
    let roll = rng.next() * totalWeight;
    for (const evt of eligible) {
      roll -= (evt.weight ?? 1);
      if (roll <= 0) return evt;
    }
    return eligible[eligible.length - 1];
  }

  // ─── Scripted Event Checks (FR-ES-003) ────────────────────────────────────────

  /** @private */
  _checkScriptedEvents(factionId: any, currentTurn: any, context: any) {
    const fired = [];
    for (const evt of this._scriptedEvents) {
      // By default, scripted events fire at most once per game (FR-ES-003)
      if (!evt.repeatable && this._firedScriptedOnce.has(evt.id)) continue;

      if (this._checkConditions(evt.conditions ?? [], factionId, currentTurn, context, evt.id)) {
        fired.push(evt);
      }
    }
    return fired;
  }

  // ─── Condition Evaluation ─────────────────────────────────────────────────────

  /** @private */
  _checkConditions(conditions: any, factionId: any, currentTurn: any, context: any, eventId: any) {
    for (const cond of conditions) {
      if (!this._evalCondition(cond, factionId, currentTurn, context, eventId)) return false;
    }
    return true;
  }

  /** @private */
  _evalCondition(cond: any, factionId: any, currentTurn: any, context: any, eventId: any) {
    const { galaxy, loyaltyStateManager, characterStates } = context;

    switch (cond.type) {
      case 'turn_gte':
        return currentTurn >= (cond.value ?? 0);

      case 'turn_lte':
        return currentTurn <= (cond.value ?? Infinity);

      case 'systems_owned_gte': {
        const tf    = cond.factionId ?? factionId;
        const count = (galaxy?.systems ?? []).filter((s: any) => s.loyalty === tf).length;
        return count >= (cond.value ?? 0);
      }

      case 'systems_owned_lte': {
        const tf    = cond.factionId ?? factionId;
        const count = (galaxy?.systems ?? []).filter((s: any) => s.loyalty === tf).length;
        return count <= (cond.value ?? Infinity);
      }

      case 'loyalty_lte': {
        const val = loyaltyStateManager?.getLoyalty(cond.systemId, cond.factionId ?? factionId) ?? 0;
        return val <= (cond.value ?? 100);
      }

      case 'loyalty_gte': {
        const val = loyaltyStateManager?.getLoyalty(cond.systemId, cond.factionId ?? factionId) ?? 0;
        return val >= (cond.value ?? 0);
      }

      case 'character_captured': {
        const charId = cond.characterId;
        return Object.values(characterStates ?? {}).some((csm: any) => {
          const chars = csm?.getAllCharacters?.() ?? Object.values(csm?.state?.characters ?? {});
          return chars.some((c: any) => c.id === charId && c.status === 'captured');
        });
      }

      case 'first_time':
        // True only if the enclosing event has not yet fired
        return !this._firedScriptedOnce.has(eventId);

      default:
        console.warn(`[EventEngine] Unknown condition type: "${cond.type}"`);
        return false;
    }
  }

  // ─── Effect Resolution ────────────────────────────────────────────────────────

  /**
   * Return the combined effects list for a given choice index.
   * choiceIndex = -1 means no choice (non-choice event); return base effects.
   * @private
   */
  _getEffectsForChoice(evt: any, choiceIndex: any) {
    const base = evt.effects ?? [];
    if (choiceIndex < 0 || !evt.choices?.length) return [...base];
    const choice = evt.choices[choiceIndex] ?? evt.choices[0];
    return [...base, ...(choice?.effects ?? [])];
  }

  /**
   * Apply a list of effects to the current game context on behalf of factionId.
   * Spec: FR-ES-005 — all 8 supported effect types.
   * @param {Object[]} effects
   * @param {Object}   context
   * @param {string}   factionId
   * @private
   */
  _applyEffects(effects: any, context: any, factionId: any) {
    const {
      galaxy, resourceStates, resourceEngine,
      loyaltyStateManager, characterStates,
      fleetStateManager, currentTurn
    } = context;

    const rsm = resourceStates?.[factionId];

    for (const eff of effects) {
      switch (eff.type) {

        // ── resource_delta ──────────────────────────────────────────────────────
        case 'resource_delta': {
          if (!rsm || !resourceEngine || !eff.resource || eff.amount == null) break;
          const delta = { [eff.resource]: Math.abs(eff.amount) };
          if (eff.amount >= 0) {
            resourceEngine.applyProduction(rsm.state, delta, currentTurn);
          } else {
            resourceEngine.spendResources(rsm.state, delta, 'event', currentTurn);
          }
          break;
        }

        // ── loyalty_delta ───────────────────────────────────────────────────────
        case 'loyalty_delta': {
          if (!loyaltyStateManager) break;
          const targetFaction = eff.factionId ?? factionId;
          if (eff.systemId) {
            loyaltyStateManager.adjustLoyalty(eff.systemId, targetFaction, eff.amount ?? 0);
          }
          break;
        }

        // ── fleet_damage ────────────────────────────────────────────────────────
        case 'fleet_damage': {
          if (!fleetStateManager || !eff.systemId) break;
          const fleets = (Object.values(fleetStateManager.fleets ?? {}) as any[])
            .flat()
            .filter((f: any) => f.systemId === eff.systemId && f.factionId === factionId && !f.inTransit);
          let removed = 0;
          const toRemove = eff.amount ?? 1;
          for (const fleet of (fleets as any[])) {
            if (removed >= toRemove) break;
            const ships = fleet.ships ?? [];
            if (ships.length > 0) {
              // Remove lowest-tier ship (last in array)
              ships.splice(ships.length - 1, 1);
              removed++;
            }
          }
          break;
        }

        // ── facility_damage ─────────────────────────────────────────────────────
        case 'facility_damage': {
          if (!eff.systemId) break;
          const sys = (galaxy?.systems ?? []).find((s: any) => s.id === eff.systemId);
          if (!sys?.facilities?.length) break;
          for (const fac of sys.facilities) {
            if (eff.facilityType === 'any' || fac.type === eff.facilityType) {
              fac.hp = Math.max(0, (fac.hp ?? fac.level ?? 1) - 1);
              fac.inoperative = (fac.hp < (fac.level ?? 1) * 0.5);
              break;
            }
          }
          break;
        }

        // ── spawn_fleet ─────────────────────────────────────────────────────────
        case 'spawn_fleet': {
          if (!fleetStateManager || !eff.systemId) break;
          const spawnFaction = eff.faction ?? 'neutral';
          try {
            const fleet = fleetStateManager.createFleet(spawnFaction, eff.systemId);
            const count = eff.size ?? 2;
            for (let i = 0; i < count; i++) {
              fleetStateManager.addShipToFleet(fleet.id, 'fighter');
            }
          } catch (err) {
            console.warn('[EventEngine] spawn_fleet failed:', err);
          }
          break;
        }

        // ── character_lost ──────────────────────────────────────────────────────
        case 'character_lost': {
          if (!eff.characterId) break;
          // Mark character as absent for 2 turns if CharacterStateManager supports it;
          // otherwise set status to 'stationed' as a temporary unavailability marker.
          for (const csm of (Object.values(characterStates ?? {}) as any[])) {
            const chars = csm?.getAllCharacters?.()
              ?? Object.values(csm?.state?.characters ?? {});
            const char = chars.find((c: any) => c.id === eff.characterId);
            if (char) {
              if (typeof csm.markAbsent === 'function') {
                csm.markAbsent(eff.characterId, 2, currentTurn);
              } else {
                char.status = 'stationed';
              }
              break;
            }
          }
          break;
        }

        // ── intel_item ──────────────────────────────────────────────────────────
        case 'intel_item': {
          // Generate an intel notification; full intel engine integration deferred.
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: {
              tier:    'info',
              message: `Intel gathered: ${eff.description ?? 'new intelligence report filed'}`
            }
          }));
          break;
        }

        // ── notify ──────────────────────────────────────────────────────────────
        case 'notify': {
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: {
              tier:    eff.tier ?? 'info',
              message: eff.message ?? ''
            }
          }));
          break;
        }

        default:
          console.warn(`[EventEngine] Unknown effect type: "${eff.type}"`);
      }
    }
  }

  // ─── AI Choice Selection (FR-ES-004) ─────────────────────────────────────────

  /**
   * AI automatically selects the choice that maximises immediate resource/loyalty gain.
   * Spec: FR-ES-004 — "AI selects option with highest delta to its current macro goal score".
   * @private
   */
  _aiSelectChoice(evt: any, factionId: any, context: any) {
    const choices = evt.choices ?? [];
    if (choices.length === 0) return -1;

    let bestIdx   = 0;
    let bestScore = -Infinity;

    choices.forEach((choice: any, idx: any) => {
      let score = 0;
      for (const eff of (choice.effects ?? [])) {
        if (eff.type === 'resource_delta') score += (eff.amount ?? 0);
        if (eff.type === 'loyalty_delta')  score += (eff.amount ?? 0) * 2;
      }
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });

    return bestIdx;
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Replace [faction_name] and [system_name] template tokens in event text.
   * Uses a seeded RNG to ensure deterministic system selection across save/load.
   * @param {string}  text
   * @param {string}  factionId
   * @param {Object}  context
   * @param {number}  [seed] - Numeric seed for deterministic selection
   * @returns {string}
   */
  _resolveTokens(text: any, factionId: any, context: any, seed = 0) {
    if (!text) return '';
    const { galaxy } = context;

    // Resolve faction display name
    const factionName = galaxy?.factionData?.[factionId]?.name ?? factionId;

    // Pick a controlled system deterministically using a seeded RNG
    const controlled = (galaxy?.systems ?? []).filter((s: any) => s.loyalty === factionId);
    let systemName = 'an unknown system';
    if (controlled.length > 0) {
      const rng = new SeededRandom(`token-${factionId}-${seed}`);
      systemName = controlled[Math.floor(rng.next() * controlled.length)]?.name ?? systemName;
    }

    return text
      .replace(/\[faction_name\]/g, factionName)
      .replace(/\[system_name\]/g,  systemName);
  }

  /** @private */
  _setCooldown(factionId: any, eventId: any, turnNumber: any) {
    if (!this._cooldowns[factionId]) this._cooldowns[factionId] = {};
    this._cooldowns[factionId][eventId] = turnNumber;
  }

  /** @private */
  _logEvent(turnNumber: any, factionId: any, eventId: any, choiceIndex: any, effectsApplied: any) {
    this._eventLog.push({
      turnNumber,
      factionId,
      eventId,
      choiceIndex,
      effectsApplied: JSON.parse(JSON.stringify(effectsApplied))
    });
  }

  // ─── Public Accessors ─────────────────────────────────────────────────────────

  /** @returns {Object[]} Copy of the event log */
  getEventLog() {
    return [...this._eventLog];
  }

  /**
   * Look up an event definition by ID.
   * @param {string} eventId
   * @returns {Object|null}
   */
  getEventById(eventId: any) {
    return this._events.find((e: any) => e.id === eventId) ?? null;
  }

  /**
   * Public wrapper for token resolution in event text.
   * Replaces [faction_name] and [system_name] with actual values.
   * @param {string} text
   * @param {string} factionId
   * @param {Object} context
   * @param {number} [seed]
   * @returns {string}
   */
  resolveTokens(text: any, factionId: any, context: any, seed = 0) {
    return this._resolveTokens(text, factionId, context, seed);
  }

  /**
   * Preview which choice events would fire for the player faction this turn,
   * without applying any effects, updating cooldowns, or logging.
   * Used by sync mode to collect player choices BEFORE headless resolution.
   * The seeded RNG guarantees the same events are selected in the actual
   * resolveEvents() call that follows.
   *
   * @param {Object} context - Must include: currentTurn, playerFactionId, galaxy,
   *                           loyaltyStateManager, characterStates
   * @returns {Array<{event: Object, factionId: string}>}
   */
  previewPlayerChoiceEvents(context: any) {
    const { currentTurn, playerFactionId } = context;
    if (!playerFactionId) return [];

    if (!this._cooldowns[playerFactionId]) this._cooldowns[playerFactionId] = {};

    // Mirrors the priority logic in resolveEvents: scripted first, random only if no scripted fires.

    // Scripted events have priority — check them first (same read-only conditions as resolveEvents)
    const scriptedEvents = this._checkScriptedEvents(playerFactionId, currentTurn, context);
    if (scriptedEvents.length > 0) {
      const evt = scriptedEvents[0];
      // Slot is consumed whether or not it's a choice event; only return if it needs player input
      if (Array.isArray(evt.choices) && evt.choices.length > 0) {
        return [{ event: evt, factionId: playerFactionId }];
      }
      return []; // non-choice scripted event will fire; no player choice needed
    }

    // No scripted event — check random (same seeded-RNG logic as resolveEvents)
    const randomEvent = this._rollRandomEvent(playerFactionId, currentTurn, context);
    if (randomEvent && Array.isArray(randomEvent.choices) && randomEvent.choices.length > 0) {
      return [{ event: randomEvent, factionId: playerFactionId }];
    }

    return [];
  }

  // ─── Serialization ────────────────────────────────────────────────────────────

  /**
   * Serialize engine state for save data (FR-ES-007).
   * @returns {Object}
   */
  serialize() {
    return {
      cooldowns:          JSON.parse(JSON.stringify(this._cooldowns)),
      firedScriptedOnce:  [...this._firedScriptedOnce],
      eventLog:           JSON.parse(JSON.stringify(this._eventLog))
    };
  }

  /**
   * Restore engine state from serialized data.
   * @param {Object} data — Output of serialize()
   */
  deserializeState(data: any) {
    if (!data) return;
    this._cooldowns         = data.cooldowns        ?? {};
    this._firedScriptedOnce = new Set(data.firedScriptedOnce ?? []);
    this._eventLog          = data.eventLog         ?? [];

    // Ensure cooldown maps exist for all faction IDs
    for (const fId of this._factionIds) {
      if (!this._cooldowns[fId]) this._cooldowns[fId] = {};
    }
  }
}

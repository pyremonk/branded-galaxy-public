/**
 * SyncTickManager — Deterministic lockstep tick loop for sync (realtime) mode.
 *
 * The elected host drives ticks at a configurable rate (1–4 Hz). All clients
 * apply the same authoritative input bundle per tick to keep simulation state
 * identical. Solo mode runs locally with no broadcast overhead.
 *
 * Spec: 058-sync-mode-tick-loop-spec.md
 * Depends on: 055 (Determinism), 056 (Presence/Broadcast), 057 (Host Election)
 */

import { dataBridge } from './data-bridge.js';
import { CMD, validateCommandPayload } from './command-types.js';
import { snapshotManager, SNAPSHOT_INTERVAL } from './snapshot-manager.js';
import {
  DEFAULT_TICKS_PER_TURN,
  MIN_TICKS_PER_TURN,
  MAX_TICKS_PER_TURN,
  isTurnBoundary,
  isSubTurnBoundary,
  quarterTurnNumber,
  getCurrentTurnFromTicks,
  clampTicksPerTurn,
} from './timescale-config.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_TAG = '[SyncTickManager]';

/** Default tick rate: 1 tick per second */
export const DEFAULT_TICKS_PER_SECOND = 1;

/** Maximum tick rate: 4 Hz (250ms per tick) */
export const MAX_TICKS_PER_SECOND = 4;

// Re-export timescale constants for backward compatibility
export { DEFAULT_TICKS_PER_TURN, MIN_TICKS_PER_TURN, MAX_TICKS_PER_TURN, MIN_TICKS_PER_SECOND, SPEED_LEVELS } from './timescale-config.js';

/** Fraction of the tick interval to wait for input before timing out */
const INPUT_TIMEOUT_RATIO = 0.8;

/** How often (in ticks) the host writes current_tick to the games table */
const DB_WRITE_INTERVAL = 5;

/** Ticks of lead time before a speed change takes effect */
const SPEED_CHANGE_LEAD_TICKS = 2;

// ─── Broadcast Message Types ────────────────────────────────────────────────

const MSG = {
  TICK_START:     'tick_start',
  PLAYER_INPUT:   'player_input',
  AUTH_BUNDLE:    'authoritative_input_bundle',
  SPEED_CHANGE:   'speed_change',
};

// ─── SyncTickManager Class ──────────────────────────────────────────────────

class SyncTickManager {
  _initialized: boolean = false;
  _running: boolean = false;
  _intervalId: any = null;
  _soloMode: boolean = false;
  _currentTick: number = 0;
  _ticksPerSecond: number = 0;
  _timePerTick: number = 0;
  _ticksPerTurn: number = 0;
  _baseTurn: number = 0;
  _gameId: any = null;
  _localPlayerId: any = null;
  _expectedPlayers: Set<any> = new Set();
  _localCommandQueue: any[] = [];
  _localSeqCounter: number = 0;
  _pendingInputs: Map<any, any> = new Map();
  _bundleQueue: any[] = [];
  _lastProcessedTick: number = 0;
  _pendingSpeedChange: any = null;
  _deps: any = null;
  _listeners: Map<any, any> = new Map();
  _channelListenerCleanup: any = null;
  _boundOnPause: any = null;
  _boundOnResume: any = null;
  _boundOnFallback: any = null;
  constructor() {
    // ── Lifecycle state ──────────────────────────────────────────────────
    this._initialized  = false;
    this._running      = false;
    this._intervalId   = null;
    this._soloMode     = false;

    // ── Tick state ───────────────────────────────────────────────────────
    this._currentTick     = 0;
    this._ticksPerSecond  = DEFAULT_TICKS_PER_SECOND;
    this._timePerTick     = 1;  // fraction of a turn per tick (derived: 1 / ticksPerTurn)
    this._ticksPerTurn    = DEFAULT_TICKS_PER_TURN;
    this._baseTurn        = 0;  // turn number when sync mode started (async→sync continuity)
    this._gameId          = null;
    this._localPlayerId   = null;

    // ── Multiplayer expected-player tracking ─────────────────────────────
    this._expectedPlayers = new Set();

    // ── Input collection ─────────────────────────────────────────────────
    /** Commands queued by the local player for the NEXT tick */
    this._localCommandQueue = [];
    /** Seq counter incremented per local command within a tick */
    this._localSeqCounter = 0;

    /** Map<tickNumber, Map<playerId, Command[]>> — pending inputs per tick */
    this._pendingInputs = new Map();

    /** Ordered queue of unprocessed AuthoritativeInputBundleMessages */
    this._bundleQueue = [];
    /** The tick number of the last fully processed bundle */
    this._lastProcessedTick = 0;

    // ── Speed change scheduling ──────────────────────────────────────────
    this._pendingSpeedChange = null;  // { ticksPerSecond, timePerTick, effectiveAtTick }

    // ── Dependencies (injected via initialize()) ─────────────────────────
    this._deps = null;

    // ── Event listeners (internal) ───────────────────────────────────────
    /** Map<eventName, Set<callback>> */
    this._listeners = new Map();

    // ── Broadcast channel listener cleanup handles ──────────────────────
    this._channelListenerCleanup = null;

    // ── Window event listener references (for cleanup) ──────────────────
    this._boundOnPause  = null;
    this._boundOnResume = null;
    this._boundOnFallback = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inject dependencies required for command application and AI command generation.
   *
   * @param {Object} deps
   * @param {Object}  deps.fleetStateManager
   * @param {Object}  deps.turnStateManager
   * @param {Object}  deps.constructionEngine
   * @param {Object}  deps.constructionStateManager
   * @param {Object}  deps.techStates          - factionId → TechStateManager
   * @param {Object}  deps.techResearchEngine
   * @param {Object}  deps.characterStates     - factionId → CharacterStateManager
   * @param {Object}  deps.resourceStates      - factionId → ResourceStateManager
   * @param {Object}  deps.resourceEngine
   * @param {Object}  deps.galaxy
   * @param {Object}  deps.aiControllers       - factionId → AIController
   * @param {Object}  deps.sessionPresenceManager
   * @param {Object}  deps.missionStateManager
   * @param {Object}  deps.eventEngine
   * @param {Function} deps.getCurrentTurn      - () => number
   */
  initialize(deps: any) {
    this._deps = deps;
    this._initialized = true;

    // Listen for session lifecycle events
    this._boundOnPause    = () => this._onPause();
    this._boundOnResume   = () => this._onResume();
    this._boundOnFallback = () => this.stopTickLoop();

    window.addEventListener('session:tickLoopPause', this._boundOnPause);
    window.addEventListener('session:tickLoopResume', this._boundOnResume);
    window.addEventListener('session:fallbackToAsync', this._boundOnFallback);

    console.log(LOG_TAG, 'Initialized with dependencies.');
  }

  /**
   * Tear down the tick loop and remove all listeners.
   */
  destroy() {
    this.stopTickLoop();

    if (this._boundOnPause) {
      window.removeEventListener('session:tickLoopPause', this._boundOnPause);
      window.removeEventListener('session:tickLoopResume', this._boundOnResume);
      window.removeEventListener('session:fallbackToAsync', this._boundOnFallback);
    }

    this._removeChannelListeners();
    this._listeners.clear();
    this._pendingInputs.clear();
    this._bundleQueue = [];
    this._localCommandQueue = [];
    this._deps = null;
    this._initialized = false;

    console.log(LOG_TAG, 'Destroyed.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Host Tick Loop (FR-STL-004)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the tick loop. Host only (or solo mode).
   *
   * @param {string} gameId
   * @param {number} [ticksPerSecond=DEFAULT_TICKS_PER_SECOND]
   * @param {number} [timePerTick] – IGNORED; derived from ticksPerTurn (FR-TCL-010)
   * @param {Object} [options]
   * @param {boolean} [(options as any).solo=false]
   * @param {Set<string>} [(options as any).expectedPlayers]
   * @param {number}  [(options as any).ticksPerTurn]  – ticks per game turn (5-30, default 10)
   * @param {number}  [(options as any).baseTurn=0]    – turn number at async→sync transition
   */
  startTickLoop(gameId: any, ticksPerSecond = DEFAULT_TICKS_PER_SECOND, timePerTick = 1, options = {}) {
    if (this._running) {
      console.warn(LOG_TAG, 'Tick loop already running.');
      return;
    }
    if (!this._initialized) {
      console.error(LOG_TAG, 'Cannot start — not initialized.');
      return;
    }

    // Timescale config (spec 061)
    this._ticksPerTurn    = clampTicksPerTurn((options as any).ticksPerTurn ?? DEFAULT_TICKS_PER_TURN);
    this._baseTurn        = (options as any).baseTurn ?? 0;
    this._timePerTick     = 1 / this._ticksPerTurn;  // FR-TCL-010: derived, not passed

    this._gameId          = gameId;
    this._ticksPerSecond  = Math.min(ticksPerSecond, MAX_TICKS_PER_SECOND);
    this._soloMode        = (options as any).solo ?? dataBridge.offlineMode;
    this._localPlayerId   = this._deps.sessionPresenceManager?.getUserId?.() ?? 'local';
    this._currentTick     = 0;
    this._lastProcessedTick = 0;
    this._localSeqCounter = 0;
    this._bundleQueue     = [];
    this._pendingInputs.clear();
    this._localCommandQueue = [];

    // Expected players for input collection
    if ((options as any).expectedPlayers) {
      this._expectedPlayers = new Set((options as any).expectedPlayers);
    } else if (this._soloMode) {
      this._expectedPlayers = new Set([this._localPlayerId]);
    }

    // Register broadcast listeners (networked mode only)
    if (!this._soloMode) {
      this._registerChannelListeners();
    }

    this._running = true;
    this._startInterval();

    console.log(LOG_TAG, `Tick loop started — ${this._ticksPerSecond} Hz, solo=${this._soloMode}, gameId=${gameId}`);

    window.dispatchEvent(new CustomEvent('syncTick:started', {
      detail: { tickNumber: 0, ticksPerSecond: this._ticksPerSecond, timePerTick: this._timePerTick }
    }));
  }

  /**
   * Stop the tick loop. Dispatches syncTick:stopped.
   */
  stopTickLoop() {
    if (!this._running) return;

    this._clearInterval();
    this._running = false;
    this._removeChannelListeners();

    console.log(LOG_TAG, `Tick loop stopped at tick ${this._currentTick}.`);

    window.dispatchEvent(new CustomEvent('syncTick:stopped', {
      detail: { tickNumber: this._currentTick }
    }));
  }

  /** @returns {boolean} */
  isRunning() {
    return this._running;
  }

  /** @returns {boolean} */
  isSoloMode() {
    return this._soloMode;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Tick Execution
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private Start the setInterval scheduler */
  _startInterval() {
    this._clearInterval();
    const intervalMs = 1000 / this._ticksPerSecond;
    this._intervalId = setInterval(() => this._executeTick(), intervalMs);
  }

  /** @private */
  _clearInterval() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Core tick execution — runs once per interval on the host.
   * @private
   */
  async _executeTick() {
    const tick = ++this._currentTick;

    // Check for pending speed change
    if (this._pendingSpeedChange && tick >= this._pendingSpeedChange.effectiveAtTick) {
      this._ticksPerSecond = this._pendingSpeedChange.ticksPerSecond;
      this._timePerTick    = this._pendingSpeedChange.timePerTick;
      this._pendingSpeedChange = null;
      this._startInterval(); // Restart with new rate
      console.log(LOG_TAG, `Speed change applied at tick ${tick}: ${this._ticksPerSecond} Hz`);
    }

    // Broadcast tick_start (networked only)
    if (!this._soloMode) {
      this._broadcastTickStart(tick);
    }

    // Dispatch local event for HUD
    window.dispatchEvent(new CustomEvent('syncTick:tickStart', {
      detail: { tickNumber: tick, ticksPerSecond: this._ticksPerSecond, timePerTick: this._timePerTick }
    }));

    // Collect inputs for this tick
    const inputsByPlayer = await this._collectInputs(tick);

    // Build authoritative bundle
    const bundle = {
      type: MSG.AUTH_BUNDLE,
      gameId: this._gameId,
      tickNumber: tick,
      inputsByPlayer,
    };

    // Broadcast to other clients (networked only)
    if (!this._soloMode) {
      this._broadcastBundle(bundle);
    }

    // Apply locally (host is also a simulation client)
    this._enqueueBundleAndProcess(bundle);

    // Periodic DB write
    if (tick % DB_WRITE_INTERVAL === 0) {
      this._writeTickToStorage(tick);
    }

    // Periodic snapshot write (FR-SNP-004)
    if (tick % SNAPSHOT_INTERVAL === 0) {
      const turnNumber = this._deps.getCurrentTurn?.() ?? 1;
      snapshotManager.writeSnapshot(this._gameId, tick, turnNumber, {
        ...this._deps,
        currentTurn: turnNumber,
      });
    }

    // Reset local command queue for next tick
    this._localCommandQueue = [];
    this._localSeqCounter = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Input Collection (FR-STL-005)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Collect inputs for the given tick from all players (including AI in solo mode).
   * @param {number} tick
   * @returns {Promise<Record<string, Array>>} inputsByPlayer
   * @private
   */
  async _collectInputs(tick: any) {
    const inputs: Record<string, any> = {};

    // Inject host/local player commands directly (no round-trip)
    inputs[this._localPlayerId] = [...this._localCommandQueue];

    // Solo mode: generate AI commands synchronously
    if (this._soloMode) {
      this._generateAICommands(tick, inputs);
      return inputs;
    }

    // Networked mode: wait for player_input messages from other clients
    const otherPlayers = [...this._expectedPlayers].filter(id => id !== this._localPlayerId);
    if (otherPlayers.length === 0) return inputs;

    const timeoutMs = (1000 / this._ticksPerSecond) * INPUT_TIMEOUT_RATIO;

    return new Promise((resolve) => {
      // Initialize pending map for this tick
      if (!this._pendingInputs.has(tick)) {
        this._pendingInputs.set(tick, new Map());
      }
      const tickInputs = this._pendingInputs.get(tick);

      // Check if some inputs already arrived (race condition protection)
      for (const pid of otherPlayers) {
        if (tickInputs.has(pid)) {
          inputs[pid] = tickInputs.get(pid);
        }
      }

      const allReceived = () => otherPlayers.every(pid => inputs[pid] !== undefined);

      if (allReceived()) {
        this._pendingInputs.delete(tick);
        resolve(inputs);
        return;
      }

      // Set up a poller on the pending map
      const checkInterval = setInterval(() => {
        for (const pid of otherPlayers) {
          if (inputs[pid] === undefined && tickInputs.has(pid)) {
            inputs[pid] = tickInputs.get(pid);
          }
        }
        if (allReceived()) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          this._pendingInputs.delete(tick);
          resolve(inputs);
        }
      }, 10);

      // Timeout — players who haven't submitted get empty commands
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        for (const pid of otherPlayers) {
          if (inputs[pid] === undefined) {
            inputs[pid] = [];
            console.warn(LOG_TAG, `Tick ${tick}: player ${pid} timed out — empty commands.`);
          }
        }
        this._pendingInputs.delete(tick);
        resolve(inputs);
      }, timeoutMs);
    });
  }

  /**
   * Generate AI commands for all AI-controlled factions and inject into inputs map.
   * @param {number} tick
   * @param {Record<string, Array>} inputs - mutated
   * @private
   */
  _generateAICommands(tick: any, inputs: any) {
    const aiControllers = this._deps.aiControllers ?? {};
    const context = this._buildAIContext();

    for (const [factionId, controller] of (Object.entries(aiControllers) as [string, any][])) {
      try {
        const commands = controller.generateTickCommands?.(context, tick) ?? [];
        if (commands.length > 0) {
          inputs[`ai:${factionId}`] = commands;
        }
      } catch (err) {
        console.error(LOG_TAG, `AI command generation failed for ${factionId}:`, err);
        inputs[`ai:${factionId}`] = [];
      }
    }
  }

  /**
   * Build the shared context object for AI command generation.
   * @returns {Object}
   * @private
   */
  _buildAIContext() {
    const d = this._deps;
    return {
      galaxy:                  d.galaxy,
      resourceStates:          d.resourceStates,
      techStates:              d.techStates,
      characterStates:         d.characterStates,
      fleetStateManager:       d.fleetStateManager,
      techResearchEngine:      d.techResearchEngine,
      constructionEngine:      d.constructionEngine,
      constructionStateManager: d.constructionStateManager,
      resourceEngine:          d.resourceEngine,
      currentTurn:             d.getCurrentTurn?.() ?? 1,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Input Submission (FR-STL-002, all clients)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submit a player command for the current tick.
   *
   * @param {string} type    - One of CMD.* constants
   * @param {Object} payload - Command-specific data
   * @returns {{ success: boolean, seq?: number, reason?: string }}
   */
  submitCommand(type: any, payload: any) {
    if (!this._running) {
      return { success: false, reason: 'Tick loop not running.' };
    }

    const validation = validateCommandPayload(type, payload);
    if (!validation.valid) {
      console.warn(LOG_TAG, `Invalid command: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    const seq = this._localSeqCounter++;
    const command = { type, payload, seq };

    this._localCommandQueue.push(command);

    // In networked mode (non-host clients), also broadcast to the host
    if (!this._soloMode) {
      this._broadcastPlayerInput(this._currentTick, command);
    }

    return { success: true, seq };
  }

  /**
   * Submit a batch of commands at once.
   * @param {Array<{type: string, payload: Object}>} commands
   * @returns {Array<{success: boolean, seq?: number}>}
   */
  submitCommands(commands: any) {
    return commands.map((c: any) => this.submitCommand(c.type, c.payload));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Bundle Processing (FR-STL-006)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enqueue a bundle and process all pending bundles in tick order.
   * @param {Object} bundle - AuthoritativeInputBundleMessage
   * @private
   */
  _enqueueBundleAndProcess(bundle: any) {
    // Insert into queue maintaining tick order
    this._bundleQueue.push(bundle);
    this._bundleQueue.sort((a: any, b: any) => a.tickNumber - b.tickNumber);

    // Process queued bundles in strict order
    while (this._bundleQueue.length > 0) {
      const next = this._bundleQueue[0];
      if (next.tickNumber !== this._lastProcessedTick + 1) {
        // Out-of-order — wait for the missing tick
        break;
      }
      this._bundleQueue.shift();
      this._applyInputBundle(next);
      this._lastProcessedTick = next.tickNumber;
    }
  }

  /**
   * Apply a single authoritative input bundle. All clients execute this identically.
   * DETERMINISM CRITICAL: No Math.random(), no Date.now(), deterministic iteration.
   *
   * @param {Object} bundle
   * @private
   */
  _applyInputBundle(bundle: any) {
    const { tickNumber, inputsByPlayer } = bundle;

    // Sort player keys alphabetically for deterministic iteration (FR-STL-006)
    const sortedPlayerIds = Object.keys(inputsByPlayer).sort();

    for (const playerId of sortedPlayerIds) {
      const commands = inputsByPlayer[playerId] ?? [];
      // Sort commands by seq within each player (FR-STL-006)
      const sorted = [...commands].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

      for (const cmd of sorted) {
        this._applyCommand(cmd, playerId);
      }
    }

    // Dispatch event for MainStage and React
    window.dispatchEvent(new CustomEvent('syncTick:bundleApplied', {
      detail: { tickNumber, inputsByPlayer }
    }));

    // Check for turn boundary (spec 061 — configurable ticksPerTurn)
    if (isTurnBoundary(tickNumber, this._ticksPerTurn)) {
      const turnNumber = getCurrentTurnFromTicks(tickNumber, this._ticksPerTurn, this._baseTurn);
      window.dispatchEvent(new CustomEvent('syncTick:turnBoundary', {
        detail: { tickNumber, turnNumber }
      }));
    }

    // Check for sub-turn boundary (.25/.50/.75 checkpoints) — used for staggered completions
    if (isSubTurnBoundary(tickNumber, this._ticksPerTurn)) {
      const qt = quarterTurnNumber(tickNumber, this._ticksPerTurn, this._baseTurn);
      window.dispatchEvent(new CustomEvent('syncTick:subTurnBoundary', {
        detail: { tickNumber, quarterTurn: qt }
      }));
    }
  }

  /**
   * Apply a single command to the relevant state manager.
   * DETERMINISM CRITICAL: No side-effects outside state managers.
   *
   * @param {Object} cmd  - { type, payload, seq }
   * @param {string} playerId
   * @private
   */
  _applyCommand(cmd: any, playerId: any) {
    const d = this._deps;
    if (!d) return;

    const { type, payload } = cmd;

    try {
      switch (type) {
        case CMD.MOVE_FLEET: {
          d.fleetStateManager?.stageMoveFleet(
            payload.fleetId,
            payload.destinationId,
            payload.travelMode ?? 'lane',
            d.galaxy
          );
          break;
        }

        case CMD.ASSIGN_FLEET_CMD: {
          d.fleetStateManager?.assignCommand(
            payload.fleetId,
            payload.command,
            payload.options ?? {}
          );
          break;
        }

        case CMD.CLAIM_SECTOR: {
          // Direct galaxy mutation — find the sector and set loyalty
          const system = d.galaxy?.systems?.find((s: any) => s.id === payload.sectorId);
          if (system) {
            system.loyalty = payload.factionId;
            system.loyaltyValue = 50;
          }
          break;
        }

        case CMD.START_RESEARCH: {
          const techState = d.techStates?.[payload.factionId];
          if (techState?.selectResearch) {
            techState.selectResearch(payload.techId);
          }
          break;
        }

        case CMD.QUEUE_CONSTRUCTION: {
          const rsm = d.resourceStates?.[payload.factionId];
          d.constructionEngine?.queueFacilityBuild(
            payload.systemId,
            payload.facilityType,
            payload.factionId,
            rsm?.state,
            d.resourceEngine,
            d.getCurrentTurn?.() ?? 1
          );
          break;
        }

        case CMD.UPGRADE_FACILITY: {
          const rsm = d.resourceStates?.[payload.factionId];
          d.constructionEngine?.queueFacilityUpgrade(
            payload.systemId,
            payload.instanceId,
            payload.factionId,
            rsm?.state,
            d.resourceEngine,
            d.getCurrentTurn?.() ?? 1
          );
          break;
        }

        case CMD.STAGE_MISSION: {
          d.turnStateManager?.stageAction('mission', payload);
          // Update character status if applicable
          const csm = d.characterStates?.[payload.factionId];
          if (csm && payload.characterId) {
            csm.assignToMission?.(payload.characterId, cmd.seq?.toString() ?? '0', payload.targetSystemId);
          }
          break;
        }

        case CMD.STAGE_DIPLOMATIC: {
          d.turnStateManager?.stageAction('diplomatic', payload);
          break;
        }

        case CMD.INVADE_PLANET: {
          d.fleetStateManager?.recordInvasionChoice(payload.systemId, payload.choice);
          break;
        }

        case CMD.EVENT_CHOICE: {
          // Record event choice for headless resolution (FR-STL-007)
          // Stored on the deps object so TRE can read it during headless resolution
          if (!d._eventChoices) d._eventChoices = {};
          d._eventChoices[payload.eventId] = payload.choiceIndex;
          break;
        }

        case CMD.ASSIGN_CHARACTER: {
          const csm = d.characterStates?.[payload.factionId];
          if (csm && payload.assignmentType === 'fleet') {
            csm.assignToFleet?.(payload.characterId, payload.fleetId);
          } else if (csm && payload.assignmentType === 'facility') {
            csm.assignToFacility?.(payload.characterId, payload.facilityId, payload.systemId);
          } else if (csm && payload.assignmentType === 'unassign') {
            csm.unassign?.(payload.characterId);
          }
          break;
        }

        default:
          console.warn(LOG_TAG, `Unknown command type: ${type}`);
      }
    } catch (err) {
      console.error(LOG_TAG, `Error applying command ${type}:`, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Speed Control (FR-STL-009, host only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Change the tick rate. Host only. Takes effect after SPEED_CHANGE_LEAD_TICKS.
   *
   * @param {number} ticksPerSecond - New rate (1–4)
   * @param {number} [timePerTick]  - In-game time per tick
   */
  changeSpeed(ticksPerSecond: any, timePerTick: any) {
    if (!this._running) return;

    const clamped = Math.max(0.5, Math.min(ticksPerSecond, MAX_TICKS_PER_SECOND));
    const effectiveAtTick = this._currentTick + SPEED_CHANGE_LEAD_TICKS;
    const newTimePerTick = timePerTick ?? this._timePerTick;

    this._pendingSpeedChange = {
      ticksPerSecond: clamped,
      timePerTick: newTimePerTick,
      effectiveAtTick,
    };

    // Broadcast to all clients (networked only)
    if (!this._soloMode) {
      this._broadcastSpeedChange(clamped, newTimePerTick, effectiveAtTick);
    }

    // Update storage
    this._writeSpeedToStorage(clamped, newTimePerTick);

    console.log(LOG_TAG, `Speed change scheduled: ${clamped} Hz at tick ${effectiveAtTick}`);

    // Dispatch for local HUD update
    window.dispatchEvent(new CustomEvent('syncTick:speedChange', {
      detail: { ticksPerSecond: clamped, timePerTick: newTimePerTick, effectiveAtTick }
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  State Accessors
  // ═══════════════════════════════════════════════════════════════════════════

  /** @returns {number} */
  getCurrentTick() { return this._currentTick; }

  /** @returns {number} */
  getTicksPerSecond() { return this._ticksPerSecond; }

  /** @returns {number} */
  getTimePerTick() { return this._timePerTick; }

  /** @returns {number} Ticks per game turn (spec 061). */
  getTicksPerTurn() { return this._ticksPerTurn; }

  /** @returns {number} Base turn when sync mode started (spec 061). */
  getBaseTurn() { return this._baseTurn; }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Event Subscription
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a callback for an internal event.
   * @param {string} event - 'tickStart' | 'inputBundle' | 'speedChange'
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  on(event: any, callback: any) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  /** @private */
  _emit(event: any, data: any) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(data); } catch (err) { console.error(LOG_TAG, `Listener error (${event}):`, err); }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Broadcast Channel Integration (FR-STL-001, networked mode)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _getChannel() {
    return this._deps?.sessionPresenceManager?.getRealtimeChannel?.() ?? null;
  }

  /** @private Register listeners on the realtime broadcast channel. */
  _registerChannelListeners() {
    const channel = this._getChannel();
    if (!channel) {
      console.warn(LOG_TAG, 'No realtime channel available — running in local-only mode.');
      return;
    }

    // Listen for player inputs (host receives these from non-host clients)
    channel.on('broadcast', { event: MSG.PLAYER_INPUT }, (payload: any) => {
      this._handlePlayerInputMessage(payload.payload ?? payload);
    });

    // Listen for authoritative bundles (non-host clients receive these from host)
    channel.on('broadcast', { event: MSG.AUTH_BUNDLE }, (payload: any) => {
      this._handleAuthBundleMessage(payload.payload ?? payload);
    });

    // Listen for tick_start (non-host clients synchronize tick counter)
    channel.on('broadcast', { event: MSG.TICK_START }, (payload: any) => {
      this._handleTickStartMessage(payload.payload ?? payload);
    });

    // Listen for speed changes
    channel.on('broadcast', { event: MSG.SPEED_CHANGE }, (payload: any) => {
      this._handleSpeedChangeMessage(payload.payload ?? payload);
    });

    this._channelListenerCleanup = true;
    console.log(LOG_TAG, 'Registered broadcast channel listeners.');
  }

  /** @private */
  _removeChannelListeners() {
    // Supabase channels are cleaned up when the channel is unsubscribed,
    // which happens in SessionPresenceManager.destroy().
    // Here we just flag that we're done.
    this._channelListenerCleanup = null;
  }

  /** @private Broadcast tick_start to all clients. */
  _broadcastTickStart(tick: any) {
    const channel = this._getChannel();
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: MSG.TICK_START,
      payload: {
        type: MSG.TICK_START,
        gameId: this._gameId,
        tickNumber: tick,
        ticksPerSecond: this._ticksPerSecond,
        timePerTick: this._timePerTick,
      },
    });
  }

  /** @private Broadcast authoritative input bundle. */
  _broadcastBundle(bundle: any) {
    const channel = this._getChannel();
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: MSG.AUTH_BUNDLE,
      payload: bundle,
    });
  }

  /** @private Broadcast a player_input message (non-host → host). */
  _broadcastPlayerInput(tickNumber: any, command: any) {
    const channel = this._getChannel();
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: MSG.PLAYER_INPUT,
      payload: {
        type: MSG.PLAYER_INPUT,
        gameId: this._gameId,
        tickNumber,
        playerId: this._localPlayerId,
        commands: [command],
      },
    });
  }

  /** @private Broadcast speed change announcement. */
  _broadcastSpeedChange(ticksPerSecond: any, timePerTick: any, effectiveAtTick: any) {
    const channel = this._getChannel();
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: MSG.SPEED_CHANGE,
      payload: {
        type: MSG.SPEED_CHANGE,
        gameId: this._gameId,
        ticksPerSecond,
        timePerTick,
        effectiveAtTick,
        requestedBy: this._localPlayerId,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Broadcast Message Handlers (non-host client path)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private Handle incoming player_input from a non-host client (host only). */
  _handlePlayerInputMessage(msg: any) {
    const { tickNumber, playerId, commands } = msg;
    if (!tickNumber || !playerId) return;

    if (!this._pendingInputs.has(tickNumber)) {
      this._pendingInputs.set(tickNumber, new Map());
    }
    const tickMap = this._pendingInputs.get(tickNumber);

    // Accumulate commands (a player might send multiple messages per tick)
    const existing = tickMap.get(playerId) ?? [];
    tickMap.set(playerId, [...existing, ...(commands ?? [])]);
  }

  /** @private Handle authoritative bundle (non-host clients). */
  _handleAuthBundleMessage(msg: any) {
    // Non-host clients enqueue and process
    if (msg.tickNumber !== undefined) {
      this._currentTick = Math.max(this._currentTick, msg.tickNumber);
      this._enqueueBundleAndProcess(msg);
    }
  }

  /** @private Handle tick_start from host (non-host clients). */
  _handleTickStartMessage(msg: any) {
    const { tickNumber, ticksPerSecond, timePerTick } = msg;
    if (tickNumber !== undefined) {
      this._currentTick = Math.max(this._currentTick, tickNumber);
    }
    if (ticksPerSecond !== undefined) {
      this._ticksPerSecond = ticksPerSecond;
    }
    if (timePerTick !== undefined) {
      this._timePerTick = timePerTick;
    }

    // Dispatch for HUD
    window.dispatchEvent(new CustomEvent('syncTick:tickStart', {
      detail: { tickNumber, ticksPerSecond, timePerTick }
    }));

    this._emit('tickStart', msg);
  }

  /** @private Handle speed change announcement. */
  _handleSpeedChangeMessage(msg: any) {
    const { ticksPerSecond, timePerTick, effectiveAtTick } = msg;
    this._pendingSpeedChange = { ticksPerSecond, timePerTick, effectiveAtTick };

    window.dispatchEvent(new CustomEvent('syncTick:speedChange', {
      detail: msg
    }));

    this._emit('speedChange', msg);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Pause / Resume (session lifecycle)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _onPause() {
    if (!this._running) return;
    this._clearInterval();
    console.log(LOG_TAG, `Tick loop paused at tick ${this._currentTick}.`);
  }

  /** @private */
  _onResume() {
    if (!this._running) return;
    this._startInterval();
    console.log(LOG_TAG, `Tick loop resumed at tick ${this._currentTick}.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Storage (FR-STL-004, offline + online)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write current tick to games table or localStorage.
   * @param {number} tick
   * @private
   */
  async _writeTickToStorage(tick: any) {
    if (dataBridge.offlineMode || this._soloMode) {
      try {
        const key = `sync_tick_${this._gameId}`;
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        data.current_tick = tick;
        data.ticks_per_second = this._ticksPerSecond;
        data.time_per_tick = this._timePerTick;
        data.ticks_per_turn = this._ticksPerTurn;
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        console.warn(LOG_TAG, 'localStorage write failed:', err);
      }
      return;
    }

    // Online: update games table
    const client = dataBridge.getClient();
    if (!client) return;

    try {
      await client
        .from('games')
        .update({
          current_tick: tick,
          ticks_per_second: this._ticksPerSecond,
          time_per_tick: this._timePerTick,
          ticks_per_turn: this._ticksPerTurn,
        })
        .eq('id', this._gameId);
    } catch (err) {
      console.warn(LOG_TAG, 'DB tick write failed:', err);
    }
  }

  /**
   * Write speed change to storage.
   * @param {number} ticksPerSecond
   * @param {number} timePerTick
   * @private
   */
  async _writeSpeedToStorage(ticksPerSecond: any, timePerTick: any) {
    if (dataBridge.offlineMode || this._soloMode) {
      try {
        const key = `sync_tick_${this._gameId}`;
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        data.ticks_per_second = ticksPerSecond;
        data.time_per_tick = timePerTick;
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        console.warn(LOG_TAG, 'localStorage speed write failed:', err);
      }
      return;
    }

    const client = dataBridge.getClient();
    if (!client) return;

    try {
      await client
        .from('games')
        .update({ ticks_per_second: ticksPerSecond, time_per_tick: timePerTick })
        .eq('id', this._gameId);
    } catch (err) {
      console.warn(LOG_TAG, 'DB speed write failed:', err);
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const syncTickManager = new SyncTickManager();

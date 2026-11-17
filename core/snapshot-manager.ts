/**
 * SnapshotManager — Periodic snapshot writing and state reconciliation.
 *
 * Writes full game-state snapshots during sync mode and provides
 * reconciliation for clients that fall behind, diverge, or re-join
 * mid-session.
 *
 * Also exports `serializeAllState()` — the shared utility used by both
 * SnapshotManager and SaveStateManager for the single source of truth
 * on "what gets serialized".
 *
 * Spec: 059-snapshots-reconciliation-spec.md
 * Depends on: 055 (Determinism), 056 (Schema), 058 (Tick Loop)
 */

import { dataBridge } from './data-bridge.js';
import { VictoryStateManager } from './victory-state-manager.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_TAG = '[SnapshotManager]';

/** Snapshot schema version — increment on breaking format changes. */
export const SNAPSHOT_VERSION = 1;

/** Ticks between automatic snapshot writes (configurable at game setup). */
export const SNAPSHOT_INTERVAL = 10;

/** Tick-gap threshold that triggers forced reconciliation. */
export const RECONCILE_THRESHOLD = 5;

/** Maximum snapshots kept in localStorage for offline mode. */
const OFFLINE_MAX_SNAPSHOTS = 3;

// ─── Shared Serialization Utility ─────────────────────────────────────────────

/**
 * Collect serialized state from all active state managers into a single
 * plain JS object.  Both `SnapshotManager.writeSnapshot()` and
 * `SaveStateManager.createSnapshot()` call this so serialization logic
 * lives in one place.
 *
 * @param {Object} refs - Named references to live state managers / data.
 * @param {Object}  refs.galaxy                - Galaxy object (systems, connections)
 * @param {Object}  refs.resourceStates        - factionId → ResourceStateManager
 * @param {Object}  refs.techStates            - factionId → TechStateManager
 * @param {Object}  refs.characterStates       - factionId → CharacterStateManager
 * @param {Object}  refs.fleetStateManager     - FleetStateManager instance
 * @param {Object}  refs.constructionStateManager - ConstructionStateManager
 * @param {Object}  refs.missionStateManager   - MissionStateManager
 * @param {Object}  refs.loyaltyStateManager   - LoyaltyStateManager
 * @param {Object}  refs.intelStateManager     - IntelStateManager
 * @param {Object}  refs.eventEngine           - EventEngine
 * @param {Object}  refs.initiativeEngine      - InitiativeEngine
 * @param {Object}  refs.turnStateManager      - TurnStateManager
 * @param {Object}  [refs.victoryGameState]    - { factions: { fid: { victoryProgress } } }
 * @param {Object}  [refs.hotSeatManager]      - HotSeatManager (may be null)
 * @param {Object}  [refs.aiControllers]       - factionId → AIController (may be null/empty)
 * @param {Object}  [refs.seededRandom]        - SeededRandom instance (optional)
 * @param {number}  [refs.currentTurn]         - Current turn number
 * @returns {Object} Plain JS object safe for JSONB / JSON.stringify
 */
export function serializeAllState(refs: any) {
  // ── Galaxy ────────────────────────────────────────────────────────────
  const galaxy = JSON.parse(JSON.stringify(refs.galaxy ?? {}));

  // ── Per-faction maps ──────────────────────────────────────────────────
  const resources: Record<string, any> = {};
  for (const [fid, rsm] of (Object.entries(refs.resourceStates ?? {}) as [string, any][])) {
    resources[fid] = rsm.serialize();
  }

  const tech: Record<string, any> = {};
  for (const [fid, tsm] of (Object.entries(refs.techStates ?? {}) as [string, any][])) {
    tech[fid] = tsm.serialize();
  }

  const characters: Record<string, any> = {};
  for (const [fid, csm] of (Object.entries(refs.characterStates ?? {}) as [string, any][])) {
    characters[fid] = csm.serialize();
  }

  const victory: Record<string, any> = {};
  if (refs.victoryGameState?.factions) {
    for (const [fid, faction] of (Object.entries(refs.victoryGameState.factions) as [string, any][])) {
      if (faction.victoryProgress) {
        victory[fid] = VictoryStateManager.serialize(faction.victoryProgress);
      }
    }
  }

  // ── Singletons / cross-faction managers ───────────────────────────────
  const fleets       = refs.fleetStateManager?.serialize()        ?? null;
  const construction = refs.constructionStateManager?.serialize() ?? null;
  const missions     = refs.missionStateManager?.serialize()      ?? null;
  const loyalty      = refs.loyaltyStateManager?.serialize()      ?? null;
  const intel        = refs.intelStateManager?.serialize()        ?? null;
  const events       = refs.eventEngine?.serialize()              ?? null;
  const initiative   = refs.initiativeEngine?.serialize()         ?? null;

  // ── Turn state ────────────────────────────────────────────────────────
  const turnBase = refs.turnStateManager?.serialize() ?? {};
  const turn = {
    ...turnBase,
    currentTurn:      refs.currentTurn ?? turnBase.currentTurn,
    initiativeOrder:  refs.initiativeEngine?.getOrder()          ?? [],
    initiativeScores: refs.initiativeEngine?.serialize()?.scores ?? {},
  };

  // ── Hot-seat ──────────────────────────────────────────────────────────
  const hotSeat = refs.hotSeatManager?.serialize() ?? null;

  // ── AI config ─────────────────────────────────────────────────────────
  const aiConfig: Record<string, any> = {};
  for (const [fid, ctrl] of (Object.entries(refs.aiControllers ?? {}) as [string, any][])) {
    if (ctrl?.serialize) aiConfig[fid] = ctrl.serialize();
  }

  // ── RNG state (optional) ──────────────────────────────────────────────
  const rng = refs.seededRandom?.serialize?.() ?? null;

  return {
    galaxy,
    resources,
    tech,
    characters,
    fleets,
    construction,
    missions,
    loyalty,
    intel,
    events,
    initiative,
    victory,
    turn,
    hotSeat,
    aiConfig,
    rng,
  };
}

// ─── SnapshotManager Class ──────────────────────────────────────────────────

class SnapshotManager {
  _lastSnapshotHash: any = null;
  _reconcileThreshold: number = 5;
  constructor() {
    /** @type {string|null} Hash of last written snapshot (to skip duplicate writes) */
    this._lastSnapshotHash = null;
    /** @type {number} Configurable reconcile threshold */
    this._reconcileThreshold = RECONCILE_THRESHOLD;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the tick-gap threshold for divergence detection.
   * @param {number} threshold - Range 3–20
   */
  setReconcileThreshold(threshold: any) {
    this._reconcileThreshold = Math.max(3, Math.min(20, threshold));
  }

  /** @returns {number} Current SNAPSHOT_VERSION */
  getSnapshotVersion() {
    return SNAPSHOT_VERSION;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Snapshot Writing (Host Only) — FR-SNP-004
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write a full game-state snapshot.  Called every SNAPSHOT_INTERVAL ticks
   * from the tick loop (on the host only).  Non-blocking — errors are logged.
   *
   * @param {string}  gameId
   * @param {number}  tickNumber
   * @param {number}  turnNumber
   * @param {Object}  stateRefs - Same shape as serializeAllState `refs` param
   */
  async writeSnapshot(gameId: any, tickNumber: any, turnNumber: any, stateRefs: any) {
    try {
      const state = serializeAllState(stateRefs);

      // Duplicate-detection: simple hash of stringified state
      const stateString = JSON.stringify(state);
      const hash = this._simpleHash(stateString);
      if (hash === this._lastSnapshotHash) {
        console.log(LOG_TAG, `Tick ${tickNumber}: state unchanged — skipping snapshot write.`);
        return;
      }
      this._lastSnapshotHash = hash;

      const snapshot = {
        id:          crypto.randomUUID(),
        gameId,
        tickNumber,
        turnNumber,
        version:     SNAPSHOT_VERSION,
        createdAt:   new Date().toISOString(),
        state,
      };

      if (dataBridge.offlineMode || !this._isRemoteGameId(gameId)) {
        this._writeOffline(snapshot);
      } else {
        await this._writeOnline(snapshot);
      }

      console.log(LOG_TAG, `Snapshot written — tick ${tickNumber}, turn ${turnNumber}`);
    } catch (err) {
      console.error(LOG_TAG, `Failed to write snapshot at tick ${tickNumber}:`, err);
    }
  }

  /** @private Write snapshot to Supabase game_snapshots table. */
  async _writeOnline(snapshot: any) {
    const client = dataBridge.getClient();
    if (!client) {
      console.warn(LOG_TAG, 'No Supabase client — falling back to offline.');
      this._writeOffline(snapshot);
      return;
    }

    const { error } = await client.from('game_snapshots').insert({
      id:          snapshot.id,
      game_id:     snapshot.gameId,
      tick_number: snapshot.tickNumber,
      turn_number: snapshot.turnNumber,
      state:       snapshot.state,
      version:     snapshot.version,
    });

    if (error) {
      console.error(LOG_TAG, 'Supabase INSERT error:', error.message);
    }
  }

  /**
   * Check whether a gameId looks like a remote (Supabase) UUID.
   * Local/solo gameIds like 'local-solo' are not valid UUIDs and must use
   * localStorage even when the player is logged in online.
   * @param {string} gameId
   * @returns {boolean}
   * @private
   */
  _isRemoteGameId(gameId: any) {
    // UUID v4 pattern (loose — just checks structure)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId);
  }

  /** @private Write snapshot to localStorage (offline/solo mode). */
  _writeOffline(snapshot: any) {
    const key = `snapshot_${snapshot.gameId}_${snapshot.tickNumber}`;
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
      this._pruneOfflineSnapshots(snapshot.gameId, OFFLINE_MAX_SNAPSHOTS);
    } catch (err) {
      console.error(LOG_TAG, 'localStorage write error:', err);
    }
  }

  /**
   * Keep only the latest `keep` snapshots in localStorage for a given game.
   * @private
   */
  _pruneOfflineSnapshots(gameId: any, keep: any) {
    const prefix = `snapshot_${gameId}_`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k: string | null = localStorage.key(i);
      if (k != null && k.startsWith(prefix)) {
        const tick = parseInt(k!.slice(prefix.length), 10);
        if (!isNaN(tick)) keys.push({ key: k, tick });
      }
    }
    keys.sort((a, b) => b.tick - a.tick);
    for (let i = keep; i < keys.length; i++) {
      localStorage.removeItem(keys[i].key);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Snapshot Loading — FR-SNP-005, FR-SNP-008
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load the most recent snapshot for a game.
   * @param {string} gameId
   * @returns {Promise<Object|null>} GameSnapshot or null
   */
  async loadLatestSnapshot(gameId: any) {
    if (dataBridge.offlineMode || !this._isRemoteGameId(gameId)) {
      return this._loadLatestOffline(gameId);
    }

    const client = dataBridge.getClient();
    if (!client) return this._loadLatestOffline(gameId);

    const { data, error } = await client
      .from('game_snapshots')
      .select('*')
      .eq('game_id', gameId)
      .order('tick_number', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      if (error?.code !== 'PGRST116') { // PGRST116 = no rows
        console.warn(LOG_TAG, 'Failed to load latest snapshot:', error?.message);
      }
      return null;
    }

    return this._rowToSnapshot(data);
  }

  /**
   * Load a specific snapshot by tick number.
   * @param {string} gameId
   * @param {number} tickNumber
   * @returns {Promise<Object|null>}
   */
  async loadSnapshot(gameId: any, tickNumber: any) {
    if (dataBridge.offlineMode || !this._isRemoteGameId(gameId)) {
      return this._loadOffline(gameId, tickNumber);
    }

    const client = dataBridge.getClient();
    if (!client) return this._loadOffline(gameId, tickNumber);

    const { data, error } = await client
      .from('game_snapshots')
      .select('*')
      .eq('game_id', gameId)
      .eq('tick_number', tickNumber)
      .single();

    if (error || !data) return null;
    return this._rowToSnapshot(data);
  }

  /** @private Convert a DB row to the GameSnapshot shape. */
  _rowToSnapshot(row: any) {
    return {
      id:         row.id,
      gameId:     row.game_id,
      tickNumber: row.tick_number,
      turnNumber: row.turn_number,
      version:    row.version,
      createdAt:  row.created_at,
      state:      row.state,
    };
  }

  /** @private Load latest snapshot from localStorage. */
  _loadLatestOffline(gameId: any) {
    const prefix = `snapshot_${gameId}_`;
    let best: string | null = null;
    let bestTick = -1;

    for (let i = 0; i < localStorage.length; i++) {
      const k: string | null = localStorage.key(i);
      if (k != null && k.startsWith(prefix)) {
        const tick = parseInt(k!.slice(prefix.length), 10);
        if (!isNaN(tick) && tick > bestTick) {
          bestTick = tick;
          best = k;
        }
      }
    }

    if (!best) return null;

    try {
      const raw = localStorage.getItem(String(best));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** @private Load specific snapshot from localStorage. */
  _loadOffline(gameId: any, tickNumber: any) {
    const key = `snapshot_${gameId}_${tickNumber}`;
    try {
      const raw = localStorage.getItem(key!);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Snapshot Application (Reconciliation) — FR-SNP-006
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a snapshot to all state managers, fully replacing local game state.
   *
   * Callers are responsible for:
   *  1. Re-wiring engine cross-references after new instances are returned
   *  2. Triggering Phaser visual updates (galaxy:snapshotApplied event)
   *
   * @param {Object} snapshot   - GameSnapshot object from writeSnapshot / load
   * @param {Object} managers   - Live state manager references (same shape as serializeAllState refs)
   * @param {Object} extraDeps  - Additional dependencies for deserialization
   * @param {string[]}    extraDeps.factionIds        - All faction IDs
   * @param {Object}      extraDeps.constructionConfig - Construction config data
   * @param {Function}    extraDeps.getTurnFn          - () => current turn
   * @param {Object}      extraDeps.factionDefinitions - { fid: factionDef } for FactionStateManager
   * @returns {Object} Bag of newly-created manager instances (for re-wiring)
   */
  applySnapshot(snapshot: any, managers: any, extraDeps: any) {
    if (!snapshot) throw new Error(`${LOG_TAG} Cannot apply null snapshot.`);
    if (snapshot.version !== SNAPSHOT_VERSION) {
      throw new Error(
        `${LOG_TAG} Snapshot version mismatch: expected ${SNAPSHOT_VERSION}, got ${snapshot.version}`
      );
    }

    const s = snapshot.state;
    const { factionIds, constructionConfig: cConfig, getTurnFn, factionDefinitions } = extraDeps;

    // We collect newly-created instances so the caller can re-wire engine refs.
    const created: Record<string, any> = {};

    // ── RNG state (first — determinism foundation) ──────────────────────
    if (s.rng && managers.seededRandom?.deserialize) {
      managers.seededRandom.deserialize(s.rng);
    }

    // ── Galaxy (mutate in-place to preserve object reference) ───────────
    if (s.galaxy && managers.galaxy) {
      const g = managers.galaxy;
      if (s.galaxy.systems)     g.systems     = s.galaxy.systems;
      if (s.galaxy.connections) g.connections = s.galaxy.connections;
      if (s.galaxy.sectors)     g.sectors     = s.galaxy.sectors;
      // Copy any additional top-level galaxy fields
      for (const key of Object.keys(s.galaxy)) {
        if (!['systems', 'connections', 'sectors'].includes(key)) {
          g[key] = s.galaxy[key];
        }
      }
    }

    // ── Per-faction: Resources ──────────────────────────────────────────
    if (s.resources && managers.resourceStates) {
      const { ResourceStateManager } = _lazyImports();
      for (const fid of factionIds) {
        if (s.resources[fid]) {
          managers.resourceStates[fid] = ResourceStateManager.deserialize(s.resources[fid]);
        }
      }
    }

    // ── Per-faction: Tech ───────────────────────────────────────────────
    if (s.tech && managers.techStates) {
      const { TechStateManager } = _lazyImports();
      for (const fid of factionIds) {
        if (s.tech[fid]) {
          managers.techStates[fid] = TechStateManager.deserialize(s.tech[fid]);
        }
      }
    }

    // ── Per-faction: Characters ─────────────────────────────────────────
    if (s.characters && managers.characterStates) {
      const { CharacterStateManager } = _lazyImports();
      for (const fid of factionIds) {
        if (s.characters[fid]) {
          managers.characterStates[fid] = CharacterStateManager.deserialize(s.characters[fid]);
        }
      }
    }

    // ── Per-faction: Victory ────────────────────────────────────────────
    if (s.victory && managers.victoryGameState?.factions) {
      for (const fid of factionIds) {
        if (s.victory[fid] && managers.victoryGameState.factions[fid]) {
          managers.victoryGameState.factions[fid].victoryProgress =
            VictoryStateManager.deserialize(s.victory[fid], fid);
        }
      }
    }

    // ── Fleet ───────────────────────────────────────────────────────────
    if (s.fleets) {
      const { FleetStateManager } = _lazyImports();
      (created as any).fleetStateManager = FleetStateManager.deserialize(s.fleets, factionIds);
    }

    // ── Construction ────────────────────────────────────────────────────
    if (s.construction) {
      const { ConstructionStateManager } = _lazyImports();
      (created as any).constructionStateManager =
        ConstructionStateManager.deserialize(s.construction, factionIds, cConfig);
    }

    // ── Missions ────────────────────────────────────────────────────────
    if (s.missions) {
      const { MissionStateManager } = _lazyImports();
      (created as any).missionStateManager = MissionStateManager.deserialize(s.missions);
    }

    // ── Loyalty ─────────────────────────────────────────────────────────
    if (s.loyalty && managers.galaxy) {
      const { LoyaltyStateManager } = _lazyImports();
      (created as any).loyaltyStateManager =
        LoyaltyStateManager.deserialize(s.loyalty, managers.galaxy.systems, factionIds);
    }

    // ── Intel ───────────────────────────────────────────────────────────
    if (s.intel) {
      const { IntelStateManager } = _lazyImports();
      (created as any).intelStateManager = IntelStateManager.deserialize(s.intel, factionIds);
    }

    // ── Event engine (instance method) ──────────────────────────────────
    if (s.events && managers.eventEngine?.deserializeState) {
      managers.eventEngine.deserializeState(s.events);
    }

    // ── Initiative engine (instance method) ─────────────────────────────
    if (s.initiative && managers.initiativeEngine?.deserialize) {
      managers.initiativeEngine.deserialize(s.initiative);
    }

    // ── Turn state ──────────────────────────────────────────────────────
    if (s.turn) {
      const { TurnStateManager } = _lazyImports();
      (created as any).turnStateManager = TurnStateManager.deserialize(s.turn, getTurnFn);
    }

    // ── Hot-seat ────────────────────────────────────────────────────────
    if (s.hotSeat) {
      const { HotSeatManager } = _lazyImports();
      (created as any).hotSeatManager = HotSeatManager.deserialize(s.hotSeat);
    }

    // ── AI controllers ──────────────────────────────────────────────────
    if (s.aiConfig && managers.aiControllers) {
      const { AIController } = _lazyImports();
      for (const fid of (Object.keys(s.aiConfig) as string[])) {
        try {
          managers.aiControllers[fid] = AIController.deserialize(s.aiConfig[fid]);
        } catch (err) {
          console.warn(LOG_TAG, `Failed to deserialize AI controller for ${fid}:`, err);
        }
      }
    }

    // ── Dispatch reconciliation event ───────────────────────────────────
    window.dispatchEvent(new CustomEvent('galaxy:snapshotApplied', {
      detail: { tickNumber: snapshot.tickNumber, turnNumber: snapshot.turnNumber }
    }));

    return created;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscription — FR-SNP-005
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to new snapshot notifications.  Returns an unsubscribe function.
   *
   * SessionPresenceManager already fires `session:snapshotAvailable` on
   * Postgres Changes INSERT into `game_snapshots`.  This method wraps that
   * event and auto-loads the full snapshot row before invoking the callback.
   *
   * @param {string}   gameId
   * @param {Function} callback - (snapshot: GameSnapshot) => void
   * @returns {Function} unsubscribe
   */
  subscribeToSnapshots(gameId: any, callback: any) {
    const handler = async (e: any) => {
      const { tickNumber } = e.detail ?? {};
      if (tickNumber == null) return;
      const snapshot = await this.loadSnapshot(gameId, tickNumber);
      if (snapshot) callback(snapshot);
    };

    window.addEventListener('session:snapshotAvailable', handler);
    return () => window.removeEventListener('session:snapshotAvailable', handler);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Divergence Detection — FR-SNP-005
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Determine whether the local client has diverged enough from the latest
   * snapshot to require forced reconciliation.
   *
   * @param {number}  localTick
   * @param {number}  latestSnapshotTick
   * @param {number}  [threshold] - Override the default RECONCILE_THRESHOLD
   * @returns {boolean}
   */
  detectDivergence(localTick: any, latestSnapshotTick: any, threshold: any) {
    const t = threshold ?? this._reconcileThreshold;
    return Math.abs(localTick - latestSnapshotTick) > t;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fast non-cryptographic hash for duplicate-detection.
   * @private
   * @param {string} str
   * @returns {number}
   */
  _simpleHash(str: any) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
  }
}

// ─── Lazy Imports ─────────────────────────────────────────────────────────────
// These are resolved lazily to avoid circular dependency issues since many
// state managers import from modules that may in turn reference this module.

let _imports: any = null;
function _lazyImports() {
  if (!_imports) {
    // Dynamic inline requires are not supported in ESM, but since these modules
    // will already be loaded by the time applySnapshot() is called at runtime,
    // we store resolutions from the first call.
    _imports = {};
  }
  return _imports;
}

/**
 * Register constructor references that applySnapshot() needs for
 * deserialization.  Called once from MainStage during initialization.
 *
 * @param {Object} constructors - { ResourceStateManager, TechStateManager, ... }
 */
export function registerSnapshotConstructors(constructors: any) {
  _imports = { ..._imports, ...constructors };
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const snapshotManager = new SnapshotManager();

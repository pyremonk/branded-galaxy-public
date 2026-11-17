/**
 * SessionPresenceManager — Supabase Presence + Postgres Changes for hybrid
 * async/sync game sessions.
 *
 * Runs *alongside* NetworkSessionManager (which keeps lobby CRUD, chat, and
 * order validation).  This manager adds:
 *   - Extended presence metadata (isReady, isHost, factionId)
 *   - Postgres Changes subscriptions on the new `games` and `game_snapshots`
 *     tables (spec 056 FR-SPF-010)
 *   - A broadcast channel stub for sync-mode messages (spec 058)
 *   - Host election & ready gating for sync mode (spec 057)
 *
 * Offline mode: creates a single-player mock presence (always ready, always
 * host) and stores game status in localStorage.
 *
 * Spec: 056-game-session-presence-spec.md, 057-host-election-ready-spec.md
 */
import { dataBridge } from './data-bridge.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const LOG_TAG = '[SessionPresenceManager]';
const LOCALSTORAGE_STATUS_PREFIX = 'game_status_';

/** Grace period for disconnect during sync mode (latency-sensitive). */
export const SYNC_GRACE_PERIOD_MS = 5_000;

/** Grace period for disconnect during async mode. */
export const ASYNC_GRACE_PERIOD_MS = 120_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build the presence-channel name for a given game. */
function presenceChannelName(gameId: any) {
  return `game:${gameId}:presence`;
}

/** Build the realtime broadcast-channel name for a given game. */
function realtimeChannelName(gameId: any) {
  return `game:${gameId}:realtime`;
}

/** Build the postgres-changes channel name for a given game. */
function postgresChannelName(gameId: any) {
  return `game:${gameId}:postgres`;
}

// ─── Host Election (pure, deterministic — FR-HER-002) ───────────────────────

/**
 * Deterministic host election.  All clients run this independently and must
 * arrive at the same result given the same presence list.
 *
 * @param {object[]} presenceList        – array of PresenceMeta objects
 * @param {number}   requiredPlayerCount – how many human players the game needs
 * @returns {string|null} userId of the elected host, or null if not enough ready players
 */
export function electHost(presenceList: any, requiredPlayerCount: any) {
  const eligible = presenceList
    .filter((p: any) => p.isReady)
    .sort((a: any, b: any) => a.userId.localeCompare(b.userId));

  if (eligible.length < requiredPlayerCount) return null;
  return eligible[0].userId;
}

// ─── Class ──────────────────────────────────────────────────────────────────

export class SessionPresenceManager {
  _gameId: any = null;
  _userId: any = null;
  _factionId: any = null;
  _isReady: boolean = false;
  _isHost: boolean = false;
  _presenceChannel: any = null;
  _realtimeChannel: any = null;
  _postgresChannel: any = null;

  _displayName: any = null;
  _initialized: boolean = false;
  _requiredPlayerCount: number = 1;
  _isSolo: boolean = false;
  _isHotSeat: boolean = false;
  _canReadyFn: any = null;
  _hasSubmittedOrders: boolean = false;
  _disconnectTimers: Map<any,any> = new Map();
  _previousPresence: Map<any,any> = new Map();
  _presenceState: Map<any,any> = new Map();
  _listeners: Map<any,any> = new Map();
  _gameStatus: any = 'async';
  constructor() {
    // ── Identity (set during initialize) ──────────────────────────────────
    /** @type {string|null} */ this._gameId      = null;
    /** @type {string|null} */ this._userId      = null;
    /** @type {string|null} */ this._displayName = null;
    /** @type {string|null} */ this._factionId   = null;

    // ── Local state ───────────────────────────────────────────────────────
    /** @type {boolean} */ this._isReady     = false;
    /** @type {boolean} */ this._isHost      = false;
    /** @type {boolean} */ this._initialized = false;

    // ── Spec 057: Mode & election state ───────────────────────────────────
    /** @type {number} Number of human players required for sync mode. */
    this._requiredPlayerCount = 1;
    /** @type {boolean} True when this is a solo game (1 human, AI opponents). */
    this._isSolo = false;
    /** @type {boolean} True for hot-seat games (async-only, no sync). */
    this._isHotSeat = false;
    /**
     * External callback that returns true when the local player has
     * submitted their async turn orders.  Set via `setCanReadyCheck()`.
     * @type {(() => boolean)|null}
     */
    this._canReadyFn = null;
    /** @type {boolean} True when local player has submitted orders this turn. */
    this._hasSubmittedOrders = false;

    // ── Spec 057: Disconnect grace timers ─────────────────────────────────
    /** @type {Map<string, ReturnType<typeof setTimeout>>} userId → grace timer */
    this._disconnectTimers = new Map();
    /** @type {Map<string, object>} Snapshot of previous presence for diff. */
    this._previousPresence = new Map();

    // ── Supabase channels ─────────────────────────────────────────────────
    /** @type {object|null} */ this._presenceChannel  = null;
    /** @type {object|null} */ this._realtimeChannel  = null;
    /** @type {object|null} */ this._postgresChannel  = null;

    // ── Cached presence state  userId → PresenceMeta ──────────────────────
    /** @type {Map<string,object>} */
    this._presenceState = new Map();

    // ── Listener registry ─────────────────────────────────────────────────
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map([
      ['presenceChange', new Set()],
      ['allReady',       new Set()],
      ['hostChange',     new Set()],
    ]);

    // ── Cached game status (populated in online mode from Postgres Changes)
    /** @type {'async'|'sync'} */
    this._gameStatus = 'async';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the manager for a specific game.
   * @param {string} gameId       – UUID from the `games` table
   * @param {string} userId       – Supabase auth user ID
   * @param {string} displayName  – Human-readable player name
   * @param {string} factionId    – Assigned faction
   * @param {object} [options]    – Spec 057 options
   * @param {number} [options.requiredPlayerCount=1] – Human players required for sync
   * @param {boolean} [options.isSolo=false]    – True for single-human games
   * @param {boolean} [options.isHotSeat=false] – True for hot-seat games (async-only)
   */
  initialize(gameId: any, userId: any, displayName: any, factionId: any, options: Record<string, any> = {}) {
    if (this._initialized) {
      console.warn(LOG_TAG, 'Already initialized — call destroy() first.');
      return;
    }

    this._gameId      = gameId;
    this._userId      = userId;
    this._displayName = displayName;
    this._factionId   = factionId;
    this._initialized = true;

    // Spec 057 options
    this._requiredPlayerCount = options.requiredPlayerCount ?? 1;
    this._isSolo              = options.isSolo ?? false;
    this._isHotSeat           = options.isHotSeat ?? false;

    if (this._isHotSeat) {
      // FR-HER-008: Hot-seat is async-only — force status and skip channels
      this._initOffline();
      console.log(LOG_TAG, `Initialized for game ${gameId} (hot-seat, async-only)`);
      return;
    }

    if (this._isSolo) {
      // FR-HER-007: Solo mode — always host/ready, skip election ceremony
      this._initSolo();
      console.log(LOG_TAG, `Initialized for game ${gameId} (solo, ${dataBridge.offlineMode ? 'offline' : 'online'})`);
      return;
    }

    if (dataBridge.offlineMode) {
      this._initOffline();
    } else {
      this._initOnline();
    }

    console.log(LOG_TAG, `Initialized for game ${gameId} (${dataBridge.offlineMode ? 'offline' : 'online'})`);
  }

  /**
   * Tear down all channels and reset internal state.
   */
  destroy() {
    if (!this._initialized) return;

    const client = dataBridge.getClient();

    if (this._presenceChannel && client) {
      client.removeChannel(this._presenceChannel);
    }
    if (this._realtimeChannel && client) {
      client.removeChannel(this._realtimeChannel);
    }
    if (this._postgresChannel && client) {
      client.removeChannel(this._postgresChannel);
    }

    this._presenceChannel  = null;
    this._realtimeChannel  = null;
    this._postgresChannel  = null;

    this._gameId      = null;
    this._userId      = null;
    this._displayName = null;
    this._factionId   = null;
    this._isReady     = false;
    this._isHost      = false;
    this._initialized = false;
    this._gameStatus  = 'async';

    // Spec 057 state
    this._requiredPlayerCount = 1;
    this._isSolo    = false;
    this._isHotSeat = false;
    this._canReadyFn = null;
    this._hasSubmittedOrders = false;

    // Clear disconnect grace timers
    for (const timer of this._disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this._disconnectTimers.clear();
    this._previousPresence.clear();

    this._presenceState.clear();

    for (const set of this._listeners.values()) {
      set.clear();
    }

    console.log(LOG_TAG, 'Destroyed — all channels removed.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Channel Access (spec 058)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return the Supabase Realtime broadcast channel for `game:{gameId}:realtime`.
   * Used by SyncTickManager to send/receive tick loop messages (spec 058).
   * @returns {Object|null} Supabase channel, or null if not initialized / offline.
   */
  getRealtimeChannel() {
    return this._realtimeChannel ?? null;
  }

  /**
   * Return the current game ID.
   * @returns {string|null}
   */
  getGameId() {
    return this._gameId ?? null;
  }

  /**
   * Return the local user ID.
   * @returns {string|null}
   */
  getUserId() {
    return this._userId ?? null;
  }

  /**
   * @returns {boolean} Whether the local user is the elected sync host.
   */
  isSyncHost() {
    return this._isHost;
  }

  /**
   * @returns {boolean} Whether this is a solo session.
   */
  isSolo() {
    return this._isSolo;
  }

  /**
   * Return the list of currently tracked player IDs from presence state.
   * @returns {string[]}
   */
  getTrackedPlayerIds() {
    return [...this._presenceState.keys()];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Ready state (FR-HER-001)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle local ready state and push the update to presence.
   * Gated: prevents setting ready if orders haven't been submitted (FR-HER-001).
   * @param {boolean} isReady
   * @returns {{ success: boolean, reason?: string }}
   */
  setReady(isReady: any) {
    // Hot-seat: always async, ready is a no-op
    if (this._isHotSeat) return { success: false, reason: 'Hot-seat mode is async-only.' };

    // Solo: always implicitly ready
    if (this._isSolo) return { success: true };

    // Gating: cannot ready-up without submitted orders
    if (isReady) {
      const check = this.canSetReady();
      if (!check.allowed) return { success: false, reason: check.reason };
    }

    this._isReady = isReady;
    this._trackPresence();

    // Dispatch not-ready event if toggling off during sync → triggers async fallback
    if (!isReady && this._gameStatus === 'sync') {
      window.dispatchEvent(new CustomEvent('session:playerNotReady', {
        detail: { userId: this._userId },
      }));
      this.requestAsyncMode('player_not_ready');
    }

    return { success: true };
  }

  /** @returns {boolean} */
  isLocalReady() {
    return this._isReady;
  }

  /**
   * Check whether the local player is allowed to toggle ready.
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canSetReady() {
    if (this._isSolo) return { allowed: true };
    if (this._isHotSeat) return { allowed: false, reason: 'Hot-seat mode is async-only.' };

    // Check external callback first (set by MainStage)
    if (this._canReadyFn && !this._canReadyFn()) {
      return { allowed: false, reason: 'Submit your turn orders before readying up.' };
    }

    // Fallback: check internal flag
    if (!this._hasSubmittedOrders) {
      return { allowed: false, reason: 'Submit your turn orders before readying up.' };
    }

    return { allowed: true };
  }

  /**
   * Register an external callback that returns true when the local player
   * has submitted their async turn orders.
   * @param {() => boolean} fn
   */
  setCanReadyCheck(fn: any) {
    this._canReadyFn = fn;
  }

  /**
   * Mark that the local player has submitted orders for the current turn.
   * Called by MainStage after successful order submission.
   * @param {boolean} submitted
   */
  markOrdersSubmitted(submitted: any) {
    this._hasSubmittedOrders = submitted;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Host state (managed externally by spec 057 host-election logic)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mark this player as host (or not) and push the update to presence.
   * @param {boolean} isHost
   */
  setHost(isHost: any) {
    this._isHost = isHost;
    this._trackPresence();
  }

  /** @returns {boolean} */
  isLocalHost() {
    return this._isHost;
  }

  /**
   * Return the userId of the current host, or null if none.
   * @returns {string|null}
   */
  getHostId() {
    for (const meta of this._presenceState.values()) {
      if (meta.isHost) return meta.userId;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Presence queries
  // ═══════════════════════════════════════════════════════════════════════════

  /** @returns {object[]} Array of PresenceMeta objects. */
  getPresenceList() {
    return Array.from(this._presenceState.values());
  }

  /** @returns {number} */
  getOnlinePlayerCount() {
    return this._presenceState.size;
  }

  /** @returns {boolean} True when every online player has isReady === true. */
  areAllPlayersReady() {
    if (this._presenceState.size === 0) return false;
    for (const meta of this._presenceState.values()) {
      if (!meta.isReady) return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscriptions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a callback for any presence change (join, leave, metadata update).
   * @param {Function} callback – receives the full presence list
   * @returns {Function} Unsubscribe function
   */
  onPresenceChange(callback: any) {
    return this._subscribe('presenceChange', callback);
  }

  /**
   * Register a callback that fires when all online players become ready.
   * @param {Function} callback – receives no arguments
   * @returns {Function} Unsubscribe function
   */
  onAllReady(callback: any) {
    return this._subscribe('allReady', callback);
  }

  /**
   * Register a callback that fires when the host changes.
   * @param {Function} callback – receives { hostId }
   * @returns {Function} Unsubscribe function
   */
  onHostChange(callback: any) {
    return this._subscribe('hostChange', callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Game status
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return the current game pacing status.
   * @returns {'async'|'sync'}
   */
  getGameStatus() {
    return this._gameStatus;
  }

  /**
   * Update the game pacing status on the `games` row (or localStorage in
   * offline mode).
   * @param {'async'|'sync'} status
   * @returns {Promise<void>}
   */
  async setGameStatus(status: any) {
    // FR-HER-008: hot-seat games are locked to async
    if (this._isHotSeat && status === 'sync') {
      console.warn(LOG_TAG, 'Hot-seat games cannot enter sync mode.');
      return;
    }

    this._gameStatus = status;

    // Solo or offline: persist to localStorage and dispatch locally
    // (solo games use a non-UUID gameId like 'local-solo' that can't
    //  be written to the Supabase `games` table).
    if (dataBridge.offlineMode || this._isSolo) {
      try {
        localStorage.setItem(
          `${LOCALSTORAGE_STATUS_PREFIX}${this._gameId}`,
          status,
        );
      } catch { /* quota exceeded — non-critical */ }
      // Dispatch locally since there's no Postgres Changes subscription
      // to fire the event for us.
      window.dispatchEvent(new CustomEvent('session:gameStatusChanged', {
        detail: { status },
      }));
      return;
    }

    const client = dataBridge.getClient();
    if (!client || !this._gameId) return;

    const { error } = await client
      .from('games')
      .update({ status })
      .eq('id', this._gameId);

    if (error) {
      console.error(LOG_TAG, 'Failed to set game status:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Spec 057: Sync mode entry & exit
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check all four sync entry conditions (FR-HER-003).
   * @param {string} [currentPhase] – e.g. 'ACTION', passed from caller to
   *   avoid a circular import on TurnStateManager.
   * @returns {{ met: boolean, reasons: string[] }}
   */
  checkSyncEntryConditions(currentPhase: any) {
    const reasons = [];

    // 1. All required players connected
    if (this.getOnlinePlayerCount() < this._requiredPlayerCount) {
      reasons.push(`Only ${this.getOnlinePlayerCount()} of ${this._requiredPlayerCount} required players connected.`);
    }

    // 2. All players ready
    if (!this.areAllPlayersReady()) {
      reasons.push('Not all players are ready.');
    }

    // 3. Game is at turn boundary (ACTION phase, no resolution/maintenance in progress)
    if (currentPhase && currentPhase !== 'ACTION') {
      reasons.push(`Game is in ${currentPhase} phase — must be at turn boundary.`);
    }

    // 4. No unresolved async turn (checked externally — for now we trust that
    //    ACTION phase implies orders are resolved for the previous turn)

    return { met: reasons.length === 0, reasons };
  }

  /**
   * Attempt to transition from async to sync mode.  Called when all-ready
   * transitions fire, or manually by solo players.
   *
   * @param {string} [currentPhase] – current TurnStateManager phase
   * @returns {Promise<{ success: boolean, hostId?: string, reasons?: string[] }>}
   */
  async attemptSyncTransition(currentPhase: any) {
    if (this._gameStatus === 'sync') {
      return { success: false, reasons: ['Already in sync mode.'] };
    }

    if (this._isHotSeat) {
      return { success: false, reasons: ['Hot-seat mode is async-only.'] };
    }

    // Solo: skip election, go straight to sync
    if (this._isSolo) {
      await this.setGameStatus('sync');
      await this._writeHostToDb(this._userId);
      window.dispatchEvent(new CustomEvent('session:hostElected', {
        detail: { hostId: this._userId, hostName: this._displayName },
      }));
      return { success: true, hostId: this._userId };
    }

    const check = this.checkSyncEntryConditions(currentPhase);
    if (!check.met) {
      return { success: false, reasons: check.reasons };
    }

    // Run election
    const hostId = electHost(this.getPresenceList(), this._requiredPlayerCount);
    if (!hostId) {
      return { success: false, reasons: ['Election produced no host — not enough ready players.'] };
    }

    // The elected host writes the DB updates
    if (hostId === this._userId) {
      this.setHost(true);
      await this.setGameStatus('sync');
      await this._writeHostToDb(hostId);
    } else {
      this.setHost(false);
    }

    const hostMeta = this._presenceState.get(hostId);
    window.dispatchEvent(new CustomEvent('session:hostElected', {
      detail: { hostId, hostName: hostMeta?.displayName ?? 'Unknown' },
    }));

    return { success: true, hostId };
  }

  /**
   * Transition from sync back to async mode (FR-HER-006).
   * Can be called by the host directly, or triggered by disconnect / not-ready.
   * @param {string} reason – e.g. 'host_request', 'player_not_ready', 'disconnect', 'vote'
   * @returns {Promise<void>}
   */
  async requestAsyncMode(reason: any) {
    if (this._gameStatus === 'async') return;

    console.log(LOG_TAG, `Returning to async mode — reason: ${reason}`);

    // Request a final snapshot before leaving sync (spec 059 handles the actual write)
    window.dispatchEvent(new CustomEvent('session:requestSnapshot', {
      detail: { reason },
    }));

    // Update game status
    await this.setGameStatus('async');

    // Clear sync-host from DB
    await this._writeHostToDb(null);

    // Clear local host flag
    this._isHost = false;
    this._trackPresence();

    // Clear all disconnect grace timers
    for (const timer of this._disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this._disconnectTimers.clear();

    window.dispatchEvent(new CustomEvent('session:fallbackToAsync', {
      detail: { reason },
    }));
  }

  /**
   * Solo-mode immediate toggle between async and sync (FR-HER-007).
   * No election ceremony, no ready checks.
   * @returns {Promise<void>}
   */
  async toggleSyncMode() {
    if (!this._isSolo) {
      console.warn(LOG_TAG, 'toggleSyncMode() is only available in solo mode.');
      return;
    }
    if (this._isHotSeat) return;

    if (this._gameStatus === 'async') {
      await this.setGameStatus('sync');
      window.dispatchEvent(new CustomEvent('session:hostElected', {
        detail: { hostId: this._userId, hostName: this._displayName },
      }));
    } else {
      await this.requestAsyncMode('solo_toggle');
    }
  }

  /** @returns {boolean} */
  isHotSeat() { return this._isHotSeat; }

  /** @returns {number} */
  getRequiredPlayerCount() { return this._requiredPlayerCount; }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — online initialization
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _initOnline() {
    const client = dataBridge.getClient();
    if (!client) return;

    // ── 1. Presence channel ──────────────────────────────────────────────
    this._presenceChannel = client
      .channel(presenceChannelName(this._gameId))
      .on('presence', { event: 'sync' }, () => {
        this._rebuildPresenceState();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this._trackPresence();
          console.log(LOG_TAG, 'Presence channel subscribed.');
        }
      });

    // ── 2. Realtime broadcast channel (stub — spec 058 adds handlers) ───
    this._realtimeChannel = client
      .channel(realtimeChannelName(this._gameId))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(LOG_TAG, 'Realtime broadcast channel subscribed.');
        }
      });

    // ── 3. Postgres Changes channel ─────────────────────────────────────
    this._postgresChannel = client
      .channel(postgresChannelName(this._gameId))
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'games',
          filter: `id=eq.${this._gameId}`,
        },
        (payload) => {
          this._handleGamesUpdate(payload.new);
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'game_snapshots',
          filter: `game_id=eq.${this._gameId}`,
        },
        (payload) => {
          this._handleSnapshotInsert(payload.new);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(LOG_TAG, 'Postgres Changes channel subscribed.');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — offline initialization
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _initOffline() {
    this._isReady = true;
    this._isHost  = true;

    const mockMeta = this._buildLocalMeta();
    this._presenceState.set(this._userId, mockMeta);

    // Restore persisted status if any.
    // 'sync' cannot survive a page reload (the tick loop stops on unload),
    // so reset it to 'async' and clear the stale entry.
    try {
      const stored = localStorage.getItem(
        `${LOCALSTORAGE_STATUS_PREFIX}${this._gameId}`,
      );
      if (stored === 'async') {
        this._gameStatus = stored;
      } else if (stored === 'sync') {
        this._gameStatus = 'async';
        localStorage.setItem(`${LOCALSTORAGE_STATUS_PREFIX}${this._gameId}`, 'async');
      }
    } catch { /* ignore */ }

    // Fire listeners once with mock state
    this._fireListeners('presenceChange', this.getPresenceList());
    this._fireListeners('allReady');
    this._fireListeners('hostChange', { hostId: this._userId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — solo initialization (FR-HER-007)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Solo mode init.  The local player is always host and always ready.
   * Online solo games still create the Presence channel (for future spectator
   * support) but skip election and ready gating.
   * @private
   */
  _initSolo() {
    this._isReady = true;
    this._isHost  = true;

    const mockMeta = this._buildLocalMeta();
    this._presenceState.set(this._userId, mockMeta);

    // Restore persisted status.
    // 'sync' cannot survive a page reload (the tick loop stops on unload),
    // so reset it to 'async' and clear the stale entry.
    try {
      const stored = localStorage.getItem(
        `${LOCALSTORAGE_STATUS_PREFIX}${this._gameId}`,
      );
      if (stored === 'async') {
        this._gameStatus = stored;
      } else if (stored === 'sync') {
        this._gameStatus = 'async';
        localStorage.setItem(`${LOCALSTORAGE_STATUS_PREFIX}${this._gameId}`, 'async');
      }
    } catch { /* ignore */ }

    // If online, open the Presence channel (spectators, future use)
    if (!dataBridge.offlineMode) {
      const client = dataBridge.getClient();
      if (client) {
        this._presenceChannel = client
          .channel(presenceChannelName(this._gameId))
          .on('presence', { event: 'sync' }, () => {
            // Still rebuild — but solo skips election inside _rebuildPresenceState
            this._rebuildPresenceState();
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await this._trackPresence();
              console.log(LOG_TAG, 'Solo presence channel subscribed.');
            }
          });

        // Postgres Changes — still useful for game status sync
        this._postgresChannel = client
          .channel(postgresChannelName(this._gameId))
          .on(
            'postgres_changes',
            {
              event:  'UPDATE',
              schema: 'public',
              table:  'games',
              filter: `id=eq.${this._gameId}`,
            },
            (payload) => { this._handleGamesUpdate(payload.new); },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log(LOG_TAG, 'Solo Postgres Changes channel subscribed.');
            }
          });
      }
    }

    // Fire listeners once with mock state
    this._fireListeners('presenceChange', this.getPresenceList());
    this._fireListeners('allReady');
    this._fireListeners('hostChange', { hostId: this._userId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — presence helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build the metadata object for the local player.
   * @private
   * @returns {object}
   */
  _buildLocalMeta() {
    return {
      userId:      this._userId,
      gameId:      this._gameId,
      displayName: this._displayName,
      factionId:   this._factionId,
      isReady:     this._isReady,
      isHost:      this._isHost,
      latencyMs:   0,
    };
  }

  /**
   * Push (or re-push) current metadata to the presence channel.
   * No-op in offline mode.
   * @private
   */
  async _trackPresence() {
    if (dataBridge.offlineMode) {
      // Update local cache for offline queries
      this._presenceState.set(this._userId, this._buildLocalMeta());
      return;
    }
    if (!this._presenceChannel) return;
    await this._presenceChannel.track(this._buildLocalMeta());
  }

  /**
   * Rebuild `_presenceState` from the Supabase presence state object.
   * Fires all relevant listener callbacks.
   * Runs host election on every presence change (FR-HER-002).
   * Detects player departures for disconnect grace timers (FR-HER-004/005).
   * @private
   */
  _rebuildPresenceState() {
    if (!this._presenceChannel) return;

    const previousHostId = this.getHostId();
    const wasAllReady    = this.areAllPlayersReady();

    // Snapshot current presence for departure detection
    const oldPresence = new Map(this._presenceState);

    this._presenceState.clear();

    const state = this._presenceChannel.presenceState();
    for (const key of Object.keys(state)) {
      const presences = state[key];
      if (!presences || presences.length === 0) continue;
      // Each key may have multiple presences (e.g. multi-tab) — use the latest
      const meta = presences[presences.length - 1];
      if (meta.userId) {
        this._presenceState.set(meta.userId, { ...meta });
      }
    }

    // ── Detect departures & arrivals (FR-HER-004/005) ─────────────────────
    if (!this._isSolo) {
      // Players who left
      for (const [userId, meta] of oldPresence) {
        if (!this._presenceState.has(userId)) {
          this._handlePlayerDeparture(userId, meta);
        }
      }
      // Players who returned (cancel grace timers)
      for (const userId of this._presenceState.keys()) {
        if (!oldPresence.has(userId) && this._disconnectTimers.has(userId)) {
          clearTimeout(this._disconnectTimers.get(userId));
          this._disconnectTimers.delete(userId);
          console.log(LOG_TAG, `Player ${userId} reconnected — grace timer cancelled.`);
        }
      }
    }

    // ── Fire listeners ────────────────────────────────────────────────────
    const presenceList = this.getPresenceList();
    this._fireListeners('presenceChange', presenceList);

    // Spec 060: Forward presence state to React for SessionPanel player list
    window.dispatchEvent(new CustomEvent('session:presenceUpdate', {
      detail: { players: presenceList },
    }));

    // ── Host election on every presence change (FR-HER-002) ──────────────
    if (!this._isSolo) {
      this._runElection(previousHostId);
    }

    // Host change? (covers both election result and manual setHost)
    const newHostId = this.getHostId();
    if (newHostId !== previousHostId) {
      this._fireListeners('hostChange', { hostId: newHostId });
    }

    // All ready?
    const nowAllReady = this.areAllPlayersReady();
    if (nowAllReady && !wasAllReady) {
      this._fireListeners('allReady');
      window.dispatchEvent(new CustomEvent('session:allPlayersReady', {
        detail: { playerCount: this.getOnlinePlayerCount() },
      }));
    }
    // Someone became not-ready?
    if (!nowAllReady && wasAllReady) {
      // Find who is not ready and dispatch event
      for (const meta of this._presenceState.values()) {
        if (!meta.isReady) {
          window.dispatchEvent(new CustomEvent('session:playerNotReady', {
            detail: { userId: meta.userId },
          }));
          break;  // one event is sufficient to signal the transition
        }
      }
    }
  }

  /**
   * Run the deterministic host election algorithm and update presence/DB if
   * the elected host changes.
   * @private
   * @param {string|null} previousHostId – host before this presence rebuild
   */
  _runElection(previousHostId: any) {
    const electedId = electHost(this.getPresenceList(), this._requiredPlayerCount);

    if (!electedId) {
      // Not enough ready players — clear host if there was one
      if (previousHostId && previousHostId === this._userId) {
        this.setHost(false);
      }
      return;
    }

    // Only the elected host writes its own isHost flag
    if (electedId === this._userId && !this._isHost) {
      this.setHost(true);
      this._writeHostToDb(electedId);

      if (previousHostId && previousHostId !== electedId) {
        // Re-election after a disconnect
        window.dispatchEvent(new CustomEvent('session:hostChanged', {
          detail: { oldHostId: previousHostId, newHostId: electedId },
        }));
      }
    } else if (electedId !== this._userId && this._isHost) {
      // We were host but someone else was elected (shouldn't happen in practice
      // with deterministic algo, but be defensive)
      this.setHost(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — disconnect grace handling (FR-HER-004 / FR-HER-005)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a player disappearing from presence.
   * Starts a grace timer appropriate to the current game mode.
   * @private
   * @param {string} userId
   * @param {object} meta – last known PresenceMeta for this player
   */
  _handlePlayerDeparture(userId: any, meta: any) {
    if (this._disconnectTimers.has(userId)) return; // already counting

    const isSync     = this._gameStatus === 'sync';
    const gracePeriod = isSync ? SYNC_GRACE_PERIOD_MS : ASYNC_GRACE_PERIOD_MS;
    const wasHost    = meta.isHost;

    console.log(LOG_TAG, `Player ${userId} departed — ${isSync ? 'sync' : 'async'} grace timer (${gracePeriod}ms) started.`);

    if (isSync && wasHost) {
      // FR-HER-004: Pause the tick loop while waiting for host reconnect
      window.dispatchEvent(new CustomEvent('session:tickLoopPause', {
        detail: { reason: 'host_disconnect', disconnectedUserId: userId },
      }));
    }

    const timer = setTimeout(() => {
      this._disconnectTimers.delete(userId);
      this._onGraceExpired(userId, wasHost);
    }, gracePeriod);

    this._disconnectTimers.set(userId, timer);
  }

  /**
   * Called when a disconnected player's grace period expires without reconnect.
   * @private
   * @param {string} userId
   * @param {boolean} wasHost – whether the departed player was the sync host
   */
  _onGraceExpired(userId: any, wasHost: any) {
    console.log(LOG_TAG, `Grace period expired for ${userId}.`);

    // Notify the system to convert the player's faction to AI
    window.dispatchEvent(new CustomEvent('network:playerKicked', {
      detail: { playerId: userId, reason: 'disconnect_timeout' },
    }));

    if (this._gameStatus !== 'sync') return;

    const remainingHumans = this.getOnlinePlayerCount();

    if (wasHost) {
      // FR-HER-004: Host disconnected during sync
      if (remainingHumans >= 2) {
        // Re-elect — _runElection will fire session:hostChanged
        const previousHostId = userId;
        this._runElection(previousHostId);
        const newHostId = this.getHostId();
        if (newHostId) {
          console.log(LOG_TAG, `Re-elected host: ${newHostId}`);
          // Resume tick loop
          window.dispatchEvent(new CustomEvent('session:tickLoopResume', {
            detail: { newHostId },
          }));
        } else {
          // Election failed — fallback
          this.requestAsyncMode('disconnect');
        }
      } else {
        // Only 1 player left — fall back
        this.requestAsyncMode('disconnect');
      }
    } else {
      // FR-HER-005: Non-host disconnected during sync
      if (remainingHumans < this._requiredPlayerCount) {
        this.requestAsyncMode('disconnect');
      }
      // Otherwise sync continues with the AI-controlled faction
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — database helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write the sync host user ID to the `games` table.
   * @private
   * @param {string|null} userId – null to clear the host
   * @returns {Promise<void>}
   */
  async _writeHostToDb(userId: any) {
    if (dataBridge.offlineMode || this._isSolo) return;

    const client = dataBridge.getClient();
    if (!client || !this._gameId) return;

    const updates: Record<string, any> = { host_user_id: userId };
    if (userId === null) {
      updates.current_tick = null;
    }

    const { error } = await client
      .from('games')
      .update(updates)
      .eq('id', this._gameId);

    if (error) {
      console.error(LOG_TAG, 'Failed to write host to games table:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — Postgres Changes handlers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle an UPDATE on the `games` row for this game.
   * Dispatches `session:gameStatusChanged`.
   * @private
   */
  _handleGamesUpdate(row: any) {
    this._gameStatus = row.status ?? this._gameStatus;
    window.dispatchEvent(new CustomEvent('session:gameStatusChanged', {
      detail: {
        status:      row.status,
        currentTurn: row.current_turn,
        currentTick: row.current_tick,
      },
    }));
  }

  /**
   * Handle an INSERT on `game_snapshots` for this game.
   * Dispatches `session:snapshotAvailable`.
   * @private
   */
  _handleSnapshotInsert(row: any) {
    window.dispatchEvent(new CustomEvent('session:snapshotAvailable', {
      detail: {
        tickNumber: row.tick_number,
        turnNumber: row.turn_number,
      },
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal — listener helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a callback on the named listener set.
   * @private
   * @returns {Function} Unsubscribe function
   */
  _subscribe(name: any, callback: any) {
    const set = this._listeners.get(name);
    if (set) set.add(callback);
    return () => {
      if (set) set.delete(callback);
    };
  }

  /**
   * Fire all callbacks in the named listener set.
   * @private
   */
  _fireListeners(name: any, ...args: any[]) {
    const set = this._listeners.get(name);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(...args);
      } catch (err) {
        console.error(LOG_TAG, `Listener error in "${name}":`, err);
      }
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const sessionPresenceManager = new SessionPresenceManager();

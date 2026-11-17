/**
 * TurnManager — Persistent async turn order submission and resolution.
 *
 * Bridges the gap between the `turn_orders` DB table (created in spec 056) and
 * the client.  In online mode, orders are written to Supabase and turn
 * advancement is detected via Postgres Changes subscriptions.  In offline mode,
 * orders are stored in localStorage and resolved immediately.
 *
 * Spec: 060-async-flow-mode-switching-spec.md (FR-ATF-001 – FR-ATF-006)
 */

import { dataBridge } from './data-bridge.js';

const LOG_TAG = '[TurnManager]';

/** Turn timer check interval (ms). */
const TIMER_CHECK_INTERVAL_MS = 1000;

/**
 * @typedef {Object} TurnManagerDeps
 * @property {string}  gameId
 * @property {string}  userId
 * @property {string[]} requiredPlayers  – player IDs that must submit each turn
 * @property {number}  [turnTimerMinutes=0] – 0 = disabled
 * @property {Function} [onAllSubmitted]  – called when all orders are in (host-only)
 * @property {Function} [onTurnAdvanced]  – called when games.current_turn changes
 * @property {Function} [onOrderUpdate]   – called when a new order row appears
 */

class TurnManager {
  _gameId: any = null;
  _userId: any = null;
  _requiredPlayers: Set<any> = new Set();
  _submittedPlayers: Set<any> = new Set();
  _turnTimerMinutes: number = 0;
  _timerIntervalId: any = null;
  _timerStartedAt: any = null;
  _onAllSubmitted: any = null;
  _onTurnAdvanced: any = null;
  _onOrderUpdate: any = null;
  _unsubOrders: any = null;
  _unsubGame: any = null;
  _initialized: boolean = false;
  constructor() {
    /** @type {string|null} */
    this._gameId = null;
    /** @type {string|null} */
    this._userId = null;
    /** @type {Set<string>} */
    this._requiredPlayers = new Set();
    /** @type {Set<string>} Submitted player IDs for the current turn. */
    this._submittedPlayers = new Set();
    /** @type {number} */
    this._turnTimerMinutes = 0;
    /** @type {number|null} Timer check interval ID. */
    this._timerIntervalId = null;
    /** @type {Date|null} When the turn timer started. */
    this._timerStartedAt = null;

    // Callbacks
    /** @type {Function|null} */
    this._onAllSubmitted = null;
    /** @type {Function|null} */
    this._onTurnAdvanced = null;
    /** @type {Function|null} */
    this._onOrderUpdate = null;

    // Supabase subscription cleanup functions
    /** @type {Function|null} */
    this._unsubOrders = null;
    /** @type {Function|null} */
    this._unsubGame = null;

    /** @type {boolean} */
    this._initialized = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the TurnManager for a game session.
   * @param {TurnManagerDeps} deps
   */
  initialize(deps: any) {
    this._gameId            = deps.gameId;
    this._userId            = deps.userId;
    this._requiredPlayers   = new Set(deps.requiredPlayers ?? []);
    this._turnTimerMinutes  = deps.turnTimerMinutes ?? 0;
    this._onAllSubmitted    = deps.onAllSubmitted ?? null;
    this._onTurnAdvanced    = deps.onTurnAdvanced ?? null;
    this._onOrderUpdate     = deps.onOrderUpdate ?? null;
    this._submittedPlayers.clear();
    this._timerStartedAt    = null;
    this._initialized       = true;

    console.log(LOG_TAG, `Initialized for game ${this._gameId}, ${this._requiredPlayers.size} required players.`);
  }

  /**
   * Start listening for turn order updates (Postgres Changes in online mode).
   * Call this after initialize() and after the game enters ACTION phase.
   * @param {number} turnNumber – current turn number to subscribe for
   */
  subscribeToOrderUpdates(turnNumber: any) {
    this._cleanupOrderSubscription();
    this._submittedPlayers.clear();

    if (dataBridge.offlineMode) {
      // Offline: nothing to subscribe — orders resolve immediately
      return;
    }

    const client = dataBridge.getClient();
    if (!client || !this._gameId) return;

    const channelName = `turn_orders_${this._gameId}_${turnNumber}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'turn_orders',
          filter: `game_id=eq.${this._gameId}`,
        },
        (payload) => {
          const row = payload.new;
          if (row.turn_number !== turnNumber) return;

          const playerId = row.player_id;
          this._submittedPlayers.add(playerId);

          console.log(LOG_TAG, `Order received from ${playerId} (${this._submittedPlayers.size}/${this._requiredPlayers.size})`);

          // Fire order update callback
          if (this._onOrderUpdate) {
            this._onOrderUpdate({
              playerId,
              submitted: this._submittedPlayers.size,
              total:     this._requiredPlayers.size,
            });
          }

          // Dispatch React event for HUD
          window.dispatchEvent(new CustomEvent('session:orderSubmissionUpdate', {
            detail: {
              submitted: this._submittedPlayers.size,
              total:     this._requiredPlayers.size,
              playerId,
            },
          }));

          // Start timer on first submission
          if (this._submittedPlayers.size === 1 && this._turnTimerMinutes > 0 && !this._timerStartedAt) {
            this._startTurnTimer();
          }

          // Check if all submitted
          this._checkAllSubmitted();
        },
      )
      .subscribe();

    this._unsubOrders = () => {
      client.removeChannel(channel);
    };

    console.log(LOG_TAG, `Subscribed to order updates for turn ${turnNumber}.`);
  }

  /**
   * Subscribe to turn advancement (games.current_turn changes).
   * Fires onTurnAdvanced callback and a CustomEvent.
   */
  subscribeToTurnAdvance() {
    this._cleanupGameSubscription();

    if (dataBridge.offlineMode) return;

    const client = dataBridge.getClient();
    if (!client || !this._gameId) return;

    const channelName = `game_turn_advance_${this._gameId}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'games',
          filter: `id=eq.${this._gameId}`,
        },
        (payload) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          if (newRow.current_turn !== oldRow.current_turn) {
            console.log(LOG_TAG, `Turn advanced: ${oldRow.current_turn} → ${newRow.current_turn}`);

            if (this._onTurnAdvanced) {
              this._onTurnAdvanced({
                previousTurn: oldRow.current_turn,
                currentTurn:  newRow.current_turn,
              });
            }

            window.dispatchEvent(new CustomEvent('session:turnAdvanced', {
              detail: {
                previousTurn: oldRow.current_turn,
                currentTurn:  newRow.current_turn,
              },
            }));
          }
        },
      )
      .subscribe();

    this._unsubGame = () => {
      client.removeChannel(channel);
    };

    console.log(LOG_TAG, 'Subscribed to turn advance.');
  }

  /**
   * Tear down all subscriptions and state.
   */
  destroy() {
    this._cleanupOrderSubscription();
    this._cleanupGameSubscription();
    this._stopTimerInterval();
    this._submittedPlayers.clear();
    this._initialized = false;
    console.log(LOG_TAG, 'Destroyed.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Order Submission
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submit this player's orders for the given turn.
   * Online: writes to `turn_orders` table (unique constraint prevents duplicates).
   * Offline: writes to localStorage and resolves immediately.
   *
   * @param {string} gameId
   * @param {number} turnNumber
   * @param {string} playerId
   * @param {Array}  commands – serialized action commands
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async submitOrders(gameId: any, turnNumber: any, playerId: any, commands: any) {
    if (dataBridge.offlineMode) {
      return this._submitOrdersOffline(gameId, turnNumber, playerId, commands);
    }

    const client = dataBridge.getClient();
    if (!client) return { success: false, error: 'No Supabase client.' };

    try {
      const { error } = await client
        .from('turn_orders')
        .insert({
          game_id:     gameId,
          turn_number: turnNumber,
          player_id:   playerId,
          orders:      commands,
        });

      if (error) {
        // Unique constraint violation = double-submit
        if (error.code === '23505') {
          console.warn(LOG_TAG, 'Double submission blocked by unique constraint.');
          return { success: false, error: 'Orders already submitted for this turn.' };
        }
        console.error(LOG_TAG, 'submitOrders error:', error.message);
        return { success: false, error: error.message };
      }

      console.log(LOG_TAG, `Orders submitted for turn ${turnNumber} by ${playerId}.`);
      return { success: true };
    } catch (err: any) {
      console.error(LOG_TAG, 'submitOrders exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Check whether a specific player has submitted for a turn.
   * @param {string} gameId
   * @param {number} turnNumber
   * @param {string} playerId
   * @returns {Promise<boolean>}
   */
  async hasSubmitted(gameId: any, turnNumber: any, playerId: any) {
    if (dataBridge.offlineMode) {
      const key = this._offlineOrderKey(gameId, turnNumber, playerId);
      return localStorage.getItem(key!) !== null;
    }

    const client = dataBridge.getClient();
    if (!client) return false;

    const { count } = await client
      .from('turn_orders')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('turn_number', turnNumber)
      .eq('player_id', playerId);

    return (count ?? 0) > 0;
  }

  /**
   * Get a list of player IDs who have submitted for a turn.
   * @param {string} gameId
   * @param {number} turnNumber
   * @returns {Promise<string[]>}
   */
  async getSubmittedPlayers(gameId: any, turnNumber: any) {
    if (dataBridge.offlineMode) {
      // Offline: check localStorage for each required player
      const submitted = [];
      for (const pid of this._requiredPlayers) {
        const key = this._offlineOrderKey(gameId, turnNumber, pid);
        if (localStorage.getItem(key) !== null) submitted.push(pid);
      }
      return submitted;
    }

    const client = dataBridge.getClient();
    if (!client) return [];

    const { data } = await client
      .from('turn_orders')
      .select('player_id')
      .eq('game_id', gameId)
      .eq('turn_number', turnNumber);

    return (data ?? []).map(r => r.player_id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Turn Resolution (host only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check whether all required players have submitted (or timer expired).
   * @param {string} gameId
   * @param {number} turnNumber
   * @param {string[]} requiredPlayers
   * @returns {Promise<boolean>}
   */
  async canResolveTurn(gameId: any, turnNumber: any, requiredPlayers: any) {
    const submitted = await this.getSubmittedPlayers(gameId, turnNumber);
    const submittedSet = new Set(submitted);

    const allIn = requiredPlayers.every((pid: any) => submittedSet.has(pid));
    if (allIn) return true;

    // Check timer expiry
    if (this._turnTimerMinutes > 0 && this._timerStartedAt) {
      const elapsed = (Date.now() - this._timerStartedAt.getTime()) / 1000;
      const limitSec = this._turnTimerMinutes * 60;
      if (elapsed >= limitSec) {
        console.log(LOG_TAG, 'Turn timer expired — allowing resolution with missing players.');
        return true;
      }
    }

    return false;
  }

  /**
   * Fetch all submitted orders for a turn, sorted by player_id for determinism.
   * @param {string} gameId
   * @param {number} turnNumber
   * @returns {Promise<Array<{player_id:string, orders:any}>>}
   */
  async fetchOrders(gameId: any, turnNumber: any) {
    if (dataBridge.offlineMode) {
      const orders = [];
      for (const pid of this._requiredPlayers) {
        const key = this._offlineOrderKey(gameId, turnNumber, pid);
        const raw = localStorage.getItem(key);
        if (raw) {
          try { orders.push({ player_id: pid, orders: JSON.parse(raw) }); }
          catch { /* skip corrupt */ }
        }
      }
      return orders.sort((a, b) => a.player_id.localeCompare(b.player_id));
    }

    const client = dataBridge.getClient();
    if (!client) return [];

    const { data } = await client
      .from('turn_orders')
      .select('player_id, orders')
      .eq('game_id', gameId)
      .eq('turn_number', turnNumber)
      .order('player_id', { ascending: true });

    return data ?? [];
  }

  /**
   * Atomically advance the turn number. Returns true if this client won the race.
   * Prevents double-resolution when two clients race to resolve.
   *
   * @param {string} gameId
   * @param {number} expectedTurn – the turn we expect to be current
   * @returns {Promise<boolean>}
   */
  async claimTurnAdvance(gameId: any, expectedTurn: any) {
    if (dataBridge.offlineMode) {
      // Offline: no race possible — always succeed
      return true;
    }

    const client = dataBridge.getClient();
    if (!client) return false;

    // Atomic: only updates if current_turn matches expected value
    const { data, error } = await client
      .from('games')
      .update({ current_turn: expectedTurn + 1 })
      .eq('id', gameId)
      .eq('current_turn', expectedTurn)
      .select('current_turn');

    if (error) {
      console.error(LOG_TAG, 'claimTurnAdvance error:', error.message);
      return false;
    }

    // If no rows were updated, another client already advanced the turn
    return (data?.length ?? 0) > 0;
  }

  /**
   * Write the resolved game state to the game_state table.
   * @param {string} gameId
   * @param {number} turnNumber – the NEW turn number (after advance)
   * @param {Object} state – serialized game state
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async writeGameState(gameId: any, turnNumber: any, state: any) {
    if (dataBridge.offlineMode) {
      try {
        localStorage.setItem(`game_state_${gameId}_${turnNumber}`, JSON.stringify(state));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    const client = dataBridge.getClient();
    if (!client) return { success: false, error: 'No Supabase client.' };

    try {
      const { error } = await client
        .from('game_state')
        .insert({
          game_id:     gameId,
          turn_number: turnNumber,
          state,
        });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Load the latest game state for a game.
   * @param {string} gameId
   * @returns {Promise<Object|null>}
   */
  async loadLatestGameState(gameId: any) {
    if (dataBridge.offlineMode) {
      // Find the highest turn_number in localStorage
      let latest = null;
      let maxTurn = -1;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`game_state_${gameId}_`)) {
          const turn = parseInt(key.split('_').pop() ?? '', 10);
          if (turn > maxTurn) {
            maxTurn = turn;
            try { const raw = localStorage.getItem(String(key)); latest = raw ? JSON.parse(raw) : null; }
            catch { /* skip corrupt */ }
          }
        }
      }
      return latest;
    }

    const client = dataBridge.getClient();
    if (!client) return null;

    const { data } = await client
      .from('game_state')
      .select('state')
      .eq('game_id', gameId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.state ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Turn Timer (FR-ATF-004)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the turn timer. Writes `turn_timer_started_at` to the games row.
   * @param {string} [gameId]
   * @param {number} [durationMinutes]
   */
  async startTurnTimer(gameId: any, durationMinutes: any) {
    const gid = gameId ?? this._gameId;
    const dur = durationMinutes ?? this._turnTimerMinutes;
    if (!dur || dur <= 0) return;

    this._timerStartedAt = new Date();
    this._turnTimerMinutes = dur;

    // Persist to DB
    if (!dataBridge.offlineMode) {
      const client = dataBridge.getClient();
      if (client && gid) {
        await client
          .from('games')
          .update({ turn_timer_started_at: this._timerStartedAt.toISOString() })
          .eq('id', gid);
      }
    }

    // Start local countdown interval
    this._startTimerInterval();

    console.log(LOG_TAG, `Turn timer started: ${dur} minutes.`);
  }

  /**
   * Get remaining time on the turn timer in seconds.
   * @returns {number|null} Seconds remaining, or null if timer is not active.
   */
  getTurnTimerRemaining() {
    if (!this._timerStartedAt || this._turnTimerMinutes <= 0) return null;
    const elapsed = (Date.now() - this._timerStartedAt.getTime()) / 1000;
    const limit   = this._turnTimerMinutes * 60;
    const remaining = Math.max(0, limit - elapsed);
    return Math.ceil(remaining);
  }

  /**
   * Reset the turn timer for a new turn. Clears started_at on the DB row.
   * @param {string} [gameId]
   */
  async resetTurnTimer(gameId: any) {
    const gid = gameId ?? this._gameId;
    this._timerStartedAt = null;
    this._stopTimerInterval();

    if (!dataBridge.offlineMode) {
      const client = dataBridge.getClient();
      if (client && gid) {
        await client
          .from('games')
          .update({ turn_timer_started_at: null })
          .eq('id', gid);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Getters
  // ═══════════════════════════════════════════════════════════════════════════

  /** @returns {{ submitted: number, total: number }} */
  getSubmissionStatus() {
    return {
      submitted: this._submittedPlayers.size,
      total:     this._requiredPlayers.size,
    };
  }

  /** @returns {boolean} */
  isInitialized() { return this._initialized; }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _submitOrdersOffline(gameId: any, turnNumber: any, playerId: any, commands: any) {
    const key = this._offlineOrderKey(gameId, turnNumber, playerId);
    if (localStorage.getItem(key) !== null) {
      return { success: false, error: 'Orders already submitted for this turn.' };
    }
    try {
      localStorage.setItem(key, JSON.stringify(commands));
      console.log(LOG_TAG, `[offline] Orders stored for turn ${turnNumber}.`);

      // Track locally
      this._submittedPlayers.add(playerId);
      window.dispatchEvent(new CustomEvent('session:orderSubmissionUpdate', {
        detail: {
          submitted: this._submittedPlayers.size,
          total:     this._requiredPlayers.size,
          playerId,
        },
      }));

      this._checkAllSubmitted();

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** @private */
  _offlineOrderKey(gameId: any, turnNumber: any, playerId: any) {
    return `turn_orders_${gameId}_${turnNumber}_${playerId}`;
  }

  /** @private */
  _checkAllSubmitted() {
    if (this._requiredPlayers.size === 0) return;

    const allIn = [...this._requiredPlayers].every(pid => this._submittedPlayers.has(pid));
    if (!allIn) return;

    console.log(LOG_TAG, 'All players submitted.');

    if (this._onAllSubmitted) {
      this._onAllSubmitted();
    }

    window.dispatchEvent(new CustomEvent('session:allOrdersSubmitted', {
      detail: {
        gameId: this._gameId,
        playerCount: this._requiredPlayers.size,
      },
    }));
  }

  /** @private */
  _startTimerInterval() {
    this._stopTimerInterval();

    this._timerIntervalId = setInterval(() => {
      const remaining = this.getTurnTimerRemaining();
      if (remaining === null) return;

      // Dispatch timer update for TurnTimerDisplay
      window.dispatchEvent(new CustomEvent('session:turnTimerUpdate', {
        detail: { remaining },
      }));

      // Timer expired — auto-resolve with empty orders for missing players
      if (remaining <= 0) {
        this._stopTimerInterval();
        console.log(LOG_TAG, 'Turn timer expired.');
        window.dispatchEvent(new CustomEvent('session:turnTimerExpired', {
          detail: { gameId: this._gameId },
        }));

        // Fill in empty orders for missing players and trigger resolution
        this._handleTimerExpiry();
      }
    }, TIMER_CHECK_INTERVAL_MS);
  }

  /** @private */
  _stopTimerInterval() {
    if (this._timerIntervalId !== null) {
      clearInterval(this._timerIntervalId);
      this._timerIntervalId = null;
    }
  }

  /**
   * When the timer expires, submit empty orders for any player who hasn't
   * submitted yet, then trigger the all-submitted check.
   * @private
   */
  async _handleTimerExpiry() {
    for (const pid of this._requiredPlayers) {
      if (!this._submittedPlayers.has(pid)) {
        console.log(LOG_TAG, `Timer expired — submitting empty orders for ${pid}`);
        await this.submitOrders(this._gameId, null, pid, []);
        this._submittedPlayers.add(pid);
      }
    }
    this._checkAllSubmitted();
  }

  /** @private */
  _cleanupOrderSubscription() {
    if (this._unsubOrders) {
      this._unsubOrders();
      this._unsubOrders = null;
    }
  }

  /** @private */
  _cleanupGameSubscription() {
    if (this._unsubGame) {
      this._unsubGame();
      this._unsubGame = null;
    }
  }

  /** @private Alias for _stopTimerInterval (cleaner naming in destroy). */
  _startTurnTimer() {
    (this.startTurnTimer as any)();
  }
}

export const turnManager = new TurnManager();

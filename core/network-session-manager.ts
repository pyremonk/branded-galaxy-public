/**
 * NetworkSessionManager — manages network multiplayer session lifecycle.
 *
 * Handles host/join lobby creation, turn submission accumulation,
 * state broadcasting, and disconnect handling via Supabase Realtime.
 *
 * Spec: 050-network-features-spec.md
 */
import { dataBridge } from './data-bridge.js';

/**
 * Generate a random 6-character alphanumeric game code (e.g. "G7K2PX").
 * @returns {string}
 */
function generateGameCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class NetworkSessionManager {
  _boundOnHostElected: any = null;
  _boundOnHostChanged: any = null;
  _boundOnFallbackToAsync: any = null;

  sessionId: any = null;
  gameCode: any = null;
  role: any = null;
  _channel: any = null;
  _submittedOrders: Map<any,any> = new Map();
  _expectedPlayers: Set<any> = new Set();
  _disconnectTimers: Map<any,any> = new Map();
  gracePeriodMs: number = 120000;
  sessionData: any = null;
  _allOrdersReceived: boolean = false;
  hasPendingTurnNotification: boolean = false;
  syncHostId: any = null;
  _asyncVotes: Set<any> = new Set();
  _playerCount: number = 0;
  constructor() {
    /** @type {string|null} Current session ID */
    this.sessionId = null;
    /** @type {string|null} 6-character game code */
    this.gameCode = null;
    /**
     * Lobby role — the player who created the lobby is 'host', everyone else is 'guest'.
     * This is the *static* lobby host, NOT the sync-mode host (see syncHostId).
     * @type {'host'|'guest'|null}
     */
    this.role = null;
    /** @type {object|null} Supabase Realtime channel */
    this._channel = null;
    /** @type {Map<string,object>} playerId → submitted orders */
    this._submittedOrders = new Map();
    /** @type {Set<string>} Player IDs expected to submit this turn */
    this._expectedPlayers = new Set();
    /** @type {Map<string,ReturnType<typeof setTimeout>>} playerId → grace timer */
    this._disconnectTimers = new Map();
    /** Grace period before a disconnected guest's faction converts to AI (FR-NF-005). */
    this.gracePeriodMs = 120_000;
    /** @type {object|null} Cached session data */
    this.sessionData = null;
    /** @type {boolean} True when all expected orders have been received (host only) */
    this._allOrdersReceived = false;
    /** @type {boolean} True when in-app turn notification badge should be shown */
    this.hasPendingTurnNotification = false;

    /**
     * Spec 057: Dynamic sync-mode host.
     * Elected by SessionPresenceManager when transitioning to sync mode.
     * Separate from `this.role` (the static lobby host).
     * @type {string|null}
     */
    this.syncHostId = null;

    /**
     * Spec 060: Async mode vote tracking.
     * Tracks votes from non-host players requesting return to async mode.
     * @type {Set<string>}
     */
    this._asyncVotes = new Set();
    /** @type {number} Number of players in the session (for vote threshold). */
    this._playerCount = 0;

    // Listen for sync-host lifecycle events from SessionPresenceManager
    this._boundOnHostElected      = this._onSyncHostElected.bind(this);
    this._boundOnHostChanged      = this._onSyncHostChanged.bind(this);
    this._boundOnFallbackToAsync  = this._onFallbackToAsync.bind(this);

    window.addEventListener('session:hostElected',      this._boundOnHostElected);
    window.addEventListener('session:hostChanged',      this._boundOnHostChanged);
    window.addEventListener('session:fallbackToAsync',  this._boundOnFallbackToAsync);
  }

  /**
   * Whether this client is the elected sync-mode host.
   * @param {string} localUserId – current user's ID
   * @returns {boolean}
   */
  isSyncHost(localUserId: any) {
    return this.syncHostId != null && this.syncHostId === localUserId;
  }

  /** @private */
  _onSyncHostElected(e: any) {
    this.syncHostId = e.detail?.hostId ?? null;
    console.log(`[NetworkSessionManager] Sync host elected: ${this.syncHostId}`);
  }

  /** @private */
  _onSyncHostChanged(e: any) {
    const oldId = this.syncHostId;
    this.syncHostId = e.detail?.newHostId ?? null;
    console.log(`[NetworkSessionManager] Sync host changed: ${oldId} → ${this.syncHostId}`);
  }

  /** @private */
  _onFallbackToAsync(e: any) {
    this.syncHostId = null;
    console.log(`[NetworkSessionManager] Sync host cleared — async mode (reason: ${e.detail?.reason})`);
  }

  // ─── Host actions ─────────────────────────────────────────────────────────────

  /**
   * Create a new network lobby (host only).
   * Generates a 6-character game code and persists the session via DataBridge.
   * @param {object} gameConfig - Game configuration from GameSetupScreen
   * @param {string} factionId - Host's chosen faction ID
   * @param {string} playerName - Host's display name
   * @returns {Promise<{success:boolean, sessionId?:string, gameCode?:string, error?:string}>}
   */
  async createLobby(gameConfig: any, factionId: any, playerName: any) {
    if (dataBridge.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }

    const gameCode = generateGameCode();
    const result: any = await dataBridge.createNetworkLobby({
      gameCode,
      gameConfig,
      hostFactionId: factionId,
      hostName:      playerName,
      hostPlayerId:  (dataBridge.currentPlayer?.id ?? ''),
    });

    if (!result.success) return result;

    this.sessionId  = result.sessionId;
    this.gameCode   = gameCode;
    this.role       = 'host';
    this.sessionData = result.sessionData ?? null;

    await this._subscribeToSession(result.sessionId);
    return { success: true, sessionId: result.sessionId, gameCode };
  }

  /**
   * Start the game from the lobby (host only).
   * Updates session status to 'active' and broadcasts 'game_started' to all guests.
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async startGame() {
    if (this.role !== 'host') {
      return { success: false, error: 'Only the host can start the game.' };
    }
    if (!this.sessionId) {
      return { success: false, error: 'No active session.' };
    }

    const result = await dataBridge.updateNetworkSessionStatus(this.sessionId, 'active');
    if (!result.success) return result;

    if (this._channel) {
      this._channel.send({
        type:    'broadcast',
        event:   'game_started',
        payload: { gameConfig: this.sessionData?.game_config ?? {} },
      });
    }
    return { success: true };
  }

  // ─── Guest actions ────────────────────────────────────────────────────────────

  /**
   * Join an existing network lobby (guest only).
   * @param {string} gameCode - 6-character game code
   * @param {string} factionId - Guest's chosen faction ID
   * @param {string} playerName - Guest's display name
   * @returns {Promise<{success:boolean, sessionId?:string, sessionData?:object, error?:string}>}
   */
  async joinLobby(gameCode: any, factionId: any, playerName: any) {
    if (dataBridge.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }

    const result: any = await dataBridge.joinNetworkLobby({
      gameCode:   gameCode.toUpperCase(),
      factionId,
      playerName,
      playerId: (dataBridge.currentPlayer?.id ?? ''),
    });

    if (!result.success) return result;

    this.sessionId   = result.sessionId;
    this.gameCode    = gameCode.toUpperCase();
    this.role        = 'guest';
    this.sessionData = result.sessionData ?? null;

    await this._subscribeToSession(result.sessionId);
    return { success: true, sessionId: result.sessionId, sessionData: result.sessionData };
  }

  // ─── Turn submission (FR-NF-003, FR-NF-004) ──────────────────────────────────

  /**
   * Submit this player's orders for the current turn.
   * Persists orders to the database and broadcasts submission to the host.
   * @param {object} orders - Serialized Action Phase orders
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async submitOrders(orders: any) {
    if (!this.sessionId) return { success: false, error: 'Not in a session.' };

    const playerId = dataBridge.currentPlayer?.id;
    const result: any  = await dataBridge.submitNetworkOrders(this.sessionId, playerId ?? '', orders);
    if (!result.success) return result;

    if (this._channel) {
      this._channel.send({
        type:    'broadcast',
        event:   'player_submitted',
        payload: { playerId },
      });
    }
    return { success: true };
  }

  /**
   * Broadcast the resolved turn state delta to all guests (host only).
   * @param {object} stateDelta - Changed game state fields (galaxy, resourceStates, currentTurn…)
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async broadcastResolution(stateDelta: any) {
    if (this.role !== 'host') {
      return { success: false, error: 'Only the host can broadcast resolution.' };
    }
    if (!this._channel) return { success: false, error: 'No active channel.' };

    const result = await dataBridge.updateNetworkSessionState(this.sessionId, stateDelta);
    if (!result.success) return result;

    this._channel.send({
      type:    'broadcast',
      event:   'turn_resolved',
      payload: { stateDelta },
    });
    return { success: true };
  }

  // ─── Ready state ──────────────────────────────────────────────────────────────

  /**
   * Mark this player as ready in the lobby.
   * Broadcasts 'player_ready' to all lobby members.
   */
  setReady() {
    if (!this._channel) return;
    const playerId = dataBridge.currentPlayer?.id;
    this._channel.send({
      type:    'broadcast',
      event:   'player_ready',
      payload: { playerId },
    });
  }

  // ─── Chat (FR-NF-001) ─────────────────────────────────────────────────────────

  /**
   * Send a lobby chat message to all connected players.
   * @param {string} message
   * @param {string} playerName
   */
  sendChatMessage(message: any, playerName: any) {
    if (!this._channel) return;
    this._channel.send({
      type:    'broadcast',
      event:   'chat_message',
      payload: { playerName, message, timestamp: Date.now() },
    });
  }

  // ─── Snapshot Request (spec 059 FR-SNP-008) ──────────────────────────────────

  /**
   * Request the host to write a fresh snapshot (used by reconnecting clients).
   */
  requestSnapshot() {
    if (!this._channel) return;
    this._channel.send({
      type:    'broadcast',
      event:   'request_snapshot',
      payload: { playerId: dataBridge.currentPlayer?.id, timestamp: Date.now() },
    });
  }

  // ─── Order validation (FR-NF-006) ────────────────────────────────────────────

  /**
   * Validate a player's submitted orders against the current game state.
   * Uses the same rules as single-player order validation.
   * @param {string} factionId - Faction whose orders to validate
   * @param {object} orders - Submitted orders payload
   * @param {object} gameState - Current game state (galaxy, resourceStates, …)
   * @returns {{ valid:boolean, errors:string[] }}
   */
  validateOrders(factionId: any, orders: any, gameState: any) {
    const errors = [];

    if (!orders || typeof orders !== 'object') {
      errors.push('Orders payload is missing or malformed.');
      return { valid: false, errors };
    }

    // Validate resource spend against available reserves
    if (orders.resourceSpend && typeof orders.resourceSpend === 'object') {
      const rsm = gameState.resourceStates?.[factionId];
      if (rsm) {
        const available = rsm.state?.available ?? {};
        for (const [resource, amount] of (Object.entries(orders.resourceSpend) as [string, any][])) {
          if ((available[resource] ?? 0) < amount) {
            errors.push(
              `Insufficient ${resource}: need ${amount}, have ${available[resource] ?? 0}.`
            );
          }
        }
      }
    }

    // Validate fleet moves reference existing systems
    if (Array.isArray(orders.fleetMoves)) {
      const systemIds = new Set((gameState.galaxy?.systems ?? []).map((s: any) => s.id));
      for (const move of orders.fleetMoves) {
        if (move.targetSystemId && !systemIds.has(move.targetSystemId)) {
          errors.push(`Fleet move targets non-existent system: ${move.targetSystemId}.`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Disconnect handling (FR-NF-005) ─────────────────────────────────────────

  /**
   * Begin a grace-period countdown for a disconnected guest.
   * If they don't reconnect within gracePeriodMs, fires 'network:playerKicked'
   * and the main-stage converts their faction to AI control.
   * @param {string} playerId
   */
  handleGuestDisconnect(playerId: any) {
    if (this._disconnectTimers.has(playerId)) return; // already counting
    console.log(`[NetworkSessionManager] Guest ${playerId} disconnected — grace timer started`);

    const timer = setTimeout(() => {
      this._disconnectTimers.delete(playerId);
      console.log(`[NetworkSessionManager] Grace period expired for ${playerId} — converting to AI`);
      window.dispatchEvent(new CustomEvent('network:playerKicked', {
        detail: { playerId, reason: 'disconnect_timeout' },
      }));
    }, this.gracePeriodMs);

    this._disconnectTimers.set(playerId, timer);
  }

  /**
   * Cancel the grace timer for a player who successfully reconnected.
   * @param {string} playerId
   */
  handleGuestReconnect(playerId: any) {
    const timer = this._disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this._disconnectTimers.delete(playerId);
      console.log(`[NetworkSessionManager] ${playerId} reconnected — grace timer cancelled`);
    }
  }

  /**
   * Promote the guest with the lowest ordinal to host when the current host disconnects.
   * Fires 'network:hostPromoted'.
   * @param {object[]} players - Session player list
   * @returns {string|null} New host player ID or null if no guests remain
   */
  promoteNewHost(players: any) {
    const currentId = dataBridge.currentPlayer?.id;
    const candidates = (players ?? [])
      .filter((p: any) => p.playerId !== currentId)
      .sort((a: any, b: any) => (a.ordinal ?? 99) - (b.ordinal ?? 99));

    if (candidates.length === 0) return null;

    const newHost = candidates[0];
    window.dispatchEvent(new CustomEvent('network:hostPromoted', {
      detail: { newHostPlayerId: newHost.playerId, newHostName: newHost.playerName },
    }));
    return newHost.playerId;
  }

  // ─── Expected players ─────────────────────────────────────────────────────────

  /**
   * Set which player IDs are expected to submit orders this turn.
   * Resets the submission tracking map.
   * @param {string[]} playerIds
   */
  setExpectedPlayers(playerIds: any) {
    this._expectedPlayers  = new Set(playerIds);
    this._submittedOrders.clear();
    this._allOrdersReceived = false;
  }

  // ─── Notification badge (FR-NF-007) ──────────────────────────────────────────

  /** Mark that the player has a pending turn waiting (async mode). */
  setPendingTurnNotification() {
    this.hasPendingTurnNotification = true;
    window.dispatchEvent(new CustomEvent('network:pendingTurn', { detail: {} }));
  }

  /** Clear the pending turn badge (player has opened the game). */
  clearPendingTurnNotification() {
    this.hasPendingTurnNotification = false;
    window.dispatchEvent(new CustomEvent('network:turnBadgeCleared', { detail: {} }));
  }

  // ─── Async Vote (spec 060 FR-MSW-005) ─────────────────────────────────────

  /**
   * Set the total player count for vote threshold calculation.
   * @param {number} count
   */
  setPlayerCount(count: any) {
    this._playerCount = count;
  }

  /**
   * Cast a vote requesting return to async mode (non-host only).
   * Broadcasts 'vote_async' to all session members.
   */
  requestAsyncVote() {
    if (!this._channel) return;
    const playerId = dataBridge.currentPlayer?.id;
    if (!playerId) return;

    this._channel.send({
      type:    'broadcast',
      event:   'vote_async',
      payload: { playerId },
    });
  }

  /**
   * Get the current async vote status.
   * @returns {{ current: number, required: number }}
   */
  getAsyncVoteStatus() {
    const required = Math.ceil(this._playerCount / 2);
    return { current: this._asyncVotes.size, required };
  }

  /**
   * Reset async votes (called when a new sync session starts).
   */
  resetAsyncVotes() {
    this._asyncVotes.clear();
    window.dispatchEvent(new CustomEvent('session:asyncVoteUpdate', {
      detail: this.getAsyncVoteStatus(),
    }));
  }

  /**
   * Handle an incoming async vote. If threshold met, host initiates transition.
   * @param {string} playerId
   * @private
   */
  _handleAsyncVote(playerId: any) {
    this._asyncVotes.add(playerId);
    const status = this.getAsyncVoteStatus();

    console.log(`[NetworkSessionManager] Async vote from ${playerId}: ${status.current}/${status.required}`);

    window.dispatchEvent(new CustomEvent('session:asyncVoteUpdate', {
      detail: status,
    }));

    // Check threshold — host triggers transition
    if (status.current >= status.required) {
      console.log('[NetworkSessionManager] Async vote threshold reached — requesting async mode.');
      // Import would be circular; use event to let MainStage/SessionPresenceManager handle it
      window.dispatchEvent(new CustomEvent('session:asyncVoteThresholdReached', {
        detail: { votes: status.current, required: status.required },
      }));
    }
  }

  // ─── Sync Pause Broadcast ─────────────────────────────────────────────────────

  /**
   * Broadcast a sync pause/unpause state change to all session members.
   * @param {boolean} paused - true to pause, false to resume
   */
  broadcastSyncPause(paused: any) {
    if (!this._channel) return;
    const playerId = dataBridge.currentPlayer?.id;
    this._channel.send({
      type:    'broadcast',
      event:   'sync_pause',
      payload: { paused, playerId },
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  /**
   * Disconnect from the session, remove the Realtime channel, and reset state.
   */
  async disconnect() {
    for (const timer of this._disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this._disconnectTimers.clear();

    if (this._channel && dataBridge.supabase) {
      await dataBridge.supabase.removeChannel(this._channel);
    }

    this._channel           = null;
    this.sessionId          = null;
    this.gameCode           = null;
    this.role               = null;
    this.sessionData        = null;
    this._allOrdersReceived = false;
    this.syncHostId         = null;
    this._asyncVotes.clear();
    this._playerCount       = 0;
    this._submittedOrders.clear();
    this._expectedPlayers.clear();

    // Remove sync-host event listeners
    window.removeEventListener('session:hostElected',     this._boundOnHostElected);
    window.removeEventListener('session:hostChanged',     this._boundOnHostChanged);
    window.removeEventListener('session:fallbackToAsync', this._boundOnFallbackToAsync);
  }

  // ─── Realtime subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to the Supabase Realtime channel for the given session.
   * Handles all broadcast events and presence tracking.
   * @param {string} sessionId
   * @private
   */
  async _subscribeToSession(sessionId: any) {
    if (!dataBridge.supabase) return;

    const channel = dataBridge.supabase
      .channel(`network_session_${sessionId}`)
      .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
        console.log('[NetworkSessionManager] player_joined:', payload);
        window.dispatchEvent(new CustomEvent('network:playerJoined', { detail: payload }));
      })
      .on('broadcast', { event: 'player_ready' }, ({ payload }) => {
        console.log('[NetworkSessionManager] player_ready:', payload);
        window.dispatchEvent(new CustomEvent('network:playerReady', { detail: payload }));
      })
      .on('broadcast', { event: 'player_submitted' }, ({ payload }) => {
        console.log('[NetworkSessionManager] player_submitted:', payload.playerId);
        this._submittedOrders.set(payload.playerId, true);
        window.dispatchEvent(new CustomEvent('network:playerSubmitted', { detail: payload }));
        this._checkAllSubmitted();
      })
      .on('broadcast', { event: 'turn_resolved' }, ({ payload }) => {
        console.log('[NetworkSessionManager] turn_resolved — applying delta');
        window.dispatchEvent(new CustomEvent('network:turnResolved', { detail: payload }));
      })
      .on('broadcast', { event: 'game_started' }, ({ payload }) => {
        console.log('[NetworkSessionManager] game_started');
        window.dispatchEvent(new CustomEvent('network:gameStarted', { detail: payload }));
      })
      .on('broadcast', { event: 'orders_rejected' }, ({ payload }) => {
        console.warn('[NetworkSessionManager] orders_rejected:', payload.errors);
        window.dispatchEvent(new CustomEvent('network:ordersRejected', { detail: payload }));
      })
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent('network:chatMessage', { detail: payload }));
      })
      .on('broadcast', { event: 'request_snapshot' }, ({ payload }) => {
        // Host-only: trigger an immediate out-of-cycle snapshot write (spec 059 FR-SNP-008)
        console.log('[NetworkSessionManager] request_snapshot from:', payload?.playerId);
        window.dispatchEvent(new CustomEvent('network:snapshotRequested', { detail: payload }));
      })
      .on('broadcast', { event: 'vote_async' }, ({ payload }) => {
        // Spec 060: Async mode vote from a non-host player
        const voterId = payload?.playerId;
        if (voterId) this._handleAsyncVote(voterId);
      })
      .on('broadcast', { event: 'sync_pause' }, ({ payload }) => {
        // Sync pause/unpause broadcast from another client
        console.log('[NetworkSessionManager] sync_pause:', payload?.paused, 'from:', payload?.playerId);
        window.dispatchEvent(new CustomEvent('network:syncPauseChanged', { detail: payload }));
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences) {
          this.handleGuestDisconnect(p.playerId ?? p.key);
          window.dispatchEvent(new CustomEvent('network:playerLeft', { detail: p }));
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences) {
          this.handleGuestReconnect(p.playerId ?? p.key);
          window.dispatchEvent(new CustomEvent('network:playerRejoined', { detail: p }));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            playerId:   dataBridge.currentPlayer?.id,
            playerName: (dataBridge.currentPlayer as any)?.user_metadata?.display_name ?? 'Player',
          });
          console.log(`[NetworkSessionManager] Subscribed to session ${sessionId}`);
        }
      });

    this._channel = channel;
  }

  /**
   * Emit 'network:allOrdersReceived' when all expected players have submitted.
   * Only the host uses this to trigger resolution.
   * @private
   */
  _checkAllSubmitted() {
    if (this.role !== 'host') return;
    if (this._expectedPlayers.size === 0) return;
    if (this._allOrdersReceived) return;

    const allIn = [...this._expectedPlayers].every(id => this._submittedOrders.has(id));
    if (allIn) {
      this._allOrdersReceived = true;
      console.log('[NetworkSessionManager] All players submitted — triggering resolution');
      window.dispatchEvent(new CustomEvent('network:allOrdersReceived', {
        detail: { orders: Object.fromEntries(this._submittedOrders) },
      }));
    }
  }
}

export const networkSessionManager = new NetworkSessionManager();

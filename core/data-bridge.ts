/// <reference types="vite/client" />
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { FEATURES } from './feature-flags.js';

class DataBridge {
  supabase: SupabaseClient | null = null;
  currentPlayer: User | { id: string; email: string } | null = null;
  offlineMode: boolean = true;

  constructor() {}

  initialize() {
    const apiUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (apiUrl && apiKey) {
      this.supabase = createClient(apiUrl, apiKey);
      this.offlineMode = false;
      console.log('[DataBridge] Connected to cloud');
    } else {
      console.log('[DataBridge] Running in offline mode');
    }
  }

  /**
   * Return the raw Supabase client, or null when running in offline mode.
   * Used by SessionPresenceManager (and future modules) that need direct
   * channel/table access without duplicating client creation.
   * @returns {import('@supabase/supabase-js').SupabaseClient | null}
   */
  getClient() {
    return this.offlineMode ? null : this.supabase;
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (this.offlineMode) {
      this.currentPlayer = { id: 'local_' + Date.now(), email };
      return { success: true };
    }

    const { data, error } = await this.supabase!.auth.signInWithPassword({
      email, password
    });

    if (error) return { success: false, error: error.message };
    
    this.currentPlayer = data.user;
    return { success: true };
  }

  async signUp(email: string, password: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    if (this.offlineMode) {
      this.currentPlayer = { id: 'local_' + Date.now(), email };
      return { success: true };
    }

    if (!FEATURES.SIGNUPS) {
      return { success: false, error: 'Sign-ups are currently closed.' };
    }

    const { data, error } = await this.supabase!.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } }
    });

    if (error) return { success: false, error: error.message };

    if (data.user) {
      await this.supabase!.from('commander_profiles').insert({
        id: data.user.id,
        alias: displayName,
        territories_held: 0,
        total_influence: 0,
        session_timestamp: new Date().toISOString()
      });
    }

    this.currentPlayer = data.user;
    return { success: true };
  }

  async fetchProgress(playerId: string): Promise<unknown> {
    if (this.offlineMode) {
      try {
        const stored = localStorage.getItem('galaxy_progress');
        return stored ? JSON.parse(stored) : { sectors: [], energy: 100 };
      } catch (err) {
        console.error('[DataBridge] Failed to parse stored progress:', err);
        return { sectors: [], energy: 100 };
      }
    }

    const { data } = await this.supabase!
      .from('galaxy_snapshots')
      .select('*')
      .eq('commander_id', playerId)
      .maybeSingle();

    return data || { sectors: [], energy: 100 };
  }

  async storeProgress(playerId: string, sectors: unknown, energy: number): Promise<boolean> {
    if (this.offlineMode) {
      try {
        localStorage.setItem('galaxy_progress', JSON.stringify({ sectors, energy }));
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to store progress:', err);
        return false;
      }
    }

    const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
      commander_id: playerId,
      territories: sectors,
      influence: energy,
      snapshot_timestamp: new Date().toISOString()
    });

    return !error;
  }

  /**
   * Save faction state for the current player.
   * @param {string} factionId - Faction identifier (e.g. 'brandAuthority', 'union', 'autoforge')
   * @param {Object} factionState - Serialized faction state (from FactionStateManager.serialize())
   * @returns {boolean} Success
   */
  async saveFactionState(factionId: string, factionState: unknown): Promise<boolean> {
    const key = this._factionStateKey();
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, JSON.stringify(factionState));
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save faction state:', err);
        return false;
      }
    }

    // Cloud mode: store faction state in the per-faction column of galaxy_snapshots
    const column = this._factionStateColumn(factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveFactionState: ${factionId}`);
      return false;
    }

    const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
      commander_id: this.currentPlayer?.id,
      [column]: factionState,
      snapshot_timestamp: new Date().toISOString()
    });

    if (error) {
      console.error('[DataBridge] Failed to save faction state to cloud:', error);
    }
    return !error;
  }

  /**
   * Load faction state for the current player.
   * @param {string} factionId - Faction identifier (e.g. 'brandAuthority', 'union', 'autoforge')
   * @returns {Object|null} Serialized faction state or null if not found
   */
  async loadFactionState(factionId: string): Promise<unknown> {
    const key = this._factionStateKey();
    if (this.offlineMode) {
      try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      } catch (err) {
        console.error('[DataBridge] Failed to load faction state:', err);
        return null;
      }
    }

    const column = this._factionStateColumn(factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for loadFactionState: ${factionId}`);
      return null;
    }

    const { data } = await this.supabase!
      .from('galaxy_snapshots')
      .select(column)
      .eq('commander_id', this.currentPlayer?.id)
      .maybeSingle();

    return (data as any)?.[column] ?? null;
  }

  /**
   * Clear saved faction state for the current player.
   * @param {string} factionId - Faction identifier (e.g. 'brandAuthority', 'union', 'autoforge')
   * @returns {boolean} Success
   */
  async clearFactionState(factionId: string): Promise<boolean> {
    const key = this._factionStateKey();
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return true;
    }

    const column = this._factionStateColumn(factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for clearFactionState: ${factionId}`);
      return false;
    }

    // Cloud mode: upsert with null for the per-faction column
    const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
      commander_id: this.currentPlayer?.id,
      [column]: null,
      snapshot_timestamp: new Date().toISOString()
    });
    return !error;
  }

  /**
   * Build the per-faction column name for a given state prefix.
   * Supabase stores state in columns like:
   *   faction_state_brandauthority, fleet_state_union, tech_state_autoforge, etc.
   * Faction IDs in code are camelCase (e.g. 'brandAuthority') but column
   * suffixes are all-lowercase ('brandauthority').
   * @param {string} prefix - Column prefix, e.g. 'faction_state', 'fleet_state'
   * @param {string} factionId - e.g. 'brandAuthority', 'union', 'autoforge'
   * @returns {string|null} Full column name, or null for unknown faction
   * @private
   */
  _perFactionColumn(prefix: string, factionId: string): string | null {
    const KNOWN_FACTIONS = ['brandAuthority', 'union', 'autoforge'];
    if (!KNOWN_FACTIONS.includes(factionId)) return null;
    return `${prefix}_${factionId.toLowerCase()}`;
  }

  /** Convenience alias kept for clarity in faction-state methods. @private */
  _factionStateColumn(factionId: string): string | null {
    return this._perFactionColumn('faction_state', factionId);
  }

  /** @private */
  _factionStateKey() {
    const playerId = this.currentPlayer?.id ?? 'local';
    return `faction_state_${playerId}`;
  }

  /** @private */
  _resourceStateKey(factionId: string): string {
    const playerId = this.currentPlayer?.id ?? 'local';
    return `resource_state_${playerId}_${factionId}`;
  }

  /**
   * Save serialized resource state for a faction.
   * @param {string} factionId
   * @param {string} serializedState - JSON string from ResourceStateManager.serialize()
   * @returns {boolean} Success
   */
  async saveResourceState(factionId: string, serializedState: string): Promise<boolean> {
    const key = this._resourceStateKey(factionId);
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, serializedState);
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save resource state:', err);
        return false;
      }
    }

    // Cloud mode: store in per-faction column of galaxy_snapshots
    const column = this._perFactionColumn('resource_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveResourceState: ${factionId}`);
      return false;
    }
    const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
      commander_id: this.currentPlayer?.id,
      [column]: JSON.parse(serializedState),
      snapshot_timestamp: new Date().toISOString()
    });

    if (error) {
      console.error('[DataBridge] Failed to save resource state to cloud:', error);
    }
    return !error;
  }

  /**
   * Load serialized resource state for a faction.
   * @param {string} factionId
   * @returns {string|null} JSON string or null if not found
   */
  async loadResourceState(factionId: string): Promise<unknown> {
    const key = this._resourceStateKey(factionId);
    if (this.offlineMode) {
      try {
        return localStorage.getItem(key) ?? null;
      } catch (err) {
        console.error('[DataBridge] Failed to load resource state:', err);
        return null;
      }
    }

    const column = this._perFactionColumn('resource_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for loadResourceState: ${factionId}`);
      return null;
    }
    const { data } = await this.supabase!
      .from('galaxy_snapshots')
      .select(column)
      .eq('commander_id', this.currentPlayer?.id)
      .maybeSingle();

    const stateObj = (data as any)?.[column];
    return stateObj ? JSON.stringify(stateObj) : null;
  }

  /**
   * Delete saved resource state for a faction.
   * @param {string} factionId
   * @returns {boolean} Success
   */
  async clearResourceState(factionId: string): Promise<boolean> {
    const key = this._resourceStateKey(factionId);
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return true;
    }
    // Cloud: upsert with null for per-faction column
    const column = this._perFactionColumn('resource_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for clearResourceState: ${factionId}`);
      return false;
    }
    const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
      commander_id: this.currentPlayer?.id,
      [column]: null,
      snapshot_timestamp: new Date().toISOString()
    });
    return !error;
  }

  getPlayer() {
    return this.currentPlayer;
  }

  // ─── Victory State Persistence ────────────────────────────────────────────

  /**
   * Save serialized victory progress state for a faction.
   * @param {string} factionId
   * @param {string} serializedState - JSON string from VictoryStateManager.serialize()
   * @returns {boolean} Success
   */
  async saveVictoryState(factionId: string, serializedState: string): Promise<boolean> {
    const key = `branded_galaxy_victory_${factionId}`;
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, serializedState);
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save victory state:', err);
        return false;
      }
    }

    // Cloud mode: store in per-faction column of galaxy_snapshots
    const column = this._perFactionColumn('victory_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveVictoryState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: this.currentPlayer?.id,
        [column]: JSON.parse(serializedState),
        snapshot_timestamp: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save victory state to cloud:', error);
      return !error;
    } catch (err) {
      console.error('[DataBridge] Victory state cloud save error:', err);
      return false;
    }
  }

  // ─── Tech State Persistence ────────────────────────────────────────────────

  /**
   * Save serialized tech state for a faction.
   * @param {string} factionId
   * @param {string} serializedState - JSON string from TechStateManager.serialize()
   * @returns {boolean} Success
   */
  async saveTechState(factionId: string, serializedState: string): Promise<boolean> {
    const key = `branded_galaxy_tech_${factionId}`;
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, serializedState);
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save tech state:', err);
        return false;
      }
    }

    const column = this._perFactionColumn('tech_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveTechState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: this.currentPlayer?.id,
        [column]: JSON.parse(serializedState),
        snapshot_timestamp: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save tech state to cloud:', error);
      return !error;
    } catch (err) {
      console.error('[DataBridge] Tech state cloud save error:', err);
      return false;
    }
  }

  /**
   * Load serialized tech state for a faction.
   * @param {string} factionId
   * @returns {string|null} JSON string or null if not found
   */
  async loadTechState(factionId: string): Promise<unknown> {
    const key = `branded_galaxy_tech_${factionId}`;
    if (this.offlineMode) {
      try {
        return localStorage.getItem(key) ?? null;
      } catch (err) {
        console.error('[DataBridge] Failed to load tech state:', err);
        return null;
      }
    }

    const column = this._perFactionColumn('tech_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for loadTechState: ${factionId}`);
      return null;
    }
    try {
      const { data } = await this.supabase!
        .from('galaxy_snapshots')
        .select(column)
        .eq('commander_id', this.currentPlayer?.id)
        .maybeSingle();

      const stateObj = (data as any)?.[column];
      return stateObj ? JSON.stringify(stateObj) : null;
    } catch (err) {
      console.error('[DataBridge] Tech state cloud load error:', err);
      return null;
    }
  }

  /**
   * Clear saved tech state for a faction.
   * @param {string} factionId
   * @returns {boolean} Success
   */
  async clearTechState(factionId: string): Promise<boolean> {
    const key = `branded_galaxy_tech_${factionId}`;
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return true;
    }
    const column = this._perFactionColumn('tech_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for clearTechState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: this.currentPlayer?.id,
        [column]: null,
        snapshot_timestamp: new Date().toISOString()
      });
      return !error;
    } catch (err) {
      console.error('[DataBridge] Tech state cloud clear error:', err);
      return false;
    }
  }

  /**
   * Save serialized turn state (phase, pendingActions, turnSummary, currentTurn).
   * @param {string} serializedState - JSON string from TurnStateManager.serialize()
   * @returns {boolean} Success
   */
  async saveTurnState(serializedState: string): Promise<boolean> {
    const player = this.currentPlayer;
    const key = `branded_galaxy_turn_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, serializedState);
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save turn state:', err);
        return false;
      }
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: player?.id,
        turn_state: JSON.parse(serializedState),
        snapshot_timestamp: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save turn state to cloud:', error);
      return !error;
    } catch (err) {
      console.error('[DataBridge] Turn state cloud save error:', err);
      return false;
    }
  }

  /**
   * Load serialized turn state.
   * @returns {string|null} JSON string or null if not found
   */
  async loadTurnState() {
    const player = this.currentPlayer;
    const key = `branded_galaxy_turn_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      try {
        return localStorage.getItem(key) ?? null;
      } catch (err) {
        console.error('[DataBridge] Failed to load turn state:', err);
        return null;
      }
    }
    try {
      const { data } = await this.supabase!
        .from('galaxy_snapshots')
        .select('turn_state')
        .eq('commander_id', player?.id)
        .maybeSingle();
      const stateObj = data?.turn_state;
      return stateObj ? JSON.stringify(stateObj) : null;
    } catch (err) {
      console.error('[DataBridge] Turn state cloud load error:', err);
      return null;
    }
  }

  /**
   * Clear saved turn state.
   * @returns {boolean} Success
   */
  async clearTurnState() {
    const player = this.currentPlayer;
    const key = `branded_galaxy_turn_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return true;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: player?.id,
        turn_state: null,
        snapshot_timestamp: new Date().toISOString()
      });
      return !error;
    } catch (err) {
      console.error('[DataBridge] Turn state cloud clear error:', err);
      return false;
    }
  }

  // ─── Fleet State Persistence ────────────────────────────────────────────────

  /**
   * Save serialized fleet state for a specific faction.
   * @param {string} factionId - e.g. 'brandAuthority', 'union', 'autoforge'
   * @param {string} serializedState - JSON string of fleet data for this faction
   * @returns {boolean} Success
   */
  async saveFleetState(factionId: string, serializedState: string): Promise<boolean> {
    const player = this.currentPlayer;
    const key = `branded_galaxy_fleet_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      try {
        // Offline: merge into single localStorage blob keyed by faction
        const existing = JSON.parse(localStorage.getItem(key) ?? '{}');
        existing[factionId] = JSON.parse(serializedState);
        localStorage.setItem(key, JSON.stringify(existing));
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save fleet state:', err);
        return false;
      }
    }
    const column = this._perFactionColumn('fleet_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveFleetState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: player?.id,
        [column]: JSON.parse(serializedState),
        snapshot_timestamp: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save fleet state to cloud:', error);
      return !error;
    } catch (err) {
      console.error('[DataBridge] Fleet state cloud save error:', err);
      return false;
    }
  }

  /**
   * Load serialized fleet state for a specific faction.
   * @param {string} factionId - e.g. 'brandAuthority', 'union', 'autoforge'
   * @returns {string|null} JSON string or null if not found
   */
  async loadFleetState(factionId: string): Promise<unknown> {
    const player = this.currentPlayer;
    const key = `branded_galaxy_fleet_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      try {
        const blob = JSON.parse(localStorage.getItem(key) ?? '{}');
        const factionData = blob[factionId];
        return factionData ? JSON.stringify(factionData) : null;
      } catch (err) {
        console.error('[DataBridge] Failed to load fleet state:', err);
        return null;
      }
    }
    const column = this._perFactionColumn('fleet_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for loadFleetState: ${factionId}`);
      return null;
    }
    try {
      const { data } = await this.supabase!
        .from('galaxy_snapshots')
        .select(column)
        .eq('commander_id', player?.id)
        .maybeSingle();
      const stateObj = (data as any)?.[column];
      return stateObj ? JSON.stringify(stateObj) : null;
    } catch (err) {
      console.error('[DataBridge] Fleet state cloud load error:', err);
      return null;
    }
  }

  /**
   * Load fleet state for ALL factions and merge into a single object
   * compatible with FleetStateManager.deserialize().
   * @returns {string|null} JSON string of merged fleet data, or null
   */
  async loadAllFleetState() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
    const merged: any = { fleets: {}, productionQueues: {}, combatLog: [] };
    let foundAny = false;

    for (const fid of FACTION_IDS) {
      const serialized = await this.loadFleetState(fid);
      if (serialized) {
        try {
          const parsed = JSON.parse(serialized as string);
          // Merge per-faction data
          if (parsed.fleets) Object.assign(merged.fleets, parsed.fleets);
          if (parsed.productionQueues) Object.assign(merged.productionQueues, parsed.productionQueues);
          if (parsed.combatLog?.length) merged.combatLog = parsed.combatLog;
          // Keep the highest counters
          if (parsed._fleetIdCounter) merged._fleetIdCounter = Math.max(merged._fleetIdCounter ?? 0, parsed._fleetIdCounter);
          if (parsed._shipIdCounter) merged._shipIdCounter = Math.max(merged._shipIdCounter ?? 0, parsed._shipIdCounter);
          if (parsed._prodSeq) merged._prodSeq = Math.max(merged._prodSeq ?? 0, parsed._prodSeq);
          foundAny = true;
        } catch (err) {
          console.warn(`[DataBridge] Failed to parse fleet state for ${fid}:`, err);
        }
      }
    }
    return foundAny ? JSON.stringify(merged) : null;
  }

  /**
   * Clear saved fleet state for a specific faction.
   * @param {string} factionId
   * @returns {boolean} Success
   */
  async clearFleetState(factionId: string): Promise<boolean> {
    const player = this.currentPlayer;
    const key = `branded_galaxy_fleet_state_${player?.id ?? 'local'}`;
    if (this.offlineMode) {
      try {
        const blob = JSON.parse(localStorage.getItem(key) ?? '{}');
        delete blob[factionId];
        localStorage.setItem(key, JSON.stringify(blob));
        return true;
      } catch {
        localStorage.removeItem(key);
        return true;
      }
    }
    const column = this._perFactionColumn('fleet_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for clearFleetState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: player?.id,
        [column]: null,
        snapshot_timestamp: new Date().toISOString()
      });
      return !error;
    } catch (err) {
      console.error('[DataBridge] Fleet state cloud clear error:', err);
      return false;
    }
  }

  // ─── Character State Persistence ─────────────────────────────────────────────

  /**
   * Save serialized character state for a faction.
   * @param {string} factionId
   * @param {string} serializedState - JSON string from CharacterStateManager.serialize()
   * @returns {boolean} Success
   */
  async saveCharacterState(factionId: string, serializedState: string): Promise<boolean> {
    const key = `branded_galaxy_characters_${factionId}`;
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, serializedState);
        return true;
      } catch (err) {
        console.error('[DataBridge] Failed to save character state:', err);
        return false;
      }
    }
    const column = this._perFactionColumn('character_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for saveCharacterState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: this.currentPlayer?.id,
        [column]: JSON.parse(serializedState),
        snapshot_timestamp: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save character state to cloud:', error);
      return !error;
    } catch (err) {
      console.error('[DataBridge] Character state cloud save error:', err);
      return false;
    }
  }

  /**
   * Load serialized character state for a faction.
   * @param {string} factionId
   * @returns {string|null} JSON string or null if not found
   */
  async loadCharacterState(factionId: string): Promise<unknown> {
    const key = `branded_galaxy_characters_${factionId}`;
    if (this.offlineMode) {
      try {
        return localStorage.getItem(key) ?? null;
      } catch (err) {
        console.error('[DataBridge] Failed to load character state:', err);
        return null;
      }
    }
    const column = this._perFactionColumn('character_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for loadCharacterState: ${factionId}`);
      return null;
    }
    try {
      const { data } = await this.supabase!
        .from('galaxy_snapshots')
        .select(column)
        .eq('commander_id', this.currentPlayer?.id)
        .maybeSingle();
      const stateObj = (data as any)?.[column];
      return stateObj ? JSON.stringify(stateObj) : null;
    } catch (err) {
      console.error('[DataBridge] Character state cloud load error:', err);
      return null;
    }
  }

  /**
   * Clear saved character state for a faction.
   * @param {string} factionId
   * @returns {boolean} Success
   */
  async clearCharacterState(factionId: string): Promise<boolean> {
    const key = `branded_galaxy_characters_${factionId}`;
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return true;
    }
    const column = this._perFactionColumn('character_state', factionId);
    if (!column) {
      console.error(`[DataBridge] Unknown faction ID for clearCharacterState: ${factionId}`);
      return false;
    }
    try {
      const { error } = await this.supabase!.from('galaxy_snapshots').upsert({
        commander_id: this.currentPlayer?.id,
        [column]: null,
        snapshot_timestamp: new Date().toISOString()
      });
      return !error;
    } catch (err) {
      console.error('[DataBridge] Character state cloud clear error:', err);
      return false;
    }
  }

  // ─── Unified Save Slots ────────────────────────────────────────────────────

  /**
   * Build a namespaced localStorage key for a save slot.
   * @param {string} slotId - 'auto' | '1'–'5'
   * @returns {string}
   * @private
   */
  _saveSlotKey(slotId: string): string {
    const playerId = this.currentPlayer?.id ?? 'local';
    return `branded_galaxy_save_${playerId}_${slotId}`;
  }

  /**
   * Persist a full game-state snapshot to a save slot.
   * @param {string} slotId  - 'auto' | '1'–'5'
   * @param {Object} saveData - Snapshot object from SaveStateManager.createSnapshot()
   * @returns {{ success: boolean, error?: string }}
   */
  async saveGameState(slotId: string, saveData: unknown): Promise<{ success: boolean; error?: string }> {
    const key = this._saveSlotKey(slotId);
    if (this.offlineMode) {
      try {
        localStorage.setItem(key, JSON.stringify(saveData));
        return { success: true };
      } catch (err) {
        console.error('[DataBridge] Failed to save game state:', err);
        return { success: false, error: (err as Error).message };
      }
    }
    // Cloud mode
    try {
      const { error } = await this.supabase!.from('game_saves').upsert({
        user_id:    this.currentPlayer?.id,
        slot_id:    slotId,
        save_data:  saveData,
        updated_at: new Date().toISOString()
      });
      if (error) console.error('[DataBridge] Failed to save game state to cloud:', error);
      return { success: !error, error: error?.message };
    } catch (err) {
      console.error('[DataBridge] saveGameState cloud error:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Load a full game-state snapshot from a save slot.
   * @param {string} slotId - 'auto' | '1'–'5'
   * @returns {Object|null} Snapshot object or null if slot is empty
   */
  async loadGameState(slotId: string): Promise<unknown> {
    const key = this._saveSlotKey(slotId);
    if (this.offlineMode) {
      try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      } catch (err) {
        console.error('[DataBridge] Failed to load game state:', err);
        return null;
      }
    }
    try {
      const { data } = await this.supabase!
        .from('game_saves')
        .select('save_data')
        .eq('user_id', this.currentPlayer?.id)
        .eq('slot_id', slotId)
        .maybeSingle();
      return data?.save_data ?? null;
    } catch (err) {
      console.error('[DataBridge] loadGameState cloud error:', err);
      return null;
    }
  }

  /**
   * Delete a save slot permanently.
   * @param {string} slotId - 'auto' | '1'–'5'
   * @returns {{ success: boolean, error?: string }}
   */
  async deleteGameState(slotId: string): Promise<{ success: boolean; error?: string }> {
    const key = this._saveSlotKey(slotId);
    if (this.offlineMode) {
      localStorage.removeItem(key);
      return { success: true };
    }
    try {
      const { error } = await this.supabase!
        .from('game_saves')
        .delete()
        .eq('user_id', this.currentPlayer?.id)
        .eq('slot_id', slotId);
      return { success: !error, error: error?.message };
    } catch (err) {
      console.error('[DataBridge] deleteGameState cloud error:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * List all save slots with their metadata (or mark empty).
   * Returns an array in order: ['auto', '1', '2', '3', '4', '5'].
   * @returns {Promise<Array<{slotId, empty, slotName?, factionId?, turn?, timestamp?, saveVersion?}>>}
   */
  async listSaveSlots() {
    const slotIds = ['auto', '1', '2', '3', '4', '5'];
    const slots   = [];
    for (const slotId of slotIds) {
      try {
        const save = await this.loadGameState(slotId) as any;
        if (save) {
          slots.push({
            slotId,
            empty:       false,
            slotName:    save.slotName,
            factionId:   save.factionId,
            turn:        save.turn,
            timestamp:   save.timestamp,
            saveVersion: save.saveVersion,
            hotSeat:     !!(save.hotSeatState)
          });
        } else {
          slots.push({ slotId, empty: true });
        }
      } catch {
        slots.push({ slotId, empty: true });
      }
    }
    return slots;
  }

  // ─── Network Multiplayer (spec 050) ──────────────────────────────────────────

  /**
   * Create a new network lobby session in Supabase.
   * @param {{gameCode:string, gameConfig:object, hostFactionId:string, hostName:string, hostPlayerId:string}} opts
   * @returns {Promise<{success:boolean, sessionId?:string, sessionData?:object, error?:string}>}
   */
  async createNetworkLobby({ gameCode, gameConfig, hostFactionId, hostName, hostPlayerId }: { gameCode: string; gameConfig: unknown; hostFactionId: string; hostName: string; hostPlayerId: string }): Promise<unknown> {
    if (this.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const players = [{
        playerId: hostPlayerId, factionId: hostFactionId,
        playerName: hostName, isHost: true, isReady: false, ordinal: 0,
      }];
      const { data, error } = await this.supabase!
        .from('network_sessions')
        .insert({
          game_code: gameCode, game_config: gameConfig,
          status: 'lobby', players,
          created_at: new Date().toISOString(), expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (error) {
        console.error('[DataBridge] createNetworkLobby error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, sessionId: data.id, sessionData: { id: data.id, game_code: gameCode, game_config: gameConfig, status: 'lobby', players } };
    } catch (err) {
      console.error('[DataBridge] createNetworkLobby exception:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Join an existing network lobby by game code.
   * @param {{gameCode:string, factionId:string, playerName:string, playerId:string}} opts
   * @returns {Promise<{success:boolean, sessionId?:string, sessionData?:object, error?:string}>}
   */
  async joinNetworkLobby({ gameCode, factionId, playerName, playerId }: { gameCode: string; factionId: string; playerName: string; playerId: string }): Promise<unknown> {
    if (this.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }
    try {
      const { data: session, error: findErr } = await this.supabase!
        .from('network_sessions')
        .select('*')
        .eq('game_code', gameCode)
        .eq('status', 'lobby')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (findErr || !session) {
        return { success: false, error: 'Game code not found or lobby has expired.' };
      }
      const players = session.players ?? [];
      if (players.length >= 3) {
        return { success: false, error: 'This lobby is full (max 3 players).' };
      }
      if (players.some((p: any) => p.factionId === factionId)) {
        return { success: false, error: 'That faction is already taken.' };
      }
      const updatedPlayers = [...players, {
        playerId, factionId, playerName,
        isHost: false, isReady: false, ordinal: players.length,
      }];
      const { error: updateErr } = await this.supabase!
        .from('network_sessions')
        .update({ players: updatedPlayers })
        .eq('id', session.id);
      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
      const sessionData = { ...session, players: updatedPlayers };
      return { success: true, sessionId: session.id, sessionData };
    } catch (err) {
      console.error('[DataBridge] joinNetworkLobby exception:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Submit a player's orders for the current network turn.
   * @param {string} sessionId
   * @param {string} playerId
   * @param {object} orders
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async submitNetworkOrders(sessionId: string, playerId: string, orders: unknown): Promise<{ success: boolean; error?: string }> {
    if (this.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }
    try {
      const { error } = await this.supabase!
        .from('network_orders')
        .upsert({
          session_id: sessionId, player_id: playerId,
          orders, submitted_at: new Date().toISOString(),
        });
      if (error) {
        console.error('[DataBridge] submitNetworkOrders error:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[DataBridge] submitNetworkOrders exception:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Fetch the current state of a network session.
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async fetchNetworkSession(sessionId: string): Promise<unknown> {
    if (this.offlineMode) return null;
    try {
      const { data } = await this.supabase!
        .from('network_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      return data ?? null;
    } catch (err) {
      console.error('[DataBridge] fetchNetworkSession exception:', err);
      return null;
    }
  }

  /**
   * Broadcast a resolved-turn state delta (host only).
   * @param {string} sessionId
   * @param {object} stateDelta
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async updateNetworkSessionState(sessionId: string, stateDelta: unknown): Promise<{ success: boolean; error?: string }> {
    if (this.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }
    try {
      const { error } = await this.supabase!
        .from('network_sessions')
        .update({
          game_state_delta: stateDelta,
          last_resolution_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      if (error) {
        console.error('[DataBridge] updateNetworkSessionState error:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[DataBridge] updateNetworkSessionState exception:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Update the status field of a network session (e.g. 'lobby' → 'active').
   * @param {string} sessionId
   * @param {string} status
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async updateNetworkSessionStatus(sessionId: string, status: string): Promise<{ success: boolean; error?: string }> {
    if (this.offlineMode) {
      return { success: false, error: 'Network play requires Supabase credentials.' };
    }
    try {
      const { error } = await this.supabase!
        .from('network_sessions')
        .update({ status })
        .eq('id', sessionId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      console.error('[DataBridge] updateNetworkSessionStatus exception:', err);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Load serialized victory progress state for a faction.
   * @param {string} factionId
   * @returns {string|null} JSON string or null if not found
   */
  async loadVictoryState(factionId: string): Promise<unknown> {
    const key = `branded_galaxy_victory_${factionId}`;
    if (this.offlineMode) {
      try {
        return localStorage.getItem(key) ?? null;
      } catch (err) {
        console.error('[DataBridge] Failed to load victory state:', err);
        return null;
      }
    }

    try {
      const column = this._perFactionColumn('victory_state', factionId);
      if (!column) {
        console.error(`[DataBridge] Unknown faction ID for loadVictoryState: ${factionId}`);
        return null;
      }
      const { data } = await this.supabase!
        .from('galaxy_snapshots')
        .select(column)
        .eq('commander_id', this.currentPlayer?.id)
        .maybeSingle();

      const stateObj = (data as any)?.[column];
      return stateObj ? JSON.stringify(stateObj) : null;
    } catch (err) {
      console.error('[DataBridge] Victory state cloud load error:', err);
      return null;
    }
  }
}

export const dataBridge = new DataBridge();

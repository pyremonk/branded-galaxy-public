/**
 * IntelStateManager — Per-faction intel store.
 *
 * Stores discrete intel items acquired through fleet patrols, spy missions,
 * outpost networks, and reconnaissance. Items expire after a fixed number of
 * turns and are purged during the Maintenance Phase.
 *
 * Specs: 042-intel-system-spec.md (FR-IS-001 through FR-IS-007)
 */

// ─── Intel item type definitions ─────────────────────────────────────────────

export const INTEL_TYPES = {
  SYSTEM_LOYALTY:    'system_loyalty',
  FLEET_COMPOSITION: 'fleet_composition',
  FACILITY_STATUS:   'facility_status',
  CHARACTER_LOCATION:'character_location',
  RESOURCE_OUTPUT:   'resource_output',
  EVENT_WARNING:     'event_warning',
};

// Base expiry durations per type (FR-IS-002)
export const INTEL_BASE_DURATION = {
  [INTEL_TYPES.SYSTEM_LOYALTY]:    3,
  [INTEL_TYPES.FLEET_COMPOSITION]: 2,
  [INTEL_TYPES.FACILITY_STATUS]:   4,
  [INTEL_TYPES.CHARACTER_LOCATION]:1,
  [INTEL_TYPES.RESOURCE_OUTPUT]:   3,
  [INTEL_TYPES.EVENT_WARNING]:     1,
};

// Maximum active intel items per faction (FR-IS-002)
const INTEL_CAP = 50;

// Monotonic counter for unique IDs
let _intelIdCounter = 1;
function _newIntelId() { return `intel-${_intelIdCounter++}`; }

// ─── IntelStateManager ────────────────────────────────────────────────────────

export class IntelStateManager {
  intelStores: any = {};

  /**
   * @param {string[]} factionIds - All active faction IDs
   */
  constructor(factionIds: any) {
    /**
     * intelStores: factionId → IntelItem[]
     * IntelItem: {
     *   id: string,
     *   type: string,
     *   systemId: string,
     *   targetFactionId: string,
     *   data: Object,
     *   revealedOnTurn: number,
     *   expiresOnTurn: number,
     *   source: 'patrol' | 'mission' | 'outpost' | 'event',
     *   false: boolean   // false intel planted by enemy (FR-CI-004); internal only
     * }
     */
    this.intelStores = {};

    for (const factionId of factionIds) {
      this.intelStores[factionId] = [];
    }
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  /**
   * Get all active (non-expired) intel items for a faction.
   * @param {string} factionId
   * @param {number} currentTurn
   * @returns {Object[]}
   */
  getActiveItems(factionId: any, currentTurn: any) {
    return (this.intelStores[factionId] ?? []).filter(
      (item: any) => item.expiresOnTurn > currentTurn
    );
  }

  /**
   * Get all intel items for a faction (including expired, for serialization).
   * @param {string} factionId
   * @returns {Object[]}
   */
  getAllItems(factionId: any) {
    return this.intelStores[factionId] ?? [];
  }

  /**
   * Check whether a faction has any active intel for a given system.
   * @param {string} factionId
   * @param {string} systemId
   * @param {number} currentTurn
   * @returns {boolean}
   */
  hasActiveIntel(factionId: any, systemId: any, currentTurn: any) {
    return this.getActiveItems(factionId, currentTurn).some((i: any) => i.systemId === systemId);
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  /**
   * Add an intel item for a faction.
   * - If an item of the same type+systemId already exists and has not expired,
   *   refresh its expiresOnTurn instead of adding a duplicate (FR-IS-007).
   * - Discards oldest items when over cap (FR-IS-002).
   *
   * @param {string} factionId
   * @param {Object} item - Partial item; id and expiresOnTurn will be set if absent
   * @returns {Object} The stored item
   */
  addIntelItem(factionId: any, item: any) {
    if (!this.intelStores[factionId]) {
      this.intelStores[factionId] = [];
    }

    const store = this.intelStores[factionId];
    const baseDuration = INTEL_BASE_DURATION[item.type] ?? 3;
    const expiresOnTurn = item.expiresOnTurn
      ?? (item.revealedOnTurn + baseDuration + (item.expiryBonus ?? 0));

    // Refresh existing non-expired item of the same type + system (FR-IS-007)
    const existing = store.find(
      (i: any) => i.type === item.type && i.systemId === item.systemId
    );
    if (existing) {
      existing.expiresOnTurn = expiresOnTurn;
      existing.data = item.data ?? existing.data;
      existing.revealedOnTurn = item.revealedOnTurn ?? existing.revealedOnTurn;
      existing.source = item.source ?? existing.source;
      return existing;
    }

    const newItem = {
      id:             _newIntelId(),
      type:           item.type,
      systemId:       item.systemId,
      targetFactionId:item.targetFactionId ?? null,
      data:           item.data ?? {},
      revealedOnTurn: item.revealedOnTurn ?? 0,
      expiresOnTurn,
      source:         item.source ?? 'mission',
      false:          item.false ?? false,
    };

    store.push(newItem);

    // Enforce cap: discard oldest items (FR-IS-002)
    if (store.length > INTEL_CAP) {
      store.sort((a: any, b: any) => a.revealedOnTurn - b.revealedOnTurn);
      store.splice(0, store.length - INTEL_CAP);
    }

    return newItem;
  }

  /**
   * Purge all expired intel items for all factions.
   * Called during the Maintenance Phase (FR-IS-002).
   * @param {number} currentTurn
   * @returns {number} Total items purged
   */
  purgeExpired(currentTurn: any) {
    let purged = 0;
    for (const factionId of Object.keys(this.intelStores)) {
      const before = this.intelStores[factionId].length;
      this.intelStores[factionId] = this.intelStores[factionId].filter(
        (item: any) => item.expiresOnTurn > currentTurn
      );
      purged += before - this.intelStores[factionId].length;
    }
    return purged;
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize the intel store to a plain JSON-safe object.
   * @returns {Object}
   */
  serialize() {
    return {
      intelStores: JSON.parse(JSON.stringify(this.intelStores)),
    };
  }

  /**
   * Restore from a serialized snapshot.
   * @param {Object} data - Output of serialize()
   * @param {string[]} factionIds
   * @returns {IntelStateManager}
   */
  static deserialize(data: any, factionIds: any) {
    const manager = new IntelStateManager(factionIds);
    if (data?.intelStores) {
      for (const [fid, items] of Object.entries(data.intelStores)) {
        if (manager.intelStores[fid] !== undefined) {
          manager.intelStores[fid] = Array.isArray(items) ? items : [];
        }
      }
    }
    return manager;
  }
}

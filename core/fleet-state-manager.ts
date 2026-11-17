/**
 * FleetStateManager — Per-faction fleet tracking, CRUD, movement, commands,
 * and production-queue management.
 *
 * Specs:
 *   013-fleet-composition-spec.md  (FR-FC-001 through FR-FC-007)
 *   014-fleet-movement-spec.md     (FR-FM-001 through FR-FM-009)
 *   016-fleet-commands-spec.md     (FR-FLC-001 through FR-FLC-008)
 */

import fleetConfig from './fleet-config.json';
import { makeId } from './deterministic-id.js';
import { applyVariance } from './timescale-config.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const FLEET_COMMAND = {
  PATROL:   'patrol',
  RAID:     'raid',
  BLOCKADE: 'blockade'
};

const MAX_SHIPS_PER_FLEET = fleetConfig.fleetRules.maxShipsPerFleet;

// Galaxy size → map dimensions (must match galaxy-generator.js SIZE_CONFIG)
const GALAXY_DIMENSIONS = {
  small:  { width: 2000, height: 1500 },
  medium: { width: 3000, height: 2000 },
  large:  { width: 4000, height: 3000 }
};

/**
 * BFS shortest-path over hyperspace connections.
 * @param {string} sourceId
 * @param {string} destId
 * @param {Object[]} systems - galaxy.systems array
 * @returns {{ turns: number, waypoints: string[] } | null}
 */
function _bfsLanePath(sourceId: any, destId: any, systems: any) {
  if (sourceId === destId) return { turns: 0, waypoints: [] };
  const byId = Object.fromEntries(systems.map((s: any) => [s.id, s]));
  const queue: [string, string[]][] = [[sourceId, []]];
  const visited = new Set([sourceId]);
  while (queue.length > 0) {
    const [curr, path] = queue.shift()!;
    const sys = byId[curr];
    if (!sys) continue;
    for (const neighborId of (sys.connections ?? [])) {
      if (neighborId === destId) {
        const waypoints = [...path, neighborId];
        return { turns: waypoints.length, waypoints };
      }
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push([neighborId, [...path, neighborId]]);
      }
    }
  }
  return null; // no lane path exists
}

// ─── ID helpers ──────────────────────────────────────────────────────────────

let _fleetIdCounter = 1;
let _shipIdCounter  = 1;

function _newFleetId() { return `fleet-${_fleetIdCounter++}`; }
function _newShipId()  { return `ship-${_shipIdCounter++}`; }

// ─── Ship type registry (keyed by shipType.id) ────────────────────────────────

const SHIP_TYPE_MAP = Object.fromEntries(
  fleetConfig.shipTypes.map(t => [t.id, t])
);

// ─── FleetStateManager ────────────────────────────────────────────────────────

export class FleetStateManager {
  fleets: any = {};
  productionQueues: any = {};
  combatLog: any[] = [];
  _ordersThisTurn: any = {};
  _prodSeq: number = 0;
  _pendingInvasions: any[] = [];
  _invasionChoices: any = {};

  /**
   * @param {string[]} factionIds - All active faction IDs
   */
  constructor(factionIds: any) {
    /**
     * fleets: factionId → Fleet[]
     * Each Fleet: {
     *   id, factionId, name, systemId,
     *   ships: Ship[],
     *   commanderId: string|null,
     *   command: { type, target, route, routeIndex } | null,
     *   inTransit: {
   *     originSystemId:      string,
   *     destinationSystemId: string,
   *     waypoints:           string[],  // lane mode: ordered hops; direct mode: empty
   *     waypointIndex:       number,    // lane mode: next hop index; direct mode: 0
   *     travelMode:          'lane'|'direct',
   *     turnsRemaining:      number|null // direct mode: turns left; lane mode: null
   *   } | null,
     *   maintenancePenalty: boolean   (true when maintenance couldn't be paid last turn)
     * }
     * Each Ship: {
     *   id, shipTypeId, currentHull, maxHull
     * }
     */
    this.fleets = {};

    /**
     * productionQueues: systemId → ProductionQueue[]
     * Each entry: { id, factionId, shipTypeId, turnsRemaining }
     */
    this.productionQueues = {};

    /**
     * combatLog: CombatLogEntry[] (last 10 combats retained)
     */
    this.combatLog = [];

    /**
     * _ordersThisTurn: factionId → Set<fleetId>
     * Tracks which fleets have already received an order this turn (FR-APL-002).
     */
    this._ordersThisTurn = {};

    /**
     * _prodSeq: Monotonic counter for deterministic production-queue IDs (spec 055 FR-DET-002).
     * Persisted via serialize()/deserialize().
     */
    this._prodSeq = 0;

    for (const factionId of factionIds) {
      this.fleets[factionId] = [];
      this._ordersThisTurn[factionId as string] = new Set();
    }
  }

  // ─── Ship type queries ─────────────────────────────────────────────────────

  /**
   * Get a ship type definition by ID.
   * @param {string} shipTypeId
   * @returns {Object|null}
   */
  getShipType(shipTypeId: any) {
    return SHIP_TYPE_MAP[shipTypeId] ?? null;
  }

  /**
   * Get all ship types available to a faction (includes universal + faction-exclusive
   * types whose required tech has been researched).
   * @param {string} factionId
   * @param {string[]} [completedTechs=[]] - Tech IDs already researched by this faction
   * @returns {Object[]}
   */
  getAvailableShipTypes(factionId: any, completedTechs: string[] = []) {
    return fleetConfig.shipTypes.filter(t => {
      if (t.faction !== 'all' && t.faction !== factionId) return false;
      if (t.requiresTech && !completedTechs.includes(t.requiresTech)) return false;
      return true;
    });
  }

  // ─── Fleet CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a new fleet for a faction at a system.
   * @param {string} factionId
   * @param {string} systemId
   * @param {string} [name] - Optional custom name; auto-generated if omitted
   * @returns {Object} The new fleet
   */
  createFleet(factionId: any, systemId: any, name: any) {
    const id = _newFleetId();
    const fleet = {
      id,
      factionId,
      name: name ?? `${factionId} Fleet ${(this.fleets[factionId]?.length ?? 0) + 1}`,
      systemId,
      ships: [],
      commanderId: null,
      command: null,
      inTransit: null,
      maintenancePenalty: false
    };
    if (!this.fleets[factionId]) this.fleets[factionId] = [];
    (this.fleets[factionId] as any[]).push(fleet);
    console.log(`[FleetStateManager] Created fleet "${fleet.name}" (${id}) for ${factionId} at ${systemId}`);
    return fleet;
  }

  /**
   * Disband (permanently remove) a fleet. Ships are scrapped.
   * @param {string} fleetId
   * @returns {{ success: boolean, scrapMaterials: number }}
   */
  disbandFleet(fleetId: any) {
    const { fleet, factionId } = this._findFleet(fleetId);
    if (!fleet) return { success: false, scrapMaterials: 0 };

    const scrapMaterials = fleet.ships.reduce((sum: any, ship: any) => {
      const type = SHIP_TYPE_MAP[ship.shipTypeId];
      if (!type) return sum;
      return sum + Math.floor((type.productionCost.materials ?? 0) * fleetConfig.fleetRules.scrapReturnRate);
    }, 0);

    this.fleets[factionId as string] = (this.fleets[factionId as string] as any[]).filter((f: any) => f.id !== fleetId);
    console.log(`[FleetStateManager] Disbanded fleet ${fleetId}; scrap: ${scrapMaterials} materials`);
    return { success: true, scrapMaterials };
  }

  /**
   * Add a ship to a fleet (from staging area after production).
   * @param {string} fleetId
   * @param {string} shipTypeId
   * @returns {{ success: boolean, ship?: Object, error?: string }}
   */
  addShipToFleet(fleetId: any, shipTypeId: any) {
    const { fleet } = this._findFleet(fleetId);
    if (!fleet) return { success: false, error: `Fleet ${fleetId} not found` };
    if (fleet.ships.length >= MAX_SHIPS_PER_FLEET) {
      return { success: false, error: `Fleet at max capacity (${MAX_SHIPS_PER_FLEET})` };
    }
    const type = SHIP_TYPE_MAP[shipTypeId];
    if (!type) return { success: false, error: `Unknown ship type: ${shipTypeId}` };
    if (type.faction !== 'all' && type.faction !== fleet.factionId) {
      return { success: false, error: `Ship type ${shipTypeId} is not available to ${fleet.factionId}` };
    }

    const ship = {
      id: _newShipId(),
      shipTypeId,
      currentHull: type.hullPoints,
      maxHull: type.hullPoints
    };
    fleet.ships.push(ship);
    return { success: true, ship };
  }

  /**
   * Remove and scrap a specific ship from a fleet.
   * @param {string} fleetId
   * @param {string} shipId
   * @returns {{ success: boolean, scrapMaterials: number }}
   */
  scrapShip(fleetId: any, shipId: any) {
    const { fleet } = this._findFleet(fleetId);
    if (!fleet) return { success: false, scrapMaterials: 0 };

    const idx = fleet.ships.findIndex((s: any) => s.id === shipId);
    if (idx === -1) return { success: false, scrapMaterials: 0 };

    const ship = fleet.ships[idx];
    const type = SHIP_TYPE_MAP[ship.shipTypeId];
    const scrapMaterials = type
      ? Math.floor((type.productionCost.materials ?? 0) * fleetConfig.fleetRules.scrapReturnRate)
      : 0;

    fleet.ships.splice(idx, 1);
    return { success: true, scrapMaterials };
  }

  // ─── Fleet Splitting and Merging ──────────────────────────────────────────

  /**
   * Split a fleet: move the given ship IDs into a new fleet at the same system.
   * Original fleet retains its name and ID. New fleet gets a generated name.
   * @param {string} fleetId
   * @param {string[]} shipIds - Ship IDs to move to the new fleet
   * @param {string} [newFleetName]
   * @returns {{ success: boolean, newFleet?: Object, error?: string }}
   */
  splitFleet(fleetId: any, shipIds: any, newFleetName: any) {
    const { fleet, factionId } = this._findFleet(fleetId);
    if (!fleet) return { success: false, error: `Fleet ${fleetId} not found` };
    if (fleet.inTransit) return { success: false, error: 'Cannot split a fleet in transit' };
    if (shipIds.length === 0) return { success: false, error: 'Must specify ships to split off' };
    if (shipIds.length >= fleet.ships.length) {
      return { success: false, error: 'Must leave at least 1 ship in original fleet' };
    }

    const toMove = fleet.ships.filter((s: any) => shipIds.includes(s.id));
    if (toMove.length !== shipIds.length) {
      return { success: false, error: 'Some ship IDs not found in fleet' };
    }

    // Remove from original
    fleet.ships = fleet.ships.filter((s: any) => !shipIds.includes(s.id));

    // Create new fleet with those ships
    const newFleet = this.createFleet(factionId, fleet.systemId, newFleetName);
    newFleet.ships = toMove;

    console.log(`[FleetStateManager] Split fleet ${fleetId} → ${newFleet.id} (${toMove.length} ships moved)`);
    return { success: true, newFleet };
  }

  /**
   * Merge two fleets at the same system into one.
   * Ships from sourceFleetId are added to targetFleetId (up to cap).
   * @param {string} targetFleetId
   * @param {string} sourceFleetId
   * @returns {{ success: boolean, error?: string }}
   */
  mergeFleets(targetFleetId: any, sourceFleetId: any) {
    const { fleet: target } = this._findFleet(targetFleetId);
    const { fleet: source } = this._findFleet(sourceFleetId);
    if (!target) return { success: false, error: `Target fleet ${targetFleetId} not found` };
    if (!source) return { success: false, error: `Source fleet ${sourceFleetId} not found` };
    if (target.systemId !== source.systemId) {
      return { success: false, error: 'Fleets must be in the same system to merge' };
    }
    if (target.inTransit || source.inTransit) {
      return { success: false, error: 'Cannot merge fleets in transit' };
    }
    if (target.ships.length + source.ships.length > MAX_SHIPS_PER_FLEET) {
      return { success: false, error: `Merge would exceed max fleet size of ${MAX_SHIPS_PER_FLEET}` };
    }

    target.ships = [...target.ships, ...source.ships];
    this.disbandFleet(sourceFleetId);
    console.log(`[FleetStateManager] Merged fleet ${sourceFleetId} into ${targetFleetId}`);
    return { success: true };
  }

  // ─── Fleet Movement ────────────────────────────────────────────────────────

  /**
   * Calculate available travel options from a fleet's current system to a destination.
   * Returns a lane option (BFS over hyperspace connections) and a direct option (distance-based).
   * @param {string} fleetId
   * @param {string} destinationId
   * @param {Object} galaxy
   * @returns {{ lane: { turns: number, waypoints: string[] }|null, direct: { turns: number } }|null}
   */
  calculateTravelOptions(fleetId: any, destinationId: any, galaxy: any) {
    const { fleet } = this._findFleet(fleetId);
    if (!fleet) return null;
    const sourceSys = galaxy.systems.find((s: any) => s.id === fleet.systemId);
    const destSys   = galaxy.systems.find((s: any) => s.id === destinationId);
    if (!sourceSys || !destSys) return null;
    if (fleet.systemId === destinationId) return null;

    // Lane path via BFS
    const laneOption = _bfsLanePath(fleet.systemId, destinationId, galaxy.systems);

    // Direct travel cost
    const tc          = fleetConfig.travelConfig ?? {};
    const maxTurns    = tc.maxTurns             ?? 8;
    const minTurns    = tc.directTravelMinTurns ?? 2;
    const dims        = galaxy.dimensions ?? (GALAXY_DIMENSIONS as Record<string, any>)[galaxy.size] ?? { width: 3000, height: 2000 };
    const maxDiag     = Math.sqrt(dims.width * dims.width + dims.height * dims.height);
    const dx          = destSys.position.x - sourceSys.position.x;
    const dy          = destSys.position.y - sourceSys.position.y;
    const dist        = Math.sqrt(dx * dx + dy * dy);
    const directTurns = Math.max(minTurns, Math.min(maxTurns, Math.ceil(dist / (maxDiag / maxTurns))));

    return { lane: laneOption, direct: { turns: directTurns } };
  }

  /**
   * Stage a fleet movement order. Places the fleet In Transit toward destination.
   * - travelMode 'lane': fleet hops via hyperspace connections, 1 turn per hop.
   * - travelMode 'direct': fleet travels in a straight line; cost by Euclidean distance.
   * @param {string} fleetId
   * @param {string} destinationId - Target system ID
   * @param {'lane'|'direct'} travelMode
   * @param {Object} galaxy
   * @returns {{ success: boolean, error?: string }}
   */
  stageMoveFleet(fleetId: any, destinationId: any, travelMode: any, galaxy: any) {
    const { fleet, factionId } = this._findFleet(fleetId);
    if (!fleet) return { success: false, error: `Fleet ${fleetId} not found` };
    if (fleet.inTransit) return { success: false, error: 'Fleet already in transit' };
    // One order per fleet per turn (FR-APL-002)
    if (this._ordersThisTurn[factionId as string]?.has(fleetId)) {
      return { success: false, error: 'Fleet has already received an order this turn' };
    }
    if (fleet.command?.type === FLEET_COMMAND.BLOCKADE) {
      return { success: false, error: 'Cannot move a fleet under Blockade order' };
    }
    if (!destinationId) {
      return { success: false, error: 'No destination specified' };
    }
    if (fleet.systemId === destinationId) {
      return { success: false, error: 'Fleet is already at this system' };
    }
    const destSys = galaxy.systems.find((s: any) => s.id === destinationId);
    if (!destSys) return { success: false, error: `System ${destinationId} not found` };

    if (travelMode === 'lane') {
      const laneOption = _bfsLanePath(fleet.systemId, destinationId, galaxy.systems);
      if (!laneOption) {
        return { success: false, error: 'No hyperspace lane path to that system' };
      }
      fleet.inTransit = {
        originSystemId:      fleet.systemId,
        destinationSystemId: destinationId,
        waypoints:           laneOption.waypoints,
        waypointIndex:       0,
        travelMode:          'lane',
        turnsRemaining:      null
      };
      console.log(`[FleetStateManager] Fleet ${fleetId} staged via lanes: ${fleet.systemId} \u2192 ${destinationId} (${laneOption.turns} hops)`);
    } else if (travelMode === 'direct') {
      const options = this.calculateTravelOptions(fleetId, destinationId, galaxy);
      const turns   = options?.direct?.turns ?? (fleetConfig.travelConfig?.maxTurns ?? 8);
      fleet.inTransit = {
        originSystemId:      fleet.systemId,
        destinationSystemId: destinationId,
        waypoints:           [],
        waypointIndex:       0,
        travelMode:          'direct',
        turnsRemaining:      turns
      };
      console.log(`[FleetStateManager] Fleet ${fleetId} staged via direct travel: ${fleet.systemId} \u2192 ${destinationId} (${turns} turns)`);
    } else {
      return { success: false, error: `Unknown travel mode: ${travelMode}` };
    }

    if (!this._ordersThisTurn[factionId as string]) this._ordersThisTurn[factionId as string] = new Set();
    this._ordersThisTurn[factionId as string].add(fleetId);
    return { success: true };
  }

  /**
   * Cancel a staged movement order for a fleet (only if turn not yet submitted).
   * @param {string} fleetId
   * @returns {{ success: boolean }}
   */
  cancelMoveFleet(fleetId: any) {
    const { fleet } = this._findFleet(fleetId);
    if (!fleet || !fleet.inTransit) return { success: false };
    fleet.inTransit = null;
    return { success: true };
  }

  /**
   * Advance one hop of movement for all in-transit fleets.
   * Called during the Resolution Phase.
   * @param {Object} galaxy
   * @returns {Array<{ fleetId, factionId, fromSystemId, toSystemId, combatNeeded: boolean }>}
   */
  resolveFleetArrivals(galaxy: any) {
    const arrivals = [];

    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      for (const fleet of fleetList) {
        if (!fleet.inTransit) continue;

        // Backward-compat: saves without travelMode treat as lane
        const mode = fleet.inTransit.travelMode ?? 'lane';

        if (mode === 'direct') {
          // ── Direct travel: decrement counter ──
          fleet.inTransit.turnsRemaining = (fleet.inTransit.turnsRemaining ?? 1) - 1;
          if (fleet.inTransit.turnsRemaining <= 0) {
            const fromSystem = fleet.systemId;
            const toSystem   = fleet.inTransit.destinationSystemId;
            fleet.systemId   = toSystem;
            const enemyPresent = this._hasEnemyFleets(factionId, toSystem);
            arrivals.push({
              fleetId:      fleet.id,
              factionId,
              fromSystemId: fromSystem,
              toSystemId:   toSystem,
              combatNeeded: enemyPresent
            });
            fleet.inTransit = null;
            console.log(`[FleetStateManager] Fleet ${fleet.id} arrived at ${toSystem} (direct travel)`);
          } else {
            console.log(`[FleetStateManager] Fleet ${fleet.id} direct travel to ${fleet.inTransit.destinationSystemId}: ${fleet.inTransit.turnsRemaining} turns remaining`);
          }
        } else {
          // ── Lane travel: advance one hop ──
          const { waypoints, waypointIndex } = fleet.inTransit;
          const nextSystem = waypoints[waypointIndex];
          const fromSystem = fleet.systemId;

          fleet.systemId = nextSystem;
          fleet.inTransit.waypointIndex++;

          const atFinalDestination =
            fleet.inTransit.waypointIndex >= fleet.inTransit.waypoints.length;

          const enemyPresent = this._hasEnemyFleets(factionId, nextSystem);

          arrivals.push({
            fleetId:      fleet.id,
            factionId,
            fromSystemId: fromSystem,
            toSystemId:   nextSystem,
            combatNeeded: enemyPresent
          });

          if (atFinalDestination) {
            fleet.inTransit = null;
            console.log(`[FleetStateManager] Fleet ${fleet.id} arrived at ${nextSystem} (final destination)`);
          } else {
            console.log(`[FleetStateManager] Fleet ${fleet.id} advanced to ${nextSystem} (continuing to ${fleet.inTransit.destinationSystemId})`);
          }
        }
      }
    }

    return arrivals;
  }

  // ─── Blockade ──────────────────────────────────────────────────────────────

  /**
   * Check whether a system is under enemy blockade for a given faction.
   * @param {string} systemId
   * @param {string} movingFactionId - Faction attempting to enter
   * @returns {boolean}
   */
  isSystemBlockaded(systemId: any, movingFactionId: any) {
    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      if (factionId === movingFactionId) continue;
      for (const fleet of fleetList) {
        if (fleet.systemId === systemId && fleet.command?.type === FLEET_COMMAND.BLOCKADE) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get the faction ID that is blockading a system, or null.
   * @param {string} systemId
   * @returns {string|null}
   */
  getBlockadingFaction(systemId: any) {
    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      for (const fleet of fleetList) {
        if (fleet.systemId === systemId && fleet.command?.type === FLEET_COMMAND.BLOCKADE) {
          return factionId;
        }
      }
    }
    return null;
  }

  // ─── Fleet Commands ────────────────────────────────────────────────────────

  /**
   * Assign a command to a fleet. Cancels any previous command.
   * @param {string} fleetId
   * @param {string} commandType - One of FLEET_COMMAND values
   * @param {Object} [commandData={}] - Type-specific data: route, target, etc.
   * @returns {{ success: boolean, error?: string }}
   */
  assignCommand(fleetId: any, commandType: any, commandData = {}) {
    const { fleet, factionId } = this._findFleet(fleetId);
    if (!fleet) return { success: false, error: `Fleet ${fleetId} not found` };

    if (!fleetConfig.commandTypes.includes(commandType)) {
      return { success: false, error: `Unknown command type: ${commandType}` };
    }
    if (commandType === FLEET_COMMAND.BLOCKADE && fleet.inTransit) {
      return { success: false, error: 'Cannot blockade while in transit' };
    }
    // One order per fleet per turn (FR-APL-002)
    if (this._ordersThisTurn[factionId as string]?.has(fleetId)) {
      return { success: false, error: 'Fleet has already received an order this turn' };
    }

    fleet.command = {
      type:       commandType,
      target:     (commandData as any).target ?? null,
      route:      (commandData as any).route ?? null,
      routeIndex: (commandData as any).routeIndex ?? 0
    };
    if (!this._ordersThisTurn[factionId as string]) this._ordersThisTurn[factionId as string] = new Set();
    this._ordersThisTurn[factionId as string].add(fleetId);
    console.log(`[FleetStateManager] Fleet ${fleetId} assigned command: ${commandType}`);
    return { success: true };
  }

  /**
   * Cancel the active command on a fleet.
   * @param {string} fleetId
   * @returns {{ success: boolean }}
   */
  cancelCommand(fleetId: any) {
    const { fleet, factionId } = this._findFleet(fleetId);
    if (!fleet) return { success: false };
    fleet.command = null;
    // Release the order slot so a replacement command can be issued (FR-APL-002)
    this._ordersThisTurn[factionId as string]?.delete(fleetId);
    return { success: true };
  }

  /**
   * Clear per-turn order tracking for one or all factions.
   * Call at the start of each new turn (before player actions are accepted).
   * @param {string} [factionId] - If omitted, clears all factions.
   */
  clearTurnOrders(factionId: any) {
    if (factionId) {
      this._ordersThisTurn[factionId as string] = new Set();
    } else {
      for (const id of Object.keys(this._ordersThisTurn)) {
        this._ordersThisTurn[id] = new Set();
      }
    }
  }

  /**
   * Execute standing fleet commands during the Resolution Phase.
   * Returns an array of events for TurnStateManager.recordEvent().
   * @param {Object} galaxy
   * @returns {Array<{ type, fleetId, factionId, systemId, message }>}
   */
  resolveFleetCommands(galaxy: any) {
    const events: any[] = [];

    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      for (const fleet of fleetList) {
        if (!fleet.command || fleet.inTransit) continue;

        switch (fleet.command.type) {
          case FLEET_COMMAND.PATROL:
            this._executePatrol(fleet, galaxy, events);
            break;
          case FLEET_COMMAND.RAID:
            this._executeRaid(fleet, galaxy, events);
            break;
          // BLOCKADE is passive (no active resolution needed)
        }
      }
    }

    return events;
  }

  /** @private */
  _executePatrol(fleet: any, galaxy: any, events: any) {
    const route = (fleet.command as any).route;
    if (!route || route.length < 2) return;

    const nextIdx = (fleet.command as any).routeIndex % route.length;
    const nextSystem = route[nextIdx];

    // Validate connection from current system
    const currentSys = galaxy.systems.find((s: any) => s.id === fleet.systemId);
    if (!currentSys?.connections.includes(nextSystem)) return;

    fleet.systemId = nextSystem;
    (fleet.command as any).routeIndex = (nextIdx + 1) % route.length;

    const nextSys = galaxy.systems.find((s: any) => s.id === nextSystem);
    const nextSysName = nextSys?.name ?? nextSystem;

    events.push({
      type:      'patrol',
      fleetId:   fleet.id,
      factionId: fleet.factionId,
      systemId:  nextSystem,
      message:   `${fleet.name} patrolling ${nextSysName}`
    });
  }

  /** @private */
  _executeRaid(fleet: any, galaxy: any, events: any) {
    const targetSystemId = (fleet.command as any).target;
    if (!targetSystemId) return;

    const currentSys = galaxy.systems.find((s: any) => s.id === fleet.systemId);
    if (!currentSys?.connections.includes(targetSystemId)) return;

    const targetSys = galaxy.systems.find((s: any) => s.id === targetSystemId);
    const targetSysName = targetSys?.name ?? targetSystemId;

    events.push({
      type:      'raid',
      fleetId:   fleet.id,
      factionId: fleet.factionId,
      systemId:  targetSystemId,
      message:   `${fleet.name} raiding ${targetSysName}`
    });

    // Raid is consumed (single-use)
    fleet.command = null;
  }

  // ─── Maintenance ──────────────────────────────────────────────────────────

  /**
   * Deduct fleet maintenance costs from resource states.
   * Applies -10% combat penalty to fleets that can't be paid.
   * Fleets sorted alphabetically within each faction for deterministic deduction.
   *
   * @param {Object} resourceStates - factionId → ResourceStateManager
   * @param {Object} resourceEngine - ResourceEngine instance
   * @param {number} currentTurn
   * @returns {Array<{ factionId, fleetId, fleetName, cost, paid }>}
   */
  deductMaintenance(resourceStates: any, resourceEngine: any, currentTurn: any) {
    const results = [];

    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      const rsm = resourceStates[factionId];
      if (!rsm) continue;

      // Sort alphabetically by fleet name (deterministic order per spec FR-FC-005)
      const sorted = [...fleetList].sort((a, b) => a.name.localeCompare(b.name));

      for (const fleet of sorted) {
        const cost = this.getTotalMaintenance(fleet);
        if (cost === 0) continue;

        const result = resourceEngine.spendResources(
          rsm.state, { credits: cost }, `fleet-maintenance:${fleet.id}`, currentTurn
        );

        if (result.success) {
          fleet.maintenancePenalty = false;
          results.push({ factionId, fleetId: fleet.id, fleetName: fleet.name, cost, paid: true });
        } else {
          fleet.maintenancePenalty = true;
          results.push({ factionId, fleetId: fleet.id, fleetName: fleet.name, cost, paid: false });
          console.warn(`[FleetStateManager] ${fleet.name} (${factionId}) could not pay maintenance — penalty applied`);
        }
      }
    }

    return results;
  }

  // ─── Aggregate Stats ──────────────────────────────────────────────────────

  /**
   * Calculate aggregate combat power for a fleet.
   * Includes commander leadership bonus, tech bonus, maintenance penalty, and hull damage.
   * @param {Object} fleet
   * @param {number} [leaderStat=0] - Commander leadership stat
   * @param {number} [techMilitaryBonus=0] - Faction tech military bonus (fraction, e.g. 0.1 = +10%)
   * @returns {number}
   */
  getTotalCombatPower(fleet: any, leaderStat = 0, techMilitaryBonus = 0) {
    let basePower = fleet.ships.reduce((sum: any, ship: any) => {
      const type = SHIP_TYPE_MAP[ship.shipTypeId];
      if (!type) return sum;
      // Hull damage reduces power proportionally (FR-SC-005)
      const hullRatio = ship.maxHull > 0 ? ship.currentHull / ship.maxHull : 0;
      return sum + type.combatPower * hullRatio;
    }, 0);

    const commanderBonus = basePower * (leaderStat / 20);
    const techBonus      = basePower * techMilitaryBonus;
    let effectivePower   = basePower + commanderBonus + techBonus;

    // Maintenance penalty (FR-FC-005): -10%
    if (fleet.maintenancePenalty) {
      effectivePower *= (1 - fleetConfig.fleetRules.maintenancePenaltyRate);
    }

    return Math.floor(effectivePower);
  }

  /**
   * Fleet speed = minimum ship speed value (FR-FC-004).
   * @param {Object} fleet
   * @returns {number}
   */
  getFleetSpeed(fleet: any) {
    if (fleet.ships.length === 0) return 0;
    return Math.min(...fleet.ships.map((s: any) => SHIP_TYPE_MAP[s.shipTypeId]?.speed ?? 1));
  }

  /**
   * Total maintenance cost per turn for a fleet.
   * @param {Object} fleet
   * @returns {number}
   */
  getTotalMaintenance(fleet: any) {
    return fleet.ships.reduce((sum: any, ship: any) => {
      return sum + (SHIP_TYPE_MAP[ship.shipTypeId]?.maintenanceCost ?? 0);
    }, 0);
  }

  // ─── Production Queues ─────────────────────────────────────────────────────

  /**
   * Enqueue a ship build at a Shipyard system.
   * @param {string} factionId
   * @param {string} systemId
   * @param {string} shipTypeId
   * @param {number} [productionTimeOverride] - Overrides type default (e.g. Brand Authority bonus)
   * @returns {{ success: boolean, queueEntry?: Object, error?: string }}
   */
  enqueueProduction(factionId: any, systemId: any, shipTypeId: any, productionTimeOverride: any, currentQuarterTurn: any) {
    const type = SHIP_TYPE_MAP[shipTypeId];
    if (!type) return { success: false, error: `Unknown ship type: ${shipTypeId}` };
    if (type.faction !== 'all' && type.faction !== factionId) {
      return { success: false, error: `Ship type not available to ${factionId}` };
    }

    if (!this.productionQueues[systemId]) this.productionQueues[systemId] = [];

    const turnsRemaining = productionTimeOverride ?? type.productionTime;
    const entryId = makeId('prod', 0, `${factionId}-${systemId}`, this._prodSeq++);
    const entry = {
      id:             entryId,
      factionId,
      shipTypeId,
      turnsRemaining,
      completionTurn: currentQuarterTurn != null
        ? currentQuarterTurn + applyVariance(turnsRemaining, entryId)
        : null
    };
    this.productionQueues[systemId].push(entry);
    console.log(`[FleetStateManager] Queued ${type.name} at ${systemId} (${turnsRemaining} turns)`);
    return { success: true, queueEntry: entry };
  }

  /**
   * Return (and remove) all production entries whose completionTurn <= quarterTurn.
   * Used by the sub-turn resolution pass.
   * @param {number} quarterTurn
   * @returns {Array<{ factionId: string, systemId: string, shipTypeId: string, queueId: string }>}
   */
  getProductionCompletedAtQuarterTurn(quarterTurn: any) {
    const completed = [];
    for (const [systemId, queue] of Object.entries(this.productionQueues) as [string, any[]][]) {
      const remaining = [];
      for (const entry of queue) {
        if (entry.completionTurn != null && entry.completionTurn <= quarterTurn) {
          completed.push({
            factionId:  entry.factionId,
            systemId,
            shipTypeId: entry.shipTypeId,
            queueId:    entry.id
          });
        } else {
          remaining.push(entry);
        }
      }
      this.productionQueues[systemId] = remaining;
    }
    return completed;
  }

  /**
   * Return all ship type definitions from the loaded configuration.
   * @returns {Object[]}
   */
  getShipTypes() {
    return fleetConfig.shipTypes;
  }

  /**
   * Cancel a queued ship-build entry, returning it so the caller can refund costs.
   * @param {string} systemId
   * @param {string} queueItemId
   * @returns {{ success: boolean, cancelledEntry?: Object, error?: string }}
   */
  cancelProductionQueueItem(systemId: any, queueItemId: any) {
    const queue = this.productionQueues[systemId];
    if (!queue) return { success: false, error: `No production queue for system ${systemId}` };
    const idx = queue.findIndex((e: any) => e.id === queueItemId);
    if (idx === -1) return { success: false, error: `Queue item ${queueItemId} not found` };
    const [cancelledEntry] = queue.splice(idx, 1);
    console.log(`[FleetStateManager] Cancelled production of ${cancelledEntry.shipTypeId} at ${systemId}`);
    return { success: true, cancelledEntry };
  }

  /**
   * Advance production queues by one turn. Returns completed ship entries.
   * Each Shipyard completes at most 1 ship per turn.
   * @returns {Array<{ factionId, systemId, shipTypeId, queueId }>}
   */
  advanceProduction() {
    const completed = [];

    for (const [systemId, queue] of Object.entries(this.productionQueues) as [string, any[]][]) {
      if (queue.length === 0) continue;

      const first = queue[0];
      first.turnsRemaining--;

      if (first.turnsRemaining <= 0) {
        queue.shift();
        completed.push({
          factionId:  first.factionId,
          systemId,
          shipTypeId: first.shipTypeId,
          queueId:    first.id
        });
        console.log(`[FleetStateManager] Ship production complete: ${first.shipTypeId} at ${systemId}`);
      }
    }

    return completed;
  }

  // ─── Combat Log ───────────────────────────────────────────────────────────

  /**
   * Append a combat log entry. Retains last 10 combats.
   * @param {Object} entry - CombatResult from CombatEngine
   */
  appendCombatLog(entry: any) {
    this.combatLog.push(entry);
    if (this.combatLog.length > 10) this.combatLog.shift();
  }

  /**
   * Get the full combat log.
   * @returns {Object[]}
   */
  getCombatLog() {
    return [...this.combatLog];
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get all fleets for a faction.
   * @param {string} factionId
   * @returns {Object[]}
   */
  getFleetsForFaction(factionId: any) {
    return this.fleets[factionId] ?? [];
  }

  /**
   * Get all fleets at a specific system (all factions).
   * @param {string} systemId
   * @returns {Object[]}
   */
  getFleetsAtSystem(systemId: any) {
    return (Object.values(this.fleets) as any[][]).flat().filter(f => f.systemId === systemId && !f.inTransit);
  }

  /**
   * Get all fleets for a faction at a specific system.
   * @param {string} factionId
   * @param {string} systemId
   * @returns {Object[]}
   */
  getFleetsForFactionAtSystem(factionId: any, systemId: any) {
    return (this.fleets[factionId] ?? []).filter((f: any) => f.systemId === systemId && !f.inTransit);
  }

  /**
   * Get a fleet by ID.
   * @param {string} fleetId
   * @returns {Object|null}
   */
  getFleetById(fleetId: any) {
    return this._findFleet(fleetId).fleet;
  }

  // ─── Planetary Invasion support ───────────────────────────────────────────

  /**
   * Get list of pending invasion targets queued by the combat resolver.
   * Each entry: { systemId, attackerFactionId, defenderFactionId, attackerFleetPower }
   * Spec: 020-planetary-defenses-spec.md (FR-PD-002)
   * @returns {Array}
   */
  getPendingInvasions() {
    return [...(this._pendingInvasions ?? [])];
  }

  /**
   * Queue an invasion to be resolved this turn.
   * @param {Object} invasion - { systemId, attackerFactionId, defenderFactionId, attackerFleetPower }
   */
  queueInvasion(invasion: any) {
    if (!this._pendingInvasions) this._pendingInvasions = [];
    this._pendingInvasions.push(invasion);
  }

  /**
   * Clear all pending invasions after resolution.
   */
  clearPendingInvasions() {
    this._pendingInvasions = [];
  }

  // ─── Invasion Choice support (spec 048 FR-GC-001) ────────────────────────

  /**
   * Record the player's Invade/Blockade choice for a specific system.
   * @param {string} systemId
   * @param {'invade'|'blockade'} choice
   */
  recordInvasionChoice(systemId: any, choice: any) {
    if (!this._invasionChoices) this._invasionChoices = new Map();
    this._invasionChoices.set(systemId, choice);
  }

  /**
   * Get the recorded invasion choice for a system. Defaults to 'invade'.
   * @param {string} systemId
   * @returns {'invade'|'blockade'}
   */
  getInvasionChoice(systemId: any) {
    return this._invasionChoices?.get(systemId) ?? 'invade';
  }

  /**
   * Clear all recorded invasion choices (called at start of each resolution phase).
   */
  clearInvasionChoices() {
    if (this._invasionChoices) this._invasionChoices.clear();
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /** @private */
  _findFleet(fleetId: any) {
    for (const [factionId, fleetList] of Object.entries(this.fleets) as [string, any[]][]) {
      const fleet = fleetList.find((f: any) => f.id === fleetId);
      if (fleet) return { fleet, factionId };
    }
    return { fleet: null, factionId: null };
  }

  /** @private */
  _hasEnemyFleets(factionId: any, systemId: any) {
    return Object.entries(this.fleets as Record<string, any[]>).some(([fid, fleets]) =>
      fid !== factionId && fleets.some((f: any) => f.systemId === systemId && !f.inTransit)
    );
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * Serialize all fleet state to a plain object for persistence.
   * @returns {Object}
   */
  serialize() {
    return {
      fleets:           JSON.parse(JSON.stringify(this.fleets)),
      productionQueues: JSON.parse(JSON.stringify(this.productionQueues)),
      combatLog:        JSON.parse(JSON.stringify(this.combatLog)),
      _fleetIdCounter,
      _shipIdCounter,
      _prodSeq:         this._prodSeq
    };
  }

  /**
   * Restore fleet state from a serialized object.
   * @param {Object} data - From serialize()
   * @param {string[]} factionIds
   * @returns {FleetStateManager}
   */
  static deserialize(data: any, factionIds: any) {
    const fsm = new FleetStateManager(factionIds);
    fsm.fleets           = data.fleets           ?? {};
    fsm.productionQueues = data.productionQueues ?? {};
    fsm.combatLog        = data.combatLog        ?? [];

    // Restore counters so IDs don't collide
    if (data._fleetIdCounter) _fleetIdCounter = data._fleetIdCounter;
    if (data._shipIdCounter)  _shipIdCounter  = data._shipIdCounter;
    fsm._prodSeq = data._prodSeq ?? 0;

    return fsm;
  }
}

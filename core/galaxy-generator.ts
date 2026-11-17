/**
 * Galaxy Generator - Procedural galaxy creation with deterministic seed
 * Creates sectors, systems, and hyperspace tunnel networks
 */
import { SeededRandom } from './seeded-random.js';
import galaxyData from './galaxy-names.json';
import { FactionDefinitionLoader } from './faction-loader.js';

// Galaxy size configurations
const SIZE_CONFIG = {
  small: { sectors: [4, 5], mapSize: { width: 2000, height: 1500 } },
  medium: { sectors: [7, 9], mapSize: { width: 3000, height: 2000 } },
  large: { sectors: [12, 15], mapSize: { width: 4000, height: 3000 } }
};

// Special system type probabilities
const SPECIAL_TYPES = {
  manufacturingCenter: 0.08,    // 8% of systems
  researchFacility: 0.08,        // 8% of systems
  tradeHub: 0.10,                // 10% of systems
  strategicChokepoint: 0.04      // 4% of systems
};

// Population distribution weights
const POPULATION_WEIGHTS = {
  low: { range: [1, 4], weight: 0.40 },      // 40% low pop
  medium: { range: [5, 7], weight: 0.40 },   // 40% medium pop
  high: { range: [8, 10], weight: 0.20 }     // 20% high pop
};

// Faction loyalties for starting systems
const FACTION_TYPES = ['brandAuthority', 'union', 'autoforge', 'neutral'];

/**
 * Main Galaxy Generator class
 */
export class GalaxyGenerator {
  seed: any;
  size: any;
  config: any;
  rng: any;
  galaxy: any;
  /**
   * @param {string|number} seed - Seed for reproducible generation
   * @param {string} size - Galaxy size: 'small', 'medium', or 'large'
   * @param {Object} config - Optional configuration overrides
   */
  constructor(seed: any, size = 'medium', config: any = {}) {
    this.seed = seed;
    this.size = size;
    this.config = { ...(SIZE_CONFIG as Record<string, any>)[size], ...config };
    this.rng = new SeededRandom(seed);
    
    // Galaxy data structure
    this.galaxy = {
      seed: seed,
      size: size,
      sectors: [],
      systems: [],
      version: '1.0',
      dimensions: {
        width:  this.config.mapSize.width,
        height: this.config.mapSize.height
      }
    };
  }

  /**
   * Generate complete galaxy
   * @param {string[]} [activeFactionIds] - Optional faction IDs; uses definitions when provided
   * @returns {Object} Galaxy data structure
   */
  generate(activeFactionIds: any = null) {
    console.log(`[Galaxy Generator] Generating ${this.size} galaxy with seed: ${this.seed}`);
    
    // Phase 1: Select sectors from static definitions
    const selectedSectors = this.selectSectors();
    
    // Phase 2: Position sectors in 2D space
    this.positionSectors(selectedSectors);
    
    // Phase 3: Generate systems within sectors
    this.generateSystems();
    
    // Phase 4: Build hyperspace tunnel network
    this.generateConnections();
    
    // Phase 5: Assign faction starting positions
    if (activeFactionIds && activeFactionIds.length > 0) {
      this.assignFactionsWithDefinitions(activeFactionIds);
    } else {
      this.assignFactions();
    }
    
    // Phase 6: Validate galaxy structure
    this.validate();
    
    console.log(`[Galaxy Generator] Complete: ${this.galaxy.sectors.length} sectors, ${this.galaxy.systems.length} systems`);
    
    return this.galaxy;
  }

  /**
   * Select N random sectors from static definitions
   * @returns {Array} Selected sector definitions
   */
  selectSectors() {
    const [min, max] = this.config.sectors;
    const count = this.rng.nextInt(min, max);
    
    // Shuffle all sectors and take first N
    const shuffled = this.rng.shuffle(galaxyData.sectors);
    const selected = shuffled.slice(0, count);
    
    console.log(`[Galaxy Generator] Selected ${count} sectors from ${galaxyData.sectors.length} available`);
    
    return selected;
  }

  /**
   * Position sectors in 2D space using grid layout
   * @param {Array} selectedSectors - Sector definitions to position
   */
  positionSectors(selectedSectors: any) {
    const { width, height } = this.config.mapSize;
    const sectorCount = selectedSectors.length;
    
    // Calculate grid dimensions (roughly square)
    const cols = Math.ceil(Math.sqrt(sectorCount));
    const rows = Math.ceil(sectorCount / cols);
    
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    const margin = 100; // Minimum distance from edges
    
    selectedSectors.forEach((sectorDef: any, index: any) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      // Calculate cell center with random offset
      const centerX = (col + 0.5) * cellWidth;
      const centerY = (row + 0.5) * cellHeight;
      
      // Add random offset within cell (keeping margin)
      const offsetX = this.rng.nextFloat(-cellWidth * 0.3, cellWidth * 0.3);
      const offsetY = this.rng.nextFloat(-cellHeight * 0.3, cellHeight * 0.3);
      
      const sector = {
        id: `sector-${String(index + 1).padStart(3, '0')}`,
        name: sectorDef.name,
        position: {
          x: Math.max(margin, Math.min(width - margin, centerX + offsetX)),
          y: Math.max(margin, Math.min(height - margin, centerY + offsetY))
        },
        systemIds: [], // Will be populated during system generation
        radius: Math.max(cellWidth, cellHeight) * 0.4 // Sector boundary radius
      };
      
      this.galaxy.sectors.push(sector);
    });
  }

  /**
   * Generate all systems within positioned sectors
   */
  generateSystems() {
    let systemCounter = 1;
    
    this.galaxy.sectors.forEach((sector: any, sectorIndex: any) => {
      const sectorDef = galaxyData.sectors.find(s => s.name === sector.name);
      const systemNames = sectorDef!.systems;
      
      systemNames.forEach((systemName, nameIndex) => {
        const system = this.createSystem(
          systemCounter++,
          systemName,
          sector,
          nameIndex,
          systemNames.length
        );
        
        this.galaxy.systems.push(system);
        sector.systemIds.push(system.id);
      });
    });
  }

  /**
   * Create individual system with all properties
   * @param {number} id - System ID number
   * @param {string} name - System name from galaxy-names.json
   * @param {Object} sector - Parent sector
   * @param {number} index - Index within sector
   * @param {number} totalInSector - Total systems in sector
   * @returns {Object} System object
   */
  createSystem(id: any, name: any, sector: any, index: any, totalInSector: any) {
    // Position system within sector using circular arrangement
    const angle = (index / totalInSector) * Math.PI * 2 + this.rng.nextFloat(-0.3, 0.3);
    const distance = sector.radius * this.rng.nextFloat(0.3, 0.8);
    
    const position = {
      x: sector.position.x + Math.cos(angle) * distance,
      y: sector.position.y + Math.sin(angle) * distance
    };

    // Generate population using weighted distribution
    const populationCategory = this.rng.weightedChoice(
      ['low', 'medium', 'high'],
      [POPULATION_WEIGHTS.low.weight, POPULATION_WEIGHTS.medium.weight, POPULATION_WEIGHTS.high.weight]
    );
    const [minPop, maxPop] = (POPULATION_WEIGHTS as Record<string, any>)[populationCategory].range;
    const population = this.rng.nextInt(minPop, maxPop);

    // Determine special type (most systems are null)
    let specialType = null;
    const specialRoll = this.rng.next();
    let cumulative = 0;
    
    for (const [type, probability] of Object.entries(SPECIAL_TYPES)) {
      cumulative += probability;
      if (specialRoll < cumulative) {
        specialType = type;
        break;
      }
    }

    // Calculate base resource production from population
    const baseCredits = population * 10 + this.rng.nextInt(-5, 15);
    const baseMaterials = population * 5 + this.rng.nextInt(-3, 8);

    // Apply special type bonuses
    const resources = this.calculateResources(baseCredits, baseMaterials, specialType);

    return {
      id: `sys-${String(id).padStart(3, '0')}`,
      name: name,
      sectorId: sector.id,
      position: position,
      population: population,
      loyalty: 'neutral', // Will be assigned in assignFactions()
      loyaltyValue: 0,    // Controlling faction's loyalty (0–100); computed by LoyaltyStateManager
      loyalties: {},      // Per-faction loyalty map: { factionId: value } — managed by LoyaltyStateManager
      troops: 0,          // Ground troops garrisoning this system
      specialType: specialType,
      resources: resources,
      connections: [], // Will be populated in generateConnections()
      defenseRating: 0,
      facilities: []
    };
  }

  /**
   * Calculate resource production with special type bonuses
   * @param {number} baseCredits - Base credit production
   * @param {number} baseMaterials - Base materials production
   * @param {string|null} specialType - Special system type
   * @returns {Object} Resource production values
   */
  calculateResources(baseCredits: any, baseMaterials: any, specialType: any) {
    let credits = baseCredits;
    let materials = baseMaterials;

    if (specialType === 'manufacturingCenter') {
      materials = Math.floor(materials * 1.5); // +50%
    } else if (specialType === 'tradeHub') {
      credits = Math.floor(credits * 1.4); // +40%
    } else if (specialType === 'researchFacility') {
      // Research bonus applied elsewhere
    }

    return {
      credits: Math.max(0, credits),
      materials: Math.max(0, materials),
      recruits: 0,
      influence: 0
    };
  }

  /**
   * Generate hyperspace tunnel network connecting systems
   * Population-weighted with some systems potentially orphaned
   */
  generateConnections() {
    const systems = this.galaxy.systems;
    
    // Sort systems by population (high to low) for prioritized connections
    const sortedSystems = [...systems].sort((a, b) => b.population - a.population);
    
    sortedSystems.forEach(system => {
      // Determine number of connections based on population
      const maxConnections = this.getMaxConnections(system.population, system.specialType);
      const targetConnections = this.rng.nextInt(0, maxConnections);
      
      // Skip if system should be orphaned
      if (targetConnections === 0) {
        return;
      }
      
      // Find potential connection targets
      const candidates = this.findConnectionCandidates(system, systems);
      
      // Sort candidates by distance and desirability
      const sorted = candidates.sort((a: any, b: any) => {
        const distA = this.distance(system.position, a.position);
        const distB = this.distance(system.position, b.position);
        // Prefer connecting to high-pop systems
        return (distA - (a.population * 10)) - (distB - (b.population * 10));
      });
      
      // Add connections up to target count
      const connectTo = sorted.slice(0, Math.min(targetConnections, sorted.length));
      connectTo.forEach((target: any) => {
        this.addConnection(system, target);
      });
    });
    
    console.log(`[Galaxy Generator] Generated ${this.countTotalConnections()} hyperspace tunnels`);
  }

  /**
   * Determine max connections based on population
   * @param {number} population - System population
   * @param {string|null} specialType - Special system type
   * @returns {number} Maximum number of connections
   */
  getMaxConnections(population: any, specialType: any) {
    if (specialType === 'strategicChokepoint') {
      return this.rng.nextInt(2, 3); // Limited connections
    }
    
    if (population >= 8) {
      return this.rng.nextInt(4, 6); // High pop: many connections
    } else if (population >= 5) {
      return this.rng.nextInt(2, 4); // Medium pop: some connections
    } else if (population >= 3) {
      return this.rng.nextInt(1, 3); // Low pop: few connections
    } else {
      // Very low pop: might be orphaned
      return this.rng.chance(0.3) ? this.rng.nextInt(1, 2) : 0;
    }
  }

  /**
   * Find candidate systems for connections
   * @param {Object} system - Source system
   * @param {Array} allSystems - All systems in galaxy
   * @returns {Array} Candidate systems
   */
  findConnectionCandidates(system: any, allSystems: any) {
    const maxDistance = 600; // Maximum connection distance
    
    return allSystems.filter((candidate: any) => {
      // Don't connect to self
      if (candidate.id === system.id) return false;
      
      // Don't connect if already connected
      if (system.connections.includes(candidate.id)) return false;
      
      // Check distance
      const dist = this.distance(system.position, candidate.position);
      if (dist > maxDistance) return false;
      
      // Don't over-connect candidate
      if (candidate.connections.length >= 8) return false;
      
      return true;
    });
  }

  /**
   * Add bidirectional connection between two systems
   * @param {Object} systemA - First system
   * @param {Object} systemB - Second system
   */
  addConnection(systemA: any, systemB: any) {
    if (!systemA.connections.includes(systemB.id)) {
      systemA.connections.push(systemB.id);
    }
    if (!systemB.connections.includes(systemA.id)) {
      systemB.connections.push(systemA.id);
    }
  }

  /**
   * Calculate Euclidean distance between two points
   * @param {Object} posA - Position {x, y}
   * @param {Object} posB - Position {x, y}
   * @returns {number} Distance
   */
  distance(posA: any, posB: any) {
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Count total connections in galaxy
   * @returns {number} Total number of connections (bidirectional counted once)
   */
  countTotalConnections() {
    const connections = new Set();
    this.galaxy.systems.forEach((system: any) => {
      system.connections.forEach((targetId: any) => {
        const pair = [system.id, targetId].sort().join('-');
        connections.add(pair);
      });
    });
    return connections.size;
  }

  /**
   * Assign faction starting positions and loyalties
   */
  assignFactions() {
    const systems = this.galaxy.systems;
    
    // Select starting systems for each faction (except neutral)
    const factions = ['brandAuthority', 'union', 'autoforge'];
    const startingSystems: Record<string, any> = {};
    
    factions.forEach(faction => {
      // Find 3-5 systems for each faction
      const count = this.rng.nextInt(3, 5);
      const chosen: any[] = [];
      
      // Pick high-population systems with good spacing
      const candidates = [...systems]
        .filter(s => s.population >= 5)
        .sort((a, b) => b.population - a.population);
      
      for (let i = 0; i < count && i < candidates.length; i++) {
        const system = candidates[i];
        
        // Check spacing from already chosen systems
        const tooClose = chosen.some(other => {
          const dist = this.distance(system.position, other.position);
          return dist < 400; // Minimum spacing
        });
        
        if (!tooClose) {
          system.loyalty = faction;
          system.loyaltyValue = 100;
          if (!system.loyalties) system.loyalties = {};
          system.loyalties[faction] = 100;
          system.troops = 5;
          chosen.push(system);
        }
      }
      
      (startingSystems as Record<string, any>)[faction] = chosen.map(s => s.id);
    });
    
    console.log('[Galaxy Generator] Assigned faction starting positions:', startingSystems);
  }

  /**
   * Assign faction starting positions using faction definitions (faction-identity system).
   * @param {string[]} activeFactionIds - Faction IDs to assign (e.g. ['brandAuthority', 'union', 'autoforge'])
   */
  assignFactionsWithDefinitions(activeFactionIds: any) {
    const factionDefs = FactionDefinitionLoader.getAllFactions();
    const systems = this.galaxy.systems;
    const usedSystemIds = new Set();
    const factionCentroids: Record<string, any> = {};

    // Sort factions by descending systemCount.min so largest territories are placed first
    const orderedFactionIds = [...activeFactionIds].sort((a, b) => {
      const defA = factionDefs.find(f => f.id === a);
      const defB = factionDefs.find(f => f.id === b);
      return (defB?.startingConditions?.systemCount?.min ?? 0) - (defA?.startingConditions?.systemCount?.min ?? 0);
    });

    const startingSystems: Record<string, any> = {};
    // Track which sectors have been claimed as a faction's home sector
    const usedHomeSectors = new Set();

    orderedFactionIds.forEach(factionId => {
      const definition = factionDefs.find(f => f.id === factionId);
      if (!definition) {
        console.warn(`[Galaxy Generator] Unknown faction ID: ${factionId}`);
        return;
      }

      const sc = definition.startingConditions;
      const criteria = sc.systemCriteria || {};
      const minPop = criteria.minPopulation ?? 0;
      const maxPop = criteria.maxPopulation ?? 10;
      const systemCount = this.rng.nextInt(sc.systemCount.min, sc.systemCount.max);
      const MIN_FACTION_SEPARATION = 400;

      // --- Sector-clustering logic ---
      // Pick a home sector: prefer sectors not already used by another faction,
      // and that have enough unassigned systems to satisfy most of the quota.
      const availableSectors = this.galaxy.sectors.filter((sector: any) => {
        if (usedHomeSectors.has(sector.id)) return false;
        const freeSystems = sector.systemIds.filter((id: any) => {
          const s = systems.find((sys: any) => sys.id === id);
          return s && !usedSystemIds.has(s.id) && s.population >= minPop && s.population <= maxPop;
        });
        return freeSystems.length >= Math.max(1, systemCount - 2);
      });

      // Enforce spatial separation from already-placed factions
      const separatedSectors = availableSectors.filter((sector: any) =>
        Object.values(factionCentroids).every(centroid =>
          this.distance(sector.position, centroid) >= MIN_FACTION_SEPARATION
        )
      );

      // Fall back to any available sector if separation can't be satisfied
      const sectorPool = separatedSectors.length > 0 ? separatedSectors : availableSectors;

      if (sectorPool.length === 0) {
        console.warn(`[Galaxy Generator] ${factionId}: no suitable home sector found, falling back to global selection`);
      }

      const homeSector = sectorPool.length > 0 ? this.rng.choice(sectorPool) : null;
      if (homeSector) usedHomeSectors.add(homeSector.id);

      // Split quota: most systems from home sector, 1–2 from neighbouring sectors
      const overflowCount = systemCount > 2 ? this.rng.nextInt(1, 2) : 0;
      const homeSectorQuota = systemCount - overflowCount;

      // Home sector candidates
      const homeCandidates = homeSector
        ? homeSector.systemIds
            .map((id: any) => systems.find((s: any) => s.id === id))
            .filter((s: any) => s && !usedSystemIds.has(s.id) && s.population >= minPop && s.population <= maxPop)
            .sort((a: any, b: any) => b.population - a.population)
        : [];

      // Neighbour sector candidates: sectors within 3× home sector radius
      const neighbourCandidates = homeSector
        ? this.galaxy.sectors
            .filter((sec: any) => sec.id !== homeSector.id && !usedHomeSectors.has(sec.id))
            .filter((sec: any) => this.distance(sec.position, homeSector.position) < homeSector.radius * 3)
            .flatMap((sec: any) =>
              sec.systemIds
                .map((id: any) => systems.find((s: any) => s.id === id))
                .filter((s: any) => s && !usedSystemIds.has(s.id) && s.population >= minPop && s.population <= maxPop)
            )
            .sort((a: any, b: any) => b.population - a.population)
        : systems
            .filter((s: any) => !usedSystemIds.has(s.id) && s.population >= minPop && s.population <= maxPop)
            .sort((a: any, b: any) => b.population - a.population);

      // Select systems: fill home sector quota first, then overflow from neighbours,
      // then top-up from global pool if either pool ran short.
      const chosen: any[] = [];
      let homeChosen = 0;
      let overflowChosen = 0;

      if (homeSector) {
        for (const candidate of homeCandidates) {
          if (homeChosen >= homeSectorQuota) break;
          const tooClose = chosen.some(c => this.distance(c.position, candidate.position) < 150);
          if (!tooClose) { chosen.push(candidate); homeChosen++; }
        }

        for (const candidate of neighbourCandidates) {
          if (overflowChosen >= overflowCount) break;
          const tooClose = chosen.some(c => this.distance(c.position, candidate.position) < 150);
          if (!tooClose) { chosen.push(candidate); overflowChosen++; }
        }
      }

      // Top-up pass: if home + overflow didn't reach systemCount (home sector ran dry,
      // or no home sector was found at all), draw from the full galaxy pool.
      if (chosen.length < systemCount) {
        const globalCandidates = systems
          .filter((s: any) => !usedSystemIds.has(s.id) && !chosen.includes(s) && s.population >= minPop && s.population <= maxPop)
          .sort((a: any, b: any) => b.population - a.population);
        for (const candidate of globalCandidates) {
          if (chosen.length >= systemCount) break;
          const tooClose = chosen.some(c => this.distance(c.position, candidate.position) < 150);
          if (!tooClose) chosen.push(candidate);
        }
        // Last resort: ignore spacing if still short (avoids assigning 0 systems)
        if (chosen.length < systemCount) {
          for (const candidate of globalCandidates) {
            if (chosen.length >= systemCount) break;
            if (!chosen.includes(candidate)) chosen.push(candidate);
          }
        }
      }

      // Assign faction loyalty
      chosen.forEach(system => {
        system.loyalty = factionId;
        system.loyaltyValue = 100;
        // Initialize per-faction loyalty map for this starting system
        if (!system.loyalties) system.loyalties = {};
        system.loyalties[factionId] = 100;
        system.troops = 5; // Starting garrison
        usedSystemIds.add(system.id);
      });

      (startingSystems as Record<string, any>)[factionId] = chosen.map(s => s.id);

      // Calculate centroid for separation enforcement
      if (chosen.length > 0) {
        const avgX = chosen.reduce((sum, s) => sum + s.position.x, 0) / chosen.length;
        const avgY = chosen.reduce((sum, s) => sum + s.position.y, 0) / chosen.length;
        (factionCentroids as Record<string, any>)[factionId] = { x: avgX, y: avgY };
      }

      const topUpChosen = chosen.length - homeChosen - overflowChosen;
      console.log(`[Galaxy Generator] ${definition.displayName}: assigned ${chosen.length} systems (${homeChosen} home, ${overflowChosen} overflow, ${topUpChosen} top-up)`);

      // Handle special conditions
      if (sc.specialConditions && sc.specialConditions.length > 0) {
        this.processSpecialConditions(factionId, sc.specialConditions, usedSystemIds, factionCentroids);
      }
    });

    // Emit faction starting data back onto galaxy for persistence
    this.galaxy.factionStartingSystems = startingSystems;
    console.log('[Galaxy Generator] Faction assignment complete (definition-based):', startingSystems);
  }

  /**
   * Process special starting conditions for a faction (e.g. secret base).
   * @param {string} factionId - Faction ID
   * @param {Array} specialConditions - Array of special condition objects from definition
   * @param {Set} usedSystemIds - Set of already-assigned system IDs (mutated in place)
   * @param {Object} factionCentroids - Map of faction centroids for reference
   */
  processSpecialConditions(factionId: any, specialConditions: any, usedSystemIds: any, factionCentroids: any) {
    const systems = this.galaxy.systems;

    for (const condition of specialConditions) {
      if (condition.type === 'secret-base') {
        const maxPop = condition.criteria?.maxPopulation ?? 3;
        const notAdjacentTo = condition.criteria?.notAdjacentTo;

        const candidates = systems.filter((s: any) => {
          if (usedSystemIds.has(s.id)) return false;
          if (s.population > maxPop) return false;

          // Must not be adjacent to forbidden faction's systems
          if (notAdjacentTo) {
            const isAdjacentToEnemy = s.connections.some((connId: any) => {
              const connSys = systems.find((sys: any) => sys.id === connId);
              return connSys && connSys.loyalty === notAdjacentTo;
            });
            if (isAdjacentToEnemy) return false;
          }

          return true;
        });

        if (candidates.length > 0) {
          const secretBaseSystem = this.rng.choice(candidates);
          secretBaseSystem.loyalty = factionId;
          secretBaseSystem.loyaltyValue = 100;
          // Initialize per-faction loyalty map for secret base
          if (!secretBaseSystem.loyalties) secretBaseSystem.loyalties = {};
          secretBaseSystem.loyalties[factionId] = 100;
          secretBaseSystem.troops = 5;
          secretBaseSystem.specialType = 'secretBase';
          secretBaseSystem.secretBaseHidden = true;
          usedSystemIds.add(secretBaseSystem.id);
          console.log(`[Galaxy Generator] ${factionId}: placed secret base at ${secretBaseSystem.name}`);
        } else {
          console.warn(`[Galaxy Generator] ${factionId}: could not place secret base — no valid candidates`);
        }
      }

      if (condition.type === 'fabrication-plant' && condition.criteria?.applyToAll) {
        // Mark all faction systems as having an automated fabrication plant
        systems
          .filter((s: any) => s.loyalty === factionId)
          .forEach((s: any) => {
            if (!s.facilities) s.facilities = [];
            s.facilities.push({ type: 'fabricationPlant', level: 1 });
          });
        console.log(`[Galaxy Generator] ${factionId}: added fabrication plants to all starting systems`);
      }
    }
  }

  /**
   * Validate galaxy structure
   */
  validate() {
    const systems = this.galaxy.systems;
    const sectors = this.galaxy.sectors;
    
    // Check all systems belong to a sector
    systems.forEach((system: any) => {
      const sector = sectors.find((s: any) => s.id === system.sectorId);
      if (!sector) {
        console.warn(`[Galaxy Generator] System ${system.id} has invalid sector: ${system.sectorId}`);
      }
    });
    
    // Check connection validity
    systems.forEach((system: any) => {
      system.connections.forEach((targetId: any) => {
        const target = systems.find((s: any) => s.id === targetId);
        if (!target) {
          console.warn(`[Galaxy Generator] System ${system.id} has invalid connection: ${targetId}`);
        }
      });
    });
    
    // Count orphaned systems
    const orphaned = systems.filter((s: any) => s.connections.length === 0);
    console.log(`[Galaxy Generator] ${orphaned.length} orphaned systems (FTL-only access)`);
    
    // Calculate resource totals
    const totalCredits = systems.reduce((sum: any, s: any) => sum + s.resources.credits, 0);
    const totalMaterials = systems.reduce((sum: any, s: any) => sum + s.resources.materials, 0);
    console.log(`[Galaxy Generator] Total resources - Credits: ${totalCredits}, Materials: ${totalMaterials}`);
  }

  /**
   * Export galaxy data as JSON-serializable object
   * @returns {Object} Galaxy data
   */
  exportGalaxy() {
    return JSON.parse(JSON.stringify(this.galaxy));
  }
}

/**
 * Convenience function to generate galaxy
 * @param {string|number} seed - Generation seed
 * @param {string} size - Galaxy size
 * @returns {Object} Generated galaxy
 */
export function generateGalaxy(seed: any, size = 'medium') {
  const generator = new GalaxyGenerator(seed, size);
  return generator.generate();
}

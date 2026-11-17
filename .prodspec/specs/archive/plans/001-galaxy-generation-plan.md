# Galaxy Generation - Technical Implementation Plan

## Architecture Overview

The Galaxy Generation system is a **pure JavaScript module** that creates deterministic, procedurally-generated galaxy layouts using a seeded random number generator. The system operates as a **stateless factory** that produces galaxy data structures consumed by the game's rendering and logic systems.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Galaxy Generator                         │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ Seeded RNG     │→ │Sector Selector │→ │ Validator     │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
│         ↓                    ↓                    ↓         │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │Sector Position │  │ System Builder │  │ Network Graph │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    Galaxy Data Object
                             ↓
        ┌────────────────────┴────────────────────┐
        ↓                                         ↓
  DataBridge Storage                    Phaser Rendering
  (offline/cloud)                       (main-stage.js)
```

### Core Components

1. **GalaxyGenerator** (main module) - Orchestrates generation phases
2. **SeededRandom** - Deterministic PRNG based on seed string
3. **SectorSelector** - Selects sectors from static definitions in `galaxy-names.json`
4. **SectorPositioner** - Assigns spatial positions to selected sectors
5. **SystemBuilder** - Generates system properties for sector's systems
6. **NetworkBuilder** - Constructs hyperspace tunnel connections
7. **BalanceValidator** - Ensures fairness and connectivity

## Technical Approach

### Module Structure

```javascript
// core/galaxy-generator.js (main entry point)
export class GalaxyGenerator {
  constructor(seed, size = 'medium', config = {}) {
    this.seed = seed;
    this.size = size;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(seed);
    this.sectorSelector = new SectorSelector();
  }
  
  generate() {
    // Orchestrate generation phases
    const selectedSectors = this.selectSectors();
    const sectors = this.positionSectors(selectedSectors);
    const systems = this.generateSystems(sectors);
    this.generateConnections(systems);
    this.assignFactions(systems);
    this.validate();
    return this.exportGalaxy();
  }
}

// core/seeded-random.js
export class SeededRandom {
  constructor(seed) {
    this.state = this.hashSeed(seed);
  }
  
  next() { /* LCG or xorshift implementation */ }
  nextInt(min, max) { /* Integer in range */ }
  nextFloat() { /* Float [0, 1) */ }
  shuffle(array) { /* Fisher-Yates shuffle */ }
}

// core/sector-selector.js
import galaxyData from './galaxy-names.json';

export class SectorSelector {
  selectSectors(count, rng) {
    // Shuffle all 31 predefined sectors and pick first N
    const shuffled = rng.shuffle([...galaxyData.sectors]);
    return shuffled.slice(0, count);
  }
  
  getSectorCount(size, rng) {
    const ranges = {
      small: [6, 8],
      medium: [10, 14],
      large: [16, 24]
    };
    const [min, max] = ranges[size];
    return rng.nextInt(min, max);
  }
}
```

### Data Flow

1. **Input**: Seed string, size ('small'/'medium'/'large'), optional config
2. **Process**: 
   - Select N sectors from static definitions (with their predefined systems)
   - Position sectors spatially in 2D space
   - Place systems within their sector boundaries
   - Assign system properties (population, resources, special types)
   - Build hyperspace network graph
   - Assign faction starting positions
   - Validate connectivity and balance
3. **Output**: Galaxy data object (JSON-serializable)

### Seeded Random Number Generator

Using **Linear Congruential Generator (LCG)** for simplicity and determinism:

```javascript
class SeededRandom {
  constructor(seed) {
    this.state = this.hashSeed(seed);
  }
  
  // DJB2 hash for seed string → number
  hashSeed(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash);
  }
  
  // LCG formula: (a * state + c) % m
  next() {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296; // Normalize to [0, 1)
  }
  
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
```

## Implementation Strategy

### Phase 1: Foundation (Core Infrastructure)
**Goal**: Set up basic generation infrastructure with deterministic output

#### Tasks:
1. Create `core/galaxy-generator.js` main module
2. Implement `SeededRandom` class with LCG algorithm
3. Create `SectorSelector` to load and select sectors from `galaxy-names.json`
4. Define galaxy data structure schema (TypeScript-style JSDoc)
5. Implement basic configuration system (size → sector count ranges)

**Deliverables**:
- Scaffold files created
- Seeded RNG tested for determinism (same seed = same output)
- Sector selection working (returns complete sectors with their systems)

### Phase 2: Sector Selection and System Generation
**Goal**: Select sectors and generate spatial layout with system properties

#### Tasks:
1. Implement `SectorSelector`:
   - Load static sector definitions from `galaxy-names.json`
   - Select 6-24 sectors based on galaxy size (shuffle and pick)
   - Return complete sectors with their predefined system lists
2. Implement `SectorPositioner`:
   - Assign spatial positions to selected sectors in 2D coordinate space
   - Create sector grid or clustered layout
   - Calculate sector boundaries for visualization
3. Implement `SystemBuilder`:
   - For each sector's systems, assign spatial position within sector boundaries
   - Generate unique IDs (`sys-001`, `sys-002`, etc.)
   - Assign population levels (0-10 scale) with weighted distribution
   - Calculate base resource production from population
   - Assign special types (5-10% manufacturing, 5-10% research, 8-12% trade)
   - Set initial loyalty to neutral
4. Position systems spatially:
   - Distribute within sector boundaries
   - Ensure minimum distance between systems (no overlap)
   - Add slight randomness for organic feel

**Deliverables**:
- Sectors selected from static definitions (correct count for size)
- Sectors positioned spatially with boundaries
- All systems from selected sectors placed and have properties
- System-sector associations match galaxy-names.json
- Resource balance maintained across galaxy

### Phase 3: Hyperspace Network Construction
**Goal**: Build strategic tunnel network between systems

#### Tasks:
1. Implement `NetworkBuilder`:
   - Calculate distances between all system pairs
   - Connect high-population systems (pop >= 6) preferentially
   - Use **population-weighted connection** approach:
     - High-pop systems get more tunnel connections
     - Low-pop systems (pop < 4) may have zero tunnels (orphaned)
     - Medium-pop systems get 1-3 tunnel connections
   - Strategic connections based on:
     - Population level (primary factor)
     - Distance (prefer nearby systems)
     - Special system types (manufacturing/trade hubs more connected)
   - Some systems intentionally orphaned (15-25% of systems)
   - Ensure network isn't fully connected mesh (strategic variety)
2. Connection validation:
   - Verify tunnel distribution matches population weights
   - Confirm orphaned systems are intentional (low-pop or strategic choice)
   - Check that major population centers form tunnel networks

**Algorithm Approach**:
```javascript
// Population-weighted tunnel generation
function buildHyperspaceTunnels(systems, rng) {
  const edges = [];
  
  for (const sys of systems) {
    // Determine connection count based on population
    let connectionCount;
    if (sys.population >= 8) {
      connectionCount = rng.nextInt(4, 6); // Major hubs
    } else if (sys.population >= 6) {
      connectionCount = rng.nextInt(2, 4); // Regional centers
    } else if (sys.population >= 4) {
      connectionCount = rng.nextInt(1, 2); // Minor systems
    } else {
      // Low-pop systems: 50% chance of being orphaned
      connectionCount = rng.next() < 0.5 ? 0 : 1;
    }
    
    // Special system types get bonus connections
    if (sys.specialType === 'tradeHub' || sys.specialType === 'manufacturingCenter') {
      connectionCount += 1;
    }
    
    // Connect to nearby systems
    if (connectionCount > 0) {
      const nearby = findNearby(sys, systems, MAX_TUNNEL_DISTANCE)
        .filter(target => target.id !== sys.id)
        .sort((a, b) => distance(sys, a) - distance(sys, b));
      
      for (let i = 0; i < Math.min(connectionCount, nearby.length); i++) {
        const target = nearby[i];
        // Add bidirectional edge (avoid duplicates)
        if (!hasConnection(sys.id, target.id, edges)) {
          edges.push({ from: sys.id, to: target.id });
        }
      }
    }
  }
  
  return edges;
}
```

**Deliverables**:
- High-population systems have more tunnel connections (4-6 tunnels)
- Low-population systems often orphaned (15-25% of systems with zero tunnels)
- Strategic variety: some systems are chokepoints, others isolated
- Network creates interesting strategic decisions (FTL vs tunnel navigation)
- Special systems (trade/manufacturing hubs) well-connected

### Phase 4: Faction Assignment and Balance
**Goal**: Assign starting positions that are fair and spatially separated

#### Tasks:
1. Implement faction starting position selection:
   - Identify candidate regions (spatially separated by minimum distance)
   - Calculate resource potential for each region
   - Select regions with comparable total resources
   - Assign 3-5 systems per faction in their region
2. Balance validation:
   - Compare total resources across factions (within 15% tolerance)
   - Ensure each faction has at least one special location
   - Verify spatial separation (minimum distance between faction cores)
3. Set initial loyalty values:
   - Faction-controlled systems: loyalty to controlling faction
   - Buffer zones: neutral loyalty
   - Adjust loyalty slightly for border systems

**Deliverables**:
- Three faction starting territories defined
- Resource parity achieved (within tolerance)
- Spatial separation maintained
- Each faction has mixed system types

### Phase 5: Validation and Export
**Goal**: Ensure generation meets all requirements and export data

#### Tasks:
1. Implement `BalanceValidator`:
   - Check sector count ranges (6-8, 10-14, 16-24)
   - Verify system count matches selected sectors (4-6 systems per sector)
   - Validate all systems have required properties
   - Confirm no duplicate names or IDs
   - Validate tunnel distribution (15-25% orphaned, high-pop well-connected)
   - Validate resource distribution
   - Check special type frequencies (5-10%, 5-10%, 8-12%, 3-5%)
2. Export galaxy data:
   - Serialize to JSON-compatible object
   - Include metadata (seed, size, timestamp, version)
   - Validate against schema
3. Performance optimization:
   - Measure generation time (must be < 2 seconds)
   - Profile bottlenecks (likely network generation)
   - Optimize if needed (spatial indexing, early termination)

**Deliverables**:
- Validation suite covering all acceptance criteria
- Clean JSON export matching schema
- Performance target met (< 2 seconds)

## Technical Decisions

### Decision 1: Seeded RNG Algorithm
**Choice**: Linear Congruential Generator (LCG)

**Rationale**:
- Simple implementation (~10 lines)
- Deterministic across platforms (pure JavaScript)
- Fast execution (critical for < 2s generation)
- Good enough randomness for game purposes

**Alternatives Considered**:
- Mersenne Twister: Overkill for our needs, larger implementation
- `Math.random()`: Not seeded, non-deterministic
- XorShift: Good alternative, slightly more complex

**Trade-offs**: LCG has known statistical weaknesses (low-order bits less random), but acceptable for spatial/procedural generation.

### Decision 2: Connection Generation Algorithm
**Choice**: Population-Weighted Tunnel Assignment (No Universal Connectivity Required)

**Rationale**:
- FTL drives allow travel to any system (tunnels not required for all systems)
- Tunnels provide faster/cheaper travel for non-FTL ships
- Population-based assignment creates logical infrastructure (busy systems = more tunnels)
- Allows orphaned systems for strategic variety
- Creates interesting gameplay choices (invest in FTL vs use tunnel networks)

**Alternatives Considered**:
- Minimum Spanning Tree: Unnecessary since connectivity not required
- Delaunay Triangulation: Creates too many connections, less strategic
- Fully connected mesh: No strategic value, visual clutter
- Random connections: Less thematic than population-based

**Trade-offs**: Some players may expect all systems connected; tutorial/UI must explain FTL vs tunnel travel.

### Decision 3: Spatial Layout Approach
**Choice**: Sector grid with random system placement within sectors

**Rationale**:
- Clear visual organization (sectors as regions)
- Easy to ensure spatial separation
- Supports sector-based fog of war (future feature)
- Natural strategic boundaries

**Alternatives Considered**:
- Pure random spatial distribution: Less organized, harder to navigate visually
- Hexagonal grid: More complex, doesn't match 2D canvas well
- Spiral/radial layout: Works for specific themes, less flexible

**Trade-offs**: Sector boundaries might feel artificial; mitigate with varied sizes/shapes.

### Decision 4: Static Sector-System Associations
**Choice**: Predefined sector groupings in JSON with fixed system memberships

**Rationale**:
- Game-to-game cohesiveness ("Kepler Prime" always in "Kepler Sector")
- Player familiarity across playthroughs
- Simplifies generation (no dynamic name assignment)
- Sectors named after member systems create thematic coherence
- Easier to balance and test (predefined groupings)

**Alternatives Considered**:
- Random system-to-sector assignment: Less cohesive, harder to remember
- Procedural name generation: Risk of inappropriate/inconsistent names
- Hybrid (some static, some random): Added complexity without clear benefit

**Trade-offs**: Less variety in sector composition, but significantly better player experience and familiarity.

### Decision 5: Sector Naming Convention
**Choice**: Name sectors after prominent member systems

**Rationale**:
- Creates natural thematic connection
- Makes sectors memorable and meaningful
- Eliminates need for separate abstract sector names
- Players can easily remember "Kepler Sector has Kepler Prime"

**Alternatives Considered**:
- Abstract functional names ("Manufacturing Belt"): Less personal, harder to remember
- Geographic names ("Northern Expanse"): Arbitrary, doesn't relate to content
- Numbered sectors: Completely forgettable

**Trade-offs**: Sector names tied to specific systems, but this actually reinforces cohesiveness.

### Decision 6: Data Structure Design
**Choice**: Flat arrays of sectors/systems with ID references

**Rationale**:
- JSON-serializable (critical for save/load)
- Easy to query by ID
- Works well with DataBridge storage
- Compatible with Phaser rendering (iterate and render)

**Alternatives Considered**:
- Nested structure (systems inside sector objects): Harder to query individual systems
- Graph library: Over-engineered, harder to serialize
- Relational tables: Not appropriate for browser context

**Trade-offs**: Requires ID lookups instead of direct references; acceptable performance cost.

## Dependencies

### Internal Dependencies
- **databridge.js**: Store generated galaxy in offline/cloud storage
- **core/galaxy-names.json**: Static name pools (must exist)
- Vite build system for ES module support

### External Dependencies
None (pure JavaScript, no external libraries needed)

### Data Dependencies
- **galaxy-names.json**: Must be loaded successfully
- Future: Campaign configuration files (fixed galaxy layouts)

### Integration Dependencies
- **boot-stage.js**: Will call `GalaxyGenerator.generate()` during initialization
- **main-stage.js**: Consumes galaxy data for rendering
- **sector.js**: May need updates to support generated system data

## Testing Approach

### Unit Testing Strategy

**Note**: Project currently has manual testing only. Propose unit tests if testing framework adopted.

```javascript
// Example tests for SeededRandom
describe('SeededRandom', () => {
  test('same seed produces same sequence', () => {
    const rng1 = new SeededRandom('test-seed');
    const rng2 = new SeededRandom('test-seed');
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });
  
  test('different seeds produce different sequences', () => {
    const rng1 = new SeededRandom('seed-a');
    const rng2 = new SeededRandom('seed-b');
    const seq1 = Array.from({ length: 100 }, () => rng1.next());
    const seq2 = Array.from({ length: 100 }, () => rng2.next());
    expect(seq1).not.toEqual(seq2);
  });
});

// Example tests for GalaxyGenerator
describe('GalaxyGenerator', () => {
  test('generates correct system count for medium galaxy', () => {
    const gen = new GalaxyGenerator('test', 'medium');
    const galaxy = gen.generate();
    expect(galaxy.systems.length).toBeGreaterThanOrEqual(26);
    expect(galaxy.systems.length).toBeLessThanOrEqual(50);
  });
  
  test('all systems are connected', () => {
    const gen = new GalaxyGenerator('test', 'small');
    const galaxy = gen.generate();
    const visited = bfs(galaxy.systems[0], galaxy.systems);
    expect(visited.size).toBe(galaxy.systems.length);
  });
});
```

### Integration Testing Considerations

1. **DataBridge Integration**:
   - Generate galaxy and store in DataBridge
   - Retrieve and verify data integrity
   - Test offline mode and cloud mode

2. **Phaser Rendering**:
   - Generate galaxy and pass to MainStage
   - Verify all systems render correctly
   - Check coordinate system compatibility

3. **Save/Load Round-trip**:
   - Generate → Save → Load → Verify no data loss
   - Test with all galaxy sizes

### Manual Testing Checklist

From [TESTING_GUIDE.md](../../TESTING_GUIDE.md) pattern:

**Galaxy Generation Tests**:
- [ ] Generate small galaxy (6-8 sectors, 24-48 systems, < 2s)
- [ ] Generate medium galaxy (10-14 sectors, 40-70 systems, < 2s)
- [ ] Generate large galaxy (16-24 sectors, 64-120 systems, < 2s)
- [ ] Same seed produces identical galaxy (test 5 times)
- [ ] Different seeds produce different galaxies
- [ ] All system names are unique
- [ ] All sector names are unique
- [ ] Systems belong to correct sectors per galaxy-names.json
- [ ] No systems overlap visually
- [ ] High-population systems (pop >= 6) have 2+ tunnel connections
- [ ] 15-25% of systems are orphaned (no tunnel connections)
- [ ] Orphaned systems are primarily low-population (pop < 4)
- [ ] FTL-capable ships can reach any system regardless of tunnels
- [ ] Special types appear at correct frequencies
- [ ] Faction starting positions are spatially separated
- [ ] Resource distribution roughly balanced across factions
- [ ] Galaxy data serializes to JSON successfully
- [ ] Deserialized galaxy matches original

**Visual/Rendering Tests**:
- [ ] Galaxy renders in Phaser without errors
- [ ] Systems positioned correctly on map
- [ ] Sector boundaries visible (if implemented)
- [ ] Hyperspace connections display between systems
- [ ] No visual clutter (connections don't obscure systems)

**Performance Tests**:
- [ ] Generation time < 2 seconds for all sizes
- [ ] No memory leaks (generate 10 galaxies in succession)
- [ ] Browser doesn't freeze during generation

### Validation Tests

Automated validation during generation:

```javascript
class BalanceValidator {
  validate(galaxy) {
    const errors = [];
    
    // Sector count validation
    const sectorRanges = { small: [6, 8], medium: [10, 14], large: [16, 24] };
    const [minSectors, maxSectors] = sectorRanges[galaxy.size];
    if (galaxy.sectors.length < minSectors || galaxy.sectors.length > maxSectors) {
      errors.push(`Sector count ${galaxy.sectors.length} out of range [${minSectors}, ${maxSectors}]`);
    }
    
    // System count validation (varies by selected sectors, ~4-6 per sector)
    const expectedMinSystems = galaxy.sectors.length * 4;
    const expectedMaxSystems = galaxy.sectors.length * 6;
    if (galaxy.systems.length < expectedMinSystems || galaxy.systems.length > expectedMaxSystems) {
      errors.push(`System count ${galaxy.systems.length} unexpected for ${galaxy.sectors.length} sectors`);
    }
    
    // Tunnel connectivity validation (not all systems need tunnels)
    const orphanedSystems = galaxy.systems.filter(s => 
      !galaxy.connections || galaxy.connections.filter(c => 
        c.from === s.id || c.to === s.id
      ).length === 0
    );
    const orphanedPercent = (orphanedSystems.length / galaxy.systems.length) * 100;
    if (orphanedPercent > 30) {
      errors.push(`Too many orphaned systems: ${orphanedPercent.toFixed(1)}% (max 30%)`);
    }
    
    // Verify high-pop systems are well-connected
    const highPopSystems = galaxy.systems.filter(s => s.population >= 6);
    const poorlyConnectedHighPop = highPopSystems.filter(s => {
      const connectionCount = galaxy.connections.filter(c => 
        c.from === s.id || c.to === s.id
      ).length;
      return connectionCount < 2;
    });
    if (poorlyConnectedHighPop.length > 0) {
      errors.push(`${poorlyConnectedHighPop.length} high-population systems have fewer than 2 tunnels`);
    }
    
    // Name uniqueness
    const systemNames = new Set(galaxy.systems.map(s => s.name));
    if (systemNames.size !== galaxy.systems.length) {
      errors.push('Duplicate system names found');
    }
    
    // Resource balance
    const factionResources = this.calculateFactionResources(galaxy);
    const avg = Object.values(factionResources).reduce((a, b) => a + b, 0) / 3;
    for (const [faction, total] of Object.entries(factionResources)) {
      const diff = Math.abs(total - avg) / avg;
      if (diff > 0.15) {
        errors.push(`Faction ${faction} resources imbalanced: ${(diff * 100).toFixed(1)}% from average`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

## Performance Considerations

### Expected Bottlenecks

1. **Connection Generation**: O(n²) distance calculations for all system pairs
   - **Mitigation**: Use spatial partitioning (grid or quadtree) to limit pair comparisons
   - **Optimization**: Pre-filter by maximum connection distance
   - **Note**: No MST required since universal connectivity not needed

2. **Tunnel Distribution Validation**: Check tunnel counts per system
   - **Mitigation**: Simple iteration over systems (O(n))
   - **Optimization**: Track connections during generation phase

3. **Spatial Positioning**: Placing systems without overlap
   - **Mitigation**: Use spatial grid for collision detection
   - **Optimization**: Progressive relaxation or force-directed layout

### Optimization Strategies

```javascript
// Spatial partitioning for connection generation
class SpatialGrid {
  constructor(systems, cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map();
    systems.forEach(sys => this.insert(sys));
  }
  
  insert(system) {
    const key = this.getCellKey(system.position);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(system);
  }
  
  getNearby(system, radius) {
    // Check only neighboring grid cells
    const cellRadius = Math.ceil(radius / this.cellSize);
    const nearby = [];
    const centerKey = this.getCellKey(system.position);
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${centerKey.x + dx},${centerKey.y + dy}`;
        if (this.grid.has(key)) {
          nearby.push(...this.grid.get(key));
        }
      }
    }
    return nearby;
  }
}
```

### Memory Management

- Load galaxy-names.json once and reuse sector definitions
- Clear temporary data structures after generation phases
- Use efficient data structures (Maps for O(1) lookups, Sets for uniqueness)
- Spatial grids can be deallocated after tunnel generation complete

## Risk Mitigation

### Risk 1: Non-Determinism Across Browsers/Platforms
**Likelihood**: Medium  
**Impact**: High (multiplayer desync)

**Mitigation**:
- Avoid `Math.random()` (use seeded RNG)
- Avoid floating-point precision issues in sort comparisons
- Test on multiple browsers/OS combinations
- Use integer seeds or hash strings to integers consistently

### Risk 2: Poor Strategic Balance
**Likelihood**: Medium  
**Impact**: Medium (unfair gameplay)

**Mitigation**:
- Implement validation for faction balance
- Add configurable tolerance for resource parity
- Manual playtesting with various seeds
- Allow regeneration if validation fails

### Risk 3: Player Confusion About Orphaned Systems
**Likelihood**: Medium  
**Impact**: Medium (gameplay frustration)

**Mitigation**:
- Clear tutorial/UI explaining FTL vs tunnel travel
- Visual distinction for orphaned systems (different icon/color)
- Tooltip showing "No tunnels - FTL required" on hover
- Ensure starting faction systems are well-connected
- Documentation in game help/manual

### Risk 4: Uninteresting Network Layouts
**Likelihood**: Low  
**Impact**: Medium (boring gameplay)

**Mitigation**:
- Tune connection generation parameters
- Playtest with multiple galaxy sizes
- Add strategic edge selection heuristics
- Consider additional connection passes for variety
- Balance orphaned systems vs connected systems

### Risk 5: Performance Degradation on Large Galaxies
**Likelihood**: Low  
**Impact**: Medium (> 2s generation time)

**Mitigation**:
- Profile early and often
- Implement spatial partitioning from start
- Set hard limits on system counts
- Add generation progress indicator if needed

## Next Steps

After implementing this plan:

1. **Update Feature Catalog**: Mark galaxy generation as "In Progress" in `.prodspec/product/feature-catalog.md`
2. **Update Backlog**: Add implementation work to `.prodspec/product/backlog.md`
3. **Begin Implementation**: Start with Phase 1 (Foundation) - see Implementation Tasks below
4. **Iterate and Test**: Complete each phase, test, then proceed to next
5. **Documentation**: Update IMPLEMENTATION_SUMMARY.md and README.md when complete

---

## Implementation Tasks

This task breakdown follows the 5-phase implementation plan. Each task is actionable and can be completed independently or as part of a sequence. Mark tasks complete as they are finished.

### Phase 1: Foundation - Core Infrastructure
**Goal**: Establish basic generator structure and seeded RNG

**Status**: Complete (no unit tests)

#### Seeded Random Number Generator
- [x] Create `core/seeded-random.js` file
- [x] Implement `SeededRandom` class constructor accepting seed parameter
- [x] Implement Linear Congruential Generator (LCG) algorithm
- [x] Add `next()` method returning float 0-1
- [x] Add `nextInt(min, max)` method for integer ranges
- [x] Add `nextFloat(min, max)` method for float ranges
- [x] Add `choice(array)` method for random array element selection
- [ ] Write unit tests for deterministic output verification
- [x] Test same seed produces identical sequences across runs

**Note**: Also has shuffle(), chance(), weightedChoice() methods

#### Galaxy Generator Core Module
- [x] Create `core/galaxy-generator.js` file
- [x] Define `GalaxyGenerator` class
- [x] Add constructor accepting `seed` and `size` parameters
- [x] Store `SeededRandom` instance as class property
- [x] Implement `generate()` main orchestration method
- [x] Define galaxy data structure schema (sectors[], systems[], connections[])
- [x] Add validation for input parameters (seed must be number, size must be valid)
- [x] Export `GalaxyGenerator` class

**Note**: Uses named export `generateGalaxy(seed, size)` function instead of class

#### Sector Selector
- [x] Create `SectorSelector` class in galaxy-generator.js
- [x] Load sector definitions from `core/galaxy-names.json`
- [x] Implement `selectSectors(count, random)` method
- [x] Use seeded RNG to select random sectors
- [x] Ensure no duplicate sector selections
- [x] Return selected sectors with their systems
- [x] Test with small (6-8), medium (10-14), and large (16-24) counts

**Note**: Implemented as `selectSectors()` function, not class

#### Integration and Testing
- [x] Import galaxy-names.json in galaxy-generator.js
- [x] Verify JSON structure matches expected format (sectors array with systems)
- [x] Test galaxy generator instantiation
- [x] Test generate() method stub (returns empty galaxy)
- [x] Verify seeded RNG produces deterministic sector selection
- [ ] Add logging for debugging (optional)

**Note**: No logging added

### Phase 2: Sector and System Generation
**Goal**: Create sectors and systems with positions and properties

**Status**: Complete

#### Sector Positioning
- [x] Implement `positionSectors(sectors, mapSize)` method
- [x] Calculate map dimensions based on galaxy size (small: 2000x1500, medium: 3000x2000, large: 4000x3000)
- [x] Use grid placement or random distribution for sector positions
- [x] Ensure minimum spacing between sectors (200 units)
- [x] Return sectors with assigned positions {x, y}
- [x] Test sector positions don't overlap

**Note**: Uses grid layout with shuffled order

#### System Positioning
- [x] Implement `positionSystemsInSector(sector, sectorBounds)` method
- [x] Calculate sector boundary (circle or rectangle around sector center)
- [x] Position each system within sector bounds using seeded RNG
- [x] Ensure minimum spacing between systems (50 units)
- [x] Assign positions to all systems in sector
- [x] Test systems stay within sector boundaries
- [x] Test no systems overlap within sector

**Note**: Uses random positioning within sector radius

#### System Property Assignment
- [x] Implement `assignSystemProperties(system, random)` method
- [x] Assign population (1-10) using weighted distribution
  - [x] 40% low (1-4)
  - [x] 40% medium (5-7)
  - [x] 20% high (8-10)
- [x] Assign special types to 20% of systems:
  - [x] Manufacturing Center (30% of special)
  - [x] Research Facility (30% of special)
  - [x] Trade Hub (30% of special)
  - [x] Strategic Chokepoint (10% of special)
- [x] Assign loyalty (Brand Authority: 30%, Union: 30%, Autoforge: 20%, Neutral: 20%)
- [x] Calculate resource baselines from population
- [x] Test property distributions match expected percentages

**Note**: Implemented in createSystem() function

#### System Object Construction
- [x] Create complete system objects with all properties
- [x] Assign unique system IDs (e.g., `sys-001`)
- [x] Link systems to parent sector ID
- [x] Store name from galaxy-names.json
- [x] Initialize empty connections array
- [x] Add system to galaxy systems array
- [x] Test system data structure completeness

### Phase 3: Tunnel Generation (Population-Weighted)
**Goal**: Generate hyperspace tunnels with orphaned systems

**Status**: Core complete (no dynamic validation)

#### Connection Infrastructure
- [x] Create `ConnectionManager` class
- [x] Initialize with systems array and seeded RNG
- [x] Create `generateTunnels()` method
- [x] Define connection data structure: {from: systemId, to: systemId}
- [x] Initialize tunnels array in galaxy object

**Note**: Implemented as generateConnections() function, not class

#### Population-Based Tunnel Assignment
- [x] Implement tunnel count calculation based on population:
  - [x] Pop >= 8: 4-6 tunnels
  - [x] Pop 6-7: 2-4 tunnels
  - [x] Pop 4-5: 1-2 tunnels
  - [x] Pop < 4: 50% chance of 0 tunnels, otherwise 1-2
- [x] Randomly determine tunnel count for each system using seeded RNG
- [x] Store tunnel count per system
- [x] Test distribution produces 15-25% orphaned systems

**Note**: Uses population-based targeting for connections

#### Tunnel Partner Selection
- [x] For each system needing tunnels, select partner systems
- [x] Calculate distance to all other systems
- [x] Sort candidates by distance
- [x] Prefer closer systems (70% weight to nearest 30%)
- [x] Avoid duplicate tunnels (A→B and B→A same tunnel)
- [x] Respect partner system's tunnel capacity
- [x] Create bidirectional tunnel connections
- [x] Test tunnels connect valid system pairs

**Note**: Uses population-weighted selection, preferring high-pop targets

#### Orphaned System Handling
- [x] Track systems with zero tunnels
- [ ] Verify 15-25% of systems are orphaned
- [ ] If < 15%, remove random tunnels from low-pop systems
- [ ] If > 25%, add tunnels to orphaned systems
- [ ] Test orphaned percentage in acceptable range
- [x] Log orphaned system count for validation

**Note**: Basic orphaned system support, no dynamic adjustment

#### Connection Data Finalization
- [x] Add tunnels to galaxy connections array
- [x] Add connection IDs to system.connections arrays
- [x] Test bidirectional consistency (if A connects to B, B connects to A)
- [x] Verify no duplicate connections
- [x] Test tunnel data structure complete

### Phase 4: Resource and Balance Calculation
**Goal**: Calculate resources and balance galaxy

**Status**: Partially implemented (basic resources only)

#### Resource Calculation
- [x] Implement `calculateResources(system)` method
- [x] Calculate base production from population:
  - [x] Credits: pop * 10
  - [x] Materials: pop * 5
  - [x] Recruits: pop * 1
  - [x] Influence: pop * 0.5
- [ ] Apply special location bonuses:
  - [ ] Manufacturing: +50% materials
  - [ ] Research: +30% influence
  - [ ] Trade Hub: +40% credits
- [ ] Apply loyalty modifier (100% at full loyalty, scales down)
- [x] Store resources in system.resources object
- [x] Test resource calculations accurate

**Note**: Basic calculation exists, no special bonuses or loyalty modifiers

#### Faction Balance Validation
- [ ] Implement `validateFactionBalance(systems)` method
- [ ] Count systems per faction
- [ ] Calculate total population per faction
- [ ] Calculate total resources per faction
- [ ] Check Brand Authority vs Union balance (within 15%)
- [ ] Check Autoforge vs others (acceptable minority)
- [ ] Return balance report object
- [ ] Test catches imbalanced galaxies

**Note**: Not implemented

#### Balance Adjustment Algorithm
- [ ] Implement `adjustBalance(systems, random)` method
- [ ] If imbalance detected, swap system loyalties
- [ ] Prioritize swapping neutral systems first
- [ ] Preserve special location distributions
- [ ] Re-run validation after adjustments
- [ ] Limit adjustment attempts (max 10 iterations)
- [ ] Log adjustments made
- [ ] Test convergence to balanced state

**Note**: Not implemented

#### Strategic Value Calculation
- [ ] Implement `calculateStrategicValue(system, galaxy)` method
- [ ] Weight resource production (40% of value)
- [ ] Weight tunnel connectivity (30% of value)
- [ ] Weight special location (20% of value)
- [ ] Weight strategic position (central vs edge) (10% of value)
- [ ] Normalize to 0-100 scale
- [ ] Store in system.strategicValue property
- [ ] Test high-value systems have good reason

**Note**: Not implemented

### Phase 5: Validation and Finalization
**Goal**: Validate galaxy meets all requirements and prepare for use

**Status**: Partially implemented (basic validation only)

#### Orphaned Systems Validation
- [x] Count systems with zero tunnels
- [ ] Verify 15-25% are orphaned (max 30% acceptable)
- [ ] If outside range, regenerate tunnels
- [ ] Log orphaned system IDs
- [ ] Test validation catches incorrect percentages

**Note**: Basic count exists, no enforcement

#### Population Distribution Validation
- [ ] Count systems in each population range (low/medium/high)
- [ ] Verify distribution matches targets (40%/40%/20%)
- [ ] Allow 10% variance
- [ ] Log distribution statistics
- [ ] Test validation catches skewed distributions

**Note**: Not implemented

#### Faction Distribution Validation
- [x] Count systems per faction
- [ ] Verify Brand Authority and Union roughly equal (within 15%)
- [ ] Verify Autoforge smaller minority
- [ ] Verify neutral systems present (15-25%)
- [ ] Log faction counts
- [ ] Test validation catches imbalanced factions

**Note**: Basic faction assignment exists, no balance validation

#### Special Location Validation
- [x] Count special location types
- [ ] Verify ~20% of systems have special types
- [ ] Verify distribution among types reasonable
- [ ] Ensure at least 1 of each type in large galaxies
- [ ] Log special location counts
- [ ] Test validation catches missing special types

**Note**: Special types assigned, no comprehensive validation

#### Data Structure Validation
- [x] Verify all systems have required properties (id, name, position, population, etc.)
- [x] Verify all sectors have systems
- [x] Verify all tunnels reference valid system IDs
- [x] Verify bidirectional tunnel consistency
- [ ] Check for orphaned references (connections to non-existent systems)
- [x] Test catches malformed data

**Note**: Basic structure validation exists

#### Performance Validation
- [x] Measure generation time for small galaxy
- [x] Measure generation time for medium galaxy
- [x] Measure generation time for large galaxy
- [x] Verify all complete in < 2 seconds
- [ ] Profile performance bottlenecks if needed
- [ ] Optimize hot paths if necessary

**Note**: Performance is acceptable

#### Galaxy Object Finalization
- [x] Create final galaxy object with metadata
- [x] Add galaxy seed
- [x] Add galaxy size
- [ ] Add generation timestamp
- [ ] Add version number
- [ ] Add validation results
- [x] Return complete galaxy object
- [x] Test galaxy object structure complete

**Note**: Basic metadata present, missing timestamp/version/validation

#### Integration with DataBridge
- [ ] Add `dataBridge.saveGalaxy(galaxy)` call
- [ ] Test galaxy persists in offline mode (localStorage)
- [ ] Test galaxy persists in cloud mode (Supabase) if available
- [ ] Add `dataBridge.loadGalaxy()` method
- [ ] Test loaded galaxy matches saved galaxy
- [x] Verify deterministic regeneration (same seed = same galaxy)

**Note**: DataBridge integration not implemented, determinism works

### Integration and Testing Tasks

**Status**: Manual testing only, no unit tests

#### Unit Testing
- [ ] Write tests for SeededRandom class
- [ ] Write tests for sector selection
- [ ] Write tests for system positioning
- [ ] Write tests for property assignment
- [ ] Write tests for tunnel generation
- [ ] Write tests for resource calculation
- [ ] Write tests for validation functions
- [ ] Achieve > 80% code coverage

**Note**: No unit tests implemented

#### Integration Testing
- [x] Test full galaxy generation (small size)
- [x] Test full galaxy generation (medium size)
- [x] Test full galaxy generation (large size)
- [x] Test deterministic generation (same seed, same output)
- [ ] Test cross-platform consistency (Windows, Mac, Linux)
- [ ] Test offline mode integration
- [ ] Test cloud mode integration (if available)

**Note**: Basic generation works, no DataBridge integration

#### Manual Testing
- [x] Generate 10 small galaxies, verify quality
- [x] Generate 10 medium galaxies, verify quality
- [x] Generate 10 large galaxies, verify quality
- [x] Verify no crashes or errors
- [x] Verify performance acceptable (< 2s)
- [x] Verify orphaned systems present and reasonable
- [ ] Verify faction balance in all galaxies
- [ ] Verify special locations distributed well
- [x] Spot-check system properties make sense

**Note**: Basic manual testing done

#### Documentation
- [ ] Document `SeededRandom` class API
- [ ] Document `GalaxyGenerator` class API
- [ ] Document galaxy data structure schema
- [ ] Document validation criteria
- [ ] Update IMPLEMENTATION_SUMMARY.md
- [ ] Update README.md with galaxy generation info
- [x] Add code comments for complex algorithms
- [ ] Create developer guide for extending generator

**Note**: Code has comments, no comprehensive documentation

### Completion Checklist

- [x] All Phase 1 tasks complete - **Core infrastructure**
- [x] All Phase 2 tasks complete - **Sector and system generation**
- [x] All Phase 3 tasks complete - **Tunnel generation (basic)**
- [ ] All Phase 4 tasks complete - **Resources basic, no balancing**
- [ ] All Phase 5 tasks complete - **Basic validation only**
- [ ] All integration tests passing - **Manual only, no DataBridge**
- [x] Manual testing complete and validated - **Basic quality checks**
- [ ] Documentation updated - **Code comments only**
- [ ] Code reviewed (if applicable)
- [ ] Feature marked "Complete" in feature-catalog.md
- [ ] Backlog updated
- [x] Ready for integration with galaxy map rendering - **Works with map**

## References

- [Galaxy Generation Spec](./spec.md)
- [Feature Catalog](../../product/feature-catalog.md)
- [Project README](../../../README.md)
- [Data Bridge](../../../core/data-bridge.js)
- [Galaxy Names Pool](../../../core/galaxy-names.json)

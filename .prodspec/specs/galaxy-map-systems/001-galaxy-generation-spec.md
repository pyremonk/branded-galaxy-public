# Galaxy Generation

## Overview

Procedural or fixed galaxy layout with sectors and star systems. This feature generates the playing field for Branded Galaxy, creating a diverse galaxy map with interconnected systems, varying properties, and strategic hyperspace tunnel networks.

## Requirements

### FR-GG-001: Galaxy Layout Generation
- System shall generate a galaxy composed of sectors containing star systems
- Each galaxy shall have configurable size parameters (small/medium/large)
- Galaxy generation shall support both procedural and fixed/campaign layouts
- Generated galaxies shall be deterministic based on seed value (for multiplayer sync)

### FR-GG-002: Sector Structure
- Galaxy shall be divided into logical sectors (regions of space)
- Each sector shall contain 4-6 star systems (predefined associations)
- Sectors and their member systems are statically defined in `core/galaxy-names.json`
- Sector names are derived from a prominent system within the sector (e.g., "Kepler Sector")
- Sectors shall have spatial positioning for map visualization

### FR-GG-003: Star System Generation
- Each star system shall have unique properties:
  - Name and sector association from static definitions (`core/galaxy-names.json`)
  - Population level (0-10 scale)
  - Base resource production capacity
  - Starting loyalty/faction alignment
  - Special characteristics (manufacturing hub, research center, etc.)
- System properties shall be balanced for gameplay fairness

### FR-GG-004: Hyperspace Tunnel Network
- Highly-populated systems shall be connected via hyperspace tunnels
- Systems WITHOUT tunnels can still be reached by FTL-capable ships
- Non-FTL ships must use tunnels to navigate between systems
- Some systems may be orphaned/standalone (no tunnel connections)
- Connection density shall vary based on:
  - System population levels (higher pop = more likely to have tunnels)
  - Strategic importance
  - Distance between systems
- Tunnels shall not form a fully connected mesh (strategic variety and visual clarity)

### FR-GG-005: Special Locations
- Galaxy shall include special system types:
  - **Manufacturing Centers**: High production capacity (+50% materials)
  - **Research Facilities**: Boost technology development (+30% research)
  - **Trade Hubs**: Increased credit generation (+40% credits)
  - **Strategic Chokepoints**: Limited connections, high defensive value
  - **Neutral Zones**: Buffer regions between factions
  - **Uninhabited Systems**: Low population, minimal resources

### FR-GG-006: Strategic Balance
- Starting positions for factions shall be:
  - Spatially separated to prevent immediate conflict
  - Roughly equivalent in resource potential
  - Include a mix of system types for varied strategies
- Resource distribution across galaxy shall be balanced but not uniform
- High-value targets shall be positioned to encourage strategic competition

### FR-GG-007: Scalability
- Small galaxy: 6-8 sectors (24-48 systems)
- Medium galaxy: 10-14 sectors (40-70 systems)
- Large galaxy: 16-24 sectors (64-120 systems)
- Generation time shall be < 2 seconds for any galaxy size

## Constraints

### CN-GG-001: Performance
- Galaxy generation must complete before game start screen
- Data structures must support efficient pathfinding and queries
- Memory usage shall scale linearly with galaxy size

### CN-GG-002: Data Structure
- Galaxy data shall be serializable for save/load functionality
- System properties shall be extensible for future features
- Coordinate system shall support 2D map visualization

### CN-GG-003: Reproducibility
- Same seed value must always generate identical galaxy
- Generation algorithm must be deterministic across platforms
- Multiplayer games must have synchronized galaxy state

### CN-GG-004: Integration Points
- Galaxy data must integrate with:
  - Galaxy Map rendering (React/Phaser UI layer)
  - Fleet movement pathfinding
  - Resource management system
  - Faction starting positions
  - Save/load serialization

### CN-GG-005: Technical Limitations
- Pure JavaScript implementation (no TypeScript)
- ES module structure with `.js` extensions
- Compatible with Vite build system
- Browser-based execution (no Node.js-only APIs)

## Acceptance Criteria

### AC-GG-001: Galaxy Generation
- [ ] Galaxy generator creates reproducible layouts from seed
- [ ] Generated galaxy contains correct number of sectors (6-8, 10-14, or 16-24)
- [ ] Generated galaxy contains correct number of systems (24-120 based on sectors)
- [ ] All systems have required properties populated
- [ ] Hyperspace tunnels connect major systems (not necessarily all systems)
- [ ] Some systems may be orphaned (reachable only by FTL)
- [ ] Generation completes in < 2 seconds for largest galaxy size

### AC-GG-002: Sector Diversity
- [ ] Each sector contains 4-6 systems as defined in galaxy-names.json
- [ ] Sector names are unique and derived from member systems
- [ ] Sectors have spatial boundaries for visualization
- [ ] Systems maintain their static sector associations across all games

### AC-GG-003: System Properties
- [ ] Each system has unique name
- [ ] Population levels distribute across 0-10 range with variation
- [ ] Resource production values are balanced across galaxy
- [ ] Special locations appear with appropriate frequency:
  - Manufacturing Centers: 5-10% of systems
  - Research Facilities: 5-10% of systems
  - Trade Hubs: 8-12% of systems
  - Strategic Chokepoints: 3-5% of systems

### AC-GG-004: Hyperspace Network
- [ ] High-population systems (pop >= 6) are more likely to have tunnel connections
- [ ] Network forms interesting strategic layout (not fully connected mesh)
- [ ] Some systems may have zero tunnel connections (orphaned, FTL-only access)
- [ ] Chokepoint systems can exist with limited connections (2-3 tunnels)
- [ ] Low-population systems (pop < 4) often have fewer or no tunnels

### AC-GG-005: Faction Starting Positions
- [ ] Each faction starts with 3-5 controlled systems
- [ ] Starting systems are spatially separated (minimum distance maintained)
- [ ] Starting territories have comparable total resources
- [ ] Each faction starts with at least one special location type

### AC-GG-006: Data Export
- [ ] Galaxy state can be serialized to JSON
- [ ] Serialized galaxy can be deserialized without data loss
- [ ] Galaxy data structure is documented
- [ ] Export includes all system properties and connections

### AC-GG-007: Integration Ready
- [ ] Galaxy data structure compatible with Phaser rendering
- [ ] Coordinate system works with 2D canvas visualization
- [ ] System IDs are unique and usable as lookup keys
- [ ] Connection graph supports pathfinding algorithms

## Technical Notes

### Suggested Data Structure

```javascript
{
  seed: "galaxy-seed-123",
  size: "medium", // small/medium/large
  sectors: [
    {
      id: "sector-001",
      name: "Core Sector",
      position: { x: 500, y: 300 },
      systems: ["sys-001", "sys-002", "sys-003"]
    }
  ],
  systems: [
    {
      id: "sys-001",
      name: "Kepler Prime",
      sectorId: "sector-001",
      position: { x: 520, y: 310 },
      population: 8,
      resources: {
        credits: 100,
        materials: 50
      },
      loyalty: "brandAuthority", // or "union", "autoforge", "neutral"
      specialType: "manufacturingCenter", // or null
      connections: ["sys-002", "sys-005"]
    }
  ]
}
```

### Generation Algorithm Phases

1. **Sector Selection**: Select N sectors from static definitions based on galaxy size
2. **Sector Positioning**: Assign spatial positions to selected sectors in 2D space
3. **System Placement**: Place sector's predefined systems within sector boundaries
4. **Property Assignment**: Assign population, resources, special types to systems
5. **Connection Generation**: Build hyperspace network based on population/distance
6. **Faction Assignment**: Set starting positions and initial loyalties
7. **Validation**: Ensure connectivity and balance requirements met

### Static Sector Associations

The game uses a static JSON file defining sector groupings for game-to-game cohesiveness:
- **Location**: `core/galaxy-names.json`
- **Structure**: 31 predefined sectors, each containing 4-6 systems (150 total systems)
- **Naming**: Sectors named after prominent member systems ("Kepler Sector" contains "Kepler Prime")
- **Theme**: Corporate/industrial sci-fi (manufacturing, trade, prosperity themes)
- **Usage**: Generator selects 6-24 complete sectors based on galaxy size; system-sector associations never change

```javascript
// Example usage
import galaxyData from '../core/galaxy-names.json';

function selectSectors(count, rng) {
  const shuffled = rng.shuffle(galaxyData.sectors);
  return shuffled.slice(0, count); // Returns sectors with their systems
}

// Kepler Prime will ALWAYS be in Kepler Sector across all games
```

### Hyperspace Tunnels vs FTL Travel

**Design Philosophy**: Not all systems need tunnel connections
- **FTL-capable ships**: Can travel directly between any two systems (longer travel time, fuel cost)
- **Non-FTL ships**: Must use hyperspace tunnels (faster, cheaper, limited routes)
- **Strategic implications**:
  - Orphaned systems are harder to defend (no quick reinforcements via tunnels)
  - High-population systems with many tunnels become strategic hubs
  - Controlling tunnel chokepoints provides military/economic advantage
  - Low-population frontier systems often isolated (require FTL to reach)

### Integration Points

- **data-bridge.js**: Store generated galaxy in offline/cloud storage
- **boot-stage.js**: Trigger generation during game initialization
- **main-stage.js**: Receive galaxy data for rendering
- **sector.js**: Extend to work with generated system data
- **core/galaxy-names.json**: Static name pools for sectors and systems

## Future Enhancements

- Campaign-specific galaxy layouts with fixed strategic positions
- Dynamic galaxy events (star going nova, new hyperspace routes discovered)
- Faction-specific starting bonuses reflected in galaxy generation
- Import/export custom galaxy configurations
- Tunnel construction/destruction mechanics (build new routes during gameplay)
- Wormholes or jump gates for fast travel between distant systems
- Nebulae and hazard zones affecting FTL travel

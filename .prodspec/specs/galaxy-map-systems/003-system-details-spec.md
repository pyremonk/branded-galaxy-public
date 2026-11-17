# System Details

## Overview

The System Details feature provides comprehensive information about individual star systems within the galaxy. This includes system loyalty, population, resource production, special characteristics, defense installations, and current activities. System details are displayed through an interactive panel when a system is selected, enabling strategic decision-making.

## Requirements

### FR-SD-001: System Properties Display
- System shall expose the following core properties:
  - **Name**: Unique identifier (e.g., "Kepler Prime")
  - **Sector**: Parent sector region
  - **Loyalty**: Current faction control (Brand Authority/Union/Autoforge/Neutral)
  - **Population Level**: Scale 0-10 representing inhabitants
  - **Coordinates**: Position in galaxy map
  - **Special Type**: Manufacturing/Research/Trade/Strategic/None
- All properties shall be displayed in readable format
- Property changes shall update in real-time

### FR-SD-002: Resource Production Information
- System shall display resource generation per turn:
  - **Credits**: Economic output (baseline + modifiers)
  - **Materials**: Industrial production (baseline + modifiers)
  - **Recruits**: Population available for military/character recruitment
  - **Influence**: Diplomatic power generated
- Resource values shall show:
  - Base production
  - Loyalty modifier impact
  - Facility/building bonuses
  - Special location bonuses
  - Net total per turn

### FR-SD-003: Loyalty and Faction Support
- System loyalty shall be represented numerically and visually:
  - Loyalty meter (0-100 scale)
  - Current controlling faction
  - Trend indicator (rising/falling/stable)
  - Support levels for each faction
- Loyalty display shall show factors affecting current value:
  - Recent missions (diplomatic/sabotage)
  - Military occupation effects
  - Propaganda influence
  - Population happiness

### FR-SD-004: Special Location Details
- Systems with special characteristics shall display:
  - **Manufacturing Centers**: +50% materials production, shipyard bonus
  - **Research Facilities**: +30% research speed, tech development
  - **Trade Hubs**: +40% credit generation, diplomatic bonus
  - **Strategic Chokepoints**: Defensive advantages, limited routes
- Special location effects shall be clearly explained
- Visual icons shall represent special types

### FR-SD-005: Defense Installations Display
- System shall show defensive capabilities:
  - Ground troop garrison count and strength
  - Orbital defense platforms
  - Shield generators status
  - Ion cannon installations
  - Total defense rating calculation
- Defense details shall include:
  - Current strength vs. maximum capacity
  - Construction in progress
  - Maintenance cost

### FR-SD-006: Facilities and Buildings
- System shall list all constructed facilities:
  - Shipyards (ship construction capability)
  - Training facilities (character/unit recruitment)
  - Research labs (tech development bonus)
  - Defense platforms (combat strength)
  - Resource extractors (production boost)
- For each facility, display:
  - Build status (operational/under construction)
  - Level/upgrade tier
  - Production/bonus effects
  - Operating costs

### FR-SD-007: Current Activities
- System shall display ongoing activities:
  - Fleet currently stationed
  - Characters present in system
  - Active missions targeting this system
  - Construction queue
  - Combat status (if under attack)
- Activities shall update in real-time during gameplay

### FR-SD-008: Historical Events
- System shall track and display recent history:
  - Last loyalty change and cause
  - Recent battles (if any)
  - Recent missions executed here
  - Facility construction completions
- Event history limited to last 5-10 significant events

### FR-SD-009: Strategic Information
- System shall provide strategic context:
  - Connected systems via hyperspace routes
  - Distance to key locations (faction HQs, front lines)
  - Threat assessment (enemy fleet proximity)
  - Strategic value rating (resource output + location)
- Recommendations for player actions (if AI-assisted)

### FR-SD-010: Contextual Actions
- System detail panel shall provide quick action buttons:
  - Build facility (if owned)
  - Deploy fleet here (if owned)
  - Assign mission to system
  - View connected systems
  - Set construction queue
- Actions availability based on:
  - System ownership
  - Player resources
  - Current game state

## Constraints

### CN-SD-001: UI Integration
- System details shall display in React-based side panel
- Panel shall overlay Phaser map without blocking interaction
- Panel shall position consistently (right side or bottom)
- Panel shall be collapsible/expandable
- Panel must not interfere with map rendering performance

### CN-SD-002: Data Consistency
- System details must always reflect current game state
- Updates from missions, combat, or turn progression must sync immediately
- Offline mode and cloud mode must show identical information
- Multiplayer state changes must propagate to detail panel

### CN-SD-003: Performance
- Detail panel rendering must not cause lag when switching systems
- Data queries must complete in < 50ms
- Panel animations must maintain 60 FPS
- Image/icon loading must not block UI responsiveness

### CN-SD-004: Responsive Design
- Panel must scale appropriately for different screen sizes
- Minimum width: 300px, maximum: 500px
- Content must scroll if exceeds viewport height
- Mobile layout consideration for future (stacked instead of side-by-side)

### CN-SD-005: Accessibility
- Color alone shall not convey critical information
- Text contrast ratios meet WCAG AA standards
- Keyboard navigation supported
- Screen reader friendly labels and structure

## Acceptance Criteria

### AC-SD-001: Core Properties Display
- [ ] All system properties display correctly when system selected
- [ ] System name, sector, and loyalty show prominently
- [ ] Population level displays as numeric value and visual indicator
- [ ] Special location type shows with icon and description
- [ ] Coordinates visible for reference

### AC-SD-002: Resource Production
- [ ] Credits, materials, recruits, influence show per-turn values
- [ ] Resource breakdown shows base + modifiers clearly
- [ ] Special location bonuses reflected in totals
- [ ] Loyalty impact on production calculated correctly
- [ ] Facility bonuses add to resource totals

### AC-SD-003: Loyalty Information
- [ ] Loyalty meter displays current value (0-100)
- [ ] Controlling faction identified clearly
- [ ] Trend indicator shows recent loyalty direction
- [ ] Factors affecting loyalty are listed with impact values
- [ ] Loyalty updates immediately after missions/events

### AC-SD-004: Defense Details
- [ ] Total defense rating displays with breakdown
- [ ] Ground troops, platforms, shields, cannons listed individually
- [ ] Defense capacity shows current vs. maximum
- [ ] Construction in progress indicated with completion estimate
- [ ] Maintenance cost displayed

### AC-SD-005: Facilities List
- [ ] All constructed facilities appear in list
- [ ] Each facility shows name, level, and status
- [ ] Production/bonus effects clearly stated
- [ ] Construction queue displays with time remaining
- [ ] Facility upgrade options visible (if applicable)

### AC-SD-006: Current Activities
- [ ] Stationed fleets listed with strength indicator
- [ ] Characters present in system shown with portraits
- [ ] Active missions targeting system displayed
- [ ] Combat status clearly indicated if under attack
- [ ] Activity updates reflect real-time game state

### AC-SD-007: Strategic Context
- [ ] Connected systems listed as links
- [ ] Distance to key locations displayed
- [ ] Threat assessment indicator shows (safe/caution/danger)
- [ ] Strategic value rating calculated and shown
- [ ] Hyperspace route count visible

### AC-SD-008: Quick Actions
- [ ] Action buttons available based on ownership and state
- [ ] Clicking action button triggers appropriate game function
- [ ] Disabled actions show tooltip explaining why unavailable
- [ ] Actions update when game state changes (e.g., resources depleted)

### AC-SD-009: Panel Behavior
- [ ] Panel opens smoothly when system selected (< 200ms)
- [ ] Panel scrolls if content exceeds viewport height
- [ ] Panel collapses/expands with button toggle
- [ ] Selecting different system updates panel content immediately
- [ ] Deselecting system closes or empties panel gracefully

### AC-SD-010: Visual Design
- [ ] Panel uses GitHub-inspired dark theme colors
- [ ] Typography is readable and appropriately sized
- [ ] Icons and indicators are intuitive
- [ ] Layout is organized and not cluttered
- [ ] Hover states and interactions have visual feedback

## Technical Notes

### React Component Structure

```jsx
// SystemDetailPanel.jsx
const SystemDetailPanel = ({ systemId, onClose }) => {
  const systemData = useSystemData(systemId);
  
  return (
    <div className="system-detail-panel">
      <SystemHeader system={systemData} onClose={onClose} />
      <SystemProperties system={systemData} />
      <ResourceProduction system={systemData} />
      <LoyaltyMeter loyalty={systemData.loyalty} />
      <DefenseInfo defenses={systemData.defenses} />
      <FacilitiesList facilities={systemData.facilities} />
      <CurrentActivities activities={systemData.activities} />
      <QuickActions system={systemData} />
    </div>
  );
};
```

### Data Fetching Pattern

```javascript
// Custom hook for system data
const useSystemData = (systemId) => {
  const [systemData, setSystemData] = useState(null);
  
  useEffect(() => {
    const data = dataBridge.getSystemDetails(systemId);
    setSystemData(data);
    
    // Subscribe to updates
    const unsubscribe = dataBridge.onSystemUpdate(systemId, (updated) => {
      setSystemData(updated);
    });
    
    return unsubscribe;
  }, [systemId]);
  
  return systemData;
};
```

### System Data Model

```javascript
{
  id: "sys-001",
  name: "Kepler Prime",
  sectorId: "sector-001",
  position: { x: 520, y: 310 },
  population: 8,
  loyalty: {
    faction: "brandAuthority",
    value: 75,
    trend: "stable", // rising/falling/stable
    factors: [
      { name: "Diplomatic mission", impact: +10 },
      { name: "Military occupation", impact: -5 }
    ]
  },
  resources: {
    credits: { base: 100, modifiers: 20, total: 120 },
    materials: { base: 50, modifiers: 25, total: 75 },
    recruits: { base: 10, modifiers: 0, total: 10 },
    influence: { base: 5, modifiers: 2, total: 7 }
  },
  specialType: "manufacturingCenter",
  defenses: {
    groundTroops: { current: 500, max: 1000 },
    platforms: 3,
    shields: true,
    ionCannons: 1,
    rating: 450
  },
  facilities: [
    {
      type: "shipyard",
      level: 2,
      status: "operational",
      bonus: "+20% ship production speed"
    }
  ],
  activities: {
    fleets: ["fleet-001"],
    characters: ["char-042"],
    missions: ["mission-123"],
    construction: { facility: "research-lab", turnsRemaining: 3 },
    combat: null
  },
  connections: ["sys-002", "sys-005", "sys-008"],
  strategicValue: 85,
  threatLevel: "caution"
}
```

### Styling Considerations

- Use card-based layout with sections
- Employ subtle borders and spacing for visual separation
- Icons from a consistent icon library (consider Material Icons or similar)
- Color coding: loyalty (faction colors), threat (green/yellow/red), trend (arrows)

## Integration Points

- **data-bridge.js**: Fetch and subscribe to system state
- **main-stage.js**: System selection event triggers panel open
- **sector.js**: Clicking sector instance triggers detail display
- **App.jsx**: React component hierarchy includes detail panel
- **Future mission system**: Quick actions launch mission planning UI

## Future Enhancements

- Historical chart showing loyalty changes over time
- Detailed combat log for battles at this system
- System comparison view (compare two systems side-by-side)
- Import/export system reports
- System tagging and notes (player annotations)
- System renaming option for owned systems
- 3D planet visualization preview
- System trade routes and economic impact visualization

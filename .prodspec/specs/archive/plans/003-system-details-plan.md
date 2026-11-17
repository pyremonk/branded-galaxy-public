# System Details - Technical Implementation Plan

## Architecture Overview

The System Details feature is a **React-based UI panel** that displays comprehensive information about selected star systems. It operates as a **real-time data consumer** that fetches system state from DataBridge, subscribes to updates, and renders organized information with contextual actions. The panel serves as the primary interface for players to understand and interact with individual systems.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  System Details Panel (React)                │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ SystemDetail   │→ │useSystemData   │→ │DataBridge     │ │
│  │ Panel Component│  │Hook (Subscribe)│  │(State Source) │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
│         ↓                    ↓                    ↓         │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ Section        │  │Real-time Update│  │Action Handlers│ │
│  │ Components     │  │Subscriber      │  │(Build, Deploy)│ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             ↓
                System Data Displayed / Actions Executed
                             ↓
        ┌────────────────────┴────────────────────┐
        ↓                                         ↓
  Phaser Selection Events           DataBridge State Changes
  (system-selected)                 (loyalty, facilities, combat)
```

### Core Components

1. **SystemDetailPanel** - Root container component managing panel state
2. **SystemHeader** - Display system name, sector, special type with close button
3. **SystemProperties** - Show population, coordinates, loyalty at a glance
4. **ResourceProduction** - Resource per-turn output with breakdown
5. **LoyaltyMeter** - Visual loyalty display with trend and factors
6. **DefenseInfo** - Defense installations and ratings
7. **FacilitiesList** - Constructed facilities and construction queue
8. **CurrentActivities** - Fleets, characters, missions currently at system
9. **StrategicContext** - Connected systems, threat level, strategic value
10. **QuickActions** - Contextual action buttons (build, deploy, mission)

### Component Hierarchy

```jsx
<SystemDetailPanel systemId={selectedSystemId}>
  <PanelHeader onClose={handleClose} />
  <ScrollableContent>
    <SystemHeader system={systemData} />
    <SystemProperties system={systemData} />
    <ResourceProduction resources={systemData.resources} />
    <LoyaltyMeter loyalty={systemData.loyalty} />
    <DefenseInfo defenses={systemData.defenses} />
    <FacilitiesList facilities={systemData.facilities} />
    <CurrentActivities activities={systemData.activities} />
    <StrategicContext 
      connections={systemData.connections}
      threatLevel={systemData.threatLevel}
      strategicValue={systemData.strategicValue}
    />
    <QuickActions system={systemData} onAction={handleAction} />
  </ScrollableContent>
</SystemDetailPanel>
```

## Technical Approach

### Existing Codebase Integration

**Current State**:
- React app structure exists (`App.jsx`, `main.jsx`)
- `AuthScreen.jsx` component demonstrates React UI patterns
- DataBridge provides data access layer
- Phaser map (MainStage) dispatches system selection events
- No existing detail panel component

**Integration Strategy**:
- Create new component directory: `src/components/SystemDetails/`
- Panel renders conditionally when system is selected
- Listen for custom events from Phaser (`system-selected`)
- Fetch data via DataBridge using custom React hook
- Subscribe to real-time updates for live data sync
- Dispatch actions back to DataBridge when buttons clicked

### Event Flow

```javascript
// 1. User clicks system in Phaser map
MainStage.selectSystem(system) 
  → window.dispatchEvent(new CustomEvent('system-selected', { 
      detail: { systemId: 'sys-001' } 
    }))

// 2. React App catches event, updates state
const [selectedSystem, setSelectedSystem] = useState(null);
useEffect(() => {
  const handler = (e) => setSelectedSystem(e.detail.systemId);
  window.addEventListener('system-selected', handler);
  return () => window.removeEventListener('system-selected', handler);
}, []);

// 3. SystemDetailPanel renders with systemId
{selectedSystem && <SystemDetailPanel systemId={selectedSystem} />}

// 4. Custom hook fetches data and subscribes to updates
const systemData = useSystemData(systemId);

// 5. Panel displays data, updates automatically on state changes
```

### Data Flow Architecture

1. **Initial Load**: 
   - System selected → Panel receives systemId prop
   - `useSystemData` hook calls `dataBridge.getSystemDetails(systemId)`
   - Component renders with fetched data

2. **Real-Time Updates**:
   - Hook subscribes to DataBridge updates: `dataBridge.onSystemUpdate(systemId, callback)`
   - DataBridge notifies on state changes (loyalty shift, facility built, fleet arrives)
   - Hook updates component state → re-render with fresh data

3. **User Actions**:
   - User clicks "Build Facility" button
   - Action handler calls `dataBridge.buildFacility(systemId, facilityType)`
   - DataBridge updates state
   - Subscription triggers re-render with updated facilities list

4. **Cleanup**:
   - Component unmounts → unsubscribe from DataBridge
   - Prevent memory leaks from dangling subscriptions

## Implementation Strategy

### Phase 1: Panel Infrastructure and Layout
**Goal**: Establish basic panel structure with open/close functionality

#### Tasks:
1. **Create Component Directory Structure**:
   ```
   src/components/SystemDetails/
     ├── SystemDetailPanel.jsx       (root component)
     ├── SystemDetailPanel.css       (styles)
     ├── index.js                    (export)
     └── sections/                   (sub-components)
         ├── SystemHeader.jsx
         ├── SystemProperties.jsx
         ├── ResourceProduction.jsx
         └── ...
   ```

2. **Implement SystemDetailPanel Root Component**:
   - Accept `systemId` and `onClose` props
   - Render panel container with fixed positioning
   - Add close button in header
   - Implement collapsible/expandable toggle (future)
   - Setup scrollable content area

3. **Create Panel Layout and Styling**:
   - Position panel on right side of screen (fixed position)
   - Width: 400px (responsive: 300px min, 500px max)
   - Height: 100vh with scrollable content
   - Dark theme styling (`#0d1117` background, `#161b22` sections)
   - Z-index above map but below modals
   - Smooth slide-in animation (200ms)

4. **Integrate with App.jsx**:
   - Add state for selected system ID
   - Listen for `system-selected` custom event from Phaser
   - Conditionally render SystemDetailPanel when system selected
   - Handle panel close (clear selected system)

5. **Handle Deselection**:
   - Listen for `system-deselected` event
   - Click outside panel (optional: keep panel open)
   - ESC key closes panel
   - Animate slide-out on close

**Deliverables**:
- Panel opens when system selected
- Panel closes correctly
- Layout responsive and scrollable
- Smooth animations
- Dark theme styling applied

### Phase 2: Data Fetching and State Management
**Goal**: Implement data fetching with real-time updates

#### Tasks:
1. **Implement useSystemData Custom Hook**:
   ```javascript
   const useSystemData = (systemId) => {
     const [data, setData] = useState(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState(null);
     
     useEffect(() => {
       if (!systemId) return;
       
       setLoading(true);
       try {
         const systemData = dataBridge.getSystemDetails(systemId);
         setData(systemData);
         setLoading(false);
       } catch (err) {
         setError(err);
         setLoading(false);
       }
       
       // Subscribe to updates
       const unsubscribe = dataBridge.onSystemUpdate(systemId, (updated) => {
         setData(updated);
       });
       
       return () => unsubscribe();
     }, [systemId]);
     
     return { data, loading, error };
   };
   ```

2. **Extend DataBridge for System Details**:
   - Implement `dataBridge.getSystemDetails(systemId)` method
   - Returns comprehensive system data object
   - Handles both offline and cloud mode
   - Calculates derived values (defense rating, resource totals)

3. **Implement Update Subscription System**:
   - `dataBridge.onSystemUpdate(systemId, callback)` method
   - Notifies subscribers when system state changes
   - Returns unsubscribe function
   - Efficient notification (only for relevant systems)

4. **Loading and Error States**:
   - Display loading spinner while fetching
   - Show error message if data fetch fails
   - Graceful degradation if DataBridge unavailable
   - Retry mechanism for failed fetches

5. **Data Caching Strategy**:
   - Cache fetched system data in DataBridge
   - Invalidate cache on updates
   - Reduce redundant queries
   - Consider stale-while-revalidate pattern

**Deliverables**:
- Data fetching hook functional
- Real-time updates working
- Loading states display correctly
- Error handling robust
- Data caching improves performance

### Phase 3: System Header and Core Properties
**Goal**: Display system identification and basic properties

#### Tasks:
1. **Implement SystemHeader Component**:
   - Display system name prominently (large font)
   - Show sector name (subtitle)
   - Display special type icon and label
   - Add close button (X icon)
   - Faction color accent (border or background tint)

2. **Implement SystemProperties Component**:
   - Population level with visual indicator (bar chart or number)
   - Coordinates in galaxy (x, y)
   - Controlling faction with color badge
   - System ID for reference (optional, dev mode)

3. **Create Special Type Icons**:
   - Manufacturing Center: factory icon
   - Research Facility: beaker icon
   - Trade Hub: money/commerce icon
   - Strategic Chokepoint: shield/fortress icon
   - None: generic planet icon

4. **Styling for Readability**:
   - Clear visual hierarchy (name > sector > details)
   - Faction colors for loyalty (Brand Authority blue, Union green, etc.)
   - Icons sized appropriately (16x16 or 24x24)
   - Spacing and padding for comfortable reading

**Deliverables**:
- System name and sector display clearly
- Special type shown with icon
- Population and coordinates visible
- Faction identification clear
- Visually appealing header

### Phase 4: Resource Production Display
**Goal**: Show resource generation with detailed breakdown

#### Tasks:
1. **Implement ResourceProduction Component**:
   - Display four resource types: Credits, Materials, Recruits, Influence
   - Show total per-turn value prominently
   - Expandable breakdown: base + modifiers
   - Color coding for resource types (gold for credits, gray for materials, etc.)

2. **Resource Breakdown Logic**:
   - Calculate base production from system data
   - Apply loyalty modifier (reduced output if low loyalty)
   - Add facility bonuses (shipyard, research lab, etc.)
   - Include special location bonuses (manufacturing +50% materials)
   - Sum to net total

3. **Visual Design**:
   - Resource icons (💰 credits, 🔧 materials, 👥 recruits, ⭐ influence)
   - Progress bars showing production relative to max
   - Expandable accordion for breakdown details
   - Positive modifier in green, negative in red

4. **Breakdown Detail View**:
   ```
   Credits: 120 per turn
     Base production: 100
     Loyalty modifier: +10
     Trade Hub bonus: +10
   ```

**Deliverables**:
- Four resource types display with totals
- Breakdown shows calculation
- Visual design clear and informative
- Icons and colors aid understanding

### Phase 5: Loyalty Meter and Faction Support
**Goal**: Display loyalty status with visual meter and factors

#### Tasks:
1. **Implement LoyaltyMeter Component**:
   - Visual meter (progress bar) showing 0-100 loyalty
   - Current controlling faction with color coding
   - Trend indicator: ↑ rising, ↓ falling, → stable
   - Loyalty value as number (e.g., "75%")

2. **Loyalty Color Coding**:
   - High loyalty (70-100): Faction color at full brightness
   - Medium loyalty (40-69): Faction color at medium brightness
   - Low loyalty (0-39): Grayed out or red tint
   - Visual warning if loyalty critically low

3. **Loyalty Factors List**:
   - Display factors affecting loyalty
   - Each factor shows name and impact (+/- value)
   - Recent missions: "Diplomatic mission: +10"
   - Military presence: "Occupation: -5"
   - Sum matches current loyalty value

4. **Trend Calculation**:
   - Compare current loyalty to previous turn
   - Rising if increased, falling if decreased
   - Stable if unchanged
   - Display arrow icon indicating trend

**Deliverables**:
- Loyalty meter visually clear
- Faction control identified
- Trend indicator functional
- Factors listed with impacts
- Color coding aids understanding

### Phase 6: Defense Information
**Goal**: Display defensive capabilities and installations

#### Tasks:
1. **Implement DefenseInfo Component**:
   - Total defense rating (calculated from all defenses)
   - Breakdown of defense types:
     - Ground troops (count and strength)
     - Orbital platforms (count)
     - Shield generators (active/inactive)
     - Ion cannons (count)
   - Visual indicators for each type

2. **Defense Rating Calculation**:
   - Sum all defense contributions
   - Ground troops: value per troop
   - Platforms: fixed value per platform
   - Shields: multiplier effect
   - Ion cannons: high value per cannon
   - Display total as numeric rating

3. **Capacity Display**:
   - Show current vs. maximum for ground troops
   - Example: "Ground Troops: 500 / 1000"
   - Progress bar for visual representation
   - Upgrade prompt if below capacity

4. **Construction in Progress**:
   - Show defense facilities being built
   - Display time remaining (turns)
   - Preview defense increase when complete

**Deliverables**:
- Defense rating displays prominently
- Breakdown shows all defense types
- Capacity indicators clear
- Construction progress visible

### Phase 7: Facilities List and Construction Queue
**Goal**: Display constructed facilities and ongoing construction

#### Tasks:
1. **Implement FacilitiesList Component**:
   - List all operational facilities
   - Each facility shows:
     - Name and type
     - Level/tier
     - Production bonus (e.g., "+20% ship production")
     - Operating cost (maintenance)
     - Status (operational/damaged)
   - Group by facility type

2. **Facility Icons and Styling**:
   - Unique icon for each facility type
   - Operational: full color
   - Under construction: grayed or outlined
   - Damaged: red tint or warning icon

3. **Construction Queue Display**:
   - Show facilities being built
   - Progress bar with turns remaining
   - Estimated completion turn
   - Cancel construction button (if allowed)

4. **Facility Actions**:
   - Upgrade button for facilities (if applicable)
   - Repair button for damaged facilities
   - Demolish button (with confirmation)

**Deliverables**:
- All facilities listed clearly
- Construction queue visible
- Progress bars functional
- Facility details comprehensive

### Phase 8: Current Activities
**Goal**: Show fleets, characters, missions, and events at system

#### Tasks:
1. **Implement CurrentActivities Component**:
   - Section for stationed fleets
   - Section for characters present
   - Section for active missions targeting system
   - Section for combat status (if under attack)

2. **Fleet Display**:
   - List each fleet at system
   - Show fleet name or ID
   - Display strength indicator (ship count or power rating)
   - Click to view fleet details (link to fleet panel)

3. **Character Display**:
   - List characters present
   - Display character portrait or icon
   - Show character name and role
   - Click to view character details

4. **Mission Display**:
   - List missions targeting this system
   - Show mission type (diplomatic, sabotage, etc.)
   - Display estimated completion time
   - Indicate mission success probability

5. **Combat Status**:
   - If system under attack, show warning
   - Display attacking faction
   - Show combat round or phase
   - Link to combat resolution view

**Deliverables**:
- Fleets listed with details
- Characters displayed with portraits
- Missions shown with status
- Combat indicator prominent
- All activities clickable for details

### Phase 9: Strategic Context and Connections
**Goal**: Provide strategic information and connected systems

#### Tasks:
1. **Implement StrategicContext Component**:
   - List connected systems (hyperspace routes)
   - Display distance to key locations (faction HQs, front lines)
   - Show threat assessment (safe/caution/danger)
   - Display strategic value rating (0-100)

2. **Connected Systems List**:
   - Show all systems connected by tunnels
   - Each system as clickable link (selects that system)
   - Display system name and faction control
   - Color-code by faction
   - Show orphaned status if no connections

3. **Threat Assessment**:
   - Calculate based on enemy fleet proximity
   - Safe: No enemies nearby (green)
   - Caution: Enemies within 2 jumps (yellow)
   - Danger: Enemies adjacent or attacking (red)
   - Visual indicator (icon or color badge)

4. **Strategic Value Display**:
   - Numeric rating (0-100)
   - Breakdown of value components:
     - Resource production weight
     - Special location bonus
     - Strategic position (chokepoint, central location)
   - Help tooltip explaining calculation

**Deliverables**:
- Connected systems listed as links
- Threat level clearly indicated
- Strategic value displayed and explained
- Distance to key locations shown

### Phase 10: Quick Actions and Contextual Buttons
**Goal**: Provide action buttons for common tasks

#### Tasks:
1. **Implement QuickActions Component**:
   - Dynamic button list based on system ownership and state
   - Buttons styled as primary, secondary, or danger
   - Disabled state for unavailable actions
   - Tooltips explaining why action unavailable

2. **Action Button Logic**:
   - **Owned Systems**:
     - Build Facility (if resources available)
     - Deploy Fleet (if fleets available)
     - Set Construction Queue
     - Manage Production
   - **Enemy Systems**:
     - Plan Mission (sabotage, diplomacy)
     - Send Fleet (attack)
     - Gather Intelligence
   - **Neutral Systems**:
     - Diplomatic Mission
     - Scout System
     - Establish Trade Route

3. **Action Handlers**:
   - Click button → dispatch action to game logic
   - Show confirmation modal if needed (e.g., "Attack this system?")
   - Provide feedback on success (toast notification)
   - Handle errors gracefully (not enough resources, etc.)

4. **Availability Checks**:
   - Check player resources before enabling build actions
   - Check fleet availability before deploy actions
   - Check prerequisites (tech requirements, etc.)
   - Display reason in tooltip if disabled

**Deliverables**:
- Action buttons render based on context
- Buttons enable/disable correctly
- Click triggers appropriate action
- Tooltips explain unavailability
- Confirmation dialogs for destructive actions

### Phase 11: Polish, Performance, and Accessibility
**Goal**: Optimize performance and ensure accessibility

#### Tasks:
1. **Performance Optimization**:
   - Memoize expensive calculations (defense rating, strategic value)
   - Use React.memo for sub-components
   - Virtualize long lists (if > 50 items)
   - Debounce rapid state updates
   - Lazy load images/icons

2. **Animation Polish**:
   - Smooth slide-in/out transitions
   - Fade animations for content changes
   - Loading skeleton screens
   - Micro-interactions (button hover, click feedback)

3. **Accessibility Improvements**:
   - Semantic HTML (proper headings, sections)
   - ARIA labels for icons and buttons
   - Keyboard navigation support (Tab, Enter, ESC)
   - Focus indicators visible
   - Color contrast meets WCAG AA (4.5:1 for text)
   - Screen reader announcements for updates

4. **Responsive Design**:
   - Test at various viewport sizes
   - Adjust panel width on smaller screens
   - Stack sections vertically if needed
   - Ensure scrolling works on touch devices
   - Mobile layout considerations (future)

5. **Error Boundaries**:
   - Wrap panel in React error boundary
   - Show fallback UI if component crashes
   - Log errors for debugging
   - Allow user to dismiss error and try again

**Deliverables**:
- Panel renders smoothly (60 FPS)
- Animations polished
- Accessible via keyboard
- WCAG AA compliant
- Error handling robust
- Responsive to screen sizes

## Technical Decisions

### Decision 1: React-based Panel vs. Phaser UI
**Choice**: React-based panel using standard DOM/CSS

**Rationale**:
- System details is information-heavy UI (text, lists, buttons)
- React excels at component composition and state management
- CSS provides better typography and layout control
- Easier to style with existing design systems
- Better accessibility support (semantic HTML, ARIA)
- Phaser best for game rendering, React best for UI

**Alternatives Considered**:
- Phaser UI using Containers and Text objects
  - Pro: Everything in one canvas
  - Con: Limited styling, harder to layout complex UI
- HTML overlay positioned via CSS
  - Pro: Simpler than React
  - Con: State management more difficult

**Trade-offs**: React adds bundle size, but benefits far outweigh cost.

### Decision 2: Custom Hook for Data Fetching
**Choice**: `useSystemData` custom hook with subscription pattern

**Rationale**:
- Encapsulates data fetching logic
- Reusable across components if needed
- Built-in loading and error states
- Automatic cleanup on unmount (prevent leaks)
- Follows React best practices
- Easy to test in isolation

**Implementation**:
```javascript
const useSystemData = (systemId) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const systemData = dataBridge.getSystemDetails(systemId);
    setData(systemData);
    setLoading(false);
    
    const unsubscribe = dataBridge.onSystemUpdate(systemId, setData);
    return unsubscribe;
  }, [systemId]);
  
  return { data, loading };
};
```

**Alternatives Considered**:
- Fetch in component directly: Mixes concerns, harder to reuse
- Redux/global state: Overkill for current needs
- React Query: Additional dependency, but consider for future

**Trade-offs**: Custom hook requires maintaining subscription system in DataBridge.

### Decision 3: Panel Positioning Strategy
**Choice**: Fixed position on right side with slide-in animation

**Rationale**:
- Consistent position aids muscle memory
- Doesn't obscure center of map (main gameplay area)
- Easy to implement with CSS
- Slide animation provides smooth transition
- Can be collapsed/hidden if needed

**Styling**:
```css
.system-detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 400px;
  height: 100vh;
  background: #0d1117;
  transform: translateX(100%);
  transition: transform 200ms ease-out;
  z-index: 50;
}

.system-detail-panel.open {
  transform: translateX(0);
}
```

**Alternatives Considered**:
- Center modal: Blocks map view
- Bottom panel: Limited vertical space
- Floating panel: Can be dragged, but complex to implement

**Trade-offs**: Fixed position reduces screen space for map, but acceptable.

### Decision 4: Component Composition Strategy
**Choice**: Granular sub-components for each section

**Rationale**:
- Single Responsibility Principle (each component has one job)
- Easier to test individual sections
- Can reuse components elsewhere (e.g., ResourceProduction in other views)
- Improves performance (only re-render changed sections)
- Better code organization

**Structure**:
```jsx
<SystemDetailPanel>
  <SystemHeader />
  <SystemProperties />
  <ResourceProduction />
  <LoyaltyMeter />
  <DefenseInfo />
  {/* ... more sections */}
</SystemDetailPanel>
```

**Alternatives Considered**:
- Monolithic component: Simpler but less maintainable
- Extreme granularity: Over-engineering, too many files

**Trade-offs**: More files to manage, but organized codebase worth it.

### Decision 5: Real-Time Update Mechanism
**Choice**: Subscription pattern with DataBridge notifications

**Rationale**:
- Push-based updates more efficient than polling
- React re-renders only when data changes
- Unsubscribe prevents memory leaks
- Works for both single-player and multiplayer (future)
- Low latency (immediate updates)

**Implementation**:
```javascript
// DataBridge implementation
class DataBridge {
  constructor() {
    this.subscribers = new Map();
  }
  
  onSystemUpdate(systemId, callback) {
    if (!this.subscribers.has(systemId)) {
      this.subscribers.set(systemId, new Set());
    }
    this.subscribers.get(systemId).add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.get(systemId)?.delete(callback);
    };
  }
  
  notifySystemUpdate(systemId, updatedData) {
    this.subscribers.get(systemId)?.forEach(callback => {
      callback(updatedData);
    });
  }
}
```

**Alternatives Considered**:
- Polling: Wasteful, higher latency
- Global state (Redux): More complex setup
- WebSocket: Overkill for local single-player

**Trade-offs**: Requires maintaining subscriber list, but efficient and scalable.

### Decision 6: Action Handler Pattern
**Choice**: Centralized action handlers in parent component, passed as props

**Rationale**:
- Child components remain presentational (easier to test)
- Action logic centralized (easier to debug)
- Can intercept all actions (logging, analytics)
- Easier to add confirmation dialogs or validation

**Pattern**:
```jsx
const SystemDetailPanel = ({ systemId }) => {
  const handleAction = (actionType, params) => {
    switch (actionType) {
      case 'build-facility':
        dataBridge.buildFacility(systemId, params.facilityType);
        break;
      case 'deploy-fleet':
        dataBridge.deployFleet(params.fleetId, systemId);
        break;
      // ... more actions
    }
  };
  
  return (
    <div>
      {/* ... */}
      <QuickActions onAction={handleAction} />
    </div>
  );
};
```

**Alternatives Considered**:
- Each component handles own actions: Scattered logic
- Direct DataBridge calls in child components: Tight coupling

**Trade-offs**: Requires passing callbacks through props, but better separation of concerns.

## Dependencies

### Internal Dependencies
- **data-bridge.js**: Primary data source for system details
- **main-stage.js**: Dispatches system selection events
- **App.jsx**: Hosts SystemDetailPanel component
- **sector.js**: Triggers selection when clicked
- **core/galaxy-generator.js**: Generates system data consumed by panel

### External Dependencies
- **React**: Already in project (check version in package.json)
- **React Hooks**: useState, useEffect, useMemo, useCallback
- No additional external libraries needed initially

### Optional Dependencies (Future):
- **react-icons**: Icon library for consistent iconography
- **framer-motion**: Advanced animations
- **react-window**: Virtual scrolling for long lists

### Data Structure Dependencies
- System data structure from galaxy generator
- Resource calculation formulas
- Defense rating algorithm
- Loyalty calculation system
- Facility definitions and effects

## Testing Approach

### Manual Testing Checklist

**Panel Behavior Tests**:
- [ ] Panel opens when system selected in Phaser map
- [ ] Panel closes when close button clicked
- [ ] Panel closes when ESC key pressed
- [ ] Panel updates when different system selected
- [ ] Slide-in/out animations smooth (200ms)
- [ ] Panel scrollable if content exceeds viewport height

**Data Display Tests**:
- [ ] System name displays correctly
- [ ] Sector name shows
- [ ] Population level accurate
- [ ] Coordinates match system position
- [ ] Special type shows with correct icon
- [ ] Controlling faction identified with color

**Resource Production Tests**:
- [ ] All four resource types display (credits, materials, recruits, influence)
- [ ] Total per-turn values correct
- [ ] Breakdown expands and shows calculation
- [ ] Base + modifiers sum to total
- [ ] Special location bonuses reflected
- [ ] Loyalty impact calculated correctly

**Loyalty Display Tests**:
- [ ] Loyalty meter shows value (0-100)
- [ ] Faction color indicates controller
- [ ] Trend indicator correct (rising/falling/stable)
- [ ] Factors list shows all influences
- [ ] Factor impacts sum correctly
- [ ] Loyalty updates in real-time after missions

**Defense Information Tests**:
- [ ] Total defense rating displays
- [ ] Ground troops show current/max capacity
- [ ] Orbital platforms count correct
- [ ] Shield status shows (active/inactive)
- [ ] Ion cannon count displays
- [ ] Construction in progress shown with time remaining

**Facilities Tests**:
- [ ] All operational facilities listed
- [ ] Each facility shows level and bonus effects
- [ ] Construction queue displays with progress
- [ ] Facility icons render correctly
- [ ] Operating costs shown
- [ ] Facility actions (upgrade, repair) available if applicable

**Activities Tests**:
- [ ] Stationed fleets listed with names
- [ ] Characters present shown with portraits
- [ ] Active missions display with details
- [ ] Combat status indicates if under attack
- [ ] All activities update in real-time

**Strategic Context Tests**:
- [ ] Connected systems listed as clickable links
- [ ] Clicking connected system selects it (updates panel)
- [ ] Threat level indicator correct (safe/caution/danger)
- [ ] Strategic value rating displays
- [ ] Distance to key locations shown

**Quick Actions Tests**:
- [ ] Owned system shows build, deploy, manage actions
- [ ] Enemy system shows mission, attack, intelligence actions
- [ ] Neutral system shows diplomatic, scout, trade actions
- [ ] Disabled actions show tooltip explaining why
- [ ] Clicking action triggers appropriate game logic
- [ ] Confirmation dialogs appear for destructive actions

**Real-Time Update Tests**:
- [ ] Loyalty changes reflect immediately in panel
- [ ] Facility construction completion updates list
- [ ] Fleet arrivals/departures update activities
- [ ] Resource production changes after facility built
- [ ] Defense updates when installations constructed

**Performance Tests**:
- [ ] Panel opens in < 200ms
- [ ] Data fetch completes in < 50ms
- [ ] Panel renders smoothly (60 FPS)
- [ ] Switching systems updates instantly (< 100ms)
- [ ] No memory leaks (unsubscribe on unmount)

**Responsive Design Tests**:
- [ ] Panel width adjusts to viewport (300-500px)
- [ ] Content scrolls correctly if exceeds height
- [ ] Layout remains organized at 1280x720
- [ ] Layout scales well at 1920x1080
- [ ] Touch scrolling works on tablets (future)

**Accessibility Tests**:
- [ ] Keyboard navigation works (Tab through elements)
- [ ] Focus indicators visible
- [ ] ESC closes panel
- [ ] Screen reader announces section headings
- [ ] Color contrast meets WCAG AA (4.5:1 text)
- [ ] ARIA labels present on icon buttons

**Integration Tests**:
- [ ] Panel fetches from DataBridge successfully
- [ ] Offline mode data displays correctly
- [ ] Cloud mode data displays correctly
- [ ] Action buttons update DataBridge state
- [ ] Phaser map selection triggers panel open
- [ ] React state syncs with Phaser events

**Edge Cases**:
- [ ] Handles missing or null system data gracefully
- [ ] Shows error message if data fetch fails
- [ ] Empty facilities list displays appropriately
- [ ] No connected systems (orphaned) handled correctly
- [ ] Long system names truncate or wrap
- [ ] Very high resource values format correctly (1000+ → 1K)

### Integration Testing Scenarios

1. **System Selection → Panel Display Flow**:
   - User clicks system on Phaser map
   - Phaser dispatches `system-selected` event
   - React catches event, updates state with systemId
   - SystemDetailPanel renders, calls useSystemData hook
   - Hook fetches data from DataBridge
   - Panel displays all sections with data
   - User sees complete system information

2. **Build Facility Action Flow**:
   - User selects owned system
   - Panel displays quick actions including "Build Facility"
   - User clicks "Build Facility" button
   - Modal/dropdown shows facility options
   - User selects "Research Lab" and confirms
   - Action handler calls `dataBridge.buildFacility(systemId, 'research-lab')`
   - DataBridge updates system state (adds to construction queue)
   - Subscription notifies panel of update
   - Panel re-renders showing Research Lab in construction queue

3. **Real-Time Loyalty Update Flow**:
   - Panel displays system with 50% loyalty to Brand Authority
   - Game processes turn, diplomatic mission completes (+15 loyalty)
   - DataBridge updates system loyalty to 65%
   - DataBridge notifies subscribers via `notifySystemUpdate()`
   - Panel's useSystemData hook receives update
   - Component state updates, triggers re-render
   - Loyalty meter animates to new 65% value
   - Factors list updates to include "Diplomatic mission: +15"

4. **Multi-System Navigation Flow**:
   - User views "Kepler Prime" system details
   - Panel shows connected systems including "Nova Station"
   - User clicks "Nova Station" link in connected systems
   - Click dispatches selection event to Phaser
   - Phaser selects Nova Station system
   - Panel receives new systemId prop
   - useSystemData hook fetches Nova Station data
   - Panel content smoothly transitions to Nova Station details

### Component Testing (Future)

Using React Testing Library:

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import { SystemDetailPanel } from './SystemDetailPanel';

describe('SystemDetailPanel', () => {
  it('renders system name', async () => {
    render(<SystemDetailPanel systemId="sys-001" />);
    
    await waitFor(() => {
      expect(screen.getByText('Kepler Prime')).toBeInTheDocument();
    });
  });
  
  it('displays resource production', async () => {
    render(<SystemDetailPanel systemId="sys-001" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Credits:/)).toBeInTheDocument();
      expect(screen.getByText(/120 per turn/)).toBeInTheDocument();
    });
  });
  
  it('calls action handler when button clicked', async () => {
    const handleAction = jest.fn();
    render(
      <SystemDetailPanel 
        systemId="sys-001" 
        onAction={handleAction}
      />
    );
    
    const buildButton = screen.getByText('Build Facility');
    buildButton.click();
    
    expect(handleAction).toHaveBeenCalledWith('build-facility', expect.any(Object));
  });
});
```

## Performance Considerations

### Expected Bottlenecks

1. **Data Fetching on System Selection**:
   - Fetching comprehensive system data from DataBridge
   - **Target**: < 50ms fetch time
   - **Mitigation**: Cache system data in DataBridge, invalidate on updates
   - **Optimization**: Pre-fetch adjacent system data (predict next selection)

2. **Real-Time Updates Triggering Re-Renders**:
   - Frequent state updates cause component re-renders
   - **Target**: < 16ms render time (60 FPS)
   - **Mitigation**: Memoize expensive calculations, use React.memo
   - **Optimization**: Batch updates (debounce rapid state changes)

3. **Long Lists (Facilities, Factors)**:
   - Rendering 50+ facilities could slow down
   - **Target**: Smooth scroll at 60 FPS
   - **Mitigation**: Virtual scrolling with react-window
   - **Optimization**: Lazy render off-screen items

4. **Complex Calculations (Defense Rating, Strategic Value)**:
   - Calculating derived values on every render
   - **Target**: < 5ms calculation time
   - **Mitigation**: Memoize with useMemo
   - **Optimization**: Calculate in DataBridge, cache results

### Optimization Strategies

```javascript
// Memoize expensive calculations
const ResourceProduction = ({ resources }) => {
  const totalProduction = useMemo(() => {
    return Object.values(resources).reduce((sum, res) => sum + res.total, 0);
  }, [resources]);
  
  return <div>Total: {totalProduction}</div>;
};

// Memoize component to prevent unnecessary re-renders
const SystemHeader = React.memo(({ system, onClose }) => {
  return (
    <div>
      <h2>{system.name}</h2>
      <button onClick={onClose}>Close</button>
    </div>
  );
});

// Debounce rapid updates
const useSystemData = (systemId) => {
  const [data, setData] = useState(null);
  const updateTimeoutRef = useRef(null);
  
  useEffect(() => {
    const handleUpdate = (newData) => {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        setData(newData);
      }, 50); // Batch updates within 50ms
    };
    
    const unsubscribe = dataBridge.onSystemUpdate(systemId, handleUpdate);
    return () => {
      clearTimeout(updateTimeoutRef.current);
      unsubscribe();
    };
  }, [systemId]);
  
  return data;
};

// Virtual scrolling for long lists (if needed)
import { FixedSizeList } from 'react-window';

const FacilitiesList = ({ facilities }) => {
  if (facilities.length < 20) {
    // Normal rendering for short lists
    return facilities.map(f => <FacilityItem key={f.id} facility={f} />);
  }
  
  // Virtual scrolling for long lists
  return (
    <FixedSizeList
      height={400}
      itemCount={facilities.length}
      itemSize={60}
    >
      {({ index, style }) => (
        <div style={style}>
          <FacilityItem facility={facilities[index]} />
        </div>
      )}
    </FixedSizeList>
  );
};
```

### Memory Management

- **Subscription Cleanup**: Always unsubscribe in useEffect cleanup
- **Event Listener Cleanup**: Remove event listeners on unmount
- **Image Caching**: Reuse loaded images/icons across renders
- **Component Unmounting**: Clear state references

**Memory Budget**:
- Component tree: ~50KB (DOM nodes)
- System data cache: ~10KB per system
- Images/icons: ~100KB (shared across all panels)
- Event handlers: ~5KB
- **Total**: ~200KB per panel instance

### Render Performance

At 60 FPS, frame budget = 16.67ms:
- **Data fetch**: Not in render path (async)
- **Component render**: 5ms (JSX → DOM)
- **Layout calculation**: 3ms (browser)
- **Paint**: 5ms (browser)
- **Buffer**: 3.67ms

Optimization targets:
- Use React DevTools Profiler to identify slow components
- Keep component render time < 5ms
- Minimize re-renders with React.memo and useMemo
- Avoid inline function/object creation in render

## Risk Mitigation

### Risk 1: DataBridge Integration Complexity
**Likelihood**: Medium  
**Impact**: High (panel can't fetch data)

**Mitigation**:
- Define clear API contract for DataBridge methods
- Mock DataBridge for component testing
- Implement fallback if DataBridge unavailable
- Test both offline and cloud modes thoroughly
- Document DataBridge API in IMPLEMENTATION_SUMMARY.md

### Risk 2: Performance Degradation with Frequent Updates
**Likelihood**: Medium  
**Impact**: Medium (laggy UI)

**Mitigation**:
- Debounce rapid state updates (50ms threshold)
- Memoize expensive calculations and components
- Use React DevTools Profiler to identify bottlenecks
- Implement virtual scrolling for long lists
- Set performance targets and monitor regularly

### Risk 3: Real-Time Subscription Memory Leaks
**Likelihood**: Medium  
**Impact**: High (browser crash over time)

**Mitigation**:
- Always return unsubscribe function from hooks
- Test subscription cleanup in component unmount
- Use React DevTools to detect memory leaks
- Implement subscriber limit per system (max 10 subscribers)
- Add logging to track subscription count

### Risk 4: Complex State Management
**Likelihood**: Low  
**Impact**: Medium (bugs, inconsistent state)

**Mitigation**:
- Keep state simple and local to panel
- Use custom hook to encapsulate data logic
- Consider Redux if complexity grows
- Document state flow clearly
- Test state transitions thoroughly

### Risk 5: Accessibility Non-Compliance
**Likelihood**: Low  
**Impact**: Medium (excludes users)

**Mitigation**:
- Use semantic HTML from the start
- Test with keyboard navigation early
- Run automated accessibility audits (axe, Lighthouse)
- Test with screen reader (NVDA or JAWS)
- Follow WCAG AA guidelines strictly

### Risk 6: Panel Obscures Map During Critical Actions
**Likelihood**: Low  
**Impact**: Low (poor UX)

**Mitigation**:
- Position panel on side (not center)
- Implement collapse/expand toggle
- Consider transparency or resizing options
- Test with various map sizes and zoom levels
- Allow panel to be closed easily (ESC, click outside)

## Next Steps

After implementing this plan:

1. **Update Feature Catalog**: Mark system-details as "In Progress"
2. **Update Backlog**: Add implementation work to backlog
3. **Begin Implementation**: Follow phase-by-phase task breakdown (see Implementation Tasks below)
4. **Incremental Testing**: Test each phase before proceeding to next
5. **Icon/Asset Creation**: Design or source icons for facilities, resources, special types
6. **Style Guide**: Document color palette, typography, spacing for consistency
7. **Documentation**: Update README and IMPLEMENTATION_SUMMARY when complete
8. **User Testing**: Get feedback on panel usability and information density

---

## Implementation Tasks

## Overview
This task breakdown follows the 11-phase implementation plan. Each task is actionable and can be completed independently or as part of a sequence. Mark tasks complete as they are finished.

---

## Phase 1: Panel Infrastructure and Layout
**Goal**: Establish basic panel structure with open/close functionality

**Status**: Complete (monolithic component instead of directory structure)

### Component Directory Structure
- [ ] Create directory `src/components/SystemDetails/`
- [x] Create `SystemDetailPanel.jsx` main component file
- [x] Create `SystemDetailPanel.css` stylesheet
- [ ] Create `index.js` export file
- [ ] Create `sections/` subdirectory for sub-components
- [x] Test directory structure correct

**Note**: Implemented as single file `SystemDetails.jsx` instead of directory structure

### SystemDetailPanel Root Component
- [x] Implement SystemDetailPanel functional component
- [ ] Accept `systemId` prop
- [ ] Accept `onClose` prop (optional callback)
- [x] Render panel container div
- [x] Add close button in header
- [x] Handle close button click
- [x] Test component renders

**Note**: Component accepts `phaserGame` prop and listens to events instead of systemId prop

### Panel Layout and Styling
- [x] Style panel with fixed position on right side
- [x] Set width: 400px (responsive: 300px min, 500px max)
- [x] Set height: 100vh
- [x] Set background: #0d1117 (dark theme)
- [x] Set z-index: 50 (above map, below modals)
- [x] Add border-left with subtle color
- [x] Test panel positioned correctly

**Note**: Uses 360px width, max-height instead of full height

### Scrollable Content Area
- [x] Create scrollable content wrapper inside panel
- [x] Use `overflow-y: auto` for vertical scrolling
- [x] Style scrollbar (dark theme)
- [x] Add padding for content spacing
- [x] Test scrolling works when content exceeds height

### Slide-In Animation
- [x] Add CSS transition for slide-in effect
- [x] Initial state: `transform: translateX(100%)`
- [x] Open state: `transform: translateX(0)`
- [x] Transition duration: 200ms
- [x] Easing: ease-out
- [x] Test animation smooth

**Note**: Uses 300ms duration and opacity + translateX animation

### Integration with App.jsx
- [x] Open `src/App.jsx` for editing
- [ ] Add state for selected system ID: `const [selectedSystem, setSelectedSystem] = useState(null)`
- [ ] Add useEffect to listen for `system-selected` custom event
- [ ] Update selectedSystem state on event
- [x] Conditionally render SystemDetailPanel when selectedSystem not null
- [ ] Pass systemId and onClose to panel
- [x] Test panel opens when system selected in Phaser

**Note**: Event listening done in SystemDetails component, not App.jsx. Passes phaserGame prop.

### Panel Close Handling
- [x] Implement close button handler
- [x] Clear selectedSystem state
- [x] Optionally dispatch `system-deselected` event to Phaser
- [ ] Add ESC key listener for close
- [x] Test panel closes correctly

**Note**: ESC listener not implemented

---

## Phase 2: Data Fetching and State Management
**Goal**: Implement data fetching with real-time updates

**Status**: Not implemented (data received from Phaser events)

### useSystemData Custom Hook
- [ ] Create `src/hooks/useSystemData.js` file
- [ ] Implement `useSystemData(systemId)` custom hook
- [ ] Initialize state: data, loading, error
- [ ] Return { data, loading, error }
- [ ] Test hook structure

**Note**: Component receives data directly from Phaser events, no custom hook

### Data Fetching Logic
- [ ] In useEffect, check if systemId provided
- [ ] Set loading to true
- [ ] Call `dataBridge.getSystemDetails(systemId)`
- [ ] Catch errors and set error state
- [ ] Set data state with fetched data
- [ ] Set loading to false
- [ ] Test data fetches successfully

**Note**: Not implemented

### Real-Time Update Subscription
- [ ] In useEffect, subscribe to updates: `dataBridge.onSystemUpdate(systemId, callback)`
- [ ] Callback updates data state with new system data
- [ ] Store unsubscribe function
- [ ] Return unsubscribe in cleanup function
- [ ] Test subscription receives updates

**Note**: Not implemented

### DataBridge Extension
- [ ] Open `core/data-bridge.js` for editing
- [ ] Implement `getSystemDetails(systemId)` method
- [ ] Fetch system from stored galaxy data
- [ ] Calculate derived values (defense rating, resource totals)
- [ ] Return complete system data object
- [ ] Test method returns correct data

**Note**: Not implemented

### DataBridge Subscription System
- [ ] Implement `onSystemUpdate(systemId, callback)` method
- [ ] Create subscribers map if not exists: `this.subscribers = new Map()`
- [ ] Add callback to system's subscriber set
- [ ] Return unsubscribe function
- [ ] Test subscription registers correctly

**Note**: Not implemented

### DataBridge Notification System
- [ ] Implement `notifySystemUpdate(systemId, updatedData)` method
- [ ] Get subscribers for systemId
- [ ] Call each callback with updated data
- [ ] Test notifications reach subscribers

**Note**: Not implemented

### Loading State Display
- [ ] In SystemDetailPanel, check if loading
- [ ] Display loading spinner or skeleton
- [ ] Center loading indicator in panel
- [ ] Test loading state shows while fetching

**Note**: Not implemented

### Error State Display
- [ ] In SystemDetailPanel, check if error
- [ ] Display error message
- [ ] Show retry button (calls fetch again)
- [ ] Test error state displays correctly

**Note**: Not implemented

---

## Phase 3: System Header and Core Properties
**Goal**: Display system identification and basic properties

**Status**: Partially complete (monolithic, no icons)

### SystemHeader Component
- [ ] Create `sections/SystemHeader.jsx` component
- [ ] Accept `system` prop
- [x] Display system name in large, bold font
- [ ] Display sector name as subtitle
- [x] Display special type icon and label
- [x] Add close button (passed from parent)
- [x] Test header renders correctly

**Note**: Implemented inline in main component, special type shows text not icons, no sector name

### Special Type Icons
- [ ] Import or define icons for special types:
  - [ ] Manufacturing Center: factory icon
  - [ ] Research Facility: beaker icon
  - [ ] Trade Hub: money/commerce icon
  - [ ] Strategic Chokepoint: shield/fortress icon
  - [ ] None: generic planet icon
- [ ] Display appropriate icon based on system.specialType
- [ ] Size icons: 24x24px
- [ ] Test icons render correctly

**Note**: Not implemented - uses text labels only
  - [ ] Research Facility: beaker/science icon
  - [ ] Trade Hub: commerce/money icon
  - [ ] Strategic Chokepoint: shield/fortress icon
  - [ ] None: generic planet icon
- [ ] Display appropriate icon based on system.specialType
- [ ] Size icons: 24x24px
- [ ] Test icons render correctly

### Faction Color Accent
- [x] Get faction from system.loyalty.faction
- [x] Map faction to color:
  - [x] brandAuthority: #58a6ff
  - [x] union: #3fb950
  - [x] autoforge: #f0883e
  - [x] neutral: #8b949e
- [x] Apply color as border-top on header
- [ ] Or apply as background tint with low alpha
- [x] Test faction color displays

**Note**: Applied to loyalty text color

### SystemProperties Component
- [ ] Create `sections/SystemProperties.jsx` component
- [ ] Accept `system` prop
- [x] Display population level as number
- [ ] Add visual population bar (0-10 scale)
- [ ] Display coordinates (x, y)
- [x] Display controlling faction with color badge
- [x] Test properties render correctly

**Note**: Implemented inline, no population bar, coordinates in debug section

### Visual Hierarchy Styling
- [x] System name: font-size 24px, font-weight bold
- [ ] Sector name: font-size 14px, color #8b949e
- [x] Special type: font-size 12px with icon
- [x] Properties: font-size 14px, organized layout
- [x] Test hierarchy clear and readable

**Note**: Uses 20px for system name, no sector name display

---

## Phase 4: Resource Production Display
**Goal**: Show resource generation with detailed breakdown

**Status**: Partially complete (basic display only)

### ResourceProduction Component
- [ ] Create `sections/ResourceProduction.jsx` component
- [ ] Accept `resources` prop (system.resources object)
- [x] Display four resource types: Credits, Materials, Recruits, Influence
- [x] Test component renders

**Note**: Implemented inline in main component

### Resource Display Layout
- [x] Create resource row for each type
- [x] Display resource icon
- [x] Display resource name
- [x] Display total per-turn value prominently
- [x] Style with dark theme
- [x] Test layout organized

### Resource Icons
- [x] Define or import icons:
  - [x] Credits: coin or dollar icon
  - [x] Materials: wrench or crate icon
  - [x] Recruits: person or helmet icon
  - [x] Influence: star or medal icon
- [x] Display icon next to resource name
- [x] Size: 20x20px
- [x] Test icons render correctly

**Note**: Uses emoji icons (💰⚙️👤🎭)

### Resource Breakdown (Expandable)
- [ ] Add expand/collapse button for each resource
- [ ] On click, show breakdown details
- [ ] Display base production
- [ ] Display loyalty modifier
- [ ] Display facility bonuses
- [ ] Display special location bonuses
- [ ] Display net total
- [ ] Test breakdown expands/collapses

**Note**: Not implemented

### Resource Color Coding
- [ ] Credits: gold (#f0883e)
- [ ] Materials: gray (#8b949e)
- [ ] Recruits: blue (#58a6ff)
- [ ] Influence: purple (#a371f7)
- [ ] Apply color to icon or label
- [ ] Test colors aid distinction

**Note**: Not implemented - uses default colors

### Breakdown Formatting
- [ ] Format breakdown as list:
  ```
  Credits: 120 per turn
    Base: 100
    Loyalty: +10
    Trade Hub: +10
  ```
- [ ] Positive modifiers in green
- [ ] Negative modifiers in red
- [ ] Test formatting clear

**Note**: Not implemented

---

## Phase 5: Loyalty Meter and Faction Support
**Goal**: Display loyalty status with visual meter and factors

**Status**: Not implemented (no loyalty meter component)

### LoyaltyMeter Component
- [ ] Create `sections/LoyaltyMeter.jsx` component
- [ ] Accept `loyalty` prop (system.loyalty object)
- [ ] Test component renders

### Loyalty Visual Meter
- [ ] Display progress bar (0-100 scale)
- [ ] Fill amount = loyalty.value
- [ ] Color = faction color
- [ ] Background = dark gray
- [ ] Height: 20px
- [ ] Test meter displays correctly

**Note**: Not implemented

### Loyalty Value Display
- [ ] Show loyalty value as percentage ("75%")
- [ ] Position above or inside meter bar
- [ ] Font: bold, clear
- [ ] Test value displays

**Note**: Not implemented (loyalty displayed as faction name only)

### Controlling Faction Display
- [x] Show faction name
- [x] Use faction color for text or badge
- [x] Position near meter
- [x] Test faction identification clear

**Note**: Implemented as text with color coding

### Trend Indicator
- [ ] Get trend from loyalty.trend (rising/falling/stable)
- [ ] Display arrow icon:
  - [ ] Rising: ↑ (green)
  - [ ] Falling: ↓ (red)
  - [ ] Stable: → (gray)
- [ ] Position next to loyalty value
- [ ] Test trend displays correctly

**Note**: Not implemented

### Loyalty Factors List
- [ ] Display loyalty.factors array
- [ ] For each factor, show:
  - [ ] Factor name
  - [ ] Impact value (+10, -5, etc.)
- [ ] Positive impacts in green
- [ ] Negative impacts in red
- [ ] Test factors list renders

**Note**: Not implemented

### Loyalty Color Coding by Value
- [ ] High loyalty (70-100): Full faction color brightness
- [ ] Medium loyalty (40-69): Medium brightness
- [ ] Low loyalty (0-39): Dimmed or red tint
- [ ] Apply to meter fill color
- [ ] Test color coding indicates loyalty level

**Note**: Not implemented

---

## Phase 6: Defense Information
**Goal**: Display defensive capabilities and installations

**Status**: Minimal (placeholder values only)

### DefenseInfo Component
- [ ] Create `sections/DefenseInfo.jsx` component
- [ ] Accept `defenses` prop (system.defenses object)
- [ ] Test component renders

**Note**: Basic placeholders in main component

### Total Defense Rating
- [x] Display defenses.rating prominently
- [x] Label: "Defense Rating"
- [ ] Font: large, bold
- [x] Test rating displays

**Note**: Shows placeholder defenseRating || 0

### Defense Breakdown
- [ ] Display ground troops: current / max
- [ ] Display orbital platforms: count
- [ ] Display shields: active/inactive status
- [ ] Display ion cannons: count
- [ ] Format as list or grid
- [ ] Test breakdown displays correctly

**Note**: Only shows facility count, no detailed breakdown

### Defense Icons
- [ ] Define or import icons:
  - [ ] Ground troops: soldier icon
  - [ ] Platforms: satellite icon
  - [ ] Shields: shield icon
  - [ ] Ion cannons: weapon icon
- [ ] Display icon for each defense type
- [ ] Test icons render

### Capacity Progress Bar
- [ ] For ground troops, show progress bar
- [ ] Fill = current / max
- [ ] Display as "500 / 1000"
- [ ] Color: green if > 75%, yellow if 50-75%, red if < 50%
- [ ] Test capacity visualization clear

**Note**: Not implemented

### Construction in Progress
- [ ] Check if defenses being built (system.activities.construction)
- [ ] Display "Building: [facility name]"
- [ ] Show turns remaining
- [ ] Preview defense increase when complete
- [ ] Test construction display

**Note**: Not implemented

---

## Phase 7: Facilities List and Construction Queue
**Goal**: Display constructed facilities and ongoing construction

**Status**: Not implemented

### FacilitiesList Component
- [ ] Create `sections/FacilitiesList.jsx` component
- [ ] Accept `facilities` prop (system.facilities array)
- [ ] Test component renders

### Facility Item Display
- [ ] For each facility, display:
  - [ ] Facility icon
  - [ ] Facility name
  - [ ] Level/tier
  - [ ] Status (operational/under construction)
  - [ ] Bonus effect ("+20% ship production")
  - [ ] Operating cost
- [ ] Test facility items render

### Facility Icons
- [ ] Define or import icons:
  - [ ] Shipyard: ship icon
  - [ ] Training facility: helmet icon
  - [ ] Research lab: beaker icon
  - [ ] Defense platform: turret icon
  - [ ] Resource extractor: drill icon
- [ ] Display appropriate icon per facility type
- [ ] Test icons correct

### Facility Status Styling
- [ ] Operational: full color
- [ ] Under construction: grayed with progress bar
- [ ] Damaged: red tint or warning icon
- [ ] Test status visual distinction clear

### Construction Queue
- [ ] Display separate section for facilities under construction
- [ ] Show facility name and type
- [ ] Show progress bar with turns remaining
- [ ] Display estimated completion turn
- [ ] Test queue displays correctly

### Facility Actions (Optional)
- [ ] Add "Upgrade" button for facilities (if applicable)
- [ ] Add "Repair" button for damaged facilities
- [ ] Add "Demolish" button (with confirmation)
- [ ] Disable buttons if conditions not met
- [ ] Test action buttons functional

---

## Phase 8: Current Activities
**Goal**: Show fleets, characters, missions, and events at system

**Status**: Not implemented

### CurrentActivities Component
- [ ] Create `sections/CurrentActivities.jsx` component
- [ ] Accept `activities` prop (system.activities object)
- [ ] Test component renders

### Stationed Fleets Section
- [ ] Display list of fleets at system (activities.fleets array)
- [ ] For each fleet ID, fetch fleet data from DataBridge
- [ ] Display fleet name or ID
- [ ] Display strength indicator (ship count or power)
- [ ] Add click handler to view fleet details
- [ ] Test fleets list renders

### Characters Present Section
- [ ] Display list of characters (activities.characters array)
- [ ] For each character ID, fetch character data
- [ ] Display character portrait or icon
- [ ] Display character name and role
- [ ] Add click handler to view character details
- [ ] Test characters list renders

### Active Missions Section
- [ ] Display missions targeting system (activities.missions array)
- [ ] For each mission ID, fetch mission data
- [ ] Display mission type (diplomatic, sabotage, etc.)
- [ ] Display turns remaining
- [ ] Display success probability
- [ ] Test missions list renders

### Combat Status
- [ ] Check if system under attack (activities.combat not null)
- [ ] Display warning indicator
- [ ] Show attacking faction
- [ ] Show combat phase or round
- [ ] Add link to combat details (if applicable)
- [ ] Test combat status displays prominently

### Empty State Handling
- [ ] If no fleets: Display "No fleets stationed"
- [ ] If no characters: Display "No characters present"
- [ ] If no missions: Display "No active missions"
- [ ] If no combat: Don't display combat section
- [ ] Test empty states display correctly

---

## Phase 9: Strategic Context and Connections
**Goal**: Provide strategic information and connected systems

**Status**: Partially implemented (connections display only)

### StrategicContext Component
- [ ] Create `sections/StrategicContext.jsx` component
- [ ] Accept `system` and `galaxy` props
- [ ] Test component renders

**Note**: Implemented inline in main component

### Connected Systems List
- [x] Display list of system.connections (array of system IDs)
- [ ] For each connection, fetch system name and faction
- [ ] Render as clickable link
- [ ] On click, select that system (dispatch event to Phaser)
- [ ] Color-code by faction
- [x] Test connected systems links work

**Note**: Shows IDs as tags, not clickable links

### Orphaned System Indicator
- [x] Check if system.connections.length === 0
- [x] Display "Orphaned System" badge
- [x] Show tooltip: "No hyperspace tunnels. FTL-only access."
- [x] Test orphaned indicator displays

### Threat Assessment
- [ ] Calculate threat level based on enemy proximity
- [ ] Safe: No enemies within 3 jumps (green)
- [ ] Caution: Enemies within 2-3 jumps (yellow)
- [ ] Danger: Enemies adjacent or attacking (red)
- [ ] Display as colored badge with icon
- [ ] Test threat assessment displays

**Note**: Not implemented

### Strategic Value Display
- [ ] Display system.strategicValue (0-100 scale)
- [ ] Label: "Strategic Value"
- [ ] Show breakdown on hover or expand:
  - [ ] Resource production weight
  - [ ] Tunnel connectivity weight
  - [ ] Special location bonus
  - [ ] Strategic position weight
- [ ] Test strategic value displays with breakdown

**Note**: Not implemented

### Distance to Key Locations
- [ ] Calculate distance to faction HQs
- [ ] Calculate distance to front lines
- [ ] Display as "3 jumps to Brand Authority HQ"
- [ ] Test distance calculations and display

**Note**: Not implemented

---

## Phase 10: Quick Actions and Contextual Buttons
**Goal**: Provide action buttons for common tasks

**Status**: Not implemented

### QuickActions Component
- [ ] Create `sections/QuickActions.jsx` component
- [ ] Accept `system` and `onAction` props
- [ ] Test component renders

### Action Button Rendering
- [ ] Determine available actions based on system ownership
- [ ] Render buttons for each action
- [ ] Style as primary, secondary, or danger buttons
- [ ] Display action icon and label
- [ ] Test buttons render correctly

### Action Availability Logic
- [ ] For owned systems:
  - [ ] "Build Facility" - if resources available
  - [ ] "Deploy Fleet" - if fleets available
  - [ ] "Set Construction Queue" - always available
  - [ ] "Manage Production" - always available
- [ ] For enemy systems:
  - [ ] "Plan Mission" - always available
  - [ ] "Send Fleet" - if fleets available
  - [ ] "Gather Intelligence" - if resources available
- [ ] For neutral systems:
  - [ ] "Diplomatic Mission" - always available
  - [ ] "Scout System" - if unexplored
  - [ ] "Establish Trade" - always available
- [ ] Test correct actions shown

### Action Availability Checks
- [ ] Check player resources (credits, materials)
- [ ] Check fleet availability
- [ ] Check tech prerequisites
- [ ] Enable button if conditions met
- [ ] Disable button if conditions not met
- [ ] Test availability checks correct

### Disabled State Tooltips
- [ ] Add tooltip to disabled buttons
- [ ] Explain why unavailable ("Not enough credits")
- [ ] Test tooltips display on hover

### Action Handler Implementation
- [ ] In SystemDetailPanel, implement `handleAction(actionType, params)` function
- [ ] Switch on actionType
- [ ] Call appropriate DataBridge method:
  - [ ] `dataBridge.buildFacility(systemId, facilityType)`
  - [ ] `dataBridge.deployFleet(fleetId, systemId)`
  - [ ] `dataBridge.planMission(systemId, missionType)`
- [ ] Show feedback (toast notification or confirmation)
- [ ] Test actions execute correctly

### Confirmation Dialogs
- [ ] For destructive actions (attack, demolish), show confirmation modal
- [ ] Display action details and consequences
- [ ] "Confirm" button executes action
- [ ] "Cancel" button dismisses modal
- [ ] Test confirmation flow works

---

## Phase 11: Polish, Performance, and Accessibility
**Goal**: Optimize performance and ensure accessibility

**Status**: Not implemented

### Performance Optimization
- [ ] Memoize expensive calculations: `useMemo(() => calculateDefenseRating(system), [system])`
- [ ] Memoize sub-components: `const SystemHeader = React.memo(...)`
- [ ] Avoid inline function creation in render
- [ ] Use `useCallback` for event handlers
- [ ] Profile component with React DevTools Profiler
- [ ] Test rendering performance (< 16ms per frame)

### Debounce Rapid Updates
- [ ] In useSystemData hook, debounce state updates
- [ ] Batch updates within 50ms window
- [ ] Prevent excessive re-renders
- [ ] Test real-time updates smooth

### Animation Polish
- [ ] Smooth fade-in for content sections
- [ ] Smooth expand/collapse for breakdowns
- [ ] Loading skeleton screens (optional)
- [ ] Micro-interactions on button hover
- [ ] Test animations enhance UX

### Semantic HTML
- [ ] Use proper heading tags (h1, h2, h3)
- [ ] Use semantic sections (section, article, aside)
- [ ] Use lists (ul, ol) for list content
- [ ] Use buttons for actions, not divs
- [ ] Test HTML structure semantic

### ARIA Labels
- [ ] Add aria-label to icon buttons
- [ ] Add aria-expanded to expandable sections
- [ ] Add aria-live for dynamic updates
- [ ] Add role attributes where needed
- [ ] Test with screen reader (NVDA, JAWS, or VoiceOver)

### Keyboard Navigation
- [ ] Ensure all interactive elements focusable (Tab order)
- [ ] Add visible focus indicators (outline or border)
- [ ] Support Enter/Space for button activation
- [ ] Support ESC to close panel
- [ ] Test keyboard-only navigation

### Color Contrast
- [ ] Check text contrast ratios with WebAIM tool
- [ ] Ensure 4.5:1 contrast for normal text
- [ ] Ensure 3:1 contrast for large text
- [ ] Adjust colors if contrast insufficient
- [ ] Test meets WCAG AA standards

### Responsive Design
- [ ] Test at 1280x720 resolution
- [ ] Test at 1920x1080 resolution
- [ ] Ensure panel width adjusts (300-500px range)
- [ ] Ensure scrolling works on all screen sizes
- [ ] Test on touch devices (tablets)

### Error Boundary
- [ ] Wrap SystemDetailPanel in React error boundary
- [ ] Show fallback UI if component crashes
- [ ] Log errors for debugging
- [ ] Add "Retry" button in fallback
- [ ] Test error boundary catches errors

---

## Integration and Testing Tasks

### Integration with Phaser Map
- [ ] Test panel opens when system selected on map
- [ ] Test panel updates when different system selected
- [ ] Test panel closes when system deselected
- [ ] Test connected system links select systems on map

### Integration with DataBridge
- [ ] Test data fetches from DataBridge offline mode
- [ ] Test data fetches from DataBridge cloud mode (if available)
- [ ] Test real-time updates work
- [ ] Test action buttons update DataBridge state
- [ ] Test state changes propagate back to panel

### Manual Testing
- [ ] Open panel for owned system, verify all sections display
- [ ] Open panel for enemy system, verify correct actions
- [ ] Open panel for neutral system, verify correct actions
- [ ] Test resource breakdown expands/collapses
- [ ] Test loyalty factors display correctly
- [ ] Test facilities list shows operational and under-construction
- [ ] Test fleets and characters display (when present)
- [ ] Test connected systems links work
- [ ] Test quick action buttons execute correctly
- [ ] Test panel scrolls when content long
- [ ] Test panel closes correctly
- [ ] Test keyboard navigation (Tab, Enter, ESC)

### Performance Testing
- [ ] Measure panel open time (< 200ms)
- [ ] Measure data fetch time (< 50ms)
- [ ] Measure render time (< 16ms)
- [ ] Test switching between systems fast (< 100ms)
- [ ] Monitor memory usage for leaks

### Documentation
- [ ] Document SystemDetailPanel component API
- [ ] Document useSystemData hook
- [ ] Document DataBridge extensions
- [ ] Document system data structure
- [ ] Update IMPLEMENTATION_SUMMARY.md
- [ ] Update README.md
- [ ] Add code comments for complex logic

---

## Completion Checklist

- [x] All Phase 1 tasks complete (panel infrastructure) - **Monolithic component**
- [ ] All Phase 2 tasks complete (data fetching) - **Not implemented**
- [x] All Phase 3 tasks complete (system header) - **Partially (no icons, no sector)**
- [x] All Phase 4 tasks complete (resource production) - **Partially (no breakdown)**
- [ ] All Phase 5 tasks complete (loyalty meter) - **Not implemented**
- [ ] All Phase 6 tasks complete (defense info) - **Minimal placeholders only**
- [ ] All Phase 7 tasks complete (facilities list) - **Not implemented**
- [ ] All Phase 8 tasks complete (current activities) - **Not implemented**
- [x] All Phase 9 tasks complete (strategic context) - **Partially (connections only)**
- [ ] All Phase 10 tasks complete (quick actions) - **Not implemented**
- [ ] All Phase 11 tasks complete (polish and accessibility) - **Not implemented**
- [ ] All integration tests passing
- [x] Manual testing complete - **Basic functionality**
- [ ] Documentation updated
- [ ] Feature marked "Complete" in feature-catalog.md
- [ ] Ready for integration with other features - **Partially ready**

## References

- [System Details Spec](./spec.md)
- [Galaxy Map Plan](../galaxy-map/plan.md)
- [Map Interaction Plan](../map-interaction/plan.md)
- [Galaxy Generation Plan](../galaxy-generation/plan.md)
- [Feature Catalog](../../product/feature-catalog.md)
- [Data Bridge](../../../core/data-bridge.js)
- [App.jsx](../../../src/App.jsx)
- [React Documentation](https://react.dev/)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

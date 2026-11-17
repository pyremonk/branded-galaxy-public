# Map Interaction - Technical Implementation Plan

## Architecture Overview

Map Interaction is the **input handling layer** that bridges user intent with game mechanics. It processes mouse, keyboard, and touch inputs on the Phaser-rendered galaxy map, translates them into game actions, and provides visual feedback. The system operates as a **state machine** with different interaction modes (normal, fleet movement, mission targeting, drag-and-drop).

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Map Interaction System                      │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │ Input Manager  │→ │Interaction Mode│→ │Action Handler │ │
│  │(Mouse/KB/Touch)│  │State Machine   │  │(Execute)      │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
│         ↓                    ↓                    ↓         │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │Selection System│  │Context Menu Mgr│  │Visual Feedback│ │
│  │(Single/Multi)  │  │(Action Menu)   │  │(Highlight)    │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    User Actions Executed
                             ↓
        ┌────────────────────┴────────────────────┐
        ↓                                         ↓
  DataBridge State Updates             React UI Panel Updates
  (Fleet moves, missions)              (System details, context menu)
```

### Core Components

1. **InputManager** - Centralizes all input event handling (mouse, keyboard, touch)
2. **SelectionSystem** - Manages system selection state with visual feedback
3. **TooltipManager** - Displays hover tooltips with system information
4. **ContextMenuManager** - Coordinates context menu display and actions (React component)
5. **KeyboardManager** - Handles keyboard shortcuts and navigation
6. **PathVisualizer** - Renders fleet movement paths and mission routes
7. **DragController** - Manages drag-and-drop operations
8. **InteractionModeStateMachine** - Switches between interaction modes

### Interaction Modes

The system operates in different modes, each with distinct input behaviors:

```javascript
const InteractionMode = {
  NORMAL: 'normal',              // Default: selection, hover, pan
  FLEET_MOVEMENT: 'fleet-move',  // Show paths, select destination
  MISSION_TARGETING: 'mission',  // Highlight valid targets
  DRAG_DROP: 'drag-drop',        // Dragging entity to target
  PAN: 'pan'                     // Active map panning
};
```

## Technical Approach

### Existing Codebase Integration

**Current State**:
- `main-stage.js` has basic Phaser scene with minimal input handling
- `sector.js` creates clickable system entities
- React layer handles UI panel interactions
- No comprehensive input management system exists

**Integration Strategy**:
- Extend MainStage to include InputManager
- Add event handlers to Sector instances
- Create input class hierarchy for organization
- Implement event communication between Phaser and React
- Maintain separation: Phaser handles canvas input, React handles UI input

### Event Flow Architecture

```javascript
// Phaser → React (system selected)
class MainStage extends Phaser.Scene {
  selectSystem(system) {
    this.selectedSystem = system;
    
    // Dispatch custom event for React
    window.dispatchEvent(new CustomEvent('system-selected', {
      detail: { 
        systemId: system.data.id,
        systemData: system.data 
      }
    }));
  }
}

// React → Phaser (enter mission targeting mode)
// App.jsx listens to React state, calls Phaser method
function MissionPlanningPanel({ missionType }) {
  useEffect(() => {
    window.phaserScene?.enterMissionTargetingMode(missionType);
    
    return () => {
      window.phaserScene?.exitMissionTargetingMode();
    };
  }, [missionType]);
}
```

### Input Priority System

Handle overlapping input events with priority:

1. **Context Menu Active**: Block all other inputs
2. **Drag Operation**: Capture pointer events exclusively
3. **Modal/Panel Open**: Block map interactions
4. **Keyboard Shortcut**: Process before other key events
5. **System Hover/Click**: Higher priority than background
6. **Map Pan**: Lowest priority (background interaction)

```javascript
class InputManager {
  handlePointerDown(pointer) {
    // Priority check
    if (this.contextMenuActive) return;
    if (this.dragActive) return;
    
    // Check for system click
    const system = this.getSystemAtPointer(pointer);
    if (system) {
      this.handleSystemClick(system, pointer);
      return; // Don't start pan
    }
    
    // No system clicked, start pan
    this.startPan(pointer);
  }
}
```

## Implementation Strategy

### Phase 1: Core Input Infrastructure
**Goal**: Establish foundational input handling system

#### Tasks:
1. **Create InputManager Class**:
   - Centralize all input event registration
   - Setup mouse, keyboard, touch listeners
   - Implement input priority system
   - Handle event delegation to specialized managers
   
2. **Implement Pointer Event Handling**:
   - Detect pointer down/up/move events
   - Distinguish left-click, right-click, middle-click
   - Track pointer state (position, button pressed, drag distance)
   - Handle multi-touch (future expansion)
   
3. **Setup Spatial Query System**:
   - Implement efficient system detection under pointer
   - Use Phaser's built-in hit testing for interactive objects
   - Cache system bounds for quick lookups
   - Handle overlapping systems (z-index priority)
   
4. **Create Event Communication Bridge**:
   - Define custom event types (system-selected, system-hovered, etc.)
   - Implement event dispatcher for Phaser → React
   - Setup global reference for React → Phaser calls
   - Document event contracts and payloads

**Deliverables**:
- InputManager class handling all input events
- Reliable pointer event detection
- Event bridge between Phaser and React
- Spatial query for system under cursor

### Phase 2: Selection System
**Goal**: Implement system selection with visual feedback

#### Tasks:
1. **Implement SelectionSystem Class**:
   - Track currently selected system(s)
   - Support single-select mode (multi-select future)
   - Handle selection state changes
   - Dispatch selection events
   
2. **Selection Visual Feedback**:
   - Add highlight effect to selected system
   - Options: glowing border, animated pulse, color change
   - Use Phaser tweens for smooth animations
   - Clear selection visual on deselect
   
3. **Click-to-Select Logic**:
   - Click system → select it
   - Click empty space → deselect current
   - Double-click → select and center view
   - Prevent selection spam (debounce rapid clicks)
   
4. **Integration with React Panels**:
   - Dispatch 'system-selected' event with system data
   - React listens and opens System Details panel
   - Panel close doesn't deselect system (persistent selection)
   - Support programmatic selection from React (fleet arrives → select system)

**Deliverables**:
- Functional selection system (single-select)
- Highlighted selected system
- React panel opens on selection
- Click empty space deselects

### Phase 3: Hover and Tooltip System
**Goal**: Provide hover feedback and informational tooltips

#### Tasks:
1. **Implement Hover Detection**:
   - Track hovered system separate from selected
   - Detect pointer enter/leave on systems
   - Handle rapid hover changes (debounce)
   - Clear hover state on pointer exit canvas
   
2. **Create TooltipManager**:
   - Phaser Container for tooltip (background + text)
   - Position tooltip near cursor (offset to avoid obscuring)
   - Smart positioning (avoid screen edges)
   - Support multi-line text with proper formatting
   
3. **Tooltip Display Logic**:
   - Show after 300ms hover delay
   - Hide immediately on hover leave
   - Don't show tooltip if context menu open
   - Cancel tooltip if user starts dragging
   
4. **Tooltip Content**:
   - System name (header)
   - Faction control with color indicator
   - Population level
   - Optional: Resource summary, loyalty percentage
   - Format for readability (icons, color coding)
   
5. **Hover Visual Feedback**:
   - Subtle brightening or outline on hover
   - Less prominent than selection highlight
   - Combine with selection highlight if both active
   - Use tween for smooth transition

**Deliverables**:
- Tooltip appears after 300ms hover
- Tooltip shows system info correctly
- Tooltip positions without obscuring
- Hover visual feedback on systems

### Phase 4: Pan and Zoom Controls
**Goal**: Implement camera navigation with smooth controls

#### Tasks:
1. **Implement Pan Controller**:
   - Click-and-drag to pan viewport
   - Calculate drag delta each frame
   - Update camera position smoothly
   - Clamp camera to map boundaries
   - Change cursor to "grab" during pan
   
2. **Implement Zoom Controller**:
   - Mouse wheel zooms in/out
   - Zoom centers on cursor position (not center of screen)
   - Discrete zoom levels: 0.5x, 0.75x, 1.0x, 1.5x, 2.0x
   - Smooth tween between zoom levels (200ms duration)
   - Prevent zooming beyond limits
   
3. **UI Zoom Buttons**:
   - Create React components for +/- buttons
   - Buttons call Phaser zoom methods
   - Display current zoom level percentage
   - Disable buttons at zoom limits
   
4. **Pan Smoothing**:
   - Add inertia/momentum to pan (optional)
   - Use Phaser camera lerp for smooth follow
   - Ease-out when approaching boundaries
   - Stop pan immediately on pointer up
   
5. **Navigation State Management**:
   - Track when user is actively panning
   - Disable other interactions during pan (no selection)
   - Block tooltip display during pan
   - Restore normal mode on pan end

**Deliverables**:
- Click-and-drag panning works smoothly
- Mouse wheel zoom functional
- Zoom centers on cursor
- Camera respects boundaries
- Cursor changes during pan

### Phase 5: Keyboard Shortcuts
**Goal**: Provide efficient keyboard navigation and controls

#### Tasks:
1. **Implement KeyboardManager**:
   - Register keyboard shortcuts
   - Support key combinations (Ctrl+, Shift+)
   - Handle key repeat for arrow keys
   - Prevent default browser actions where needed
   
2. **Navigation Shortcuts**:
   - Arrow keys: Pan map in direction (constant speed)
   - +/- keys: Zoom in/out
   - Spacebar: Center on selected system
   - Tab: Cycle through player-owned systems
   - Home: Reset view to galaxy center
   
3. **Action Shortcuts**:
   - ESC: Deselect, close panels, cancel actions
   - M: Toggle map overlays (cycle modes)
   - F: Toggle fullscreen
   - H: Show help overlay with shortcuts
   
4. **Focus Management**:
   - Don't intercept keys when input field focused
   - Check `document.activeElement` before processing
   - Allow shortcuts when focus on canvas
   - Provide visual focus indicator for accessibility
   
5. **Shortcut Documentation**:
   - Create in-game help overlay (H key)
   - List all shortcuts with descriptions
   - Group by category (navigation, actions, overlays)
   - Display in React modal or overlay

**Deliverables**:
- All keyboard shortcuts functional
- Arrow keys pan map
- Tab cycles owned systems
- ESC deselects and closes panels
- Help overlay shows shortcuts

### Phase 6: Context Menu System
**Goal**: Implement right-click context menus with context-aware actions

#### Tasks:
1. **Create ContextMenuManager (Phaser side)**:
   - Detect right-click on systems
   - Calculate menu position (avoid screen edges)
   - Dispatch event to React with system data and position
   - Handle menu dismissal (click outside, ESC)
   
2. **Implement ContextMenu Component (React)**:
   - Portal-rendered menu at specified position
   - Receives system data and available actions
   - Renders action buttons with icons
   - Styles match dark theme
   
3. **Action Availability Logic**:
   - Determine available actions based on:
     - System ownership (owned, enemy, neutral)
     - Player resources (can afford actions)
     - Game state (mission in progress, fleet available)
   - Enable/disable menu items accordingly
   - Show disabled state clearly (grayed out, tooltip explaining why)
   
4. **Context Menu Actions**:
   - **Owned systems**: Build Facility, Deploy Fleet, Set Rally Point, Manage Production
   - **Enemy systems**: Plan Mission, Send Fleet, Gather Intelligence
   - **Neutral systems**: Diplomatic Mission, Scout, Establish Trade
   - Each action triggers appropriate game flow
   
5. **Menu Positioning**:
   - Calculate position to keep menu on screen
   - Check viewport bounds
   - Flip menu direction if near edge (left/right, top/bottom)
   - Position relative to canvas, not window
   
6. **Menu Dismissal**:
   - Click outside menu dismisses it
   - ESC key dismisses it
   - Clicking action executes and dismisses
   - Starting other interaction (drag, pan) dismisses

**Deliverables**:
- Right-click opens context menu
- Menu shows relevant actions
- Actions enable/disable correctly
- Menu positions intelligently
- Dismissal works reliably

### Phase 7: Fleet Movement Visualization
**Goal**: Show fleet movement paths and enable destination selection

#### Tasks:
1. **Implement PathVisualizer Class**:
   - Render path as series of connected lines
   - Use Phaser Graphics for drawing
   - Support animated effects (dashing, pulsing)
   - Clear previous path when new one drawn
   
2. **Path Calculation**:
   - Integrate with pathfinding algorithm (Dijkstra or A*)
   - Find shortest route through hyperspace tunnels
   - Handle invalid paths (no route exists)
   - Calculate travel time in turns
   
3. **Fleet Movement Mode**:
   - Enter mode when fleet selected
   - Highlight valid destinations
   - Show path preview on destination hover
   - Display travel time estimate
   - Confirm movement on click
   
4. **Visual Feedback**:
   - Valid destinations: Green highlight or checkmark icon
   - Invalid destinations: Red X or grayed out
   - Path line: Animated dashes, faction color
   - Show fleet icon moving along path during travel
   
5. **Movement Confirmation**:
   - Click destination shows confirmation dialog (React)
   - Display: route, travel time, fuel cost (if applicable)
   - Confirm or cancel
   - Exit movement mode after confirmation or cancel

**Deliverables**:
- Fleet selection enters movement mode
- Hovering destination shows path
- Path visual animates
- Invalid destinations show feedback
- Movement confirms and executes

### Phase 8: Mission Targeting System
**Goal**: Enable mission target selection with intel display

#### Tasks:
1. **Implement Mission Targeting Mode**:
   - Enter mode when planning mission
   - Highlight valid target systems
   - Disable/gray out invalid targets
   - Show mission-relevant info on hover/select
   
2. **Target Validation**:
   - Check mission type requirements
   - Validate based on:
     - System ownership (can't target own systems for some missions)
     - Intelligence level (need intel to target)
     - Mission prerequisites (character skills, resources)
   - Display reason for invalid targets in tooltip
   
3. **Intel Display Integration**:
   - Show mission success probability
   - Display system defenses
   - Show loyalty percentage (if known)
   - List known characters present
   - Indicate intel quality (certain, estimated, unknown)
   
4. **Target Selection**:
   - Click target to select
   - React panel updates with target info
   - Show mission planning interface
   - Allow character assignment
   - Confirm mission launch
   
5. **Exit Mission Mode**:
   - Cancel button exits mode
   - Launching mission exits mode
   - ESC key exits mode
   - Restore normal interaction

**Deliverables**:
- Mission mode highlights valid targets
- Invalid targets show disabled state
- Target selection shows intel
- Mission panel integrates correctly
- Exit mode restores normal interaction

### Phase 9: Drag-and-Drop Actions
**Goal**: Support drag-and-drop for quick actions (future enhancement)

#### Tasks:
1. **Implement DragController**:
   - Detect drag start (threshold distance)
   - Track dragged entity (fleet, character, resource)
   - Update drag preview position each frame
   - Highlight valid drop targets
   - Execute drop action on release
   
2. **Drag Preview**:
   - Show ghost/preview of dragged entity
   - Follow cursor smoothly
   - Alpha blend or scale to indicate dragging
   - Change visual if over invalid target
   
3. **Drop Target Highlighting**:
   - Highlight systems that can receive drop
   - Show action preview text ("Move Fleet Here")
   - Invalid targets show red or no highlight
   - Update in real-time as drag moves
   
4. **Drop Actions**:
   - Fleet → System: Move fleet
   - Character → System: Assign mission
   - Resource → System: Allocate for production (future)
   - Validate action before executing
   - Show confirmation if needed
   
5. **Drag Cancellation**:
   - ESC key cancels drag
   - Dropping on invalid target cancels
   - Dropping outside map cancels
   - Animate preview back to origin on cancel

**Deliverables**:
- Drag-and-drop functional for fleets
- Drop targets highlight appropriately
- Drop executes correct action
- Drag cancellation works
- Visual feedback throughout drag

### Phase 10: Double-Click Actions
**Goal**: Implement double-click shortcuts for quick actions

#### Tasks:
1. **Implement Double-Click Detection**:
   - Track time between clicks
   - Threshold: 300ms between clicks = double-click
   - Same target required (not just position)
   - Don't fire single-click action on first click of double
   
2. **Double-Click System**:
   - Centers camera on system
   - Zooms to 150% (if not already)
   - Opens System Details panel
   - Smooth tween animation (400ms)
   
3. **Double-Click Empty Space**:
   - Resets zoom to 100%
   - Centers view on galaxy center
   - Closes panels (optional)
   - Smooth reset animation
   
4. **Single vs. Double Click Handling**:
   - Delay single-click action by 300ms
   - If double-click occurs within delay, cancel single-click
   - Execute single-click if no second click
   - Trade-off: slight lag on single-click, but clean double-click

**Deliverables**:
- Double-click system centers and zooms
- Double-click empty space resets view
- Single-click still works correctly
- Animations smooth

### Phase 11: Performance Optimization and Polish
**Goal**: Ensure responsive input and visual polish

#### Tasks:
1. **Input Performance**:
   - Throttle pointer move events (60 FPS max)
   - Debounce rapid hover changes
   - Optimize spatial queries with quadtree
   - Minimize event listener allocations
   
2. **Visual Polish**:
   - Smooth transitions for all state changes
   - Consistent animation timing (200-400ms)
   - Cursor changes for all interaction states
   - Loading indicators for async actions
   
3. **Memory Management**:
   - Reuse tooltip containers (object pooling)
   - Clean up event listeners on scene shutdown
   - Clear path visualizations after use
   - Limit history of selection states
   
4. **Accessibility Improvements**:
   - Keyboard navigation focus indicators
   - Screen reader announcements for system selection
   - High contrast mode for selection highlights
   - Reduce motion option for animations
   
5. **Error Handling**:
   - Graceful fallback if action fails
   - User feedback for failed actions (toast notification)
   - Log errors without crashing
   - Prevent spam-clicking exploits

**Deliverables**:
- All interactions respond < 16ms
- Smooth visual transitions
- Memory usage stable
- Accessible keyboard navigation
- Robust error handling

## Technical Decisions

### Decision 1: Centralized InputManager vs. Distributed Handlers
**Choice**: Centralized InputManager class

**Rationale**:
- Single source of truth for input state
- Easier to implement input priority system
- Simplified debugging (one place to check)
- Can intercept and modify events before dispatch
- Better for mode switching (fleet movement, mission targeting)

**Alternatives Considered**:
- Distributed: Each component handles own input
  - Pro: Better encapsulation
  - Con: Harder to coordinate, priority conflicts
- Event-based pub/sub system
  - Pro: Loose coupling
  - Con: Harder to control event flow and priority

**Trade-offs**: Centralized manager creates single point of failure, but benefits outweigh risks.

### Decision 2: Phaser vs. React for Context Menu
**Choice**: React Portal for context menu rendering

**Rationale**:
- Context menus are UI, not game rendering
- React better suited for form-like interfaces
- Easier styling with CSS
- Access to game state without prop drilling
- Consistent with other UI panels
- Portal allows positioning anywhere in DOM

**Alternatives Considered**:
- Phaser-rendered menu using Containers
  - Pro: Keeps everything in canvas
  - Con: Harder to style, no HTML/CSS benefits
- HTML overlay positioned via CSS
  - Pro: Simple
  - Con: Harder to coordinate with Phaser events

**Trade-offs**: React portal requires coordination between Phaser and React, but UI benefits worth it.

### Decision 3: Tooltip Delay Strategy
**Choice**: 300ms delay before showing tooltip

**Rationale**:
- Prevents tooltip spam during fast cursor movement
- Follows UX best practices (Windows, web apps)
- Gives user time to decide on target
- Doesn't slow down deliberate interactions
- Immediate hide keeps UI responsive

**Alternatives Considered**:
- No delay: Too spammy, distracting
- Longer delay (500ms+): Feels unresponsive
- Fade-in animation: Adds delay without benefit

**Trade-offs**: 300ms delay is standard, no significant trade-offs.

### Decision 4: Single vs. Double Click Handling
**Choice**: Delay single-click by 300ms to detect double-click

**Rationale**:
- Clean separation of single vs. double actions
- Prevents double-execution bugs
- Standard pattern in many applications
- 300ms delay barely noticeable for single-click

**Implementation**:
```javascript
let clickTimeout = null;

function handleClick(system) {
  if (clickTimeout) {
    // Second click = double-click
    clearTimeout(clickTimeout);
    clickTimeout = null;
    handleDoubleClick(system);
  } else {
    // First click, wait for potential second
    clickTimeout = setTimeout(() => {
      handleSingleClick(system);
      clickTimeout = null;
    }, 300);
  }
}
```

**Alternatives Considered**:
- Execute single-click immediately, undo if double-click detected
  - Pro: No delay
  - Con: Messy undo logic, potential side effects
- Use modifier key (Shift+Click for double-action)
  - Pro: Immediate feedback
  - Con: Less intuitive

**Trade-offs**: Slight delay on single-click, but acceptable for UI responsiveness.

### Decision 5: Interaction Mode State Machine
**Choice**: Explicit mode system with state machine pattern

**Rationale**:
- Clear definition of what inputs do in each mode
- Easy to add new modes (combat mode, diplomacy mode)
- Prevents input conflicts
- Simplified debugging (know current mode)
- Visual feedback per mode (cursor, highlights)

**Implementation**:
```javascript
class InteractionModeManager {
  constructor() {
    this.mode = InteractionMode.NORMAL;
    this.previousMode = null;
  }
  
  setMode(newMode) {
    this.exitMode(this.mode);
    this.previousMode = this.mode;
    this.mode = newMode;
    this.enterMode(newMode);
  }
  
  enterMode(mode) {
    switch (mode) {
      case InteractionMode.FLEET_MOVEMENT:
        this.highlightValidDestinations();
        this.showFleetRange();
        break;
      case InteractionMode.MISSION_TARGETING:
        this.highlightValidTargets();
        this.showIntelOverlay();
        break;
      // ... other modes
    }
  }
  
  exitMode(mode) {
    // Clean up mode-specific state
    this.clearHighlights();
    this.clearPreviews();
  }
}
```

**Alternatives Considered**:
- Boolean flags for each mode: Messy, hard to track state
- Event-based mode transitions: Harder to debug state
- No explicit modes: Input conflicts and bugs

**Trade-offs**: State machine adds complexity but prevents bugs and unclear behavior.

### Decision 6: Path Visualization Rendering
**Choice**: Phaser Graphics object for path rendering

**Rationale**:
- Fast rendering of lines
- Easy to animate (alpha, dash offset)
- Can redraw efficiently (clear + redraw)
- GPU-accelerated
- Built-in line drawing APIs

**Alternatives Considered**:
- Sprite-based path (chain of sprites): More memory, harder to scale
- Canvas2D overlay: Coordinate conversion issues
- SVG overlay: Performance issues with frequent updates

**Trade-offs**: Graphics objects have limited styling options, but sufficient for paths.

## Dependencies

### Internal Dependencies
- **main-stage.js**: Primary scene for input handling
- **sector.js**: Interactive system entities with hit areas
- **data-bridge.js**: Execute game actions (fleet movement, missions)
- **App.jsx**: React layer for context menus and panels
- **core/galaxy-generator.js**: Galaxy data for pathfinding

### External Dependencies
- **Phaser 3**: Input API, tweens, containers, graphics
- No additional libraries needed

### Data Structure Dependencies
- Galaxy data with system positions
- Hyperspace tunnel connections for pathfinding
- System ownership and state data
- Fleet data for movement visualization
- Mission data for targeting mode

### Integration Dependencies
- Custom event system between Phaser and React
- Global reference to Phaser scene (`window.phaserScene`)
- DataBridge state notification system
- React Portal for context menu rendering

## Testing Approach

### Manual Testing Checklist

**System Selection Tests**:
- [ ] Click system selects it (highlight appears)
- [ ] Selected system opens System Details panel
- [ ] Only one system selected at a time
- [ ] Click empty space deselects system
- [ ] Selection state persists correctly

**Hover and Tooltip Tests**:
- [ ] Hover shows subtle highlight effect
- [ ] Tooltip appears after 300ms delay
- [ ] Tooltip shows correct system info
- [ ] Tooltip positions without obscuring system
- [ ] Tooltip disappears immediately on mouse leave
- [ ] Rapid hover doesn't cause tooltip spam

**Pan and Zoom Tests**:
- [ ] Click-and-drag pans map smoothly
- [ ] Cursor changes to "grab" during drag
- [ ] Pan respects map boundaries
- [ ] Mouse wheel zooms centered on cursor
- [ ] Zoom limits work (50% min, 200% max)
- [ ] Zoom transitions animate smoothly (200ms)
- [ ] UI zoom buttons (+/-) functional

**Keyboard Shortcut Tests**:
- [ ] Arrow keys pan map in direction
- [ ] +/- keys zoom in/out
- [ ] Spacebar centers on selected system
- [ ] Tab cycles through owned systems
- [ ] ESC deselects and closes panels
- [ ] M toggles map overlays
- [ ] H shows help overlay
- [ ] Shortcuts don't fire when typing in input field

**Context Menu Tests**:
- [ ] Right-click on owned system shows correct actions
- [ ] Right-click on enemy system shows correct actions
- [ ] Right-click on neutral system shows correct actions
- [ ] Menu items enable/disable based on game state
- [ ] Menu positions correctly (avoids screen edges)
- [ ] Click outside dismisses menu
- [ ] ESC key dismisses menu
- [ ] Click action executes and closes menu

**Double-Click Tests**:
- [ ] Double-click system centers and zooms to it
- [ ] Double-click empty space resets view (100%, centered)
- [ ] Single-click still works (after 300ms delay)
- [ ] Double-click detection doesn't fire single-click

**Fleet Movement Tests** (when implemented):
- [ ] Select fleet enters movement mode
- [ ] Valid destinations highlight in green
- [ ] Invalid destinations show red feedback
- [ ] Hover destination shows path preview
- [ ] Path animates (dashed line effect)
- [ ] Click destination confirms movement
- [ ] Travel time displays correctly
- [ ] ESC exits movement mode

**Mission Targeting Tests** (when implemented):
- [ ] Enter mission mode highlights valid targets
- [ ] Invalid targets grayed out or disabled
- [ ] Target selection shows intel panel
- [ ] Mission success probability displays
- [ ] System defenses show in tooltip
- [ ] Click target selects it
- [ ] Character assignment interface appears
- [ ] Cancel exits mission mode

**Performance Tests**:
- [ ] All input responds within 16ms (60 FPS maintained)
- [ ] Hover effects on 120 systems cause no lag
- [ ] Pan operations smooth at 60 FPS
- [ ] Zoom transitions don't drop frames
- [ ] Context menu opens instantly (< 50ms)
- [ ] Tooltip rendering doesn't impact frame rate

**Integration Tests**:
- [ ] System selection updates React panel
- [ ] Context menu actions trigger game logic
- [ ] Fleet movement updates DataBridge state
- [ ] Mission targeting syncs with React mission panel
- [ ] Keyboard shortcuts work with panels open
- [ ] Map interactions disabled when modal open

**Edge Cases**:
- [ ] Rapid clicking doesn't cause selection spam
- [ ] Context menu doesn't open during drag
- [ ] Tooltip doesn't show during pan
- [ ] Zoom works correctly at map boundaries
- [ ] Pan boundaries work at all zoom levels
- [ ] Selection works correctly with overlapping systems
- [ ] Double-click doesn't fire on different systems

### Integration Testing Scenarios

1. **Fleet Movement Complete Flow**:
   - Select fleet from panel or map
   - Enter movement mode (valid destinations highlight)
   - Hover over destination (path preview appears)
   - Click destination (confirmation dialog shows)
   - Confirm movement (fleet starts moving)
   - Path animates along route
   - Fleet arrives (selection updates to destination)

2. **Mission Planning Flow**:
   - Open mission planning panel (React)
   - Select mission type
   - Map enters targeting mode
   - Click valid target system
   - Intel displays in panel
   - Assign character to mission
   - Confirm mission launch
   - Exit targeting mode, mission executes

3. **Context Menu Action Flow**:
   - Right-click owned system
   - Select "Build Facility" action
   - React modal opens with facility choices
   - Select facility type
   - Confirm construction
   - DataBridge updates system state
   - Map refreshes to show construction

4. **Keyboard Navigation Flow**:
   - Press Tab to cycle owned systems
   - Each Tab press selects next owned system
   - System Details panel updates for each
   - Press Spacebar to center on selected
   - Use arrow keys to pan around
   - Press ESC to deselect and close panel

### Automated Testing (Future)

Using Phaser test utilities:

```javascript
describe('InputManager', () => {
  it('should select system on click', () => {
    const scene = createTestScene();
    const system = scene.systems[0];
    
    scene.input.emit('pointerdown', { 
      x: system.x, 
      y: system.y 
    });
    
    expect(scene.selectedSystem).toBe(system);
  });
  
  it('should deselect on empty space click', () => {
    const scene = createTestScene();
    scene.selectSystem(scene.systems[0]);
    
    scene.input.emit('pointerdown', { 
      x: -1000, // Empty space
      y: -1000 
    });
    
    expect(scene.selectedSystem).toBe(null);
  });
});
```

## Performance Considerations

### Expected Bottlenecks

1. **Hover Detection on 120 Systems**:
   - Checking every system on pointer move expensive
   - **Mitigation**: Use spatial partitioning (quadtree or grid)
   - **Optimization**: Only check systems in viewport
   - **Target**: Hover detection < 1ms

2. **Tooltip Rendering**:
   - Creating/destroying text objects each hover
   - **Mitigation**: Object pooling (reuse tooltip container)
   - **Optimization**: Update text content instead of recreating
   - **Target**: Tooltip show/hide < 5ms

3. **Path Calculation for Fleet Movement**:
   - Pathfinding algorithm can be slow for large galaxies
   - **Mitigation**: Pre-calculate paths, cache results
   - **Optimization**: A* with good heuristic, limit search depth
   - **Target**: Path calculation < 50ms

4. **Context Menu Rendering**:
   - React Portal rendering on right-click
   - **Mitigation**: Pre-render hidden menu, just position on click
   - **Optimization**: Memoize action list calculation
   - **Target**: Context menu open < 50ms

### Optimization Strategies

```javascript
// Spatial partitioning for hover detection
class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }
  
  insert(system) {
    const cell = this.getCell(system.x, system.y);
    if (!this.grid.has(cell)) {
      this.grid.set(cell, []);
    }
    this.grid.get(cell).push(system);
  }
  
  query(x, y) {
    const cell = this.getCell(x, y);
    return this.grid.get(cell) || [];
  }
  
  getCell(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }
}

// Usage
const spatialGrid = new SpatialGrid(100);
systems.forEach(sys => spatialGrid.insert(sys));

// On pointer move
const candidates = spatialGrid.query(pointer.x, pointer.y);
const hovered = candidates.find(sys => sys.contains(pointer));
```

```javascript
// Tooltip object pooling
class TooltipPool {
  constructor(scene) {
    this.scene = scene;
    this.active = null;
    this.pool = [this.createTooltip()];
  }
  
  show(x, y, text) {
    if (!this.active) {
      this.active = this.pool.pop() || this.createTooltip();
    }
    this.active.setPosition(x, y);
    this.active.setText(text);
    this.active.setVisible(true);
  }
  
  hide() {
    if (this.active) {
      this.active.setVisible(false);
      this.pool.push(this.active);
      this.active = null;
    }
  }
  
  createTooltip() {
    // Create Phaser Container with background + text
    return this.scene.add.container(0, 0).setDepth(100);
  }
}
```

```javascript
// Throttle pointer move events
class ThrottledInputHandler {
  constructor(handler, delay = 16) { // 60 FPS
    this.handler = handler;
    this.delay = delay;
    this.lastCall = 0;
  }
  
  handle(event) {
    const now = Date.now();
    if (now - this.lastCall >= this.delay) {
      this.handler(event);
      this.lastCall = now;
    }
  }
}

// Usage
this.input.on('pointermove', new ThrottledInputHandler(
  pointer => this.handlePointerMove(pointer)
).handle);
```

### Memory Management

- **Event Listeners**: Remove all listeners in scene `shutdown()` method
- **Tooltip Pool**: Limit pool size to 1-2 instances
- **Path Graphics**: Clear and reuse Graphics object instead of creating new
- **Selection State**: Don't store full system data, just ID reference

**Memory Budget**:
- InputManager: ~50KB (event handlers, state)
- Tooltip: ~10KB per instance
- Path Visualizer: ~20KB (Graphics object)
- Context Menu: Handled by React (outside Phaser memory)
- **Total**: ~100KB for input system

### Frame Budget

At 60 FPS, frame budget = 16.67ms:
- **Input Processing**: 2ms (pointer events, keyboard)
- **Hover Detection**: 1ms (spatial query)
- **Tooltip Update**: 1ms (position, text)
- **Path Preview**: 2ms (draw path)
- **Visual Feedback**: 2ms (highlights, tweens)
- **Rest of Scene**: 8ms
- **Buffer**: 0.67ms

If frame budget exceeded:
1. Profile to identify bottleneck (Chrome DevTools Performance tab)
2. Optimize hot path (spatial partitioning, throttling)
3. Reduce visual complexity (simpler effects)
4. Consider 30 FPS mode for complex interactions

## Risk Mitigation

### Risk 1: Input Conflicts Between Phaser and React
**Likelihood**: Medium  
**Impact**: High (broken interactions)

**Mitigation**:
- Clear separation: Phaser handles canvas, React handles UI
- Implement input priority system
- Block map interactions when React modal/panel active
- Test all interaction combinations
- Document event flow and communication patterns

### Risk 2: Performance Degradation with Hover Spam
**Likelihood**: Medium  
**Impact**: Medium (laggy interactions)

**Mitigation**:
- Throttle pointer move events to 60 FPS max
- Use spatial partitioning for hover detection
- Debounce tooltip display (300ms delay)
- Profile with 120 systems
- Add performance monitoring in development

### Risk 3: Double-Click vs Single-Click Conflicts
**Likelihood**: Low  
**Impact**: Medium (confusing behavior)

**Mitigation**:
- Use standard 300ms delay pattern
- Extensively test click timing edge cases
- Provide visual feedback immediately (hover highlight)
- Consider making double-click timing configurable
- Document behavior clearly

### Risk 4: Context Menu Positioning Issues
**Likelihood**: Low  
**Impact**: Low (menu off-screen)

**Mitigation**:
- Implement smart positioning algorithm
- Check viewport bounds before rendering
- Flip menu direction if near edge
- Test at various screen resolutions
- Add fallback to center-screen position

### Risk 5: Keyboard Shortcut Conflicts with Browser
**Likelihood**: Medium  
**Impact**: Medium (shortcuts don't work)

**Mitigation**:
- Use `event.preventDefault()` for captured keys
- Avoid common browser shortcuts (Ctrl+T, Ctrl+W)
- Test in all major browsers
- Document conflicting shortcuts
- Provide rebinding option (future enhancement)

### Risk 6: Path Calculation Performance
**Likelihood**: Low  
**Impact**: Medium (slow fleet movement preview)

**Mitigation**:
- Implement efficient A* pathfinding
- Cache frequently calculated paths
- Limit search depth (max 10 jumps)
- Show loading indicator if > 50ms
- Fall back to straight line if pathfinding too slow

## Next Steps

After implementing this plan:

1. **Update Feature Catalog**: Mark map-interaction as "In Progress"
2. **Update Backlog**: Queue implementation work
3. **Begin Implementation**: Start with core input infrastructure (see Implementation Tasks below)
4. **Incremental Testing**: Test each phase before proceeding
5. **UI Asset Creation**: Design cursors (grab, grabbing, etc.)
6. **Documentation**: Update README and IMPLEMENTATION_SUMMARY
7. **Accessibility Audit**: Ensure keyboard navigation and screen reader support

---

## Implementation Tasks

## Overview
This task breakdown follows the 11-phase implementation plan. Each task is actionable and can be completed independently or as part of a sequence. Mark tasks complete as they are finished.

---

## Phase 1: Core Input Infrastructure
**Goal**: Establish foundational input handling system

**Status**: Complete (integrated into MainStage rather than separate InputManager class)

### InputManager Class Creation
- [x] Create `engine/input-manager.js` file
- [x] Define `InputManager` class
- [x] Add constructor accepting Phaser scene
- [x] Store scene reference
- [x] Initialize input state object
- [x] Define input priority constants

**Note**: Implemented directly in MainStage.js instead of separate class

### Pointer Event Handling
- [x] Register `pointerdown` event listener
- [x] Register `pointerup` event listener
- [x] Register `pointermove` event listener
- [x] Track pointer state (position, buttons pressed, drag distance)
- [x] Distinguish left-click, right-click, middle-click
- [x] Test pointer events fire correctly

### Input Priority System
- [x] Implement priority checking in event handlers
- [ ] Check for active context menu (blocks other inputs)
- [x] Check for active drag operation (captures events)
- [ ] Check for open modal/panel (blocks map interactions)
- [x] Implement priority handler dispatch
- [x] Test priority system blocks lower-priority inputs

**Note**: Basic priority implemented (drag blocks other inputs)

### Spatial Query System
- [x] Implement `getSystemAtPointer(pointer)` method
- [x] Use Phaser's hit testing on interactive objects
- [x] Query all systems under pointer
- [x] Return topmost system (z-index priority)
- [x] Handle case of no system (return null)
- [x] Test spatial query finds correct system

**Note**: Uses Phaser's built-in hit testing via gameobject events

### Event Communication Bridge
- [x] Define custom event types:
  - [x] `system-selected`
  - [x] `system-deselected`
  - [x] `system-hovered`
  - [ ] `fleet-selected`
  - [ ] `mission-target-selected`
- [x] Implement event dispatcher using `window.dispatchEvent`
- [x] Include relevant data in event detail
- [x] Setup global Phaser scene reference: `window.phaserScene`
- [x] Test events dispatch and can be caught in React

**Note**: system-hover and system-hover-end events implemented

### Integration with MainStage
- [x] Instantiate InputManager in MainStage.create()
- [x] Pass MainStage scene to InputManager
- [x] Delegate input events to InputManager
- [x] Test InputManager receives events

**Note**: Input handling integrated directly into MainStage

---

## Phase 2: Selection System
**Goal**: Implement system selection with visual feedback

**Status**: Complete

### SelectionSystem Class
- [x] Create `SelectionSystem` class in input-manager.js or separate file
- [x] Track currently selected system
- [x] Implement `select(system)` method
- [x] Implement `deselect()` method
- [x] Implement `getSelected()` method
- [x] Support single-select mode only (multi-select future)
- [x] Test selection state tracked correctly

**Note**: Implemented in MainStage with selectedSystem property

### Selection Visual Feedback
- [x] Add `select()` method to Sector class
- [x] Apply white border glow: `circle.setStrokeStyle(3, 0xffffff)`
- [x] Add pulsing animation with Phaser tween (optional)
- [x] Add `deselect()` method to clear highlight
- [x] Test selected system visually distinct

**Note**: Implemented in System.js with selectedIndicator

### Click-to-Select Logic
- [x] In InputManager, handle click on system
- [x] Call SelectionSystem.select(system)
- [x] Deselect previous system if any
- [x] Dispatch `system-selected` event to React
- [x] Test clicking system selects it

### Click Empty Space to Deselect
- [x] Detect click on empty space (no system)
- [x] Call SelectionSystem.deselect()
- [x] Clear visual highlight
- [x] Dispatch `system-deselected` event
- [x] Test clicking empty space deselects

### Double-Click to Select and Center
- [x] Implement double-click detection (two clicks within 300ms)
- [x] On double-click system: select and center camera
- [x] Tween camera to system position
- [x] Zoom to 150% if not already
- [x] Test double-click centers and zooms

### Integration with React Panels
- [x] In React App.jsx, listen for `system-selected` event
- [x] Extract systemId from event detail
- [x] Update React state with selected system ID
- [x] Render SystemDetailPanel when system selected
- [x] Test panel opens on system selection

**Note**: SystemDetails.jsx component listens for events

---

## Phase 3: Hover and Tooltip System
**Goal**: Provide hover feedback and informational tooltips

**Status**: Complete (no 300ms delay in current implementation)

### Hover Detection
- [x] Track hovered system separate from selected
- [x] In InputManager, handle `pointerover` on systems
- [x] In InputManager, handle `pointerout` on systems
- [x] Debounce rapid hover changes (throttle to 60 FPS)
- [x] Clear hover state when pointer leaves canvas
- [x] Test hover detection accurate

**Note**: Implemented via System.js hover handlers

### TooltipManager Class
- [x] Create `TooltipManager` class in `engine/tooltip-manager.js`
- [x] Create Phaser Container for tooltip
- [x] Add background rectangle (rounded corners)
- [x] Add text object with multi-line support
- [x] Set depth to 100 (above game objects)
- [x] Set initially invisible
- [x] Test tooltip renders correctly

**Note**: Implemented in MainStage.buildHUD() as tooltipContainer

### Tooltip Display Logic
- [x] Implement `show(x, y, system)` method
- [ ] Start 300ms timer on hover
- [x] After delay, display tooltip
- [x] Position near cursor with offset (10-20px)
- [x] Format text: system name, faction, population
- [x] Implement `hide()` method (hide immediately)
- [ ] Cancel timer on pointer out
- [x] Test tooltip shows after 300ms delay
- [x] Test tooltip hides immediately on hover out

**Note**: Shows immediately (no 300ms delay in current implementation)

### Tooltip Smart Positioning
- [x] Check tooltip bounds against viewport
- [ ] Flip tooltip if near right edge (position left of cursor)
- [ ] Flip tooltip if near bottom edge (position above cursor)
- [ ] Ensure tooltip never off-screen
- [x] Test positioning at all screen edges

**Note**: Basic positioning implemented, no edge flipping

### Tooltip Content Formatting
- [x] Display system name (bold or larger font)
- [x] Display faction with color indicator
- [x] Display population level ("Pop: 8")
- [x] Optional: Display resource summary
- [x] Use line breaks for readability
- [x] Test content displays correctly

### Hover Visual Feedback
- [x] Add `hover()` method to Sector class
- [x] Apply subtle brightening (increase alpha by 0.2)
- [x] Or apply outline (strokeStyle with thin line)
- [x] Add `unhover()` method to clear effect
- [x] Test hover effect visible but not distracting
- [x] Test hover effect combines with selection highlight

**Note**: Implemented in System.js with alpha and scale changes

---

## Phase 4: Pan and Zoom Controls
**Goal**: Implement camera navigation with smooth controls

**Status**: Complete (no cursor changes)

### Pan Controller
- [x] In InputManager, handle `pointerdown` for pan start
- [x] Store drag start position
- [x] Handle `pointermove` to calculate drag delta
- [x] Update camera scroll position each frame
- [x] Clamp camera to map boundaries
- [x] Handle `pointerup` to end pan
- [x] Test click-and-drag panning works

### Cursor Changes During Pan
- [ ] Change cursor to "grab" on pointer down
- [ ] Change cursor to "grabbing" during drag
- [ ] Reset cursor on pointer up
- [ ] Use CSS: `canvas.style.cursor = 'grab'`
- [ ] Test cursor changes correctly

**Note**: Not implemented in current version

### Mouse Wheel Zoom
- [x] Register `wheel` event listener
- [x] Calculate zoom factor from deltaY
- [x] Get world point under cursor
- [x] Apply zoom to camera
- [x] Re-center on world point (zoom to cursor)
- [x] Clamp zoom between 0.5x and 2.0x
- [x] Test mouse wheel zoom centered on cursor

### Zoom Button UI (React)
- [ ] Create `ZoomControls.jsx` React component
- [ ] Add "+" button for zoom in
- [ ] Add "-" button for zoom out
- [ ] Display current zoom percentage
- [ ] Call Phaser methods: `window.phaserScene.zoomIn()`, `zoomOut()`
- [x] Implement zoomIn() and zoomOut() in MainStage
- [x] Tween zoom over 200ms
- [ ] Disable buttons at limits (0.5x, 2.0x)
- [x] Test zoom buttons functional

**Note**: Zoom buttons in Phaser HUD instead of React component

### Keyboard Zoom
- [x] Register keyboard listeners for '+' and '-' keys
- [x] Call zoomIn() on '+' press
- [x] Call zoomOut() on '-' press
- [x] Test keyboard zoom works

### Pan Smoothing
- [ ] Add camera lerp for smooth follow (optional)
- [ ] Use ease-out when approaching boundaries
- [x] Stop pan immediately on pointer up (no inertia for now)
- [x] Test pan feels smooth

### Navigation State Management
- [x] Track when user is actively panning
- [x] Disable other interactions during pan (no selection)
- [ ] Block tooltip display during pan
- [x] Restore normal mode on pan end

**Note**: Basic state tracking with isDragging flag

---

## Phase 5: Keyboard Shortcuts
**Goal**: Provide efficient keyboard navigation and controls

**Status**: Complete (no help overlay)

### KeyboardManager Class
- [x] Create `KeyboardManager` class in `engine/keyboard-manager.js`
- [x] Accept scene in constructor
- [x] Create shortcuts map
- [x] Implement `register(key, callback)` method
- [x] Use Phaser keyboard API: `scene.input.keyboard.addKey()`
- [x] Test keyboard manager registers keys

**Note**: Implemented in MainStage.setupKeyboardControls()

### Navigation Shortcuts
- [x] Register arrow keys (UP, DOWN, LEFT, RIGHT)
- [x] Implement arrow key pan (move camera 50 units per press)
- [x] Support key repeat for continuous pan
- [x] Register '+' and '-' for zoom
- [x] Register Spacebar for center on selected system
- [x] Register Tab for cycle owned systems
- [ ] Register Home for reset to galaxy center
- [x] Test all navigation shortcuts work

### Action Shortcuts
- [x] Register ESC key for deselect/close/cancel
- [x] Implement ESC handler (deselect system, close panels)
- [ ] Register M key for toggle map overlays (cycle modes)
- [ ] Register F key for toggle fullscreen
- [ ] Register H key for show help overlay
- [x] Test action shortcuts trigger correctly

**Note**: Only ESC implemented

### Focus Management
- [ ] Check `document.activeElement` before processing keys
- [ ] Don't intercept keys if input field focused
- [ ] Don't intercept keys if textarea focused
- [x] Allow shortcuts when canvas or body has focus
- [x] Test shortcuts don't interfere with typing

**Note**: Basic focus management - may not check all edge cases

### Shortcut Documentation
- [ ] Create `HelpOverlay.jsx` React component
- [ ] List all shortcuts with descriptions
- [ ] Group by category (navigation, actions, overlays)
- [ ] Show on H key press
- [ ] Dismiss on ESC or close button
- [ ] Test help overlay displays all shortcuts

**Note**: Not implemented

### Tab Cycle Implementation
- [x] Get list of player-owned systems
- [x] Track current index in cycle
- [x] On Tab press, select next owned system
- [x] Wrap around to first after last
- [x] Center camera on selected system
- [x] Test Tab cycles through owned systems

---

## Phase 6: Context Menu System
**Goal**: Implement right-click context menus with context-aware actions

**Status**: Not implemented

### ContextMenuManager (Phaser Side)
- [ ] Create `ContextMenuManager` class in input-manager.js
- [ ] Detect right-click on systems (`pointerdown` with rightButton)
- [ ] Calculate menu position (pointer x, y)
- [ ] Check viewport bounds, adjust if near edge
- [ ] Dispatch `context-menu-open` event to React
- [ ] Include system data and position in event detail
- [ ] Test right-click dispatches event

### ContextMenu Component (React)
- [ ] Create `ContextMenu.jsx` React component
- [ ] Accept position (x, y) and system data as props
- [ ] Render using React Portal (position anywhere in DOM)
- [ ] Style as dark theme menu (background #1c2128)
- [ ] Position absolutely at specified coordinates
- [ ] Test menu renders at correct position

**Note**: Not implemented

### Action Availability Logic
- [ ] Implement `getAvailableActions(system, gameState)` function
- [ ] Check system ownership (owned, enemy, neutral)
- [ ] Check player resources (can afford build actions)
- [ ] Check prerequisites (tech, fleets available, etc.)
- [ ] Return array of action objects with enabled/disabled flags
- [ ] Test action availability calculated correctly

**Note**: Not implemented

### Context Menu Actions
- [ ] Define actions for owned systems:
  - [ ] "Build Facility"
  - [ ] "Deploy Fleet"
  - [ ] "Set Rally Point"
  - [ ] "Manage Production"
- [ ] Define actions for enemy systems:
  - [ ] "Plan Mission"
  - [ ] "Send Fleet"
  - [ ] "Gather Intelligence"
- [ ] Define actions for neutral systems:
  - [ ] "Diplomatic Mission"
  - [ ] "Scout System"
  - [ ] "Establish Trade"
- [ ] Test correct actions shown based on ownership

**Note**: Not implemented

### Action Rendering
- [ ] Render each action as button in menu
- [ ] Display action icon (if available)
- [ ] Display action label
- [ ] Disable button if action unavailable
- [ ] Show tooltip on disabled actions explaining why
- [ ] Test actions render correctly

**Note**: Not implemented

### Action Execution
- [ ] On action button click, trigger appropriate handler
- [ ] Call game logic (e.g., `dataBridge.buildFacility()`)
- [ ] Close menu after action executed
- [ ] Show confirmation if needed (destructive actions)
- [ ] Test actions execute correctly

**Note**: Not implemented

### Menu Positioning Intelligence
- [ ] If menu would go off right edge, position left of cursor
- [ ] If menu would go off bottom edge, position above cursor
- [ ] Ensure menu always fully visible
- [ ] Test positioning at all screen edges

**Note**: Not implemented

### Menu Dismissal
- [ ] Listen for click outside menu
- [ ] Close menu on outside click
- [ ] Listen for ESC key
- [ ] Close menu on ESC
- [ ] Close menu on action execution
- [ ] Starting other interaction (drag, pan) dismisses menu
- [ ] Test all dismissal methods work

**Note**: Not implemented

---

## Phase 7: Fleet Movement Visualization
**Goal**: Show fleet movement paths and enable destination selection

**Status**: Not implemented

### PathVisualizer Class
- [ ] Create `PathVisualizer` class in `engine/path-visualizer.js`
- [ ] Create Phaser Graphics object for path lines
- [ ] Set depth to 50 (above tunnels, below systems)
- [ ] Implement `clearPath()` method
- [ ] Test path visualizer setup

### Path Rendering
- [ ] Implement `showPath(route)` method
- [ ] Accept array of system positions
- [ ] Draw lines connecting positions
- [ ] Use faction color for path
- [ ] Line style: width 3px, alpha 0.8
- [ ] Test path renders correctly

**Note**: Not implemented

### Path Animation
- [ ] Add animated dashing effect (optional)
- [ ] Tween alpha between 0.8 and 0.4 (pulsing)
- [ ] Duration: 500ms, repeat infinitely
- [ ] Test path animation smooth

**Note**: Not implemented

### Pathfinding Integration
- [ ] Implement `calculatePath(fromId, toId)` function
- [ ] Use A* or Dijkstra on tunnel graph
- [ ] Find shortest route through hyperspace
- [ ] Handle case of no path exists (return null)
- [ ] Return array of system IDs in path
- [ ] Test pathfinding finds optimal routes

**Note**: Not implemented

### Fleet Movement Mode
- [ ] Implement `enterFleetMovementMode(fleet)` method
- [ ] Track active fleet
- [ ] Highlight valid destinations (systems fleet can reach)
- [ ] Disable invalid destinations (no path or out of range)
- [ ] Test mode activation changes map state

**Note**: Not implemented

### Path Preview on Hover
- [ ] On hover over destination, calculate path
- [ ] Show path preview with PathVisualizer
- [ ] Display travel time estimate in tooltip
- [ ] Update preview as hover moves between systems
- [ ] Test path preview updates in real-time

**Note**: Not implemented

### Valid/Invalid Destination Feedback
- [ ] Valid destinations: green highlight or checkmark icon
- [ ] Invalid destinations: red X or grayed out
- [ ] Show reason in tooltip ("No path available")
- [ ] Test visual feedback clear

**Note**: Not implemented

### Movement Confirmation
- [ ] On click valid destination, show confirmation dialog (React)
- [ ] Display route, travel time, fuel cost (if applicable)
- [ ] "Confirm" button executes movement
- [ ] "Cancel" button exits movement mode
- [ ] Test confirmation flow works

**Note**: Not implemented

### Exit Movement Mode
- [ ] Clear path preview
- [ ] Clear destination highlights
- [ ] Reset map to normal interaction mode
- [ ] Test mode exit cleans up state

**Note**: Not implemented

---

## Phase 8: Mission Targeting System
**Goal**: Enable mission target selection with intel display

**Status**: Not implemented

### Mission Targeting Mode
- [ ] Implement `enterMissionTargetingMode(missionType)` method
- [ ] Track active mission type
- [ ] Highlight valid target systems
- [ ] Gray out invalid targets
- [ ] Test mode activation

### Target Validation
- [ ] Implement `isValidTarget(system, missionType)` function
- [ ] Check mission type requirements:
  - [ ] Diplomatic: Not own system, neutral or enemy
  - [ ] Sabotage: Enemy system only
  - [ ] Scout: Unexplored systems
- [ ] Check intel level requirement
- [ ] Check prerequisites (character skills, resources)
- [ ] Return validation result with reason
- [ ] Test validation logic correct

**Note**: Not implemented

### Target Highlighting
- [ ] Valid targets: green or blue highlight
- [ ] Invalid targets: grayed out, alpha 0.3
- [ ] Show visual indicator (icon or border)
- [ ] Test highlighting clear

**Note**: Not implemented

### Intel Display
- [ ] On hover or select target, show intel panel
- [ ] Display mission success probability
- [ ] Display system defenses
- [ ] Display loyalty percentage (if known)
- [ ] List known characters present
- [ ] Indicate intel quality (certain/estimated/unknown)
- [ ] Test intel displays correctly

**Note**: Not implemented

### Target Selection
- [ ] On click valid target, select as mission target
- [ ] Dispatch `mission-target-selected` event to React
- [ ] React opens mission planning panel
- [ ] Show character assignment interface
- [ ] Test target selection flow works

**Note**: Not implemented

### Mission Confirmation
- [ ] In React panel, review mission details
- [ ] Assign character to mission
- [ ] Set mission parameters
- [ ] Confirm mission launch
- [ ] Execute mission via DataBridge
- [ ] Test mission launches correctly

**Note**: Not implemented

### Exit Mission Mode
- [ ] "Cancel" button exits mode
- [ ] Launching mission exits mode
- [ ] ESC key exits mode
- [ ] Clear target highlights
- [ ] Restore normal interaction
- [ ] Test mode exit works

**Note**: Not implemented

---

## Phase 9: Drag-and-Drop Actions
**Goal**: Support drag-and-drop for quick actions (future enhancement)

**Status**: Not implemented

### DragController Class
- [ ] Create `DragController` class in input-manager.js
- [ ] Track drag start position
- [ ] Calculate drag threshold (10 pixels)
- [ ] Detect drag start (pointer moved > threshold)
- [ ] Track dragged entity (fleet, character, resource)
- [ ] Test drag detection

### Drag Preview
- [ ] Create ghost/preview of dragged entity
- [ ] Render as semi-transparent sprite or icon
- [ ] Follow cursor position
- [ ] Update preview position each frame
- [ ] Test drag preview visible

**Note**: Not implemented

### Drop Target Highlighting
- [ ] Detect valid drop targets under cursor
- [ ] Highlight valid targets (green glow)
- [ ] Show action preview text ("Move Fleet Here")
- [ ] Gray out invalid targets
- [ ] Update highlights in real-time as drag moves
- [ ] Test drop target feedback clear

**Note**: Not implemented

### Drop Action Execution
- [ ] On pointer up, check if over valid target
- [ ] If valid: execute drop action
  - [ ] Fleet → System: Move fleet to system
  - [ ] Character → System: Assign mission to system
  - [ ] Resource → System: Allocate for production
- [ ] If invalid: cancel drag (snap back animation)
- [ ] Test drop actions execute correctly

**Note**: Not implemented

### Drag Cancellation
- [ ] ESC key cancels drag
- [ ] Dropping on invalid target cancels
- [ ] Dropping outside map cancels
- [ ] Animate preview back to origin on cancel
- [ ] Test cancellation works

**Note**: Not implemented

---

## Phase 10: Double-Click Actions
**Goal**: Implement double-click shortcuts for quick actions

### Double-Click Detection
- [ ] Track time of last click
- [ ] Track last clicked system
- [ ] On click, check if < 300ms since last click
- [ ] Check if same system clicked
- [ ] If yes: trigger double-click action
- [ ] Test double-click detection accurate

### Single vs. Double Click Handling
- [ ] Delay single-click action by 300ms
- [ ] Start timer on first click
- [ ] If second click within 300ms: cancel timer, fire double-click
- [ ] If no second click: fire single-click after timer
- [ ] Test single-click works (with slight delay)
- [ ] Test double-click fires without single-click

### Double-Click System Action
- [ ] On double-click system: center camera on system
- [ ] Tween camera position over 400ms
- [ ] Zoom to 150% (if not already)
- [ ] Open System Details panel
- [ ] Test double-click centers and zooms

### Double-Click Empty Space Action
- [ ] On double-click empty space: reset view
- [ ] Tween camera to galaxy center
- [ ] Reset zoom to 100%
- [ ] Close panels (optional)
- [ ] Test double-click empty space resets

### Animation Smoothness
- [ ] Use Phaser tweens for all camera movements
- [ ] Easing: Sine.easeInOut or similar
- [ ] Duration: 300-400ms
- [ ] Test animations smooth

---

## Phase 11: Performance Optimization and Polish
**Goal**: Ensure responsive input and visual polish

### Input Performance Optimization
- [ ] Throttle `pointermove` events to 60 FPS max
- [ ] Debounce rapid hover changes (100ms)
- [ ] Optimize spatial queries with quadtree (if not already)
- [ ] Minimize event listener allocations
- [ ] Profile input handling time (< 2ms per frame)
- [ ] Test input remains responsive

### Visual Polish
- [ ] Smooth transitions for all state changes
- [ ] Consistent animation timing (200-400ms)
- [ ] Cursor changes for all interaction states
- [ ] Loading indicators for async actions
- [ ] Test all interactions have visual feedback

### Memory Management
- [ ] Reuse tooltip containers (object pooling)
- [ ] Clean up event listeners on scene shutdown
- [ ] Clear path visualizations after use
- [ ] Remove tween references on completion
- [ ] Test for memory leaks (play for 10 minutes, check memory)

### Accessibility Improvements
- [ ] Add keyboard navigation focus indicators
- [ ] Add ARIA labels for interactive elements
- [ ] Add screen reader announcements for system selection
- [ ] Test high contrast mode for highlights
- [ ] Add "reduce motion" option for animations (optional)
- [ ] Test keyboard-only navigation

### Error Handling
- [ ] Try-catch around action handlers
- [ ] Show user-friendly error messages (toast notifications)
- [ ] Log errors to console for debugging
- [ ] Graceful fallback if action fails
- [ ] Prevent spam-clicking exploits (debounce action buttons)
- [ ] Test error handling for all actions

---

## Integration and Testing Tasks

### Integration with Phaser Map
- [ ] Test input system works with galaxy map rendering
- [ ] Test selection integrates with map visual feedback
- [ ] Test tooltips position correctly on map
- [ ] Test context menus don't block map view
- [ ] Test keyboard shortcuts work with map

### Integration with React UI
- [ ] Test system selection opens React detail panel
- [ ] Test context menu appears in React layer
- [ ] Test confirmation dialogs render correctly
- [ ] Test React state updates from Phaser events
- [ ] Test Phaser responds to React commands

### Integration with DataBridge
- [ ] Test action handlers update DataBridge state
- [ ] Test fleet movement updates data correctly
- [ ] Test mission targeting updates data correctly
- [ ] Test state changes reflect in map
- [ ] Test both offline and cloud modes

### Performance Testing
- [ ] Test input handling at 60 FPS with 120 systems
- [ ] Test hover detection causes no lag
- [ ] Test drag operations update at 60 FPS
- [ ] Test zoom and pan remain smooth
- [ ] Test context menu opens quickly (< 50ms)
- [ ] Profile with Chrome DevTools

### Manual Testing
- [ ] Test all selection methods (click, double-click, Tab)
- [ ] Test all navigation methods (pan, zoom, keyboard)
- [ ] Test hover tooltips on all systems
- [ ] Test context menus on all system types (owned, enemy, neutral)
- [ ] Test keyboard shortcuts for all actions
- [ ] Test double-click actions
- [ ] Test fleet movement preview (when implemented)
- [ ] Test mission targeting (when implemented)
- [ ] Test edge cases (rapid clicking, hover spam, etc.)

### Documentation
- [ ] Document InputManager API
- [ ] Document custom events and payloads
- [ ] Document keyboard shortcuts
- [ ] Document interaction modes (normal, fleet movement, mission targeting)
- [ ] Update IMPLEMENTATION_SUMMARY.md
- [ ] Update README.md
- [ ] Add code comments for complex logic

---

## Completion Checklist

- [ ] All Phase 1 tasks complete (input infrastructure)
- [ ] All Phase 2 tasks complete (selection)
- [ ] All Phase 3 tasks complete (hover and tooltips)
- [ ] All Phase 4 tasks complete (pan and zoom)
- [ ] All Phase 5 tasks complete (keyboard shortcuts)
- [ ] All Phase 6 tasks complete (context menus)
- [ ] All Phase 7 tasks complete (fleet movement)
- [ ] All Phase 8 tasks complete (mission targeting)
- [ ] All Phase 9 tasks complete (drag-and-drop)
- [ ] All Phase 10 tasks complete (double-click)
- [ ] All Phase 11 tasks complete (optimization)
- [ ] All integration tests passing
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Feature marked "Complete" in feature-catalog.md
- [ ] Ready for next features

## References

- [Map Interaction Spec](./spec.md)
- [Galaxy Map Plan](../galaxy-map/plan.md)
- [Galaxy Generation Plan](../galaxy-generation/plan.md)
- [Feature Catalog](../../product/feature-catalog.md)
- [Main Stage](../../../engine/main-stage.js)
- [Sector Class](../../../ui/sector.js)
- [Data Bridge](../../../core/data-bridge.js)
- [Phaser Input Documentation](https://photonstorm.github.io/phaser3-docs/Phaser.Input.html)

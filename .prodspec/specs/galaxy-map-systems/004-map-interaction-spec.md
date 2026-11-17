# Map Interaction

## Overview

Map Interaction defines all user input methods for engaging with the galaxy map, including system selection, fleet movement visualization, mission targeting, and context-sensitive actions. This feature bridges user intent with game mechanics through intuitive mouse, keyboard, and touch controls.

## Requirements

### FR-MI-001: System Selection
- Players shall select systems by clicking on them
- Selected system shall:
  - Highlight with distinct visual effect (border glow, pulse)
  - Open System Details panel
  - Remain selected until another system is clicked or deselection action taken
- Multiple selection modes:
  - **Single selection**: Default click behavior
  - **Multi-select** (future): Ctrl+Click or Shift+Click to select multiple systems
- Click on empty map space shall deselect current system

### FR-MI-002: System Hover Effects
- Hovering mouse over system shall trigger:
  - Subtle highlight effect (brightening, outline)
  - Tooltip with basic information:
    - System name
    - Faction control
    - Population level
    - Optional: Resource summary
- Tooltip shall appear after 300ms hover delay
- Tooltip shall position near cursor without obscuring system
- Tooltip shall disappear immediately on mouse leave

### FR-MI-003: Fleet Movement Visualization
- When fleet selected, clicking destination system shall:
  - Display movement path along hyperspace routes
  - Highlight all systems in path
  - Show estimated turns to arrival
  - Provide confirmation action (move fleet vs. cancel)
- Path visualization shall:
  - Use animated line or dashed arrow
  - Indicate valid vs. invalid destinations
  - Update in real-time as player hovers over targets
- Invalid destinations shall show error feedback (red X, disabled state)

### FR-MI-004: Mission Target Selection
- When mission planning mode active, clicking system shall:
  - Set system as mission target
  - Display mission success probability
  - Show relevant system intel (loyalty, defenses, etc.)
  - Provide character assignment interface
- Mission-valid targets shall highlight when mission planning active
- Invalid targets shall be visually disabled or grayed out

### FR-MI-005: Context Menus
- Right-click on system shall open context menu with available actions:
  - **Owned systems**: Build facility, deploy fleet, set rally point, manage production
  - **Enemy systems**: Plan mission, send fleet, gather intelligence
  - **Neutral systems**: Diplomatic mission, scout system, establish trade
- Context menu items shall be enabled/disabled based on current game state
- Context menu shall dismiss on click outside or ESC key
- Context menu shall position intelligently (avoid screen edges)

### FR-MI-006: Drag and Pan Navigation
- Players shall pan map by click-and-drag:
  - Left mouse button drag pans viewport
  - Cursor changes to "grab" icon during drag
  - Smooth interpolation during pan motion
  - Respect map boundaries (no scrolling beyond edges)
- Touch gesture support (future):
  - Single finger swipe to pan
  - Two-finger pinch to zoom

### FR-MI-007: Zoom Controls
- Players shall zoom map using:
  - Mouse wheel scroll (up = zoom in, down = zoom out)
  - Zoom buttons in UI (+ and -)
  - Keyboard shortcuts (+ / - keys, or Z / X keys)
- Zoom behavior:
  - Zoom centers on mouse cursor position
  - Discrete zoom levels: 50%, 75%, 100%, 150%, 200%
  - Smooth animation between zoom levels (200ms transition)
  - Labels and tooltips adjust visibility based on zoom level
- Zoom limits prevent over-zooming (too close or too far)

### FR-MI-008: Double-Click Actions
- Double-clicking system shall:
  - Center and zoom to system (focus view)
  - Open System Details panel if not already open
  - Provide quick navigation to important locations
- Double-clicking empty space shall reset zoom to 100% and center galaxy

### FR-MI-009: Keyboard Shortcuts
- Keyboard controls shall provide efficient navigation:
  - **Arrow keys**: Pan map in direction
  - **+/-**: Zoom in/out
  - **Spacebar**: Center view on selected system
  - **Tab**: Cycle through player-owned systems
  - **ESC**: Deselect, close panels, cancel actions
  - **F**: Toggle fullscreen
  - **M**: Toggle map overlays (cycle through modes)
  - **H**: Toggle help overlay
- Keyboard shortcuts shall work regardless of focus (unless typing in input field)

### FR-MI-010: Drag-and-Drop Actions
- Players shall drag-and-drop entities for quick actions:
  - **Fleet icon → System**: Move fleet to system
  - **Character portrait → System**: Assign mission to system
  - **Resources → System**: Allocate resources for construction/production
- Drag-and-drop shall:
  - Show preview of action during drag
  - Highlight valid drop targets
  - Provide visual feedback on drop (animation, confirmation)
  - Allow cancellation by dropping on invalid target

### FR-MI-011: Multi-System Actions
- When multiple systems selected (future), enable batch actions:
  - Set unified construction queue
  - Mass deploy fleets
  - Coordinated diplomatic campaigns
- Multi-system selection visual feedback (all selected systems highlighted)

### FR-MI-012: Touch and Mobile Support (Future)
- Touch input shall map to mouse interactions:
  - Tap = Click
  - Long press = Right-click (context menu)
  - Swipe = Pan
  - Pinch = Zoom
  - Double-tap = Double-click
- Touch targets shall be appropriately sized (minimum 44x44px)
- Touch gestures shall not conflict with browser defaults

## Constraints

### CN-MI-001: Input Handling Architecture
- Phaser handles all canvas-based input (clicks on systems, dragging)
- React handles UI panel interactions (buttons, forms)
- Clear separation: Phaser = map input, React = panel input
- Communication via shared state or event bus

### CN-MI-002: Performance
- Input handling must respond in < 16ms (60 FPS)
- Hover effects must not cause lag even with 120 systems
- Drag operations must update smoothly without frame drops
- Click detection must use spatial partitioning for large galaxies

### CN-MI-003: Accessibility
- All critical actions must be keyboard-accessible
- Focus indicators for keyboard navigation
- Screen reader announcements for system selection
- No reliance on color alone for interaction feedback

### CN-MI-004: Cross-Browser Compatibility
- Mouse events must work consistently across browsers
- Keyboard shortcuts must not conflict with browser hotkeys
- Touch events must gracefully degrade if not supported
- Pointer events API preferred for unified input handling

### CN-MI-005: Existing Codebase Integration
- Extends `main-stage.js` input handling
- Uses `sector.js` for system click detection (hitareas)
- Integrates with React state management for panel updates
- Follows existing interaction patterns in codebase

## Acceptance Criteria

### AC-MI-001: System Selection
- [ ] Clicking system selects it and highlights visually
- [ ] Selected system opens System Details panel
- [ ] Only one system can be selected at a time (single-select mode)
- [ ] Clicking empty space deselects current system
- [ ] Selected state persists until deselection or new selection

### AC-MI-002: Hover Feedback
- [ ] Hovering over system shows subtle highlight
- [ ] Tooltip appears after 300ms hover delay
- [ ] Tooltip shows system name, faction, population
- [ ] Tooltip positions near cursor without obscuring view
- [ ] Tooltip disappears immediately on mouse leave

### AC-MI-003: Pan Navigation
- [ ] Click-and-drag pans map smoothly
- [ ] Cursor changes to "grab" icon during drag
- [ ] Pan respects map boundaries (no empty space)
- [ ] Pan interpolation is smooth (no jittery movement)
- [ ] Releasing mouse button stops pan

### AC-MI-004: Zoom Controls
- [ ] Mouse wheel zooms in/out centered on cursor
- [ ] Zoom buttons (+/-) in UI work correctly
- [ ] Keyboard shortcuts +/- zoom appropriately
- [ ] Zoom transitions animate smoothly (200ms)
- [ ] Zoom limits prevent over-zooming (50% min, 200% max)

### AC-MI-005: Double-Click Actions
- [ ] Double-clicking system centers and zooms to it
- [ ] Double-clicking system opens System Details panel
- [ ] Double-clicking empty space resets view (100% zoom, centered)
- [ ] Double-click detection doesn't conflict with single click

### AC-MI-006: Context Menu
- [ ] Right-click on system opens context menu
- [ ] Context menu shows relevant actions based on system ownership
- [ ] Menu items enable/disable based on game state (resources, etc.)
- [ ] Clicking menu item executes action and closes menu
- [ ] Clicking outside or ESC key dismisses menu

### AC-MI-007: Keyboard Shortcuts
- [ ] Arrow keys pan map in appropriate direction
- [ ] Tab cycles through player-owned systems
- [ ] Spacebar centers view on selected system
- [ ] ESC deselects and closes panels
- [ ] M toggles map overlays
- [ ] Keyboard shortcuts work without focus issues

### AC-MI-008: Fleet Movement Preview
- [ ] Selecting fleet then hovering destination shows path preview
- [ ] Path highlights hyperspace route connections
- [ ] Invalid destinations show red/disabled feedback
- [ ] Clicking destination confirms movement (with confirmation if needed)
- [ ] Path calculation uses shortest route algorithm

### AC-MI-009: Mission Targeting
- [ ] Mission planning mode highlights valid target systems
- [ ] Clicking target system sets it as mission target
- [ ] Invalid targets are visually disabled
- [ ] Mission success probability displays on hover/selection
- [ ] Exiting mission planning mode restores normal interaction

### AC-MI-010: Performance
- [ ] All interactions respond within 16ms (60 FPS maintained)
- [ ] Hover effects on 120 systems cause no lag
- [ ] Drag operations update at 60 FPS
- [ ] Zoom and pan remain smooth on low-end hardware

### AC-MI-011: Visual Feedback
- [ ] All interactions have clear visual feedback
- [ ] Selected elements have distinct styling
- [ ] Invalid actions show error state (red, disabled)
- [ ] Successful actions show confirmation (animation, highlight)
- [ ] Loading states visible for async operations

## Technical Notes

### Input Event Handling in Phaser

```javascript
// main-stage.js
class MainStage extends Phaser.Scene {
  create() {
    // System click handling
    this.systems.forEach(sector => {
      sector.circle.setInteractive();
      sector.circle.on('pointerdown', () => this.selectSystem(sector));
      sector.circle.on('pointerover', () => this.hoverSystem(sector));
      sector.circle.on('pointerout', () => this.unhoverSystem(sector));
    });
    
    // Map pan (click-and-drag)
    this.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) return; // Ignore right-click for pan
      this.dragStart = { x: pointer.x, y: pointer.y };
    });
    
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && this.dragStart) {
        const dx = pointer.x - this.dragStart.x;
        const dy = pointer.y - this.dragStart.y;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.dragStart = { x: pointer.x, y: pointer.y };
      }
    });
    
    // Zoom with mouse wheel
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoom = this.cameras.main.zoom;
      const newZoom = deltaY > 0 ? zoom * 0.9 : zoom * 1.1;
      this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.5, 2.0));
    });
  }
  
  selectSystem(sector) {
    // Deselect previous
    if (this.selectedSystem) {
      this.selectedSystem.deselect();
    }
    
    // Select new
    sector.select();
    this.selectedSystem = sector;
    
    // Notify React layer
    window.dispatchEvent(new CustomEvent('system-selected', {
      detail: { systemId: sector.data.id }
    }));
  }
}
```

### Keyboard Shortcut Manager

```javascript
// Create a keyboard manager class
class KeyboardManager {
  constructor(scene) {
    this.scene = scene;
    this.shortcuts = new Map();
    this.registerDefaults();
  }
  
  registerDefaults() {
    this.register('TAB', () => this.cycleOwnedSystems());
    this.register('SPACE', () => this.centerOnSelected());
    this.register('ESC', () => this.deselect());
    this.register('PLUS', () => this.scene.zoomIn());
    this.register('MINUS', () => this.scene.zoomOut());
    // ... more shortcuts
  }
  
  register(key, callback) {
    const keyObj = this.scene.input.keyboard.addKey(key);
    keyObj.on('down', callback);
    this.shortcuts.set(key, keyObj);
  }
}
```

### Context Menu Implementation

Use React Portal to render context menu:

```jsx
// ContextMenu.jsx
const ContextMenu = ({ x, y, system, onClose, onAction }) => {
  const actions = getAvailableActions(system);
  
  return (
    <div 
      className="context-menu"
      style={{ position: 'absolute', left: x, top: y }}
    >
      {actions.map(action => (
        <button
          key={action.id}
          disabled={!action.enabled}
          onClick={() => { onAction(action); onClose(); }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};
```

### Tooltip System

```javascript
// Phaser tooltip implementation
class SystemTooltip {
  constructor(scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(100);
    this.background = scene.add.rectangle(0, 0, 150, 60, 0x1c2128);
    this.text = scene.add.text(0, 0, '', { fontSize: 12 });
    this.container.add([this.background, this.text]);
    this.container.setVisible(false);
    this.hoverTimeout = null;
  }
  
  show(x, y, system) {
    clearTimeout(this.hoverTimeout);
    this.hoverTimeout = setTimeout(() => {
      this.text.setText(`${system.name}\n${system.faction}\nPop: ${system.population}`);
      this.container.setPosition(x + 10, y + 10);
      this.container.setVisible(true);
    }, 300);
  }
  
  hide() {
    clearTimeout(this.hoverTimeout);
    this.container.setVisible(false);
  }
}
```

### Path Visualization for Fleet Movement

```javascript
class PathVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics().setDepth(50);
  }
  
  showPath(route) {
    this.graphics.clear();
    this.graphics.lineStyle(2, 0x58a6ff, 0.8);
    
    for (let i = 0; i < route.length - 1; i++) {
      const start = route[i];
      const end = route[i + 1];
      this.graphics.lineBetween(start.x, start.y, end.x, end.y);
    }
    
    // Animated dash effect
    this.scene.tweens.add({
      targets: this.graphics,
      alpha: { from: 0.8, to: 0.4 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  }
  
  clearPath() {
    this.graphics.clear();
  }
}
```

### Touch Input Handling (Future)

```javascript
// Detect touch vs mouse
const isTouchDevice = 'ontouchstart' in window;

if (isTouchDevice) {
  // Register touch-specific handlers
  this.input.on('pointerdown', (pointer) => {
    this.touchStart = Date.now();
  });
  
  this.input.on('pointerup', (pointer) => {
    const touchDuration = Date.now() - this.touchStart;
    if (touchDuration > 500) {
      // Long press = context menu
      this.showContextMenu(pointer.x, pointer.y);
    }
  });
}
```

## Integration Points

- **main-stage.js**: Primary input event handling scene
- **sector.js**: Interactive system objects with hit areas
- **App.jsx**: React state updates from Phaser events (via custom events or state bridge)
- **data-bridge.js**: Action execution (fleet movement, mission assignment)
- **Future HUD components**: Context menus, tooltips, confirmation dialogs

## Future Enhancements

- Gesture recording and playback (replay actions)
- Macro system (record and execute multi-step actions)
- Voice commands for accessibility
- Custom keybinding configuration
- Gamepad/controller support
- VR interaction mode (experimental)
- Multi-touch gestures for tablets
- Accessibility features (sticky keys, mouse keys, etc.)
- Undo/redo functionality for reversible actions

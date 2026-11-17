# Galaxy Map

## Overview

The Galaxy Map is the central visual interface for Branded Galaxy, providing players with a strategic view of all sectors, systems, and their current state. It serves as the primary navigation and information display, showing faction control, fog of war, fleet positions, and enabling all strategic interactions.

## Requirements

### FR-GM-001: Map Rendering
- System shall render a 2D galaxy map showing all sectors and systems
- Map shall use Phaser 3 rendering engine within React application context
- Visual style shall match GitHub-inspired dark theme (`#0d1117` background)
- Map shall support zoom levels (100%, 150%, 200%)
- Map shall support pan/drag to navigate large galaxies
- Rendering performance shall maintain 60 FPS on modern browsers

### FR-GM-002: Sector Visualization
- Each sector shall be visually represented as a bounded region
- Sector boundaries shall be indicated with subtle lines or shading
- Sector names shall display when zoomed in sufficiently
- Sector regions shall use distinct visual styling from systems

### FR-GM-003: System Visualization
- Each star system shall be rendered as a circle/node
- System size shall scale with population level (larger = more populous)
- System color shall indicate faction loyalty:
  - **Brand Authority**: Blue (`#58a6ff`)
  - **The Union**: Green (`#3fb950`)
  - **The Autoforge**: Yellow/Gold (`#f0883e`)
  - **Neutral**: Gray (`#8b949e`)
- System names shall display on hover or when zoomed in
- **Deprecated:** no cost or purchase price should appear beneath systems; acquisition is handled by game logic
- Special system types shall have visual indicators (icons or border effects)

### FR-GM-004: Hyperspace Tunnel Display
- Connections between systems shall render as lines
- Connection lines shall use subtle styling to avoid visual clutter
- Active fleet movement paths shall highlight their connections
- Connection density shall be visually manageable even in dense networks

### FR-GM-005: Fog of War System
- Unexplored/uncontrolled regions shall be obscured or darkened
- Fog of war shall reveal based on:
  - Controlled systems and adjacent systems
  - Fleet scout range
  - Established spy networks
- Partially revealed systems shall show limited information
- Previously explored but no longer visible systems shall show stale data

### FR-GM-006: Fleet Position Indicators
- Friendly fleets shall display on map at current location
- Fleet icons shall indicate fleet size/strength
- Fleet movement shall animate along hyperspace routes
- Enemy fleets shall only display if within intelligence range
- Fleet icons shall be clickable for detailed view

### FR-GM-007: Map Overlays and Filters
- Players shall toggle overlay visualization modes:
  - **Control Overlay**: Show loyalty/faction control clearly
  - **Resource Overlay**: Highlight resource-rich systems
  - **Military Overlay**: Show fleet positions and defense strength
  - **Intelligence Overlay**: Display fog of war and known intel
- Overlays shall be toggleable without performance impact
- Multiple overlays can be active simultaneously (with compositing)

### FR-GM-008: Visual Feedback
- Selected systems shall highlight with distinct border/glow
- Hovered systems shall show tooltip preview
- Mission targets shall pulse or indicate visually
- Combat-active systems shall have special visual effects
- Recently captured/changed systems shall have transition animation

### FR-GM-009: Responsive Layout
- Map shall scale to available viewport size
- Minimum resolution support: 1280x720
- UI panels shall not obscure critical map areas
- Map controls shall be accessible and intuitive
- Touch input support for tablet/mobile (future consideration)

## Constraints

### CN-GM-001: Technical Architecture
- Map must render using Phaser 3 game canvas
- Integration with React UI layer via `window.startPhaserGame()`
- Map container div: `#galaxy-app` (child of `#root`)
- No direct DOM manipulation from Phaser (use React for UI panels)

### CN-GM-002: Performance
- Rendering must handle up to 120 systems without lag
- Pan/zoom operations must be smooth (no frame drops)
- Map updates (loyalty changes, fleet movement) must not cause stuttering
- Asset loading during map initialization must show progress indicator

### CN-GM-003: Data Integration
- Map must consume galaxy data from DataBridge
- Map state updates must sync with game state changes
- Offline mode and cloud mode must both work seamlessly
- Map must support real-time updates in multiplayer (future)

### CN-GM-004: Browser Compatibility
- Must work in modern browsers (Chrome, Firefox, Edge, Safari)
- WebGL rendering preferred, fallback to Canvas if needed
- No browser-specific features without polyfills

### CN-GM-005: Existing Codebase Integration
- Extends existing `main-stage.js` Phaser scene
- Uses `sector.js` class for system entity management
- Follows existing dark theme color palette
- Maintains separation between React (UI) and Phaser (rendering)

## Acceptance Criteria

### AC-GM-001: Basic Map Rendering
- [ ] Galaxy map renders all systems with correct positions
- [ ] Systems display with size proportional to population
- [ ] System colors reflect faction loyalty correctly
- [ ] Sector boundaries are visible and appropriately styled
- [ ] Map background uses dark theme (`#0d1117`)

### AC-GM-002: Navigation Controls
- [ ] Map supports click-and-drag panning
- [ ] Zoom in/out controls work (buttons or mouse wheel)
- [ ] Zoom maintains center focus or mouse position
- [ ] Pan boundaries prevent scrolling into empty space
- [ ] Double-click on system centers and zooms to it

### AC-GM-003: Interactive Elements
- [ ] Hovering over system shows tooltip with basic info
- [ ] Clicking system selects it and shows detail panel
- [ ] Selected system has visible highlight effect
- [ ] Hyperspace connections display between linked systems
- [ ] Connection lines don't obscure system visibility

### AC-GM-004: Fog of War
- [x] Unexplored systems are darkened or hidden
- [x] Player-controlled systems and neighbors are fully visible
- [x] Fog of war updates when systems are explored/captured
- [x] Partial visibility shows limited system information
- [ ] Fog rendering does not impact performance

### AC-GM-005: Visual Indicators
- [ ] Special system types have visual markers (icons or effects)
- [x] Fleet positions display on map with appropriate icons
- [ ] Mission targets show indicator (pulse or highlight)
- [ ] Combat events trigger visual feedback on affected systems
- [ ] Loyalty changes animate smoothly (color transition)

### AC-GM-006: Overlay System
- [ ] Toggle buttons switch between overlay modes
- [ ] Resource overlay highlights high-production systems
- [ ] Military overlay shows defense strength indicators
- [x] Intelligence overlay visualizes fog of war clearly
- [x] Overlays composite correctly when multiple active

### AC-GM-007: Performance
- [ ] Map renders at 60 FPS with medium galaxy (60 systems)
- [ ] Map renders at 30+ FPS with large galaxy (120 systems)
- [ ] Zoom operations complete without lag
- [ ] Pan operations are smooth and responsive
- [ ] System updates (loyalty, fleets) render without frame drops

### AC-GM-008: Integration
- [ ] Map initializes correctly after React authentication screen
- [ ] Map consumes galaxy data from DataBridge successfully
- [ ] Map updates reflect game state changes in real-time
- [ ] Works in both offline mode and cloud mode
- [ ] No conflicts between React UI and Phaser rendering

### AC-GM-009: Responsive Design
- [ ] Map scales to viewport size appropriately
- [ ] UI panels position correctly around map canvas
- [ ] Map remains usable at 1280x720 minimum resolution
- [ ] Map controls are accessible without obscuring view
- [ ] Fullscreen mode works correctly

## Technical Notes

### Phaser Scene Structure

The galaxy map will be rendered in `main-stage.js`:

```javascript
class MainStage extends Phaser.Scene {
  create() {
    this.galaxyData = dataBridge.getGalaxy();
    
    // Render sectors
    this.renderSectors();
    
    // Render hyperspace connections
    this.renderConnections();
    
    // Render systems using Sector class
    this.systems = [];
    this.galaxyData.systems.forEach(sysData => {
      const sector = new Sector(this, sysData);
      this.systems.push(sector);
    });
    
    // Setup camera controls
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    
    // Input handlers
    this.setupPanControls();
    this.setupZoomControls();
  }
}
```

### Camera and Navigation

- Use Phaser's built-in camera system for pan/zoom
- Implement smooth scrolling with damping effects
- Zoom levels: 0.75x, 1.0x, 1.5x, 2.0x
- Constrain camera to map boundaries

### Fog of War Implementation

Two-layer approach:
1. **Base Layer**: Render all systems in darkened/desaturated state
2. **Visibility Layer**: Apply full color only to visible systems
3. **Memory Layer**: Show last-known state for previously seen systems

```javascript
// Pseudo-code
system.alpha = isVisible ? 1.0 : 0.3;
system.saturation = isVisible ? 1.0 : 0.2;
```

### Overlay System Architecture

Use Phaser's multiple camera or render texture approach:
- Each overlay is a separate visual layer
- Toggles show/hide specific overlay layers
- Compositing uses blend modes for visual clarity

### Performance Optimization

- Use object pooling for frequently updated elements (fleets, effects)
- Batch render static elements (sectors, connections)
- Update only visible systems during pan/zoom
- Use spatial partitioning for large galaxies (quadtree or grid)

### Color Palette

```javascript
const COLORS = {
  background: 0x0d1117,
  brandAuthority: 0x58a6ff,
  union: 0x3fb950,
  autoforge: 0xf0883e,
  neutral: 0x8b949e,
  selected: 0xffffff,
  connection: 0x30363d,
  fogOfWar: 0x161b22
};
```

## Integration Points

- **data-bridge.js**: Fetch galaxy state and system data
- **main-stage.js**: Primary rendering scene for map
- **sector.js**: System entity class for interactive elements
- **App.jsx**: React layer triggers map initialization
- **Future HUD components**: React panels overlay map for system details

## Future Enhancements

- 3D visualization mode (isometric or full 3D)
- Animated background starfield with parallax scrolling
- Mini-map in corner for large galaxy navigation
- Time-lapse replay of territorial changes
- Screenshot/export map as image
- Custom map themes/color schemes
- Accessibility improvements (high contrast mode, screen reader support)

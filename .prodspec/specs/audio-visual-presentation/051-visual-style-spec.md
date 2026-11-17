# Visual Style

## Overview

This spec defines the visual design language for Branded Galaxy: color palette, typography, galaxy map aesthetics, faction visual identities, UI component styling, and animation/particle guidelines. It establishes the source-of-truth for all visual decisions to ensure consistency across Phaser-rendered game elements and React UI overlays.

## Requirements

### FR-VS-001: Color Palette
- **Base Dark Theme** (applied globally):
  - Background deep: `#0d1117`
  - Surface: `#161b22`
  - Border / divider: `#30363d`
  - Text primary: `#e6edf3`
  - Text secondary: `#8b949e`
  - Text muted: `#484f58`
- **Accent Colors**:
  - Blue (Brand Authority / interactive): `#58a6ff`
  - Green (success / growth): `#3fb950`
  - Red (danger / threat): `#f85149`
  - Yellow (warning / caution): `#d29922`
  - Purple (research / tech): `#bc8cff`
  - Orange (resources / economy): `#e3b341`

### FR-VS-002: Faction Visual Identity
- **The Brand Authority**: `#58a6ff` (blue) — clean, corporate iconography; sharp geometric shapes
- **The Union**: `#3fb950` (green) — organic, resistance aesthetic; rough edges, worn textures implied
- **The Autoforge**: `#9e6a03` (gold/amber) — mechanical, industrial; hex grid motifs
- Each faction's systems on the galaxy map use the faction's primary color for the system ring/glow
- Controlled systems display the faction's color at full opacity; contested systems pulse between two faction colors at 1Hz

### FR-VS-003: Galaxy Map Aesthetics
- Background: deep black (`#0d1117`) with a sparse star field (procedural, seeded per galaxy seed)
- Star field: ~200 small white/blue particles per viewport at ~10% opacity using Phaser particle emitters
- System nodes: circles with a faction-colored outer ring and white inner dot; radius scales with population (min 16px, max 28px)
- Hyperspace lanes: `#30363d` lines (1px width at standard zoom); brighten to `#8b949e` on hover
- Neutral/uncontrolled systems: `#484f58` ring, no colored glow

### FR-VS-004: Typography
- Primary font: `'Orbitron', sans-serif` for headings and titles (sci-fi aesthetic)
- Secondary font: `'Inter', sans-serif` for body text, labels, and tooltips
- Monospace: `'JetBrains Mono', monospace` for IDs, turn counters, and numeric data
- Text size scale (rem):
  - H1 title: 2.0
  - H2 section: 1.5
  - H3 subsection: 1.25
  - Body / label: 1.0
  - Caption / tooltip: 0.875

### FR-VS-005: HUD and Panel Styling
- All HUD panels and slide-in info panels use: `background: #161b22; border: 1px solid #30363d; border-radius: 6px`
- Panel headers: `background: #21262d; padding: 12px 16px`
- Interactive buttons: `background: #21262d; border: 1px solid #30363d` with hover state `border-color: #58a6ff; color: #58a6ff`
- Danger/confirm buttons: `background: #da3633; color: #fff`
- HUD resource bar: individual resource chip with colored icon, current value, and trend arrow

### FR-VS-006: Animations and Transitions
- Panel slide-in: 200ms ease-out from right edge
- Modal appear: 150ms fade-in with 5px upward translate
- Toast notification: 200ms slide-in from top-right, 6s hold, 200ms fade-out
- Faction color pulse on contested systems: CSS `animation: pulse 1s infinite alternate`
- System click feedback: 80ms scale up (1.0 → 1.1) then 80ms scale back
- Fleet transit indicators: animated dashed line between source and destination system, traveling dot at 5s per hop

### FR-VS-007: Particle Effects
- Boot Stage creates procedural particle assets (spec from `boot-stage.js`)
- Active starfield in MainStage: slow-drifting particles at ~1px/s
- Combat flash: brief red particle burst at system node on combat trigger (15 particles, 0.5s lifetime)
- System capture: brief faction-color particle spray (20 particles, 1.0s lifetime)
- Research complete: purple particle ring expanding from HUD research icon (30 particles, 0.8s lifetime)

### FR-VS-008: Accessibility Considerations
- All color-coded information must have a secondary non-color indicator (icon, text label, or pattern)
- Minimum contrast ratio for all text vs background: 4.5:1 (WCAG AA)
- Animated effects must not flash at > 3 Hz (seizure safety)
- Font size minimum: 12px / 0.75rem for any visible text

## Constraints

- All pixel values in this spec are at 100% zoom (standard display); the game must remain legible at 90% browser zoom
- Phaser canvas elements use direct drawing calls; system glows and rings are Phaser Graphics objects, not CSS
- React UI components use inline styles + CSS modules; global CSS variables expose the color tokens from FR-VS-001

## Acceptance Criteria

- [x] All system nodes display correct faction color ring and scale with population
- [x] Contested systems pulse at 1Hz between competing faction colors
- [x] Hyperspace lanes use correct base color and brighten on hover
- [x] All panel backgrounds, borders, and header colors match the defined tokens
- [x] Panel slide-in animation completes in ≤ 200ms
- [x] Combat flash and system capture particle effects trigger correctly on respective events
- [x] Fleet transit dot animation displays for in-transit fleets
- [x] Font stacks resolve to correct fonts (Orbitron, Inter, JetBrains Mono)
- [x] All text meets 4.5:1 contrast minimum

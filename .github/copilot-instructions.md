# Branded Galaxy - AI Agent Instructions

## Architecture Overview

This is a **layered hybrid application** combining React UI with Phaser 3 game engine:

```
React UI Layer (Auth, Menus) 
   ↓
Data Bridge (Supabase/localStorage)
   ↓
Phaser Game Engine (Rendering)
```

**Critical Integration Point**: React and Phaser communicate via `window.startPhaserGame()` function defined in [src/main.jsx](../src/main.jsx#L20). React renders first, then triggers Phaser game initialization after authentication.

## Project Structure

- `core/` - Core systems: [app.js](../core/app.js) (legacy), [data-bridge.js](../core/data-bridge.js) (singleton handling Supabase/offline mode)
- `engine/` - Phaser scenes: [boot-stage.js](../engine/boot-stage.js) (loading), [main-stage.js](../engine/main-stage.js) (gameplay)
- `src/` - React components: [main.jsx](../src/main.jsx) (entry point), [App.jsx](../src/App.jsx) (auth flow)
- `ui/` - Game UI classes: [sector.js](../ui/sector.js) (sector entities with rendering and state)
- `.prodspec/` - Product specification workflow (numbered flat spec files, plan mode sessions)

## Key Patterns

### Dual-Mode Data Bridge
[data-bridge.js](../core/data-bridge.js) operates in two modes:
- **Cloud mode**: Supabase client (requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`)
- **Offline mode**: localStorage fallback (default when env vars missing)

Always check `dataBridge.offlineMode` before implementing data operations.

### Phaser Scene Flow
1. [BootStage](../engine/boot-stage.js): Creates procedural assets (particles), shows loading bar
2. [MainStage](../engine/main-stage.js): Game logic - sector management, HUD, starfield particles

Use `this.scene.start('SceneName')` for transitions, never instantiate scenes directly.

### Sector Component Pattern
[Sector class](../ui/sector.js) encapsulates:
- Visual rendering (Phaser circle + text objects)
- State management (owned, cost)
- Interactive behaviors (hover effects, claiming)

When creating new game entities, follow this self-contained class pattern storing references to Phaser objects as instance properties.

### React ↔ Phaser Event Sequencing (Modal Data Loading)

**Critical**: Phaser responds to `window.dispatchEvent` **synchronously** — the response event fires and its React listener runs *during* the dispatch call, before any React state updates from the same tick have been applied.

This creates a silent data-loss bug in any modal that:
1. Sets state (e.g. `setFactionId(fid)`) — this is async/deferred
2. Immediately dispatches multiple request events to Phaser
3. Has response handlers that guard on that state value

The state value is still `null`/stale when the synchronous response fires, so the guard rejects the data and the modal opens empty. On the *second* open the state is already populated from the previous session, so it works — making the bug easy to miss.

**The fix pattern** — use a `useRef` as the single source of truth for values that must be readable during synchronous Phaser responses:

```js
// Set the ref BEFORE dispatching any requests
sessionFactionIdRef.current = fid;
setFactionId(fid);  // async — NOT available in handlers called during the dispatches below

window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', { detail: { factionId: fid } }));
window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
// ...etc
```

```js
// In every response handler, read the ref, fall back to state for ongoing sessions
const expectedFid = sessionFactionIdRef.current ?? factionId;
if (playerFactionId !== expectedFid) return;
```

**Rules when building or modifying modals that request data on open:**

1. **Always set a session ref before dispatching.** Any value needed by response handlers must be in a ref, not just state.
2. **Never clear the session ref inside a data handler.** Only clear it in `handleClose` / unmount. A handler that fires first (e.g. character update) must not clear the ref that later handlers (fleet, mission, construction) still need.
3. **Use separate refs for separate concerns.** `pendingCharIdRef` tracks the character being opened; `sessionFactionIdRef` tracks the faction for the whole session — they have different lifetimes and must not be conflated.
4. **Check for this pattern when reviewing any modal that shows empty on first open but populated on second open.** That symptom is the fingerprint of this stale-state / synchronous-response race.

See [AssignmentModal.jsx](../src/components/AssignmentModal.jsx) for the canonical implementation.

## Development Commands

```bash
npm run dev        # Start dev server on http://localhost:3030/Branded-Galaxy/
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

**Port**: Always use 3030 (configured in [package.json](../package.json))  
**Base Path**: `/Branded-Galaxy/` for GitHub Pages deployment (set in [vite.config.js](../vite.config.js))

## ProdSpec Workflow

Follow spec-driven development for new features:
1. **Create spec**: `.prodspec/specs/{category}/{NNN}-{feature-name}-spec.md` (requirements, constraints, acceptance criteria)
2. **Run Plan mode**: Open a Plan mode session referencing the spec — no `plan.md` file is created; the plan exists only during the session
3. **Implement**: Execute the plan with the spec as the requirements reference
4. **Update specs and docs**: When implementation details change, immediately update the spec file and product docs

### Spec File Naming

- Format: `{NNN}-{feature-name}-spec.md` (file), inside a kebab-case category subfolder under `.prodspec/specs/`
- `{NNN}` is the zero-padded position number from the feature catalog (e.g. `007-technology-research-tree-spec.md`)
- Specs are numbered sequentially in the order sub-features appear under their parent sections in `feature-catalog.md`
- **Category folders** (use the matching folder for the feature catalog section):

  | Folder | Specs |
  |---|---|
  | `galaxy-map-systems/` | 001–004 |
  | `faction-management/` | 005–008 |
  | `character-leader-system/` | 009–012 |
  | `fleet-management-combat/` | 013–016 |
  | `base-construction-facilities/` | 017–020 |
  | `mission-system/` | 021–023 |
  | `diplomacy-planet-loyalty/` | 024–027 |
  | `turn-based-game-loop/` | 028–031 |
  | `ai-opponents/` | 032–033 |
  | `user-interface-controls/` | 034–036, 063 |
  | `game-setup-configuration/` | 037–039 |
  | `save-load-system/` | 040–041 |
  | `intelligence-fog-of-war/` | 042–044 |
  | `event-system/` | 045 |
  | `combat-resolution-system/` | 046–048 |
  | `multiplayer-networking/` | 049–050 |
  | `audio-visual-presentation/` | 051–052 |
  | `tutorial-help-system/` | 053–054 |
  | `hybrid-async-sync-mode/` | 055–062 |

- **For features not yet in the catalog**: use the next number after the current last catalog entry, place the spec in the matching category folder, then add the feature to `feature-catalog.md`
- **For new categories**: create a new kebab-case folder matching the catalog section name

**Critical**: Specs and documentation must stay synchronized with implementation. When modifying features, always update:
- Feature spec in `.prodspec/specs/{category}/{NNN}-{feature-name}-spec.md`
- README.md if user-facing behavior or architecture changes

See [.prodspec/README.md](../.prodspec/README.md) for the spec template and full directory structure.

## Project Management Files Synchronization

Two key product management files must be kept in sync:

- **[.prodspec/product/feature-catalog.md](../.prodspec/product/feature-catalog.md)** - Comprehensive inventory of all features with detailed descriptions, categorized by system. The authoritative reference for what features exist and their implementation status.
- **[.prodspec/product/roadmap.md](../.prodspec/product/roadmap.md)** - Planned features and known gaps. Keep updated as work is completed.

**Synchronization Rules**:
1. When adding or completing features, update `feature-catalog.md` status and spec link
2. When starting planned work from `roadmap.md`, move it to `feature-catalog.md` when done
3. When new gaps are discovered, add them to the Known Gaps section of `roadmap.md`
4. Cross-reference between files using spec links to maintain traceability

**Workflow**: Feature Catalog (what exists) → Roadmap (what's planned/gaps) → Implementation → Update both files

## Code Conventions

- **No TypeScript**: Pure JavaScript with ES modules
- **Imports**: Always use `.js` extension in imports
- **React**: Functional components only, hooks for state management
- **Phaser**: Scene-based architecture, avoid direct `new Phaser.Game()` calls after initial setup
- **Named constants**: Extract magic numbers (see `AUTH_TRANSITION_DELAY_MS` in [App.jsx](../src/App.jsx#L5))
- **Styling**: GitHub-inspired dark theme colors (`#0d1117`, `#58a6ff`, `#3fb950`)

## UI Display Rules

### Icons and Unicode Symbols
- **Never use emoji** in source files, JSON data, or JSX. Emoji render as color glyphs on some platforms, cannot be CSS-colored, and are prone to mojibake (encoding corruption) when files are saved in different encodings.
- **All icons must be pure Unicode text glyphs** (e.g. `◆`, `⚙`, `♟`, `★`, `⬡`, `⚠`) or inline SVG. Text glyphs inherit CSS `color` and render flat/monochrome.
- **Define all icon constants in [src/icons.js](../src/icons.js)** using `\u{XXXXX}` code-point escapes (never literal characters). Import from there — never scatter icon strings across components.
- **Tech tree JSON node icons** must also be plain Unicode text glyphs (no emoji, no `\uFE0F` variation selector). JSON cannot hold JSX, but the same no-emoji rule applies.
- **Never let a raw `\uXXXX` escape or code-point literal appear in rendered UI.** If a character is not rendering correctly, fix the source encoding — do not work around it by switching to a different representation inline.
- **`\uXXXX` escapes are silently ignored in bare JSX text content.** Root cause: JSX text nodes are not JavaScript strings — escape sequences like `\u27f3` in bare text render as the literal characters `\u27f3` in the browser. They are only processed inside a JS expression. Resolution: always place Unicode escapes inside `{}` so they are evaluated as JS strings (e.g. `{'\u27f3'}` not `\u27f3` in a text node), use a literal character in the source file, or use an HTML entity (`&#x27F3;`). The safest approach is to define the constant in `icons.js` and import it — this forces the value through a JS string and the issue cannot occur.

### User-Friendly Names in the UI
- **Always display the human-readable name** of a game object (system name, sector name, faction name, character name, etc.) whenever presenting information to the player — never show a raw ID such as `sector_004`, `sys_alpha`, or a UUID.
- Resolve names before passing data to any React component or Phaser text object. Look up the name from the relevant state manager or definition object (e.g. `galaxyState.systems[id].name`, `factionDefs[id].name`).
- IDs are internal keys — acceptable in state, logs, and data structures, but **must not appear in any player-visible string, label, tooltip, notification, or modal**.

### Character Portraits
- **All character portraits are PNG images** served from `assets/transparent-character-portraits/`. The `portrait` field in `character-definitions.json` and on runtime character objects must be a filename (e.g. `"K_06_t.png"`), never a Unicode glyph or emoji.
- **Available portraits**: 60 files across four series — `A_01_t.png`–`A_18_t.png` (android/synthetic look), `F_01_t.png`–`F_12_t.png` (female), `K_01_t.png`–`K_17_t.png` (mixed), `M_01_t.png`–`M_13_t.png` (male). The full list lives in [`core/character-state-manager.js`](../core/character-state-manager.js) as the exported `PORTRAIT_POOL` constant.
- **When adding a named character** to `character-definitions.json`, assign a portrait filename from the pool. Prefer the `A_` series for Autoforge synthetic characters, `F_` for female characters, and `K_`/`M_` for others. Avoid reusing a portrait already assigned to another character in the same faction roster.
- **When generating a character procedurally** (e.g. via `recruitCharacter`), call `random.choice(PORTRAIT_POOL)` (imported from `character-state-manager.js`) — already handled automatically.
- **Rendering**: `CharacterRosterPanel.jsx` and `AssignmentModal.jsx` detect `.png` suffix and render an `<img>` tag using `${import.meta.env.BASE_URL}transparent-character-portraits/${portrait}`. Any new component that displays a character portrait must follow the same pattern — never render the filename string as text.
- The `assets/` directory is configured as Vite's `publicDir` (see [`vite.config.js`](../vite.config.js)), so portrait files are served at `${BASE_URL}transparent-character-portraits/<filename>` in both dev and production.

## Common Gotchas

1. **React + Phaser DOM conflict**: Never render Phaser and React in same div - React uses `#root`, Phaser uses `#galaxy-app` (child of root)
2. **DataBridge initialization**: Must call `dataBridge.initialize()` before any auth operations (done in [main.jsx](../src/main.jsx#L10))
3. **Vite env vars**: Must prefix with `VITE_` to expose to client code
4. **Scene depth**: HUD elements need explicit `.setDepth(90+)` to render above game objects
5. **Base path**: Remember `/Branded-Galaxy/` base path when referencing assets or routes
6. **Solo online ≠ offline mode**: When a player is logged in with Supabase credentials but playing a solo game, `dataBridge.offlineMode` is `false` — yet the gameId is `"local-solo"` (not a UUID). Any Supabase query using this non-UUID id fails with a 400 error. **Always guard DB writes with both `dataBridge.offlineMode` AND a solo/local game check** (e.g. `this._isSolo`, `this._soloMode`, or a UUID-format test on the gameId). See `SessionPresenceManager.setGameStatus()`, `SyncTickManager._writeTickToStorage()`, and `SnapshotManager._isRemoteGameId()` for the canonical pattern.
7. **Local event dispatch for solo/offline mode changes**: When persisting state to localStorage instead of Supabase, there is no Postgres Changes subscription to fire downstream events. Code that writes to localStorage **must also dispatch the corresponding `window.dispatchEvent(new CustomEvent(...))` manually** — otherwise listeners (e.g. MainStage listening for `session:gameStatusChanged`) never fire and the state transition silently fails.
8. **React conditional rendering vs component `visible` prop**: If a parent uses `{show && <Component />}` to control mount/unmount, but the component also checks a `visible` prop internally and returns `null` when it's falsy, the component will never render unless `visible={true}` is explicitly passed. Prefer one gating mechanism — either the parent conditional **or** the internal prop — not both.
9. **React ↔ Phaser dead events**: When a React component dispatches a `window.CustomEvent` expecting Phaser (MainStage) to handle it, verify that MainStage actually has a `window.addEventListener(...)` for that event name. Symptom: button click does nothing, no console error. Always grep for the event name across both React (`src/`) and Phaser (`engine/`) to confirm both ends exist before considering the feature wired.

## Testing

Manual testing only (no automated test suite):
- Verify the landing page and login panel render
- Test offline mode (no .env.local)
- Test Supabase integration (with credentials)
- Check build output (~1.84 MB, ~444 KB gzipped)

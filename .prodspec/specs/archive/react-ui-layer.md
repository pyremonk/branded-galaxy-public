# React UI Layer Integration Spec

## Overview
Integrate React.js with Vite as the UI layer for Branded Galaxy game, separating concerns between UI components (React) and game engine (Phaser).

## Requirements

### React Setup
- Install React 19.x and React-DOM
- Configure Vite to support React using @vitejs/plugin-react
- Create modular component structure

### UI Components
- AuthScreen component for authentication UI
  - Sign In view
  - Sign Up view
  - Form validation
  - Error/success messaging
- App component as main entry point
  - Manages authentication state
  - Integrates with Phaser game engine

### Integration with Existing Code
- Maintain compatibility with existing Phaser game engine
- Preserve existing data-bridge.js for Supabase integration
- Keep Phaser scenes (BootStage, MainStage) intact
- React handles UI layer, Phaser handles game rendering

### Build Configuration
- Update vite.config.js with React plugin
- Maintain existing build settings (base path, output directory)
- Support ES modules

## Constraints
- Must not break existing Phaser game functionality
- Minimize changes to existing game logic
- Use existing authentication flow (data-bridge)
- Keep bundle size reasonable
- Support modern browsers (ES6+)

## Architecture

```
┌─────────────────────────────────────┐
│         React UI Layer              │
│  ┌──────────────────────────────┐  │
│  │   App Component              │  │
│  │   ├─ AuthScreen              │  │
│  │   └─ (Future UI Components)  │  │
│  └──────────────────────────────┘  │
├─────────────────────────────────────┤
│      Data Bridge (Supabase)         │
├─────────────────────────────────────┤
│     Phaser Game Engine              │
│  ┌──────────────────────────────┐  │
│  │   BootStage                   │  │
│  │   MainStage                   │  │
│  │   Sector Components          │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Implementation Steps

1. Install dependencies (react, react-dom, @vitejs/plugin-react)
2. Configure Vite with React plugin
3. Create React component structure
   - src/main.jsx (entry point)
   - src/App.jsx (main app component)
   - src/components/AuthScreen.jsx (auth UI)
   - src/components/AuthScreen.css (styles)
4. Update index.html to use React entry point
5. Integrate Phaser initialization with React lifecycle
6. Test authentication flow
7. Verify game launches after authentication

## Acceptance Criteria

- [x] React and Vite are properly configured
- [x] Authentication UI renders correctly
- [x] Sign in/sign up functionality works
- [x] Phaser game starts after successful authentication
- [x] No regression in existing game functionality
- [x] Build process completes successfully
- [x] Development server runs without errors
- [x] Code follows project structure conventions

## Testing

- Manual testing of authentication flow
- Verify UI renders correctly in browser
- Test sign in with existing account
- Test sign up with new account
- Verify Phaser game initializes post-auth
- Check console for errors
- Test build output

## Future Enhancements

- Add React components for in-game UI overlays
- Implement HUD as React components
- Add game stats display using React
- Create settings panel with React
- Add animations and transitions

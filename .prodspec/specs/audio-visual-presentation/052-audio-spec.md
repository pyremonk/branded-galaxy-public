# Audio

## Overview

This spec defines the audio design for Branded Galaxy: background music structure, sound effect triggers, faction-specific audio themes, and the audio settings system. Audio enhances immersion and provides feedback for key game events without overwhelming the strategic focus. Phase 1 ships with foundational SFX and one ambient music track; faction themes and voice lines are Phase 2+.

## Requirements

### FR-AU-001: Audio Architecture
- Audio is managed by a lightweight Audio Manager module (`core/audio-manager.js`, to be created)
- The Audio Manager wraps the Web Audio API via Phaser's built-in sound system
- Sound assets are loaded during BootStage (spec from `boot-stage.js`) using Phaser's asset loader
- All audio keys are defined as named constants in `core/audio-manager.js`

### FR-AU-002: Background Music
- **Phase 1**: One ambient background track plays in a seamless loop during gameplay
  - Track style: atmospheric, electronic/space ambient; neutral (non-faction-specific)
  - Loop crossfade: 2s fade overlap to eliminate click at loop point
- **Phase 2+**: Faction-specific themes that crossfade when the player's faction is winning/losing
- Music volume: configurable (default 40%)
- Main menu uses a separate, lighter ambient loop

### FR-AU-003: UI Sound Effects
- Button click: soft click SFX (< 80ms duration)
- Panel open: short whoosh/slide SFX
- Panel close: inverse (shorter) whoosh SFX
- Notification toast (Info): subtle chime, low volume
- Notification toast (Warning): sharper alert tone
- Notification modal (Critical): sustained alert tone (loops until dismissed)
- Turn End confirmation: brief "submit" click
- Error / invalid action: short low-pitched buzzer

### FR-AU-004: Game Event Sound Effects
- System claimed / captured: faction-appropriate fanfare sting (< 2s)
- Combat triggered: short battle SFX (percussive, 1–2s)
- Fleet arrival: subtle hyperspace drop-in SFX
- Research complete: ascending chime sequence (~1.5s)
- Character captured: tense notification sting
- Mission success: positive resolution chime
- Mission failure: negative resolution tone
- Event triggered: distinctive event notification sting
- Victory achieved: full victory fanfare (3–5s)
- Defeat: somber resolution tone (3–5s)

### FR-AU-005: Volume Controls
- Audio settings are accessible from the pause menu and main menu settings screen
- Controls:
  - **Master Volume**: slider 0–100% (affects all audio, default 70%)
  - **Music Volume**: slider 0–100% relative to Master (default 40%)
  - **SFX Volume**: slider 0–100% relative to Master (default 80%)
  - **Mute All**: toggle button
- Settings persist in `localStorage` under key `brandedGalaxy_audioSettings`
- Volume changes take effect immediately (no need to restart)

### FR-AU-006: Faction Audio Themes (Phase 2 — Out of Scope for Phase 1)
- Each faction has a distinct musical motif:
  - Brand Authority: clean, corporate orchestral strings + synthesizer
  - Union: tense, rebellious electronic drums + melodic bass
  - Autoforge: mechanical, percussion-heavy industrial / glitch electronic
- Motifs are short loops (30–60s) that replace the neutral ambient track when that faction's UI is focused

### FR-AU-007: Voice Lines (Phase 2 — Out of Scope for Phase 1)
- Key events have faction-specific spoken lines:
  - Mission success, mission failure, research complete, system captured, system lost
- Voice lines are triggered by the same events as FR-AU-004 but substitute for the generic SFX when available

## Constraints

- All audio files must be in `.ogg` format (Phaser primary) with `.mp3` fallback for browser compatibility
- No audio file may exceed 2MB for Phase 1 (network budget)
- Audio must not play if Master Volume is 0 or Mute All is active
- Audio loading failures must not prevent the game from starting; log a warning and continue silently

## Acceptance Criteria

- [x] Ambient background music plays on loop during gameplay with seamless crossfade
- [x] All UI SFX fire on correct triggers (button click, panel open/close, toasts)
- [x] All game event SFX fire on correct triggers (combat, capture, research, victory, defeat)
- [x] Master, Music, and SFX volume sliders independently control respective channels
- [x] Mute All toggle correctly silences all audio
- [x] Audio settings persist across sessions via localStorage
- [x] Audio load failure logs a warning without preventing game start

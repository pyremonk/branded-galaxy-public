/**
 * SaveStateManager — Orchestrates full-game-state serialization for the
 * Save/Load system.
 *
 * Responsibilities:
 *  - createSnapshot(): gather state from all subsystems into one object
 *  - validateVersion(): reject incompatible save files
 *
 * Slot IDs: 'auto' (auto-save), '1'–'5' (manual slots)
 * Save format: plain JSON object stored via DataBridge.saveGameState()
 *
 * Specs: 040-save-game-spec.md, 041-load-game-spec.md
 */

import { serializeAllState } from './snapshot-manager.js';

// Increment this when the save schema has a breaking change (FR-SG-005)
// v2: adds constructionState, missionState, loyaltyState, hotSeatState
// v3: adds turnHistory to turnState (via TurnStateManager.serialize())
// v4: serialize() normalization — all managers now return plain objects
// v5: adds alertState (spec 063 player alerts)
export const SAVE_VERSION = 5;

export const MANUAL_SLOT_IDS = ['1', '2', '3', '4', '5'];
export const AUTO_SLOT_ID    = 'auto';
export const ALL_SLOT_IDS    = [AUTO_SLOT_ID, ...MANUAL_SLOT_IDS];

export class SaveStateManager {
  /**
   * Collect a complete game-state snapshot from a live MainStage instance.
   *
   * @param {import('../engine/main-stage.js').MainStage} mainStage
   * @param {string} slotId   - 'auto' | '1'–'5'
   * @param {string} slotName - Display name for the slot
   * @returns {Object} Serialisable snapshot (safe to JSON.stringify)
   */
  static createSnapshot(mainStage: any, slotId: any, slotName: any, alertState = []) {
    const factionId   = mainStage.game.registry.get('playerFactionId') ?? 'brandAuthority';
    const gameConfig  = mainStage.game.registry.get('gameConfig')      ?? {};
    const currentTurn = mainStage.currentTurn;

    // Delegate serialization to the shared utility (FR-SNP-010)
    const state = serializeAllState({
      galaxy:                  mainStage.galaxy,
      resourceStates:          mainStage.resourceStates,
      techStates:              mainStage.techStates,
      characterStates:         mainStage.characterStates,
      fleetStateManager:       mainStage.fleetStateManager,
      constructionStateManager: mainStage.constructionStateManager,
      missionStateManager:     mainStage.missionStateManager,
      loyaltyStateManager:     mainStage.loyaltyStateManager,
      intelStateManager:       mainStage.intelStateManager,
      eventEngine:             mainStage.eventEngine,
      initiativeEngine:        mainStage.initiativeEngine,
      turnStateManager:        mainStage.turnStateManager,
      victoryGameState:        mainStage.victoryGameState,
      hotSeatManager:          mainStage.hotSeatManager,
      aiControllers:           mainStage.aiControllers,
      currentTurn,
    });

    // Strip the preGeneratedGalaxy (large) and any prior savedState to avoid nesting
    const { preGeneratedGalaxy: _pg, savedState: _ss, ...savableConfig } = gameConfig;

    return {
      saveVersion:      SAVE_VERSION,
      slotId,
      slotName,
      factionId,
      turn:             currentTurn,
      timestamp:        new Date().toISOString(),
      galaxy:           state.galaxy,
      resourceStates:   state.resources,
      techStates:       state.tech,
      characterStates:  state.characters,
      fleetState:       state.fleets,
      turnState:        state.turn,
      victoryStates:    state.victory,
      eventState:       state.events,
      intelState:       state.intel,
      constructionState: state.construction,
      missionState:     state.missions,
      loyaltyState:     state.loyalty,
      hotSeatState:     state.hotSeat,
      gameConfig:       savableConfig,
      tutorialStep:     mainStage.tutorialEngine?.currentStepIndex ?? undefined,
      alertState:       alertState,
    };
  }

  /**
   * Check whether a loaded save object is compatible with the current game.
   *
   * @param {Object} saveData - Raw parsed save object
   * @returns {{ valid: boolean, incompatible?: boolean, error?: string }}
   */
  static validateVersion(saveData: any) {
    if (!saveData || typeof saveData !== 'object') {
      return { valid: false, error: 'Save data is corrupted. This slot cannot be loaded.' };
    }
    if (saveData.saveVersion == null) {
      return { valid: false, incompatible: true, error: 'This save is from an older version and cannot be loaded.' };
    }
    if (saveData.saveVersion > SAVE_VERSION) {
      return { valid: false, incompatible: true, error: 'This save is from a newer version and cannot be loaded.' };
    }
    // v3 saves are forward-compatible — deserialize() guards handle
    // the old JSON-string format vs new plain-object format.
    return { valid: true };
  }
}

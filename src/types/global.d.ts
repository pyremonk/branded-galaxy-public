/**
 * Global type augmentations.
 *
 * - Declares window.startPhaserGame
 * - Augments WindowEventMap for typed window.addEventListener / dispatchEvent
 */

import type { GameConfig } from './game-objects.js';
import type { WindowGameEventMap } from './events.js';

declare global {
  interface Window {
    /**
     * Initialise and start the Phaser game after the player has selected
     * their faction. Called by React (FactionSelector / GameSetupScreen) once
     * authentication and setup are complete.
     */
    startPhaserGame(factionId?: string | null, gameConfig?: GameConfig): void;

    /** Raw MainStage scene reference exposed by dev-tools (DEV only). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __bg?: any;

    /** Dev tools console utilities (DEV only). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    devTools?: any;
  }

  // Merge our custom event map into the DOM WindowEventMap so that
  // window.addEventListener / removeEventListener / dispatchEvent are typed.
  interface WindowEventMap extends WindowGameEventMap {}
}

export {};

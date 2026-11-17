import { useEffect } from 'react';

/**
 * Blocks Phaser pointer and keyboard input while the component that calls this
 * hook is mounted (or while `isActive` is true for always-mounted components).
 * Uses a depth counter in MainStage so stacked modals/panels don't prematurely
 * re-enable input when an inner overlay closes.
 *
 * @param {boolean} [isActive=true]  Pass a visibility boolean for always-mounted
 *   components (e.g. modals that render null internally instead of unmounting).
 *   Conditionally-mounted components can omit this — the default `true` means
 *   the block is active for the full mount lifetime.
 *
 * Usage examples:
 *   // Conditionally-mounted panel — block on mount, unblock on unmount:
 *   useBlockPhaserInput();
 *
 *   // Always-mounted modal that shows/hides via internal state:
 *   useBlockPhaserInput(!!current);   // or useBlockPhaserInput(isOpen);
 */
export function useBlockPhaserInput(isActive = true) {
  useEffect(() => {
    if (!isActive) return;
    window.dispatchEvent(new CustomEvent('game:uiLayerOpen'));
    return () => {
      window.dispatchEvent(new CustomEvent('game:uiLayerClose'));
    };
  }, [isActive]);
}

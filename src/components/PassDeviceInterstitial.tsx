/**
 * PassDeviceInterstitial — Full-screen overlay shown between hot-seat turns.
 *
 * Completely obscures all game state to prevent the outgoing player from
 * seeing the incoming player's position. Dismissed by the incoming player
 * clicking "I'm Ready".
 *
 * Spec: 049-multiplayer-modes-spec.md (FR-MP-002, FR-MP-003)
 */
import './PassDeviceInterstitial.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

/**
 * @param {{
 *   playerName: string,
 *   playerNumber: number,
 *   factionName: string,
 *   onReady: () => void
 * }} props
 */
export function PassDeviceInterstitial({ playerName, playerNumber, factionName, onReady }: any) {
  useBlockPhaserInput();
  const displayName = playerName ?? `Player ${playerNumber}`;

  // Trap focus and keyboard events inside the overlay so they don't reach Phaser
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onReady();
    }
  };

  return (
    <div
      className="pdi-overlay"
      onKeyDown={handleKeyDown}
      /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
      tabIndex={-1}
    >
      <div className="pdi-card" role="dialog" aria-modal="true" aria-label="Pass device interstitial">
        <div className="pdi-icon" aria-hidden="true">🪑</div>
        <h1 className="pdi-title">Pass the Device</h1>
        <div className="pdi-player-badge">
          <span className="pdi-player-label">Next up</span>
          <span className="pdi-player-name">{displayName}</span>
          <span className="pdi-faction-name">{factionName}</span>
        </div>
        <p className="pdi-hint">
          Hand the device to {displayName}.<br />
          Don't peek — it's their turn!
        </p>
        <button
          className="pdi-ready-btn"
          onClick={onReady}
          autoFocus
        >
          I'm Ready →
        </button>
      </div>
    </div>
  );
}

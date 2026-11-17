/**
 * TurnProgressBar — Compact turn-boundary progress indicator for sync mode.
 *
 * Replaces the END TURN button + turn chip area in TopBarHUD when sync mode
 * is active.  Shows current turn number, a progress bar filling toward the
 * next turn boundary, percentage, and a speed indicator (1×–4×).
 *
 * Listens for:
 *   galaxy:syncTickUpdate  → { tickInTurn, ticksPerTurn, ticksPerSecond }
 *
 * Spec: 062-unified-time-display-spec.md (FR-UTD-007)
 */
import { useState, useEffect } from 'react';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatTurnLabel } from '../utils/time-format.js';
import './TurnProgressBar.css';

/**
 * @param {{ onOpenTurnHistory: Function }} props
 */
export function TurnProgressBar({ onOpenTurnHistory }: any) {
  const { currentTurn, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [tickInTurn, setTickInTurn] = useState(0);

  useEffect(() => {
    const handler = (e: any) => {
      const d = e.detail ?? {};
      if (d.tickInTurn !== undefined) setTickInTurn(d.tickInTurn);
    };
    window.addEventListener('galaxy:syncTickUpdate', handler);
    return () => window.removeEventListener('galaxy:syncTickUpdate', handler);
  }, []);

  const progressPct = ticksPerTurn > 0
    ? Math.round((tickInTurn / ticksPerTurn) * 100)
    : 0;
  const ticksRemaining = ticksPerTurn - tickInTurn;
  const secondsRemaining = ticksPerSecond > 0
    ? Math.round(ticksRemaining / ticksPerSecond)
    : ticksRemaining;

  return (
    <button
      className="turn-progress-bar"
      onClick={onOpenTurnHistory}
      title={`Next month in ${ticksRemaining} tick${ticksRemaining !== 1 ? 's' : ''} (~${secondsRemaining}s)`}
    >
      <span className="turn-progress-bar__label">{formatTurnLabel(currentTurn)}</span>
      <div className="turn-progress-bar__track">
        <div
          className="turn-progress-bar__fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className="turn-progress-bar__pct">{progressPct}%</span>
      <span className="turn-progress-bar__speed">{ticksPerSecond}&times;</span>
    </button>
  );
}

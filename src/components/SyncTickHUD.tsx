/**
 * SyncTickHUD — Displays sync mode status: tick counter, speed indicator,
 * speed controls (host only), and turn progress bar.
 *
 * Listens for:
 *  - galaxy:syncTickUpdate  → tick counter, speed, turn progress
 *  - galaxy:syncModeChanged → show/hide, host status
 *  - galaxy:syncPauseChanged → paused state
 *  - syncTick:speedChange   → pending speed change
 *
 * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-008)
 */
import { useState, useEffect, useCallback } from 'react';
import { SPEED_LEVELS } from '../../core/timescale-config.js';
import './SyncTickHUD.css';

/**
 * @param {Object} props
 * @param {boolean} props.isHost - Whether the local player is the sync host
 */
export function SyncTickHUD({ isHost = false }) {
  const [tickNumber, setTickNumber] = useState(0);
  const [ticksPerSecond, setTicksPerSecond] = useState(1);
  const [ticksPerTurn, setTicksPerTurn] = useState(10);
  const [tickInTurn, setTickInTurn] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  // Listen for tick updates from MainStage
  useEffect(() => {
    const onTickUpdate = (e: any) => {
      const d = e.detail ?? {};
      if (d.tickNumber !== undefined) setTickNumber(d.tickNumber);
      if (d.ticksPerSecond !== undefined) setTicksPerSecond(d.ticksPerSecond);
      if (d.ticksPerTurn !== undefined) setTicksPerTurn(d.ticksPerTurn);
      if (d.tickInTurn !== undefined) setTickInTurn(d.tickInTurn);
    };

    const onModeChanged = (e: any) => {
      setVisible(e.detail?.active ?? false);
      if (!e.detail?.active) setPaused(false);
    };

    const onPauseChanged = (e: any) => {
      setPaused(e.detail?.paused ?? false);
    };

    window.addEventListener('galaxy:syncTickUpdate', onTickUpdate);
    window.addEventListener('galaxy:syncModeChanged', onModeChanged);
    window.addEventListener('galaxy:syncPauseChanged', onPauseChanged);

    return () => {
      window.removeEventListener('galaxy:syncTickUpdate', onTickUpdate);
      window.removeEventListener('galaxy:syncModeChanged', onModeChanged);
      window.removeEventListener('galaxy:syncPauseChanged', onPauseChanged);
    };
  }, []);

  const handleSpeedDown = useCallback(() => {
    const idx = SPEED_LEVELS.indexOf(ticksPerSecond);
    if (!isHost || idx <= 0) return;
    window.dispatchEvent(new CustomEvent('game:changeSyncSpeed', {
      detail: { ticksPerSecond: SPEED_LEVELS[idx - 1] }
    }));
  }, [isHost, ticksPerSecond]);

  const handleSpeedUp = useCallback(() => {
    const idx = SPEED_LEVELS.indexOf(ticksPerSecond);
    if (!isHost || idx >= SPEED_LEVELS.length - 1) return;
    window.dispatchEvent(new CustomEvent('game:changeSyncSpeed', {
      detail: { ticksPerSecond: SPEED_LEVELS[idx + 1] }
    }));
  }, [isHost, ticksPerSecond]);

  if (!visible) return null;

  const progressPct = ticksPerTurn > 0
    ? Math.round((tickInTurn / ticksPerTurn) * 100)
    : 0;
  const ticksRemaining = ticksPerTurn - tickInTurn;
  const secondsRemaining = ticksPerSecond > 0
    ? Math.round(ticksRemaining / ticksPerSecond)
    : ticksRemaining;

  return (
    <div className={`sync-tick-hud${paused ? ' sync-tick-hud--paused' : ''}`}>
      {/* Mode badge now rendered by ModeIndicatorBadge in TopBarHUD */}

      {/* Tick counter */}
      <div className="sync-tick-counter">
        Tick <span className="sync-tick-num">{tickNumber}</span>
      </div>

      {/* Speed indicator with controls */}
      <div className="sync-tick-speed">
        {isHost && (
          <button
            className="sync-tick-speed-btn"
            onClick={handleSpeedDown}
            disabled={SPEED_LEVELS.indexOf(ticksPerSecond) <= 0}
            title="Decrease speed"
          >
            {'\u25C0'}
          </button>
        )}
        <span className="sync-tick-speed-value">
          {ticksPerSecond === 0.5 ? '\u00BDx' : `${ticksPerSecond}x`}
          <span className="sync-tick-speed-pips">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className={`sync-tick-pip ${i <= SPEED_LEVELS.indexOf(ticksPerSecond) ? 'active' : ''}`}
              />
            ))}
          </span>
        </span>
        {isHost && (
          <button
            className="sync-tick-speed-btn"
            onClick={handleSpeedUp}
            disabled={SPEED_LEVELS.indexOf(ticksPerSecond) >= SPEED_LEVELS.length - 1}
            title="Increase speed"
          >
            {'\u25B6'}
          </button>
        )}
      </div>

      {/* Turn progress bar */}
      <div className="sync-tick-turn-progress" title={paused ? 'Paused' : `Next month in ${ticksRemaining} tick${ticksRemaining !== 1 ? 's' : ''} (~${secondsRemaining}s)`}>
        <div className="sync-tick-turn-bar">
          <div
            className={`sync-tick-turn-fill${paused ? ' sync-tick-turn-fill--paused' : ''}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="sync-tick-turn-label">
          {paused ? 'PAUSED' : `Month in ${ticksRemaining} (${secondsRemaining}s)`}
        </span>
      </div>
    </div>
  );
}

/**
 * ModeIndicatorBadge — Always-visible pill badge showing current game mode.
 *
 * ASYNC  mode: amber background, shows "Turn {N}".
 * SYNC   mode: green background, shows "Tick {N} @ {rate}x".
 * PAUSED mode: amber pulsing background, shows "Tick {N} — PAUSED".
 *
 * Listens for:
 *   galaxy:syncModeChanged   → active (bool), isHost
 *   galaxy:turnUpdate        → turn number
 *   galaxy:syncTickUpdate    → tickNumber, ticksPerSecond
 *   galaxy:gameStatusUpdate  → gameStatus, syncPaused
 *   galaxy:syncPauseChanged  → paused (bool)
 *
 * Spec: 060-async-flow-mode-switching-spec.md (FR-MSW-001)
 */
import { useState, useEffect } from 'react';
import { SESSION_ICONS } from '../icons.js';
import './ModeIndicatorBadge.css';
import { formatTurnLabel } from '../utils/time-format.js';

export function ModeIndicatorBadge() {
  const [syncActive, setSyncActive] = useState(false);
  const [paused, setPaused]         = useState(false);
  const [turn, setTurn]             = useState(1);
  const [tickNumber, setTickNumber] = useState(0);
  const [ticksPerSecond, setTicksPerSecond] = useState(1);

  useEffect(() => {
    const onModeChanged = (e: any) => {
      setSyncActive(e.detail?.active ?? false);
      if (!e.detail?.active) setPaused(false);
    };
    const onTurnUpdate = (e: any) => {
      setTurn(e.detail?.turn ?? 1);
    };
    const onTickUpdate = (e: any) => {
      const d = e.detail ?? {};
      if (d.tickNumber !== undefined) setTickNumber(d.tickNumber);
      if (d.ticksPerSecond !== undefined) setTicksPerSecond(d.ticksPerSecond);
    };
    const onStatusUpdate = (e: any) => {
      const status = e.detail?.gameStatus;
      if (status === 'sync') setSyncActive(true);
      else if (status === 'async') { setSyncActive(false); setPaused(false); }
      if (e.detail?.syncPaused !== undefined) setPaused(e.detail.syncPaused);
    };
    const onPauseChanged = (e: any) => {
      setPaused(e.detail?.paused ?? false);
    };

    window.addEventListener('galaxy:syncModeChanged', onModeChanged);
    window.addEventListener('galaxy:turnUpdate', onTurnUpdate);
    window.addEventListener('galaxy:syncTickUpdate', onTickUpdate);
    window.addEventListener('galaxy:gameStatusUpdate', onStatusUpdate);
    window.addEventListener('galaxy:syncPauseChanged', onPauseChanged);

    return () => {
      window.removeEventListener('galaxy:syncModeChanged', onModeChanged);
      window.removeEventListener('galaxy:turnUpdate', onTurnUpdate);
      window.removeEventListener('galaxy:syncTickUpdate', onTickUpdate);
      window.removeEventListener('galaxy:gameStatusUpdate', onStatusUpdate);
      window.removeEventListener('galaxy:syncPauseChanged', onPauseChanged);
    };
  }, []);

  if (syncActive) {
    const badgeClass = paused
      ? 'mode-indicator-badge mode-indicator-badge--paused'
      : 'mode-indicator-badge mode-indicator-badge--sync';
    const badgeTitle = paused ? 'Realtime mode paused' : 'Realtime mode active';
    const icon = paused ? SESSION_ICONS.pause : SESSION_ICONS.sync;

    return (
      <div className={badgeClass} title={badgeTitle}>
        <span className="mode-indicator-badge__icon">{icon}</span>
        <span className="mode-indicator-badge__label">{paused ? 'PAUSED' : 'SYNC'}</span>
        <span className="mode-indicator-badge__detail">
          {paused ? `Tick ${tickNumber}` : `Tick ${tickNumber} @ ${ticksPerSecond}x`}
        </span>
      </div>
    );
  }

  return (
    <div className="mode-indicator-badge mode-indicator-badge--async" title="Turn-based mode">
      <span className="mode-indicator-badge__label">ASYNC</span>
      <span className="mode-indicator-badge__detail">{formatTurnLabel(turn)}</span>
    </div>
  );
}

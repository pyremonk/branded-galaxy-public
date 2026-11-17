/**
 * SyncPauseButton — Dedicated top-bar button to pause/unpause the sync tick loop.
 *
 * Visible only during sync (realtime) mode.
 * Any player (solo or multiplayer) can pause.
 * In multiplayer, only the host can unpause.
 *
 * Dispatches:
 *   game:toggleSyncPause  →  MainStage toggles the tick loop
 *
 * Reads pause state from GameTimeContext (via useGameTime).
 */
import { useCallback } from 'react';
import { SESSION_ICONS } from '../icons.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { audioManager } from '../../core/audio-manager.js';
import './SyncPauseButton.css';

/**
 * @param {Object} props
 * @param {boolean} props.isHost  - Whether the local player is the sync host
 * @param {boolean} props.isSolo  - Whether this is a solo game
 */
export function SyncPauseButton({ isHost = false, isSolo = true }) {
  const { mode, paused } = useGameTime();

  const canUnpause = isSolo || isHost;
  const disabled = paused && !canUnpause;

  const handleClick = useCallback(() => {
    if (disabled) return;
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:toggleSyncPause'));
  }, [disabled]);

  // Only show during sync mode
  if (mode !== 'sync') return null;

  const label = paused ? 'Resume' : 'Pause';
  const icon  = paused ? SESSION_ICONS.play : SESSION_ICONS.pause;
  const title = paused
    ? (canUnpause ? 'Resume realtime' : 'Only the host can unpause')
    : 'Pause realtime';

  return (
    <button
      className={`sync-pause-btn${paused ? ' sync-pause-btn--paused' : ''}`}
      onClick={handleClick}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      <span className="sync-pause-btn__icon">{icon}</span>
      <span className="sync-pause-btn__label">{label}</span>
    </button>
  );
}

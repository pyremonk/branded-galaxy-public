/**
 * SessionPanel — Expandable dropdown panel for session management.
 *
 * Renders two distinct layouts:
 *   - **Multiplayer**: Player list, ready toggle, mode section, speed controls, async vote UI.
 *   - **Solo**: Direct mode toggle button, speed controls.
 *
 * Hidden entirely for hot-seat mode.
 *
 * Listens for:
 *   session:presenceUpdate      → player list
 *   session:readyUpdate         → ready states
 *   session:hostElected         → host status
 *   galaxy:syncModeChanged      → mode active / isHost
 *   galaxy:syncTickUpdate       → tick speed
 *   session:asyncVoteUpdate     → vote counts
 *   galaxy:gameStatusUpdate     → game status / isSolo / isHotSeat
 *
 * Dispatches:
 *   game:toggleReady            → toggles local player ready state
 *   game:toggleSyncMode         → solo mode switch
 *   game:changeSyncSpeed        → speed slider
 *   game:requestAsyncVote       → non-host vote for async return
 *   game:requestAsyncMode       → host immediate return to async
 *
 * Spec: 060-async-flow-mode-switching-spec.md (FR-MSW-002 – FR-MSW-005)
 */
import { useState, useEffect, useCallback } from 'react';
import { SESSION_ICONS, UI_ICONS, RESOURCE_ICONS } from '../icons.js';
import { audioManager } from '../../core/audio-manager.js';
import { SPEED_LEVELS } from '../../core/timescale-config.js';
import './SessionPanel.css';

// ── Faction display colors (subset — reused from MainStage static map) ──────
const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#d29bff',
  autoforge:      '#f85149',
  freeStars:      '#58a6ff',
  voidSynth:      '#3fb950',
};

export function SessionPanel({ visible, onClose }: any) {
  // Game state
  const [isSolo, setIsSolo]       = useState(true);
  const [isHotSeat, setIsHotSeat] = useState(false);
  const [syncActive, setSyncActive] = useState(false);
  const [isHost, setIsHost]       = useState(false);

  // Player list (multiplayer)
  const [players, setPlayers] = useState<any[]>([]);

  // Speed
  const [ticksPerSecond, setTicksPerSecond] = useState(1);
  const [ticksPerTurn, setTicksPerTurn]     = useState(10);

  // Async vote
  const [voteCurrent, setVoteCurrent] = useState(0);
  const [voteRequired, setVoteRequired] = useState(1);

  // Pause state
  const [paused, setPaused] = useState(false);

  // ── Event listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const onStatusUpdate = (e: any) => {
      const d = e.detail ?? {};
      if (d.isSolo !== undefined) setIsSolo(d.isSolo);
      if (d.isHotSeat !== undefined) setIsHotSeat(d.isHotSeat);
      if (d.isHost !== undefined) setIsHost(d.isHost);
      if (d.gameStatus === 'sync') setSyncActive(true);
      else if (d.gameStatus === 'async') setSyncActive(false);
    };
    const onModeChanged = (e: any) => {
      setSyncActive(e.detail?.active ?? false);
      if (e.detail?.isHost !== undefined) setIsHost(e.detail.isHost);
      if (!e.detail?.active) setPaused(false);
    };
    const onTickUpdate = (e: any) => {
      if (e.detail?.ticksPerSecond !== undefined) setTicksPerSecond(e.detail.ticksPerSecond);
      if (e.detail?.ticksPerTurn !== undefined) setTicksPerTurn(e.detail.ticksPerTurn);
    };
    // syncTick:speedChange fires immediately when changeSpeed() is called,
    // before the next bundle; update the display right away so the speed
    // buttons compute the correct next step on rapid clicks.
    const onSpeedChange = (e: any) => {
      if (e.detail?.ticksPerSecond !== undefined) setTicksPerSecond(e.detail.ticksPerSecond);
    };
    const onPresence = (e: any) => {
      if (Array.isArray(e.detail?.players)) setPlayers(e.detail.players);
    };
    const onVoteUpdate = (e: any) => {
      const d = e.detail ?? {};
      if (d.current !== undefined) setVoteCurrent(d.current);
      if (d.required !== undefined) setVoteRequired(d.required);
    };
    const onHostElected = (e: any) => {
      // We can't know from this event alone if *we* are the host.
      // That's determined by galaxy:syncModeChanged isHost flag.
    };
    const onPauseChanged = (e: any) => {
      setPaused(e.detail?.paused ?? false);
    };

    window.addEventListener('galaxy:gameStatusUpdate', onStatusUpdate);
    window.addEventListener('galaxy:syncModeChanged', onModeChanged);
    window.addEventListener('galaxy:syncTickUpdate', onTickUpdate);
    window.addEventListener('syncTick:speedChange', onSpeedChange);
    window.addEventListener('session:presenceUpdate', onPresence);
    window.addEventListener('session:asyncVoteUpdate', onVoteUpdate);
    window.addEventListener('session:hostElected', onHostElected);
    window.addEventListener('galaxy:syncPauseChanged', onPauseChanged);

    // Request initial status
    window.dispatchEvent(new CustomEvent('game:requestGameStatus'));

    return () => {
      window.removeEventListener('galaxy:gameStatusUpdate', onStatusUpdate);
      window.removeEventListener('galaxy:syncModeChanged', onModeChanged);
      window.removeEventListener('galaxy:syncTickUpdate', onTickUpdate);
      window.removeEventListener('syncTick:speedChange', onSpeedChange);
      window.removeEventListener('session:presenceUpdate', onPresence);
      window.removeEventListener('session:asyncVoteUpdate', onVoteUpdate);
      window.removeEventListener('session:hostElected', onHostElected);
      window.removeEventListener('galaxy:syncPauseChanged', onPauseChanged);
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleToggleSyncMode = useCallback(() => {
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:toggleSyncMode'));
  }, []);

  const handleTogglePause = useCallback(() => {
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:toggleSyncPause'));
  }, []);

  const handleToggleReady = useCallback(() => {
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:toggleReady'));
  }, []);

  const handleSpeedDown = useCallback(() => {
    const idx = SPEED_LEVELS.indexOf(ticksPerSecond);
    if (idx <= 0) return;
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:changeSyncSpeed', {
      detail: { ticksPerSecond: SPEED_LEVELS[idx - 1] },
    }));
  }, [ticksPerSecond]);

  const handleSpeedUp = useCallback(() => {
    const idx = SPEED_LEVELS.indexOf(ticksPerSecond);
    if (idx >= SPEED_LEVELS.length - 1) return;
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:changeSyncSpeed', {
      detail: { ticksPerSecond: SPEED_LEVELS[idx + 1] },
    }));
  }, [ticksPerSecond]);

  const handleRequestAsync = useCallback(() => {
    audioManager.playUIClick();
    if (isHost) {
      window.dispatchEvent(new CustomEvent('game:requestAsyncMode'));
    } else {
      window.dispatchEvent(new CustomEvent('game:requestAsyncVote'));
    }
  }, [isHost]);

  // ── Don't render ─────────────────────────────────────────────────────────
  if (!visible || isHotSeat) return null;

  // ── Solo layout ──────────────────────────────────────────────────────────
  if (isSolo) {
    return (
      <div className="session-panel session-panel--solo">
        <div className="session-panel__header">
          <span className="session-panel__title">Session</span>
          <button className="session-panel__close" onClick={onClose} title="Close">
            {UI_ICONS.cancel}
          </button>
        </div>

        {/* Mode section */}
        <div className="session-panel__mode-section">
          <div className="session-panel__mode-label">
            {syncActive ? (paused ? 'Realtime Mode (Paused)' : 'Realtime Mode') : 'Turn-Based Mode'}
          </div>
          <div className="session-panel__mode-desc">
            {syncActive
              ? (paused
                  ? 'The game is paused. You can still queue orders. Click below to resume.'
                  : 'The game runs in real time. Click below to return to turn-based play.')
              : 'Submit orders each turn. Click below to switch to realtime play.'
            }
          </div>
        </div>

        {/* Pause toggle (sync only) */}
        {syncActive && (
          <button
            className={`session-panel__pause-toggle ${paused ? 'session-panel__pause-toggle--resume' : ''}`}
            onClick={handleTogglePause}
          >
            {paused ? 'Resume Realtime' : 'Pause Realtime'}
          </button>
        )}

        {/* Mode toggle */}
        <button
          className={`session-panel__mode-toggle ${syncActive ? 'session-panel__mode-toggle--async' : 'session-panel__mode-toggle--sync'}`}
          onClick={handleToggleSyncMode}
        >
          {syncActive ? 'Switch to Turn-Based' : 'Switch to Realtime'}
        </button>

        {/* Speed controls (sync only) */}
        {syncActive && (
          <div className="session-panel__speed">
            <span className="session-panel__speed-label">Speed</span>
            <button className="session-panel__speed-btn" onClick={handleSpeedDown} disabled={SPEED_LEVELS.indexOf(ticksPerSecond) <= 0}>{' \u25C0'}</button>
            <span className="session-panel__speed-value">{ticksPerSecond === 0.5 ? '\u00BDx' : `${ticksPerSecond}x`}</span>
            <button className="session-panel__speed-btn" onClick={handleSpeedUp} disabled={SPEED_LEVELS.indexOf(ticksPerSecond) >= SPEED_LEVELS.length - 1}>{' \u25B6'}</button>
          </div>
        )}

        {/* Pacing info (spec 061 FR-TCL-009) */}
        {syncActive && (
          <div className="session-panel__pacing">
            ~{Math.round(ticksPerTurn / ticksPerSecond)}s per month
          </div>
        )}
      </div>
    );
  }

  // ── Multiplayer layout ───────────────────────────────────────────────────
  return (
    <div className="session-panel session-panel--multi">
      <div className="session-panel__header">
        <span className="session-panel__title">Session</span>
        <button className="session-panel__close" onClick={onClose} title="Close">
          {UI_ICONS.cancel}
        </button>
      </div>

      {/* Player list */}
      <div className="session-panel__player-list">
        {players.map((p) => (
          <div key={p.id} className="session-panel__player-row">
            <span
              className="session-panel__player-online"
              style={{ color: p.online ? '#3fb950' : '#484f58' }}
              title={p.online ? 'Online' : 'Offline'}
            >
              {SESSION_ICONS.online}
            </span>
            <span className="session-panel__player-name">{p.displayName ?? 'Player'}</span>
            {p.isHost && (
              <span className="session-panel__player-host" title="Host" style={{ color: '#f0883e' }}>
                {SESSION_ICONS.host}
              </span>
            )}
            <span
              className="session-panel__player-ready"
              style={{ color: p.isReady ? '#3fb950' : '#484f58' }}
              title={p.isReady ? 'Ready' : 'Not ready'}
            >
              {SESSION_ICONS.ready}
            </span>
            {p.factionColor && (
              <span
                className="session-panel__player-faction"
                style={{ color: FACTION_COLORS[p.factionId] ?? p.factionColor ?? '#8b949e' }}
              >
                {p.factionName ?? p.factionId}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Ready toggle */}
      <button
        className="session-panel__ready-btn"
        onClick={handleToggleReady}
      >
        {SESSION_ICONS.ready} Toggle Ready
      </button>

      {/* Mode section */}
      <div className="session-panel__mode-section">
        <div className="session-panel__mode-label">
          {syncActive ? (paused ? 'Realtime Mode (Paused)' : 'Realtime Mode') : 'Turn-Based Mode'}
        </div>
        <div className="session-panel__mode-desc">
          {syncActive
            ? (paused
                ? 'The game is paused. Players can still queue orders.'
                : 'Realtime mode active.')
            : 'All players must be ready to start Realtime Mode.'
          }
        </div>
      </div>

      {/* Pause toggle (sync only) — any player can pause, only host unpause */}
      {syncActive && (
        <button
          className={`session-panel__pause-toggle ${paused ? 'session-panel__pause-toggle--resume' : ''}`}
          onClick={handleTogglePause}
          disabled={paused && !isHost}
          title={paused && !isHost ? 'Only the host can unpause' : undefined}
        >
          {paused ? (isHost ? 'Resume Realtime' : 'Waiting for host to resume') : 'Pause Realtime'}
        </button>
      )}

      {/* Speed controls (host only, sync only) */}
      {syncActive && isHost && (
        <div className="session-panel__speed">
          <span className="session-panel__speed-label">Speed</span>
          <button className="session-panel__speed-btn" onClick={handleSpeedDown} disabled={SPEED_LEVELS.indexOf(ticksPerSecond) <= 0}>{'\u25C0'}</button>
          <span className="session-panel__speed-value">{ticksPerSecond === 0.5 ? '\u00BDx' : `${ticksPerSecond}x`}</span>
          <button className="session-panel__speed-btn" onClick={handleSpeedUp} disabled={SPEED_LEVELS.indexOf(ticksPerSecond) >= SPEED_LEVELS.length - 1}>{'\u25B6'}</button>
        </div>
      )}
      {syncActive && !isHost && (
        <div className="session-panel__speed session-panel__speed--readonly">
          <span className="session-panel__speed-label">Speed</span>
          <span className="session-panel__speed-value">{ticksPerSecond === 0.5 ? '\u00BDx' : `${ticksPerSecond}x`}</span>
        </div>
      )}

      {/* Pacing info (spec 061 FR-TCL-009) */}
      {syncActive && (
        <div className="session-panel__pacing">
          ~{Math.round(ticksPerTurn / ticksPerSecond)}s per month
        </div>
      )}

      {/* Return to async / vote */}
      {syncActive && (
        <div className="session-panel__async-section">
          <button
            className="session-panel__async-btn"
            onClick={handleRequestAsync}
          >
            {isHost ? 'Return to Turn-Based' : 'Request Turn-Based'}
          </button>
          {!isHost && voteCurrent > 0 && (
            <div className="session-panel__vote-count">
              {voteCurrent}/{voteRequired} voted
            </div>
          )}
        </div>
      )}
    </div>
  );
}

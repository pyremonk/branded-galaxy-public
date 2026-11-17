/**
 * TopBarHUD — Consolidated top bar replacing the old Phaser HUD.
 *
 * Displays: Turn # (clickable) | Resources | Victory Progress | [spacer] | 🔊 | ☰
 *
 * Data sources:
 *   galaxy:turnUpdate    → { turn }
 *   galaxy:resourceUpdate → { resources, production, caps }
 *   galaxy:endTurnState  → { status: 'idle'|'resolving'|'submitted' }
 *   galaxy:victoryUpdate → full victory state (subscribed locally)
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AudioSettingsPanel } from './AudioSettingsPanel';
import { EndTurnButton } from './EndTurnButton.jsx';
import { ModeIndicatorBadge } from './ModeIndicatorBadge.jsx';
import { TurnTimerDisplay } from './TurnTimerDisplay.jsx';
import { TurnProgressBar } from './TurnProgressBar.jsx';
import { SessionPanel } from './SessionPanel.jsx';
import { SyncPauseButton } from './SyncPauseButton.jsx';
import { victoryNotificationEngine } from '../../core/victory-notification-engine.js';
import { audioManager } from '../../core/audio-manager.js';
import { AlertBar } from './AlertBar.jsx';
import './TopBarHUD.css';

import { RESOURCE_ICONS, UI_ICONS, SESSION_ICONS } from '../icons.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatTurnLabel, formatRateSuffixCompact } from '../utils/time-format.js';

/* ── Flat monochrome SVG icons ───────────────────────────────────────── */
const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const MutedSpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>
);

const RESOURCE_ORDER  = ['credits', 'materials', 'recruits', 'influence'];
const RESOURCE_LABELS: Record<string, string> = { credits: 'CR', materials: 'MT', recruits: 'RC', influence: 'IN' };
const RESOURCE_COLORS: Record<string, string> = { credits: '#f0883e', materials: '#58a6ff', recruits: '#3fb950', influence: '#d29bff' };

function fmt(n: any) {
  return Math.floor(n ?? 0).toLocaleString();
}

/**
 * TopBarHUD
 *
 * Props:
 *   onOpenBreakdown      {Function}  — open resource breakdown modal
 *   onOpenVictoryScreen  {Function} — open full victory screen
 *   onReturnToMenu       {Function} — navigate back to main menu (with warning if needed)
 *   onOpenTurnHistory    {Function} — open the Turn History log panel
 */
export function TopBarHUD({ playerFactionId, onOpenBreakdown, onOpenVictoryScreen, onReturnToMenu, onOpenTurnHistory, onOpenAlertHistory }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [turn,          setTurn]          = useState(1);
  const [resources,     setResources]     = useState<any>({});
  const [production,    setProduction]    = useState<any>({});
  const [caps,          setCaps]          = useState<any>({});
  const [victoryData,   setVictoryData]   = useState<any>(null);
  const [showAudio,     setShowAudio]     = useState(false);
  const [isMuted,       setIsMuted]       = useState(() => audioManager.getSettings().muteAll);
  const [showMenu,          setShowMenu]          = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showSession,        setShowSession]        = useState(false);
  const [isSolo,  setIsSolo]  = useState(true);
  const [isHost,  setIsHost]  = useState(false);

  const menuRef    = useRef<HTMLDivElement | null>(null);
  const audioRef   = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: any) => setIsMuted(e.detail?.muted ?? false);
    window.addEventListener('audio:muteChanged', handler);
    return () => window.removeEventListener('audio:muteChanged', handler);
  }, []);

  // Track isSolo/isHost for SyncPauseButton
  useEffect(() => {
    const onStatus = (e: any) => {
      const d = e.detail ?? {};
      if (d.isSolo !== undefined) setIsSolo(d.isSolo);
      if (d.isHost !== undefined) setIsHost(d.isHost);
    };
    const onModeChanged = (e: any) => {
      if (e.detail?.isHost !== undefined) setIsHost(e.detail.isHost);
    };
    window.addEventListener('galaxy:gameStatusUpdate', onStatus);
    window.addEventListener('galaxy:syncModeChanged', onModeChanged);
    return () => {
      window.removeEventListener('galaxy:gameStatusUpdate', onStatus);
      window.removeEventListener('galaxy:syncModeChanged', onModeChanged);
    };
  }, []);

  useEffect(() => {
    const handler = (e: any) => setTurn(e.detail?.turn ?? 1);
    window.addEventListener('galaxy:turnUpdate', handler);
    return () => window.removeEventListener('galaxy:turnUpdate', handler);
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      setResources(e.detail?.resources   ?? {});
      setProduction(e.detail?.production ?? {});
      setCaps(e.detail?.caps             ?? {});
    };
    window.addEventListener('galaxy:resourceUpdate', handler);
    return () => window.removeEventListener('galaxy:resourceUpdate', handler);
  }, []);



  useEffect(() => {
    const handler = (e: any) => setVictoryData(e.detail ?? null);
    window.addEventListener('galaxy:victoryUpdate', handler);
    return () => window.removeEventListener('galaxy:victoryUpdate', handler);
  }, []);

  // Close menu dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: any) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Close audio dropdown on outside click
  useEffect(() => {
    if (!showAudio) return;
    const handler = (e: any) => {
      if (audioRef.current && !audioRef.current.contains(e.target)) setShowAudio(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAudio]);

  // Close session dropdown on outside click
  useEffect(() => {
    if (!showSession) return;
    const handler = (e: any) => {
      if (sessionRef.current && !sessionRef.current.contains(e.target)) setShowSession(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSession]);

  // ── Victory: find closest unlocked condition ──────────────────────────────
  let closestVictory = null;
  const vp = victoryData?.victoryProgress;
  if (vp) {
    for (const [id, cond] of (Object.entries(vp) as [string, any][])) {
      if (id.startsWith('_') || !cond?.unlocked) continue;
      const pct = victoryNotificationEngine.getProgressPercent(cond);
      if (!closestVictory || pct > closestVictory.pct) {
        closestVictory = { name: cond.name ?? id, pct };
      }
    }
  }

  const handleSave = () => {
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:openSaveMenu'));
  };

  const handleReturnToMenuRequest = () => {
    audioManager.playUIClick();
    setShowMenu(false);
    // Warn if still in action phase — staged actions will be lost
    setShowReturnConfirm(true);
  };

  const confirmReturnToMenu = () => {
    audioManager.playUIClick();
    setShowReturnConfirm(false);
    onReturnToMenu?.();
  };

  const isSyncMode = mode === 'sync';

  const bar = (
    <div className={`top-bar-hud${isSyncMode ? ' top-bar-hud--sync' : ''}`}>

      {/* ── Async: End Turn + Turn chip  |  Sync: Turn progress bar ──── */}
      {isSyncMode ? (
        <TurnProgressBar
          onOpenTurnHistory={() => { audioManager.playUIClick(); onOpenTurnHistory?.(); }}
        />
      ) : (
        <>
          <EndTurnButton />
          <div className="top-bar-divider" />
          <button
            className="top-bar-turn-btn"
            onClick={() => { audioManager.playUIClick(); onOpenTurnHistory?.(); }}
            title="View Turn History"
          >
            {formatTurnLabel(turn)}
          </button>
        </>
      )}

      {/* ── Mode badge + pause button + async timer (hidden in sync) ──────────── */}
      <ModeIndicatorBadge />
      <SyncPauseButton isHost={isHost} isSolo={isSolo} />
      {!isSyncMode && <TurnTimerDisplay />}

      <div className="top-bar-divider" />

      {/* ── Resource strip ───────────────────────────────────────────────── */}
      <button
        className="top-bar-resources"
        onClick={onOpenBreakdown}
        title="Click to view resource breakdown"
      >
        {RESOURCE_ORDER.map(r => {
          const cur  = resources[r]  ?? 0;
          const prod = production[r] ?? 0;
          const cap  = caps[r];
          const nearCap = cap > 0 && cur / cap > 0.9;

          return (
            <span
              key={r}
              className={`top-bar-res-chip${nearCap ? ' top-bar-res-chip--cap' : ''}`}
              title={`${RESOURCE_LABELS[r]}: ${fmt(cur)}${cap ? ' / ' + fmt(cap) : ''}`}
            >
              <span className="top-bar-res-icon" style={{ color: RESOURCE_COLORS[r] }}>{(RESOURCE_ICONS as Record<string, string>)[r]}</span>
              <span className="top-bar-res-value">{fmt(cur)}</span>
              {prod !== 0 && (
                <span className={`top-bar-res-delta ${prod > 0 ? 'top-bar-res-delta--pos' : 'top-bar-res-delta--neg'}`}>
                  {prod > 0 ? '+' : ''}{fmt(prod)}{formatRateSuffixCompact(mode, ticksPerSecond, ticksPerTurn)}
                </span>
              )}
            </span>
          );
        })}
      </button>

      <div className="top-bar-divider" />

      {/* ── Alert bar (takes up remaining space) ──────────────────────── */}
      <AlertBar onOpenAlertHistory={onOpenAlertHistory} />

      {/* ── Victory progress icon button ────────────────────────────── */}
      {closestVictory && (
        <button
          className="top-bar-icon-btn top-bar-victory-icon-btn"
          onClick={() => { audioManager.playUIClick(); onOpenVictoryScreen(); }}
          title={`Victory: ${closestVictory.name} — ${closestVictory.pct}%`}
          aria-label={`Victory progress: ${closestVictory.pct}%`}
        >
          <span className="top-bar-victory-icon-glyph">{UI_ICONS.victory}</span>
          <div className="top-bar-victory-micro-bar">
            <div
              className="top-bar-victory-micro-fill"
              style={{ width: `${closestVictory.pct}%` }}
            />
          </div>
        </button>
      )}


      {/* ── Session panel toggle ─────────────────────────────────────────── */}
      <div className="top-bar-session-wrap" ref={sessionRef}>
        <button
          className="top-bar-icon-btn"
          onClick={() => { audioManager.playUIClick(); setShowSession(s => !s); setShowMenu(false); setShowAudio(false); }}
          title="Session settings"
          aria-label="Session settings"
          aria-expanded={showSession}
        >
          {SESSION_ICONS.sync}
        </button>
        {showSession && (
          <SessionPanel visible onClose={() => setShowSession(false)} />
        )}
      </div>

      {/* ── Audio settings ───────────────────────────────────────────────── */}
      <div className="top-bar-audio-wrap" ref={audioRef}>
        <button
          className="top-bar-icon-btn"
          onClick={() => { audioManager.playUIClick(); setShowAudio(s => !s); setShowMenu(false); }}
          title="Audio Settings"
          aria-label="Audio Settings"
        >
          {isMuted ? <MutedSpeakerIcon /> : <SpeakerIcon />}
        </button>
        {showAudio && (
          <div className="top-bar-audio-dropdown">
            <AudioSettingsPanel onClose={() => setShowAudio(false)} />
          </div>
        )}
      </div>

      {/* ── Menu (hamburger) ─────────────────────────────────────────────── */}
      <div className="top-bar-menu-wrap" ref={menuRef}>
        <button
          className="top-bar-icon-btn"
          onClick={() => { audioManager.playUIClick(); setShowMenu(m => !m); setShowAudio(false); }}
          title="Game menu"
          aria-label="Game menu"
          aria-expanded={showMenu}
        >
          {UI_ICONS.menu}
        </button>
        {showMenu && (
          <div className="top-bar-menu-dropdown">
            <button className="top-bar-menu-item" onClick={() => { setShowMenu(false); handleSave(); }}>Save game</button>
            <div className="top-bar-menu-separator" />
            <button className="top-bar-menu-item top-bar-menu-item--danger" onClick={handleReturnToMenuRequest}>Return to main menu</button>
          </div>
        )}
      </div>

    </div>
  );

  return (
    <>
      {bar}
      {/* Portalled outside .top-bar-hud so backdrop-filter doesn't clip it */}
      {showReturnConfirm && createPortal(
        <div className="top-bar-confirm-backdrop" onClick={() => setShowReturnConfirm(false)}>
          <div className="top-bar-confirm-box" onClick={e => e.stopPropagation()}>
            <p className="top-bar-confirm-msg">
              Exiting without ending your turn will cause you to lose the actions you&rsquo;ve set.
              Return to the main menu anyway?
            </p>
            <div className="top-bar-confirm-btns">
              <button
                className="top-bar-confirm-btn top-bar-confirm-btn--cancel"
                onClick={() => setShowReturnConfirm(false)}
              >
                Stay in game
              </button>
              <button
                className="top-bar-confirm-btn top-bar-confirm-btn--confirm"
                onClick={confirmReturnToMenu}
              >
                Return to menu
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

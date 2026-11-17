/**
 * Alert Context — manages the Player Alerts store (spec 063).
 *
 * - Subscribes to `galaxy:playerAlert` and filters by the active player's factionId
 * - In async mode, buffers alerts that arrive during the resolution/maintenance
 *   phase and releases them when the action phase begins
 * - In sync mode, delivers alerts to the display queue immediately
 * - Exposes the full alert list, the display queue, and helpers for the AlertBar
 *   and AlertHistoryPanel components via useAlerts()
 * - Provides restoreAlerts() for save/load integration
 *
 * Spec: 063-player-alerts-spec.md
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';

// ─── Alert data model ─────────────────────────────────────────────────────────

const MAX_ALERTS = 100;

// ─── Context ──────────────────────────────────────────────────────────────────

const AlertContext = createContext<any>({
  /** @type {Array} All alerts newest-first, kept for history */
  alerts: [],
  /** @type {Array} FIFO queue of alerts waiting to appear in the alert bar */
  displayQueue: [],
  /** The player's faction id — used by AlertHistoryPanel for grouping */
  playerFactionId: null,
  /** Consume/remove the first item from the display queue */
  consumeFromQueue: () => {},
  /** Restore alerts array from a loaded save */
  restoreAlerts: (_arr: any) => {},
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAlerts() {
  return useContext(AlertContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let _alertIdCounter = 0;
function nextAlertId() {
  _alertIdCounter += 1;
  return `alert_${Date.now()}_${_alertIdCounter}`;
}

/**
 * @param {{ children: React.ReactNode, playerFactionId: string }} props
 */
export function AlertProvider({ children, playerFactionId }: any) {
  // All historical alerts — newest first
  const [alerts, setAlerts]             = useState<any[]>([]);
  // FIFO queue for bar display
  const [displayQueue, setDisplayQueue] = useState<any[]>([]);

  // Track game mode and resolution phase for delivery timing
  const modeRef          = useRef('async');
  const inResolutionRef  = useRef(false);
  const asyncBufferRef   = useRef<any[]>([]);   // holds alerts buffered during resolution

  // ── Track sync mode ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      modeRef.current = e.detail?.active ? 'sync' : 'async';
    };
    window.addEventListener('galaxy:syncModeChanged', handler);
    return () => window.removeEventListener('galaxy:syncModeChanged', handler);
  }, []);

  // ── Track resolution phase (async mode only) ─────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      const status = e.detail?.status;
      if (status === 'idle') {
        // Action phase started — flush buffered async alerts to display queue
        inResolutionRef.current = false;
        if (asyncBufferRef.current.length > 0) {
          const buffered = asyncBufferRef.current.slice();
          asyncBufferRef.current = [];
          setDisplayQueue(q => [...q, ...buffered]);
        }
      } else if (modeRef.current !== 'sync') {
        // resolving or submitted in async mode — start buffering.
        // Guard: in sync mode the modeRef branch handles delivery, so we must
        // NOT set inResolutionRef here; otherwise the async buffer stays open
        // for the entire sync session and flushes a storm of alerts on exit.
        inResolutionRef.current = true;
      }
    };
    window.addEventListener('galaxy:endTurnState', handler);
    return () => window.removeEventListener('galaxy:endTurnState', handler);
  }, []);

  // ── Subscribe to galaxy:playerAlert ──────────────────────────────────────
  const handlePlayerAlert = useCallback((e: any) => {
    const detail = e.detail;
    if (!detail) return;

    // Filter: only show alerts for the active player's faction
    if (detail.factionId && playerFactionId && detail.factionId !== playerFactionId) return;

    const alert = {
      id:             nextAlertId(),
      category:       detail.category       ?? 'event',
      factionId:      detail.factionId      ?? playerFactionId,
      actorFactionId: detail.actorFactionId ?? null,
      message:        detail.message        ?? '',
      outcome:        detail.outcome        ?? { summary: '', details: [], systemId: null, systemName: null },
      turn:           detail.turn           ?? 0,
      timestamp:      Date.now(),
    };

    // Append to historical store (newest first, cap at 100)
    setAlerts(prev => {
      const next = [alert, ...prev];
      return next.length > MAX_ALERTS ? next.slice(0, MAX_ALERTS) : next;
    });

    // Decide delivery timing
    if (modeRef.current === 'sync') {
      // Sync: immediate
      setDisplayQueue(q => [...q, alert]);
    } else if (inResolutionRef.current) {
      // Async + resolution phase: buffer
      asyncBufferRef.current.push(alert);
    } else {
      // Async + action phase: direct to queue
      setDisplayQueue(q => [...q, alert]);
    }
  }, [playerFactionId]);

  useEffect(() => {
    window.addEventListener('galaxy:playerAlert', handlePlayerAlert);
    return () => window.removeEventListener('galaxy:playerAlert', handlePlayerAlert);
  }, [handlePlayerAlert]);

  // ── Queue management ─────────────────────────────────────────────────────
  const consumeFromQueue = useCallback(() => {
    setDisplayQueue(q => q.slice(1));
  }, []);

  // ── Save/load ────────────────────────────────────────────────────────────
  const restoreAlerts = useCallback((arr: any) => {
    if (!Array.isArray(arr)) return;
    setAlerts(arr);
    // Restore most recent alert into queue so it shows in the bar on load
    if (arr.length > 0) {
      setDisplayQueue([arr[0]]);
    }
  }, []);

  const value = useMemo(() => ({
    alerts,
    displayQueue,
    playerFactionId,
    consumeFromQueue,
    restoreAlerts,
  }), [alerts, displayQueue, playerFactionId, consumeFromQueue, restoreAlerts]);

  // Listen for save/load restoration (spec 063)
  useEffect(() => {
    const handleRestore = (e: any) => {
      const arr = e.detail?.alerts;
      if (Array.isArray(arr) && arr.length > 0) restoreAlerts(arr);
    };
    window.addEventListener('game:restoreAlertState', handleRestore);
    return () => window.removeEventListener('game:restoreAlertState', handleRestore);
  }, [restoreAlerts]);

    // Persist latest alerts to window so MainStage can include them in save snapshots
  React.useEffect(() => { (window as any).__alertState = alerts; }, [alerts]);

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
}

/**
 * SyncTurnToast — Non-blocking toast notification for sync-mode turn summaries.
 *
 * Listens for `galaxy:syncTurnSummary` events (dispatched by MainStage after
 * headless resolution in sync mode).  Displays a compact toast that:
 *   - Shows "Turn {N} resolved — {summary counts}"
 *   - Auto-dismisses after 5 seconds if not clicked
 *   - Expands into the full TurnSummaryHUD when clicked
 *
 * Spec: 062-unified-time-display-spec.md (FR-UTD-010)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { TurnSummaryHUD } from './TurnSummaryHUD.jsx';
import { formatTurnLabel } from '../utils/time-format.js';
import './SyncTurnToast.css';

const TOAST_DURATION_MS = 5000;

/**
 * Build a compact summary string from the resolution events.
 * E.g. "2 combats, 1 mission complete, 3 constructions"
 */
function buildSummaryText(events: any) {
  const counts: Record<string, number> = {};
  for (const evt of events) {
    const domain = evt.domain ?? 'event';
    counts[domain] = (counts[domain] ?? 0) + 1;
  }

  const LABELS: Record<string, string> = {
    combat:       'combat',
    fleet:        'fleet move',
    mission:      'mission',
    construction: 'construction',
    research:     'research',
    event:        'event',
    invasion:     'invasion',
    diplomacy:    'diplomacy',
    loyalty:      'loyalty',
    maintenance:  'maintenance',
    resource:     'resource',
    victory:      'victory',
  };

  const parts: string[] = [];
  for (const [domain, count] of (Object.entries(counts) as [string, number][])) {
    const label = LABELS[domain] ?? domain;
    parts.push(`${count} ${label}${count !== 1 ? 's' : ''}`);
  }
  return parts.join(', ') || 'no events';
}

export function SyncTurnToast() {
  /** @type {[Array<{summary, turn, playerFactionId, initiativeOrder}>, Function]} */
  const [toasts, setToasts] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<any>(null); // expanded toast data or null
  const timerRefs = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Listen for sync turn summary events
  useEffect(() => {
    const handler = (e: any) => {
      const data = e.detail ?? {};
      const id = `${data.turn}-${Date.now()}`;
      const entry = { id, ...data };

      setToasts(prev => [...prev, entry]);

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timerRefs.current.delete(id);
      }, TOAST_DURATION_MS);
      timerRefs.current.set(id, timer);
    };

    window.addEventListener('galaxy:syncTurnSummary', handler);
    return () => {
      window.removeEventListener('galaxy:syncTurnSummary', handler);
      // Clear all pending timers on unmount
      for (const timer of timerRefs.current.values()) clearTimeout(timer);
      timerRefs.current.clear();
    };
  }, []);

  const handleClickToast = useCallback((toast: any) => {
    // Clear the auto-dismiss timer
    const timer = timerRefs.current.get(toast.id);
    if (timer) {
      clearTimeout(timer);
      timerRefs.current.delete(toast.id);
    }
    // Remove from toast stack and expand
    setToasts(prev => prev.filter(t => t.id !== toast.id));
    setExpanded(toast);
  }, []);

  const handleDismissToast = useCallback((id: any) => {
    const timer = timerRefs.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerRefs.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpanded(null);
  }, []);

  return (
    <>
      {/* Toast stack — compact notifications */}
      {toasts.length > 0 && (
        <div className="sync-turn-toast-stack">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="sync-turn-toast"
              onClick={() => handleClickToast(toast)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClickToast(toast); }}
            >
              <span className="sync-turn-toast__label">
                {formatTurnLabel(toast.turn - 1)} resolved
              </span>
              <span className="sync-turn-toast__detail">
                {buildSummaryText(toast.summary ?? [])}
              </span>
              <button
                className="sync-turn-toast__close"
                onClick={(e) => { e.stopPropagation(); handleDismissToast(toast.id); }}
                title="Dismiss"
              >
                {'\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Expanded turn summary modal overlay */}
      {expanded && (
        <div className="sync-turn-toast-overlay" onClick={handleCloseExpanded}>
          <div onClick={(e) => e.stopPropagation()}>
            <TurnSummaryHUD
              summary={expanded.summary ?? []}
              turn={expanded.turn}
              onContinue={handleCloseExpanded}
              playerFactionId={expanded.playerFactionId}
              initiativeOrder={expanded.initiativeOrder ?? []}
            />
          </div>
        </div>
      )}
    </>
  );
}

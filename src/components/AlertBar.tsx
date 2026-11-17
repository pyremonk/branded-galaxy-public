/**
 * AlertBar — compact alert display embedded in the TopBarHUD.
 *
 * Displays the most recent alert message as a single scrolling line.
 * Clicking opens the AlertHistoryPanel.
 *
 * Spec: 063-player-alerts-spec.md (FR-PA-004)
 */

import { useState, useEffect, useRef } from 'react';
import { useAlerts } from '../contexts/AlertContext.jsx';
import { ALERT_ICONS } from '../icons.js';
import './AlertBar.css';

const PACING_MS = 3000;  // 3 seconds between queued alerts

/**
 * @param {{ onOpenAlertHistory: Function }} props
 */
export function AlertBar({ onOpenAlertHistory }: any) {
  const { displayQueue, consumeFromQueue } = useAlerts();
  const queue = displayQueue as any[];
  const alertIcons = ALERT_ICONS as Record<string, string>;

  // The alert currently displayed in the bar
  const [shown, setShown]         = useState<any>(null);
  // Trigger scroll-in animation by changing this key
  const [animKey, setAnimKey]     = useState(0);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelOpenRef = useRef(false);

  // ── Start pacing timer ───────────────────────────────────────────────────
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (panelOpenRef.current) return;  // Paused while panel is open
      // If there's something in the queue, advance
      consumeFromQueue();
    }, PACING_MS);
  };

  // ── Queue changes: show newly arrived alert ──────────────────────────────
  useEffect(() => {
    if (queue.length === 0) return;

    const next = queue[0];
    if (!shown || next.id !== shown.id) {
      setShown(next);
      setAnimKey(k => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  // ── Start pacing timer once on mount ────────────────────────────────────
  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Panel open/close state forwarded from parent ─────────────────────────
  // We expose a way for the parent to notify us — but the simplest approach
  // is to accept an optional onOpenAlertHistory and track it ourselves.
  const handleClick = () => {
    panelOpenRef.current = true;
    onOpenAlertHistory?.();
  };

  // This is called by the parent when the panel closes (via context or event)
  useEffect(() => {
    const onClose = () => {
      panelOpenRef.current = false;
      // Immediately show the next queued alert
      if (queue.length > 1) {
        consumeFromQueue();
      }
    };
    window.addEventListener('alertPanel:closed', onClose);
    return () => window.removeEventListener('alertPanel:closed', onClose);
  }, [queue, consumeFromQueue]);

  const isEmpty = !shown;

  return (
    <button
      className="alert-bar"
      onClick={handleClick}
      title={shown ? shown.message : 'No alerts — click to view history'}
      aria-label="Alert bar — click to open alert history"
    >
      <div className="alert-bar-inner">
        {isEmpty ? (
          <span className="alert-bar-empty">No alerts</span>
        ) : (
          <span
            key={animKey}
            className="alert-bar-message alert-bar-message--slide"
          >
            <span
              className="alert-bar-icon"
              aria-hidden="true"
            >
              {alertIcons[shown.category] ?? alertIcons.event}
            </span>
            <span className="alert-bar-text">{shown.message}</span>
          </span>
        )}
      </div>
      {queue.length > 1 && (
        <span className="alert-bar-count" title={`${queue.length} pending alerts`}>
          +{queue.length - 1}
        </span>
      )}
    </button>
  );
}

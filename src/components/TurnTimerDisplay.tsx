/**
 * TurnTimerDisplay — Compact countdown for the optional async turn timer.
 *
 * Shows remaining time in MM:SS format with a clock icon.
 * Hidden when timer is disabled or not started.
 *
 * Listens for:
 *   session:turnTimerUpdate  → { remaining } (seconds)
 *   session:turnTimerExpired → hides display
 *
 * Spec: 060-async-flow-mode-switching-spec.md (FR-ATF-004)
 */
import { useState, useEffect } from 'react';
import { SESSION_ICONS } from '../icons.js';
import './TurnTimerDisplay.css';

/**
 * Format seconds into MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds: any) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TurnTimerDisplay() {
  const [remaining, setRemaining] = useState<any>(null);

  useEffect(() => {
    const onTimerUpdate = (e: any) => {
      setRemaining(e.detail?.remaining ?? null);
    };
    const onTimerExpired = () => {
      setRemaining(0);
    };

    window.addEventListener('session:turnTimerUpdate', onTimerUpdate);
    window.addEventListener('session:turnTimerExpired', onTimerExpired);

    return () => {
      window.removeEventListener('session:turnTimerUpdate', onTimerUpdate);
      window.removeEventListener('session:turnTimerExpired', onTimerExpired);
    };
  }, []);

  // Don't render if timer is not active
  if (remaining === null) return null;

  const isWarning  = remaining > 0 && remaining <= 60;
  const isCritical = remaining > 0 && remaining <= 10;
  const isExpired  = remaining <= 0;

  let className = 'turn-timer-display';
  if (isExpired)       className += ' turn-timer-display--expired';
  else if (isCritical) className += ' turn-timer-display--critical';
  else if (isWarning)  className += ' turn-timer-display--warning';

  return (
    <div className={className} title={isExpired ? 'Timer expired' : `${remaining}s remaining`}>
      <span className="turn-timer-display__icon">{SESSION_ICONS.clock}</span>
      <span className="turn-timer-display__time">
        {isExpired ? 'EXPIRED' : formatTime(remaining)}
      </span>
    </div>
  );
}

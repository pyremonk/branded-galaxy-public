/**
 * TurnTimerHUD — Multiplayer action-phase countdown timer.
 *
 * Rendered only when `timerActive` prop is true.
 * In single-player (default), this component returns null — zero cost.
 *
 * When active:
 *  - Listens for galaxy:phaseStart ACTION → starts countdown from `limitSeconds`
 *  - Listens for galaxy:phaseStart RESOLUTION → stops countdown
 *  - Fires game:timerExpired at 0 → MainStage calls submitActionPhase()
 *  - Displays MM:SS countdown
 *  - Amber styling (< 60s), Red alert styling (< 15s)
 *
 * Spec: 031-turn-timer-spec.md (FR-TT-005)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import './TurnTimerHUD.css';

const AMBER_THRESHOLD_S = 60;
const RED_THRESHOLD_S   = 15;

/**
 * Format seconds to MM:SS string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds: any) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/**
 * @param {{ timerActive: boolean, limitSeconds: number }} props
 *   timerActive  — false in single-player (renders nothing)
 *   limitSeconds — countdown duration when active (default 300 = 5 min)
 */
export function TurnTimerHUD({ timerActive = false, limitSeconds = 300 }) {
  const [secondsLeft, setSecondsLeft] = useState(limitSeconds);
  const [running,     setRunning]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback((duration: any) => {
    stopTimer();
    setSecondsLeft(duration);
    setRunning(true);

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          stopTimer();
          // Auto-submit the Action Phase when time runs out
          window.dispatchEvent(new CustomEvent('game:timerExpired'));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // Listen for phase transitions
  useEffect(() => {
    if (!timerActive) return;

    const handler = (e: any) => {
      const { phase } = e.detail ?? {};
      if (phase === 'ACTION') {
        startTimer(limitSeconds);
      } else if (phase === 'RESOLUTION' || phase === 'MAINTENANCE') {
        stopTimer();
      }
    };

    window.addEventListener('galaxy:phaseStart', handler);
    return () => {
      window.removeEventListener('galaxy:phaseStart', handler);
      stopTimer();
    };
  }, [timerActive, limitSeconds, startTimer, stopTimer]);

  // Single-player: render nothing
  if (!timerActive) return null;

  // Determine urgency class
  let urgency = '';
  if (secondsLeft <= RED_THRESHOLD_S)   urgency = 'turn-timer--red';
  else if (secondsLeft <= AMBER_THRESHOLD_S) urgency = 'turn-timer--amber';

  return (
    <div className={`turn-timer-hud ${urgency}`.trim()} title="Time remaining this turn">
      <div className="turn-timer-label">TURN TIME</div>
      <div className={`turn-timer-display${running ? '' : ' turn-timer-display--paused'}`}>
        {formatTime(secondsLeft)}
      </div>
      {secondsLeft <= RED_THRESHOLD_S && running && (
        <div className="turn-timer-warning">HURRY!</div>
      )}
    </div>
  );
}

/**
 * CriticalAlertDialog — Modal for a single critical-tier game alert.
 *
 * Rendered by ActionPhaseSequencer, one alert at a time. Does NOT
 * manage its own queue — the sequencer decides when to show it.
 *
 * Props:
 *   alert       { message, locationId, locationCategory }
 *   critIndex   number   1-based index of this alert in the queue
 *   critTotal   number   total critical alerts this turn
 *   onDismiss   Function called when player dismisses
 *
 * Spec: 036-notifications-alerts-spec.md (FR-NA-003)
 */
import { useCallback } from 'react';
import './CriticalAlertDialog.css';

export function CriticalAlertDialog({ alert, critIndex, critTotal, onDismiss }: any) {
  const handleGoto = useCallback(() => {
    if (alert.locationId) {
      window.dispatchEvent(new CustomEvent('galaxy:navigateTo', {
        detail: { systemId: alert.locationId }
      }));
    }
    onDismiss();
  }, [alert, onDismiss]);

  return (
    <div className="cad-scrim" role="dialog" aria-modal="true" aria-label="Critical Alert">
      <div className="cad-modal">

        <div className="cad-header">
          <span className="cad-badge">ALERT</span>
          {critTotal > 1 && (
            <span className="cad-progress">{critIndex} of {critTotal}</span>
          )}
        </div>

        <p className="cad-message">{alert.message}</p>

        <div className="cad-actions">
          {alert.locationId && (
            <button className="cad-btn cad-btn--primary" onClick={handleGoto}>
              View Details
            </button>
          )}
          <button className="cad-btn cad-btn--secondary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
}

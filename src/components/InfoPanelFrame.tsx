/**
 * InfoPanelFrame — Shared right-side slide-in panel housing for all
 * information panels (system, fleet, characters, intel).
 *
 * Provides: fixed-right positioning, consistent header with close button,
 * scrollable content area, panelOpen/Close event dispatch.
 *
 * Spec: 035-information-panels-spec.md (FR-IP-008)
 */
import { useEffect } from 'react';
import './InfoPanelFrame.css';

/**
 * @param {{
 *   panelId: string,      // e.g. 'system' | 'fleet' | 'characters' | 'intel'
 *   title: string,
 *   subtitle?: string,
 *   onClose: () => void,
 *   children: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function InfoPanelFrame({ panelId, title, subtitle, onClose, children, className = '' }: any) {
  // NOTE: galaxy:panelOpen / galaxy:panelClose are intentionally NOT dispatched here.
  // Dispatching in a useEffect cleanup is StrictMode-unsafe — React double-invokes
  // effects in development, causing the cleanup's panelClose to fire while the panel
  // is still open, hiding it immediately.  Those events are already dispatched by the
  // callers: onSystemClick (open) and deselectSystem / openPanel(null) (close).

  // ESC key closes the panel
  useEffect(() => {
    const handler = (e: any) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={`info-panel-frame ${className}`.trim()} role="dialog" aria-label={title}>
      <div className="info-panel-header">
        <div className="info-panel-titles">
          <span className="info-panel-title">{title}</span>
          {subtitle && <span className="info-panel-subtitle">{subtitle}</span>}
        </div>
        <button className="info-panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      </div>
      <div className="info-panel-body">
        {children}
      </div>
    </div>
  );
}

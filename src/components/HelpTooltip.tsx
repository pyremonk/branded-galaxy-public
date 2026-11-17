import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import helpDefinitions from '../../core/help-definitions.json';
import './HelpTooltip.css';

// Index definitions by id for O(1) lookup
const DEFS_MAP = Object.fromEntries(helpDefinitions.map(d => [d.id, d]));

// Single global portal target — created once on first render
let _tooltipRoot: HTMLDivElement | null = null;
function getTooltipRoot() {
  if (!_tooltipRoot) {
    _tooltipRoot = document.createElement('div');
    _tooltipRoot.id = 'htip-portal';
    document.body.appendChild(_tooltipRoot);
  }
  return _tooltipRoot;
}

/**
 * HelpTooltip — wraps any element and shows a tooltip on hover (400ms delay)
 * or long-press (500ms).
 *
 * Props:
 *   helpId    string  — id from help-definitions.json
 *   children  node    — wrapped element
 */
export function HelpTooltip({ helpId, children }: any) {
  const def = DEFS_MAP[helpId];
  const [visible,  setVisible]  = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, flip: false });

  const hoverTimer = useRef<any>(null);
  const pressTimer = useRef<any>(null);
  const wrapRef    = useRef<HTMLSpanElement | null>(null);

  const clearTimers = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);

  const show = useCallback(() => {
    if (!wrapRef.current || !def) return;
    const rect = wrapRef.current.getBoundingClientRect();
    // Position tooltip above the element; flip below if near top edge
    const flip = rect.top < 120;
    const top  = flip ? rect.bottom + 8 : rect.top - 8;
    // Clamp left so tooltip doesn't overflow viewport
    const left = Math.min(
      rect.left,
      window.innerWidth - 300
    );
    setPosition({ top, left, flip });
    setVisible(true);
  }, [def]);

  const hide = useCallback(() => {
    clearTimers();
    setVisible(false);
  }, [clearTimers]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  const onMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(show, 400);
  }, [show]);

  const onMouseLeave = useCallback(() => {
    clearTimers();
    setVisible(false);
  }, [clearTimers]);

  const onTouchStart = useCallback(() => {
    pressTimer.current = setTimeout(show, 500);
  }, [show]);

  const onTouchEnd = useCallback(() => {
    clearTimers();
    // Keep visible briefly so the user can read it
    setTimeout(() => setVisible(false), 2000);
  }, [clearTimers]);

  if (!def) return <>{children}</>;

  const tooltip = visible ? (
    <div
      className={`htip-tooltip${position.flip ? ' htip-tooltip--below' : ''}`}
      style={{
        position: 'fixed',
        top:  position.flip ? position.top  : undefined,
        bottom: !position.flip ? window.innerHeight - position.top : undefined,
        left: position.left,
      }}
      role="tooltip"
    >
      <div className="htip-name">{def.name}</div>
      <div className="htip-desc">{def.description}</div>
      {def.shortcut && (
        <div className="htip-meta">
          <span className="htip-shortcut-label">Shortcut:</span>
          <kbd className="htip-kbd">{def.shortcut}</kbd>
        </div>
      )}
      {def.resourceCost && (
        <div className="htip-meta">
          <span className="htip-cost-label">Cost:</span>
          <span className="htip-cost">{def.resourceCost}</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <span
        ref={wrapRef}
        className="htip-wrap"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </span>
      {tooltip && createPortal(tooltip, getTooltipRoot())}
    </>
  );
}

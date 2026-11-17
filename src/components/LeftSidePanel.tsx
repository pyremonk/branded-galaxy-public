import { useState, useEffect, useRef } from 'react';
import { InitiativeIndicator } from './InitiativeIndicator';
import { ActionLimitsHUD } from './ActionLimitsHUD';
import './LeftSidePanel.css';

/**
 * LeftSidePanel — combined container for initiative order and
 * action‑limits information.  Positioned below the top bar on the
 * left side of the screen.  The width of the panel is captured from
 * the initiative indicator when it first renders so that it matches
 * the original standalone initiative panel width.
 *
 * Props:
 *   playerFactionId {string}
 */
export function LeftSidePanel({ playerFactionId }: any) {
  const initRef = useRef(null);
  const [width, setWidth] = useState('auto');

  // callback ref lets us measure immediately when the DOM node is
  // attached (including after the initiative order arrives).
  const measure = (node: any) => {
    initRef.current = node;
    if (node) {
      setWidth(`${node.offsetWidth}px`);
    }
  };

  return (
    <div className="left-side-panel" style={{ width }}>
      <InitiativeIndicator
        playerFactionId={playerFactionId}
        inline
        ref={measure}
      />
      <ActionLimitsHUD playerFactionId={playerFactionId} inline />
    </div>
  );
}

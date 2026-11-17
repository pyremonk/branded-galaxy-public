/**
 * InvasionChoiceModal — Presents the player with an Invade / Blockade decision
 * after winning space combat over an enemy system.
 *
 * Listens for galaxy:invasionChoiceRequest dispatched by MainStage after the
 * pre-invasion resolution phase. Queues all incoming requests and resolves
 * them one at a time. Each choice dispatches galaxy:invasionChoiceResolved so
 * MainStage can record the choice before running the planetary invasion step.
 *
 * Spec: 048-ground-combat-spec.md (FR-GC-001)
 */
import { useState, useEffect, useCallback } from 'react';
import './InvasionChoiceModal.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

const FACTION_LABELS: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'The Autoforge',
};

export function InvasionChoiceModal() {
  const [queue,   setQueue]   = useState<any[]>([]); // Array of pending { systemId, systemName, ... }
  const [current, setCurrent] = useState<any>(null);
  useBlockPhaserInput(!!current);

  // Receive incoming invasion choice requests from MainStage
  useEffect(() => {
    const handler = (e: any) => {
      const item = e.detail ?? {};
      if (!item.systemId) return;
      setQueue(prev => [...prev, item]);
    };
    window.addEventListener('galaxy:invasionChoiceRequest', handler);
    return () => window.removeEventListener('galaxy:invasionChoiceRequest', handler);
  }, []);

  // Promote the first queued item into the active modal
  useEffect(() => {
    if (current) return;
    setQueue(prev => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setCurrent(next);
      return rest;
    });
  }, [queue, current]);

  const handleChoice = useCallback((choice: any) => {
    if (!current) return;
    window.dispatchEvent(new CustomEvent('galaxy:invasionChoiceResolved', {
      detail: {
        systemId: current.systemId,
        choice    // 'invade' | 'blockade'
      }
    }));
    setCurrent(null);
  }, [current]);

  if (!current) return null;

  const {
    systemName,
    defenderFactionId,
    groundTroops
  } = current;

  return (
    <div className="icm-scrim" role="dialog" aria-modal="true" aria-labelledby="icm-title">
      <div className="icm-modal">
        <div className="icm-header">
          <span className="icm-badge">INVASION DECISION</span>
          <h2 className="icm-title" id="icm-title">Invade {systemName}?</h2>
        </div>

        <p className="icm-description">
          Your forces have achieved space superiority over{' '}
          <strong>{systemName}</strong>
          {defenderFactionId ? ` (held by ${FACTION_LABELS[defenderFactionId] ?? defenderFactionId})` : ''}.
          The system is within reach — commit your ground forces or establish a blockade.
        </p>

        {groundTroops > 0 && (
          <div className="icm-troop-count">
            Ground assault capacity: <strong>{groundTroops}</strong> unit{groundTroops !== 1 ? 's' : ''}
          </div>
        )}

        <div className="icm-choices">
          <button className="icm-choice-btn icm-choice-btn--invade" onClick={() => handleChoice('invade')}>
            <span className="icm-choice-label">Invade</span>
            <span className="icm-choice-detail">Launch ground assault — attempt to capture the system this turn.</span>
          </button>

          <button className="icm-choice-btn icm-choice-btn--blockade" onClick={() => handleChoice('blockade')}>
            <span className="icm-choice-label">Establish Blockade</span>
            <span className="icm-choice-detail">Seal the system — deny reinforcements without committing to a ground battle.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

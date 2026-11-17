/**
 * EndTurnButton — Standalone End Turn button extracted from TopBarHUD.
 *
 * Owns end-turn state (idle/resolving/submitted/waiting), integrates with
 * TurnManager for async network submission status.
 *
 * Listens for:
 *   galaxy:endTurnState           → status changes
 *   session:orderSubmissionUpdate → submitted/total counts
 *
 * Dispatches:
 *   game:submitTurn               → triggers MainStage.submitActionPhase()
 *
 * Spec: 060-async-flow-mode-switching-spec.md (FR-MSW-007)
 */
import { useState, useEffect, useCallback } from 'react';
import { audioManager } from '../../core/audio-manager.js';
import './EndTurnButton.css';

type EndTurnStatus = 'idle' | 'resolving' | 'submitted' | 'sync';

interface OrderSubmissionUpdateDetail {
  submitted?: number;
  total?: number;
}

const STATUS_LABELS: Record<string, string> = {
  idle:      'END TURN',
  resolving: 'RESOLVING...',
  submitted: 'SUBMITTED',
  sync:      'REALTIME',
};

export function EndTurnButton() {
  const [status, setStatus]       = useState<EndTurnStatus>('idle');
  const [submitted, setSubmitted] = useState(0);
  const [total, setTotal]         = useState(0);

  useEffect(() => {
    const onEndTurnState = (e: Event) => {
      const next = (e as CustomEvent<{ status?: EndTurnStatus }>).detail?.status;
      setStatus(next ?? 'idle');
    };
    const onOrderUpdate = (e: Event) => {
      const d = (e as CustomEvent<OrderSubmissionUpdateDetail>).detail ?? {};
      if (d.submitted !== undefined) setSubmitted(d.submitted);
      if (d.total !== undefined) setTotal(d.total);
    };

    window.addEventListener('galaxy:endTurnState', onEndTurnState);
    window.addEventListener('session:orderSubmissionUpdate', onOrderUpdate);

    return () => {
      window.removeEventListener('galaxy:endTurnState', onEndTurnState);
      window.removeEventListener('session:orderSubmissionUpdate', onOrderUpdate);
    };
  }, []);

  const locked = status !== 'idle';

  const handleClick = useCallback(() => {
    if (locked) return;
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('game:submitTurn'));
  }, [locked]);

  // Build label
  let label = STATUS_LABELS[status] ?? 'END TURN';
  // Show submission count when in "submitted" state and total > 1
  if (status === 'submitted' && total > 1) {
    label = `WAITING ${submitted}/${total}`;
  }

  const title = locked
    ? label
    : 'End your turn';

  return (
    <button
      className={`end-turn-btn${locked ? ' end-turn-btn--locked' : ''}`}
      onClick={handleClick}
      disabled={locked}
      title={title}
    >
      [{label}]
    </button>
  );
}

/**
 * CombatResultModal — Space combat result informational overlay.
 *
 * Rendered by ActionPhaseSequencer as part of the sequential turn-start flow.
 * Does NOT manage its own queue or event listeners — receives a single result
 * as a prop and calls onDismiss when the player is ready to continue.
 *
 * Props:
 *   combatResult  Object  — combat result detail (systemId, outcome, factions, losses, etc.)
 *   onDismiss     Function — called when player dismisses
 *
 * Spec: 036-notifications-alerts-spec.md (FR-NA-004)
 */
import { useCallback } from 'react';
import './CombatResultModal.css';

const FACTION_LABELS: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'The Autoforge',
};

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
};

export function CombatResultModal({ combatResult, onDismiss }: any) {
  const dismiss = useCallback(() => onDismiss?.(), [onDismiss]);

  if (!combatResult) return null;

  const {
    systemName,
    outcome,
    attackerFactionId,
    defenderFactionId,
    attackerLosses,
    defenderLosses,
    rounds,
    playerFactionId
  } = combatResult;

  const isAttackerVictory = outcome === 'attackerVictory';
  const isDefenderVictory = outcome === 'defenderVictory';
  const isDraw            = !isAttackerVictory && !isDefenderVictory;

  const playerIsAttacker  = playerFactionId === attackerFactionId;
  const playerIsDefender  = playerFactionId === defenderFactionId;

  let outcomeLabel;
  let outcomeClass;
  if ((playerIsAttacker && isAttackerVictory) || (playerIsDefender && isDefenderVictory)) {
    outcomeLabel = 'VICTORY';
    outcomeClass = 'crm-outcome--victory';
  } else if (isDraw) {
    outcomeLabel = 'DRAW';
    outcomeClass = 'crm-outcome--draw';
  } else {
    outcomeLabel = 'DEFEAT';
    outcomeClass = 'crm-outcome--defeat';
  }

  const attackerColor = FACTION_COLORS[attackerFactionId] ?? '#8b949e';
  const defenderColor = FACTION_COLORS[defenderFactionId] ?? '#8b949e';

  return (
    <div className="crm-scrim" role="dialog" aria-modal="true" aria-label="Combat Result">
      <div className="crm-modal">
        <div className="crm-header">
          <span className="crm-badge">COMBAT</span>
          <h2 className="crm-title">{systemName}</h2>
        </div>

        <div className={`crm-outcome ${outcomeClass}`}>{outcomeLabel}</div>

        <div className="crm-combatants">
          <div className="crm-side">
            <span className="crm-faction-name" style={{ color: attackerColor }}>
              {FACTION_LABELS[attackerFactionId] ?? attackerFactionId}
            </span>
            <span className="crm-role">Attacker</span>
            <span className="crm-losses">−{attackerLosses} ships</span>
          </div>
          <div className="crm-vs">VS</div>
          <div className="crm-side">
            <span className="crm-faction-name" style={{ color: defenderColor }}>
              {FACTION_LABELS[defenderFactionId] ?? defenderFactionId}
            </span>
            <span className="crm-role">Defender</span>
            <span className="crm-losses">−{defenderLosses} ships</span>
          </div>
        </div>

        <div className="crm-footer">
          <span className="crm-rounds">{rounds} round{rounds !== 1 ? 's' : ''}</span>
          <button className="crm-dismiss-btn" onClick={dismiss}>Continue</button>
        </div>
      </div>
    </div>
  );
}


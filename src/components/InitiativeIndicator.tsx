/**
 * InitiativeIndicator — Small HUD badge showing faction initiative order.
 *
 * Populated once when galaxy:initiativeSet fires from MainStage.create().
 * Static for the full game (Phase 1B — no per-turn re-rolls).
 *
 * Spec: 029-turn-order-spec.md (FR-TO-002)
 */
import { useState, useEffect, forwardRef } from 'react';
import './InitiativeIndicator.css';

// Faction display info keyed by faction ID
const FACTION_DISPLAY: Record<string, { name: string; fullName: string; color: string }> = {
  brandAuthority: { name: 'BA',  fullName: 'Brand Authority', color: '#58a6ff' },
  union:          { name: 'UN',  fullName: 'The Union',       color: '#3fb950' },
  autoforge:      { name: 'AF',  fullName: 'Autoforge',       color: '#f0883e' }
};

export const InitiativeIndicator = forwardRef<HTMLDivElement, any>(function InitiativeIndicator({ playerFactionId, inline = false }, ref) {
  const [order,  setOrder]  = useState<any[]>([]);   // string[] of faction IDs, highest first
  const [scores, setScores] = useState<any>({});   // factionId → score

  useEffect(() => {
    const handler = (e: any) => {
      const { order: newOrder, scores: newScores } = e.detail ?? {};
      if (newOrder) {
        setOrder(newOrder);
        setScores(newScores ?? {});
      }
    };

    window.addEventListener('galaxy:initiativeSet', handler);
    return () => window.removeEventListener('galaxy:initiativeSet', handler);
  }, []);

  if (order.length === 0) return null;

  return (
    <div
      ref={ref}
      className={`initiative-indicator${inline ? ' initiative-indicator--inline' : ''}`}
      title="Initiative Order — determines resolution sequence"
    >
      <div className="initiative-indicator__label">INITIATIVE</div>
      <div className="initiative-indicator__list">
        {order.map((factionId: any, index: any) => {
          const display = FACTION_DISPLAY[factionId] ?? { name: factionId.slice(0, 2).toUpperCase(), color: '#8b949e', fullName: factionId };
          const isPlayer = factionId === playerFactionId;
          return (
            <div
              key={factionId}
              className={`initiative-indicator__entry${isPlayer ? ' initiative-indicator__entry--player' : ''}`}
              title={`${display.fullName} — Score: ${scores[factionId] ?? '?'}`}
            >
              <span className="initiative-indicator__rank">{index + 1}.</span>
              <span
                className="initiative-indicator__badge"
                style={{ background: display.color, color: '#0d1117' }}
              >
                {display.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

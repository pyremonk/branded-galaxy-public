import { useState, useEffect } from 'react';
import { UI_ICONS } from '../icons.js';
import './ResearchQueue.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration, formatTurnLabel } from '../utils/time-format.js';

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#f0883e',
  autoforge:      '#3fb950'
};

/**
 * ResearchQueue — shows the tech research queue and allows reordering / removal.
 *
 * Props:
 *   factionId  {string}
 */
export default function ResearchQueue({ factionId }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [queuedIds,    setQueuedIds]    = useState<any[]>([]);
  const [activeProjects, setActive]     = useState<any[]>([]);
  const [currentTurn,  setCurrentTurn]  = useState(1);
  const [techDefs,     setTechDefs]     = useState<Record<string, any>>({});
  const factionColor = FACTION_COLORS[factionId] ?? '#58a6ff';

  // Subscribe to tech state updates
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.factionId !== factionId) return;
      setQueuedIds(e.detail.researchQueue         ?? []);
      setActive(e.detail.activeResearchProjects   ?? []);
      setCurrentTurn(e.detail.currentTurn         ?? 1);
    };
    window.addEventListener('game:techUpdate', handler);
    window.dispatchEvent(new CustomEvent('game:requestTechUpdate'));
    return () => window.removeEventListener('game:techUpdate', handler);
  }, [factionId]);

  // Load tech definitions to display names/icons
  useEffect(() => {
    if (!factionId) return;
    const FILE_MAP: Record<string, () => Promise<any>> = {
      brandAuthority: () => import('../../core/tech-trees/brand-authority-tree.json'),
      union:          () => import('../../core/tech-trees/union-tree.json'),
      autoforge:      () => import('../../core/tech-trees/autoforge-tree.json')
    };
    const loader = FILE_MAP[factionId];
    if (!loader) return;
    loader().then((mod: any) => {
      const map: Record<string, any> = {};
      (mod.default?.technologies ?? []).forEach((t: any) => { map[t.id] = t; });
      setTechDefs(map);
    });
  }, [factionId]);

  function handleRemove(techId: any) {
    window.dispatchEvent(new CustomEvent('game:removeResearchQueue', {
      detail: { factionId, techId }
    }));
  }

  function handleMoveUp(idx: any) {
    if (idx === 0) return;
    const reordered = [...queuedIds];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    window.dispatchEvent(new CustomEvent('game:reorderResearchQueue', {
      detail: { factionId, orderedTechIds: reordered }
    }));
  }

  function handleMoveDown(idx: any) {
    if (idx === queuedIds.length - 1) return;
    const reordered = [...queuedIds];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    window.dispatchEvent(new CustomEvent('game:reorderResearchQueue', {
      detail: { factionId, orderedTechIds: reordered }
    }));
  }

  // Calculate ETA for each queued item
  function calcETAs() {
    // Find the latest completesOnTurn in active projects
    const latestActive = Math.max(
      currentTurn,
      ...activeProjects.map(p => p.completesOnTurn ?? (currentTurn + (p.turnsRemaining ?? 0)))
    );
    const etas = [];
    let cursor = latestActive;
    for (const techId of queuedIds) {
      const tech = techDefs[techId];
      const turns = tech?.cost?.turns ?? 5;
      etas.push(cursor + 1);
      cursor = cursor + turns;
    }
    return etas;
  }

  const etas = calcETAs();

  return (
    <div className="research-queue" style={({ '--faction-color': factionColor } as any)}>
      <div className="research-queue__header">
        <span className="research-queue__title">📋 Research Queue</span>
        <span className="research-queue__count">{queuedIds.length} / 3</span>
      </div>

      {queuedIds.length === 0 ? (
        <div className="research-queue__empty">
          Queue techs to auto-start after current research
        </div>
      ) : (
        <ol className="research-queue__list">
          {queuedIds.map((techId, idx) => {
            const tech = techDefs[techId];
            const startTurn = etas[idx];
            const turnsUntilStart = Math.max(0, startTurn - currentTurn);
            return (
              <li key={techId} className="research-queue__item">
                <span className="research-queue__order">{idx + 1}</span>
                <span className="research-queue__icon">{tech?.icon ?? UI_ICONS.queueEmpty}</span>
                <div className="research-queue__info">
                  <span className="research-queue__name">{tech?.name ?? techId}</span>
                  <span className="research-queue__eta">
                    Starts ~{formatTurnLabel(startTurn)}
                    {turnsUntilStart > 0 && ` (in ${formatDuration(turnsUntilStart, mode, ticksPerSecond, ticksPerTurn)})`}
                  </span>
                </div>
                <div className="research-queue__actions">
                  <button
                    className="research-queue__btn-arrow"
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    title="Move up"
                  >▲</button>
                  <button
                    className="research-queue__btn-arrow"
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === queuedIds.length - 1}
                    aria-label="Move down"
                    title="Move down"
                  >▼</button>
                  <button
                    className="research-queue__btn-remove"
                    onClick={() => handleRemove(techId)}
                    aria-label={`Remove ${tech?.name ?? techId} from queue`}
                    title="Remove"
                  >✕</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { UI_ICONS } from '../icons.js';
import './ResearchProgressHUD.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDurationCompact, formatTurnLabel } from '../utils/time-format.js';

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#f0883e',
  autoforge:      '#3fb950'
};

/**
 * ResearchProgressHUD — compact in-game display of current research status.
 * Supports multi-research (Autoforge).
 *
 * Props:
 *   factionId {string}
 */
export default function ResearchProgressHUD({ factionId }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [currentTurn,    setCurrentTurn]    = useState(1);
  const [techDefs,       setTechDefs]       = useState<Record<string, any>>({});
  const factionColor = FACTION_COLORS[factionId] ?? '#58a6ff';

  // Subscribe to tech state updates
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.factionId !== factionId) return;
      setActiveProjects(e.detail.activeResearchProjects ?? []);
      setCurrentTurn(e.detail.currentTurn ?? 1);
    };
    window.addEventListener('game:techUpdate', handler);
    window.dispatchEvent(new CustomEvent('game:requestTechUpdate'));
    return () => window.removeEventListener('game:techUpdate', handler);
  }, [factionId]);

  // Load tech definitions for names/icons
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

  if (activeProjects.length === 0) {
    return (
      <div className="research-hud research-hud--idle" style={({ '--faction-color': factionColor } as any)}>
        <span className="research-hud__idle-text">No Active Research</span>
      </div>
    );
  }

  return (
    <div className="research-hud" style={({ '--faction-color': factionColor } as any)}>
      {activeProjects.map((project: any) => {
        const tech = techDefs[project.techId];
        const total    = project.totalTurns    ?? project.turnsRemaining;
        const elapsed  = total - project.turnsRemaining;
        const pct      = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
        const eta      = project.completesOnTurn ?? (currentTurn + project.turnsRemaining);

        return (
          <div key={project.techId} className="research-hud__item">
            <span className="research-hud__icon">{tech?.icon ?? UI_ICONS.queueEmpty}</span>
            <div className="research-hud__body">
              <div className="research-hud__top-row">
                <span className="research-hud__name">{tech?.name ?? project.techId}</span>
                <span className="research-hud__turns">{formatDurationCompact(project.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)} left</span>
              </div>
              <div className="research-hud__progress-bar" aria-label={`${pct}% complete`}>
                <div className="research-hud__progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="research-hud__eta">
                {formatTurnLabel(elapsed)} / {total} · Completes {formatTurnLabel(eta)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

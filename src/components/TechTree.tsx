import { useState, useEffect, useCallback, useRef } from 'react';
import './TechTree.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDurationCompact, formatTurnLabel } from '../utils/time-format.js';

/** Faction color map */
const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#f0883e',
  autoforge:      '#3fb950'
};

const TIER_LABELS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];

// ─── SVG Connection Lines ──────────────────────────────────────────────────────

function TechConnections({ techs, nodeRefs, completedIds, researchingIds }: any) {
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    // Recalculate after DOM layout
    const timer = setTimeout(() => {
      const newLines: any[] = [];
      techs.forEach((tech: any) => {
        tech.prerequisites.forEach((prereqId: any) => {
          const fromRef = nodeRefs.current[prereqId];
          const toRef   = nodeRefs.current[tech.id];
          if (!fromRef || !toRef) return;

          const fromRect = fromRef.getBoundingClientRect();
          const toRect   = toRef.getBoundingClientRect();
          const containerRect = fromRef.closest('.tech-tree-svg-layer')?.getBoundingClientRect();
          if (!containerRect) return;

          const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
          const y1 = fromRect.bottom                    - containerRect.top;
          const x2 = toRect.left   + toRect.width  / 2 - containerRect.left;
          const y2 = toRect.top                         - containerRect.top;

          const fromDone  = completedIds.has(prereqId);
          const toDone    = completedIds.has(tech.id);
          const toActive  = researchingIds.has(tech.id);
          const lineClass = fromDone && toDone  ? 'line-completed'
                          : fromDone && toActive ? 'line-active'
                          : fromDone             ? 'line-available'
                          :                        'line-locked';

          newLines.push({ x1, y1, x2, y2, lineClass, key: `${prereqId}-${tech.id}` });
        });
      });
      setLines(newLines);
    }, 80);
    return () => clearTimeout(timer);
  });

  return (
    <svg className="tech-tree-svg-layer" aria-hidden="true">
      <defs>
        <marker id="arrow-completed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#3fb950"/>
        </marker>
        <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#58a6ff"/>
        </marker>
        <marker id="arrow-available" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#58a6ff"/>
        </marker>
        <marker id="arrow-locked" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#444"/>
        </marker>
      </defs>
      {lines.map(l => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          className={`tech-line ${l.lineClass}`}
          markerEnd={`url(#arrow-${l.lineClass.replace('line-', '')})`}
        />
      ))}
    </svg>
  );
}

// ─── Tech Node ─────────────────────────────────────────────────────────────────

function TechNode({ tech, state, progress, factionColor, onSelect, nodeRef }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const stateClass = `tech-node tech-node--${state}`;

  const progressPct = progress
    ? Math.round(((progress.totalTurns - progress.turnsRemaining) / progress.totalTurns) * 100)
    : 0;

  return (
    <button
      ref={nodeRef}
      className={stateClass}
      style={({ '--faction-color': factionColor } as any)}
      onClick={() => onSelect(tech)}
      aria-label={`${tech.name} – ${state}`}
      disabled={state === 'locked'}
      title={state === 'locked' ? `Requires: ${tech.prerequisites.join(', ')}` : tech.name}
    >
      <span className="tech-node__icon" aria-hidden="true">{tech.icon}</span>
      <span className="tech-node__name">{tech.name}</span>
      {state === 'completed' && (
        <span className="tech-node__checkmark" aria-hidden="true">✓</span>
      )}
      {state === 'researching' && (
        <div className="tech-node__progress" aria-label={`${progressPct}% complete`}>
          <div className="tech-node__progress-fill" style={{ width: `${progressPct}%` }} />
          <span className="tech-node__progress-label">{formatDurationCompact(progress.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)}</span>
        </div>
      )}
    </button>
  );
}

// ─── Main TechTree Component ────────────────────────────────────────────────────

/**
 * TechTree - Visual faction-specific technology tree with tier rows and connection lines.
 *
 * Props:
 *   factionId          {string}   Player faction ID
 *   onClose            {Function} Called when the UI should close (not used in inline mode)
 *   onSelectTech       {Function} Called with tech definition when a node is clicked
 *   inline             {boolean}  When true, renders as a block inside a parent container
 */
export default function TechTree({ factionId, onClose, onSelectTech, inline = false }: any) {
  const [initialized, setInitialized] = useState(false);
  const [techDefs,    setTechDefs]    = useState<any[]>([]);  // full tech definition list
  const [techState,   setTechState]   = useState<any>({
    completedTechnologies: [],
    activeResearchProjects: [],
    researchQueue: [],
    multiResearchSlots: 1,
    currentTurn: 1
  });

  const nodeRefs  = useRef<any>({});
  const factionColor = FACTION_COLORS[factionId] ?? '#58a6ff';

  // ── Load tech definitions from JSON (via dynamic import) ──
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
      setTechDefs(mod.default?.technologies ?? []);
      setInitialized(true);
    }).catch((err: any) => console.error('[TechTree] Failed to load tech definitions:', err));
  }, [factionId]);

  // ── Subscribe to game:techUpdate events ──
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.factionId === factionId) {
        setTechState({
          completedTechnologies:  e.detail.completedTechnologies  ?? [],
          activeResearchProjects: e.detail.activeResearchProjects ?? [],
          researchQueue:          e.detail.researchQueue          ?? [],
          multiResearchSlots:     e.detail.multiResearchSlots     ?? 1,
          currentTurn:            e.detail.currentTurn            ?? 1
        });
      }
    };
    window.addEventListener('game:techUpdate', handler);
    // Request current state
    window.dispatchEvent(new CustomEvent('game:requestTechUpdate'));
    return () => window.removeEventListener('game:techUpdate', handler);
  }, [factionId]);

  // ── Keyboard close (not active in inline mode) ──
  useEffect(() => {
    if (inline) return;
    const handler = (e: any) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, inline]);

  if (!initialized) {
    return (
      <div className={`tech-tree tech-tree--loading${inline ? ' tech-tree--inline' : ''}`}>
        <span>Loading tech tree…</span>
      </div>
    );
  }

  // Build lookup sets for fast state checking
  const completedSet   = new Set(techState.completedTechnologies);
  const researchingMap = new Map(techState.activeResearchProjects.map((p: any) => [p.techId, p]));
  const queuedSet      = new Set(techState.researchQueue);

  function getTechState(tech: any) {
    if (completedSet.has(tech.id))   return 'completed';
    if (researchingMap.has(tech.id)) return 'researching';
    // Available if all prerequisites complete
    const prereqsMet = tech.prerequisites.every((req: any) => completedSet.has(req));
    if (prereqsMet)                  return 'available';
    return 'locked';
  }

  // Group techs by tier
  const tierMap: Record<number, any[]> = {};
  techDefs.forEach(t => {
    if (!tierMap[t.tier]) tierMap[t.tier] = [];
    tierMap[t.tier].push(t);
  });

  const factionLabel = ({
    brandAuthority: 'The Brand Authority',
    union:          'The Union',
    autoforge:      'The Autoforge'
  } as Record<string, string>)[factionId] ?? factionId;

  return (
    <div className={`tech-tree${inline ? ' tech-tree--inline' : ''}`} role={inline ? undefined : 'dialog'} aria-label={inline ? undefined : 'Tech Tree'}>
      {/* Header */}
      <div className="tech-tree__header" style={{ borderColor: factionColor }}>
        <h2 className="tech-tree__title" style={{ color: factionColor }}>
          &#x269B; Tech Tree &#x2014; {factionLabel}
        </h2>
        <div className="tech-tree__meta">
          <span className="tech-tree__turn">{formatTurnLabel(techState.currentTurn)}</span>
          <span className="tech-tree__slots">
            Research Slots: {techState.activeResearchProjects.length} / {techState.multiResearchSlots}
          </span>
        </div>
        <button className="tech-tree__close" onClick={onClose} aria-label="Close tech tree">✕</button>
      </div>

      {/* Tree body */}
      <div className="tech-tree__body">
        {/* SVG connection lines overlay */}
        <TechConnections
          techs={techDefs}
          nodeRefs={nodeRefs}
          completedIds={completedSet}
          researchingIds={new Set(researchingMap.keys())}
        />

        {/* Tier rows */}
        {[1, 2, 3, 4, 5].map(tier => (
          <div key={tier} className="tech-tree__tier-row">
            <div className="tech-tree__tier-label">{TIER_LABELS[tier - 1]}</div>
            <div className="tech-tree__tier-nodes">
              {(tierMap[tier] ?? []).map((tech: any) => {
                const nodeState = getTechState(tech);
                return (
                  <TechNode
                    key={tech.id}
                    tech={tech}
                    state={nodeState}
                    progress={researchingMap.get(tech.id) ?? null}
                    factionColor={factionColor}
                    onSelect={(t: any) => onSelectTech?.(t, nodeState, researchingMap.get(t.id) ?? null)}
                    nodeRef={(el: any) => { nodeRefs.current[tech.id] = el; }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

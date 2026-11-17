/**
 * ActionLimitsHUD — Per-category action readiness summary.
 *
 * Every row shows  X / Y  where X = committed this turn and Y = total capacity.
 * Starts at 0/N and climbs as orders are issued.
 *
 * All rows show live data derived from the galaxy:resourceUpdate event.
 *
 * Grays out during non-ACTION phases.
 * Spec: 030-action-points-limits-spec.md (FR-APL-006)
 */
import { useState, useEffect } from 'react';
import './ActionLimitsHUD.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';

interface ActionLimitsHUDProps {
  playerFactionId?: string | null;
  inline?: boolean;
}

interface ResourceUpdateDetail {
  factionId?: string;
  resources?: Record<string, number>;
  queuedSpending?: Record<string, number>;
  currentPhase?: string;
  availableChars?: number;
  totalChars?: number;
  fleetsWithoutOrders?: number;
  totalFleets?: number;
  systemsWithQueueSpace?: number;
  systemsWithActiveQueue?: number;
  totalControlledSystems?: number;
}

const RESOURCE_LABELS: Record<string, string> = {
  credits:   'CR',
  materials: 'MT',
  recruits:  'RC',
  influence: 'IN'
};
const RESOURCE_COLORS: Record<string, string> = {
  credits:   '#f0883e',
  materials: '#58a6ff',
  recruits:  '#3fb950',
  influence: '#d29bff'
};

export function ActionLimitsHUD({ playerFactionId, inline = false }: ActionLimitsHUDProps) {
  const { mode } = useGameTime();
  const [resources,             setResources]             = useState<Record<string, number>>({});
  const [queuedSpending,        setQueuedSpending]        = useState<Record<string, number>>({});
  const [currentPhase,          setCurrentPhase]          = useState('ACTION');
  const [availableChars,        setAvailableChars]        = useState<number | null>(null);
  const [totalChars,            setTotalChars]            = useState<number | null>(null);
  const [fleetsWithoutOrders,   setFleetsWithoutOrders]   = useState<number | null>(null);
  const [totalFleets,           setTotalFleets]           = useState<number | null>(null);
  const [systemsWithQueueSpace, setSystemsWithQueueSpace] = useState<number | null>(null);
  const [systemsWithActiveQueue, setSystemsWithActiveQueue] = useState<number | null>(null);
  const [totalControlledSystems,setTotalControlledSystems]= useState<number | null>(null);

  // Pull from galaxy:resourceUpdate
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ResourceUpdateDetail>).detail ?? {};
      if (d.factionId && d.factionId !== playerFactionId) return;
      if (d.resources)      setResources(d.resources);
      if (d.queuedSpending) setQueuedSpending(d.queuedSpending);
      if (d.currentPhase)   setCurrentPhase(d.currentPhase);
      if (d.availableChars        != null) setAvailableChars(d.availableChars);
      if (d.totalChars            != null) setTotalChars(d.totalChars);
      if (d.fleetsWithoutOrders   != null) setFleetsWithoutOrders(d.fleetsWithoutOrders);
      if (d.totalFleets           != null) setTotalFleets(d.totalFleets);
      if (d.systemsWithQueueSpace  != null) setSystemsWithQueueSpace(d.systemsWithQueueSpace);
      if (d.systemsWithActiveQueue  != null) setSystemsWithActiveQueue(d.systemsWithActiveQueue);
      if (d.totalControlledSystems  != null) setTotalControlledSystems(d.totalControlledSystems);
    };
    window.addEventListener('galaxy:resourceUpdate', handler);
    return () => window.removeEventListener('galaxy:resourceUpdate', handler);
  }, [playerFactionId]);

  // Track phase separately (fires before resource update during transition)
  useEffect(() => {
    const handler = (e: Event) => {
      const phase = (e as CustomEvent<{ phase?: string }>).detail?.phase;
      if (phase) setCurrentPhase(phase);
    };
    window.addEventListener('galaxy:phaseStart', handler);
    return () => window.removeEventListener('galaxy:phaseStart', handler);
  }, []);

  const isActive = currentPhase === 'ACTION';

  // Effective available = pool − reserved (soft-locked) amounts
  const effectiveResources = Object.fromEntries(
    (Object.entries(resources) as [string, number][]).map(([k, v]) => [
      k,
      Math.max(0, v - (queuedSpending[k] ?? 0))
    ])
  ) as Record<string, number>;

  return (
    <div className={`action-limits-hud${isActive ? '' : ' action-limits-hud--locked'}${inline ? ' action-limits-hud--inline' : ''}`}>
      <div className="action-limits-title">{mode === 'sync' ? 'PENDING ACTIONS' : 'TURN ACTIONS'}</div>

      {/* Characters — committed (on orders/mission/fleet) / total non-dead */}
      <div className={`action-limits-row${availableChars === 0 && totalChars !== null ? ' action-limits-row--stub' : ''}`}>
        <span className="action-limits-label">CHARS</span>
        <span className={`action-limits-value${availableChars === 0 && totalChars !== null ? ' action-limits-value--exhausted' : ''}`}>
          {availableChars !== null && totalChars !== null ? `${totalChars - availableChars}/${totalChars}` : '—'}
        </span>
      </div>

      {/* Fleets — fleets with orders issued this turn / total fleets */}
      <div className={`action-limits-row${fleetsWithoutOrders === 0 && totalFleets !== null ? ' action-limits-row--stub' : ''}`}>
        <span className="action-limits-label">FLEETS</span>
        <span className={`action-limits-value${fleetsWithoutOrders === 0 && totalFleets !== null ? ' action-limits-value--exhausted' : ''}`}>
          {totalFleets !== null && fleetsWithoutOrders !== null ? `${totalFleets - fleetsWithoutOrders}/${totalFleets}` : '—'}
        </span>
      </div>

      {/* Construction — systems with something queued / total controlled systems */}
      <div className={`action-limits-row${systemsWithQueueSpace === 0 && totalControlledSystems !== null ? ' action-limits-row--stub' : ''}`}>
        <span className="action-limits-label">BUILD</span>
        <span className={`action-limits-value${systemsWithQueueSpace === 0 && totalControlledSystems !== null ? ' action-limits-value--exhausted' : ''}`}>
          {systemsWithActiveQueue !== null ? `${systemsWithActiveQueue}/${totalControlledSystems}` : '—'}
        </span>
      </div>

      {/* Resources (live, reflecting staged deductions) */}
      {/*<div className="action-limits-resources">
        {Object.entries(RESOURCE_LABELS).map(([key, abbr]) => {
          const val     = effectiveResources[key] ?? 0;
          const reserved = queuedSpending[key] ?? 0;
          return (
            <div key={key} className="action-limits-resource-row" title={`${key}: ${val} available${reserved > 0 ? ` (${reserved} reserved)` : ''}`}>
              <span className="action-limits-resource-label" style={{ color: RESOURCE_COLORS[key] }}>
                {abbr}
              </span>
              <span className="action-limits-resource-val">
                {val.toLocaleString()}
                {reserved > 0 && (
                  <span className="action-limits-resource-reserved"> (-{reserved})</span>
                )}
              </span>
            </div>
          );
        })}
      </div> */}

      {!isActive && (
        <div className="action-limits-phase-lock">
          {currentPhase === 'RESOLUTION' ? 'RESOLVING...' : 'PROCESSING...'}
        </div>
      )}
    </div>
  );
}

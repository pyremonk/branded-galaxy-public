/**
 * ActiveMissionsPanel — Mission management UI.
 *
 * Shows all staged (pending), in-progress (multi-turn), and recently completed
 * missions for the player's faction. Allows cancellation of staged missions.
 *
 * Spec: 022-mission-execution-spec.md (FR-ME-008)
 */
import { useState, useEffect, useCallback } from 'react';
import { InfoPanelFrame } from './InfoPanelFrame';
import './ActiveMissionsPanel.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration, formatTurnLabelCompact } from '../utils/time-format.js';


const TIER_LABELS: Record<string, string> = {
  'critical-success': 'Critical Success',
  'success':          'Success',
  'failure':          'Failure',
  'critical-failure': 'Critical Failure'
};

const TIER_COLORS: Record<string, string> = {
  'critical-success': '#3fb950',
  'success':          '#58a6ff',
  'failure':          '#f0883e',
  'critical-failure': '#f85149'
};

const STATUS_TABS = [
  { id: 'staged',    label: 'Staged'    },
  { id: 'active',    label: 'Active'    },
  { id: 'completed', label: 'Completed' }
];

function MissionTypeTag({ type }: any) {
  return <span className="mission-type-tag">{type}</span>;
}

function OutcomeBadge({ tier }: any) {
  return (
    <span className="mission-outcome-badge" style={{ color: TIER_COLORS[tier] ?? '#8b949e' }}>
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}

function StagedMissionCard({ mission, onCancel, isActionPhase }: any) {
  return (
    <div className="mission-card mission-card--staged">
      <div className="mission-card-header">
        <MissionTypeTag type={mission.payload?.missionType ?? '?'} />
        <span className="mission-card-faction">{mission.payload?.factionId}</span>
      </div>
      <div className="mission-card-body">
        <div className="mission-card-target">
          Target: <span>{mission.payload?.targetId ?? '—'}</span>
        </div>
        <div className="mission-card-chars">
          Characters: {(mission.payload?.characterIds ?? []).join(', ') || '—'}
        </div>
      </div>
      {isActionPhase && (
        <button
          className="mission-cancel-btn"
          onClick={() => onCancel(mission.id)}
          title="Cancel this staged mission"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function ActiveMissionCard({ mission }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const pct = mission.totalTurns > 0
    ? Math.round(((mission.totalTurns - mission.turnsRemaining) / mission.totalTurns) * 100)
    : 0;

  return (
    <div className="mission-card mission-card--active">
      <div className="mission-card-header">
        <MissionTypeTag type={mission.missionType ?? '?'} />
        <span className="mission-turns-left">{formatDuration(mission.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)} left</span>
      </div>
      <div className="mission-card-body">
        <div className="mission-card-target">Target: <span>{mission.targetId ?? '—'}</span></div>
        <div className="mission-progress-bar">
          <div className="mission-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="mission-progress-label">{pct}% complete</span>
      </div>
    </div>
  );
}

function CompletedMissionCard({ report }: any) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mission-card mission-card--completed" onClick={() => setExpanded(e => !e)}>
      <div className="mission-card-header">
        <MissionTypeTag type={report.missionType ?? '?'} />
        <OutcomeBadge tier={report.outcomeTier} />
        <span className="mission-card-turn">{formatTurnLabelCompact(report.turn)}</span>
      </div>
      {expanded && (
        <div className="mission-card-detail">
          <div>Target: {report.targetId ?? '—'}</div>
          <div>XP: +{report.xpAwarded ?? 0}</div>
          {report.detectionOccurred && <div className="mission-detected">⚠ Detected</div>}
          {(report.captureEvents ?? []).map((evt: any, i: any) => (
            <div key={i} className="mission-capture">🔒 {evt.type.replace(/_/g, ' ')}: {evt.characterId}</div>
          ))}
          {(report.effectsApplied ?? []).map((fx: any, i: any) => (
            fx && <div key={i} className="mission-effect">{_describeEffect(fx)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function _describeEffect(fx: any) {
  switch (fx.type) {
    case 'loyalty_shift':       return `Loyalty ${fx.amount > 0 ? '+' : ''}${fx.amount} at ${fx.systemId}`;
    case 'facility_damage':     return `Facility ${fx.facilityType} damage −${fx.amount}${fx.destroyed ? ' (destroyed)' : ''}`;
    case 'research_advance':    return `Research ${fx.turns > 0 ? 'advanced +' : 'set back '}${Math.abs(fx.turns)} turn(s)`;
    case 'system_revolt':       return `Revolt at ${fx.systemId} (${fx.duration} turns)`;
    case 'character_killed':    return `Character eliminated: ${fx.characterId}`;
    case 'character_wounded':   return `Character wounded: ${fx.characterId}`;
    case 'character_rescued':   return `Character rescued: ${fx.characterId}`;
    case 'recruit_character':   return fx.success ? `Recruited Tier-${fx.tier} character` : `Recruitment failed`;
    case 'intel_reveal':        return `Intel revealed (${fx.itemCount} item(s))`;
    case 'diplomatic_consequence': return `+${fx.amount} influence to ${fx.factionId}`;
    case 'troop_reduction':     return `Troops −${fx.amount} at ${fx.systemId}`;
    default:                    return fx.type;
  }
}

export function ActiveMissionsPanel({ onClose, playerFactionId }: any) {
  const [activeTab,    setActiveTab]    = useState('staged');
  const [staged,       setStaged]       = useState<any[]>([]);
  const [active,       setActive]       = useState<any[]>([]);
  const [completed,    setCompleted]    = useState<any[]>([]);
  const [currentPhase, setCurrentPhase] = useState('ACTION');

  // Sync with game:missionUpdate events
  useEffect(() => {
    const handler = (e: any) => {
      if (!e.detail) return;
      if (e.detail.factionId !== playerFactionId) return;
      setStaged(e.detail.staged   ?? []);
      setActive(e.detail.active   ?? []);
      setCompleted(e.detail.log   ?? []);
    };
    window.addEventListener('game:missionUpdate', handler);
    // Request fresh state on mount
    window.dispatchEvent(new CustomEvent('game:requestMissionUpdate', { detail: { factionId: playerFactionId } }));
    return () => window.removeEventListener('game:missionUpdate', handler);
  }, [playerFactionId]);

  // Track phase for cancel button visibility
  useEffect(() => {
    const handler = (e: any) => { if (e.detail?.phase) setCurrentPhase(e.detail.phase); };
    window.addEventListener('galaxy:phaseStart', handler);
    return () => window.removeEventListener('galaxy:phaseStart', handler);
  }, []);

  const handleCancel = useCallback((actionId: any) => {
    window.dispatchEvent(new CustomEvent('game:cancelMission', { detail: { actionId } }));
  }, []);

  const counts: Record<string, number> = { staged: staged.length, active: active.length, completed: completed.length };

  return (
    <InfoPanelFrame title="Missions" onClose={onClose}>
      <div className="missions-panel">
        {/* Tab bar */}
        <div className="missions-tabs">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`missions-tab${activeTab === tab.id ? ' missions-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {counts[tab.id] > 0 && (
                <span className="missions-tab-count">{counts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="missions-list">
          {activeTab === 'staged' && (
            staged.length === 0
              ? <div className="missions-empty">No staged missions this turn.</div>
              : staged.map(m => (
                <StagedMissionCard
                  key={m.id}
                  mission={m}
                  onCancel={handleCancel}
                  isActionPhase={currentPhase === 'ACTION'}
                />
              ))
          )}

          {activeTab === 'active' && (
            active.length === 0
              ? <div className="missions-empty">No multi-turn missions in progress.</div>
              : active.map(m => (
                <ActiveMissionCard key={m.missionId} mission={m} />
              ))
          )}

          {activeTab === 'completed' && (
            completed.length === 0
              ? <div className="missions-empty">No mission reports yet.</div>
              : completed.map((r, i) => (
                <CompletedMissionCard key={r.missionId ?? i} report={r} />
              ))
          )}
        </div>
      </div>
    </InfoPanelFrame>
  );
}

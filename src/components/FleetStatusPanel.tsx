/**
 * FleetStatusPanel — Displays fleet data for the player faction with order controls.
 * Spec: 013-fleet-composition-spec.md, 014-fleet-movement-spec.md,
 *       015-space-combat-spec.md, 016-fleet-commands-spec.md
 */
import { useState, useEffect } from 'react';
import { InfoPanelFrame } from './InfoPanelFrame';

import { UI_ICONS } from '../icons.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration } from '../utils/time-format.js';

const COMMAND_LABELS: Record<string, string> = {
  patrol:   'Patrol',
  raid:     'Raid',
  blockade: 'Blockade'
};

const OUTCOME_LABELS: Record<string, string> = {
  attackerVictory: 'Victory',
  defenderVictory: 'Repelled',
  attacker_wins:   'Victory',
  defender_wins:   'Repelled',
  draw:            'Draw'
};

const BTN = (color = '#58a6ff') => ({
  padding: '3px 8px', fontSize: 11, background: 'transparent',
  border: `1px solid ${color}`, color, borderRadius: 3, cursor: 'pointer',
  marginRight: 4, marginTop: 4, lineHeight: '1.4'
});

const SELECT_STYLE = {
  background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d',
  borderRadius: 3, padding: '2px 6px', fontSize: 11, marginRight: 4, marginTop: 4
};

// ─── Travel cost helpers (mirror fleet-state-manager.js logic) ───────────────

const GALAXY_DIMENSIONS_MAP = {
  small:  { width: 2000, height: 1500 },
  medium: { width: 3000, height: 2000 },
  large:  { width: 4000, height: 3000 }
};

function _bfsBuildPath(sourceId: any, destId: any, systems: any) {
  if (sourceId === destId) return { turns: 0, waypoints: [] };
  const byId = Object.fromEntries(systems.map((s: any) => [s.id, s]));
  const queue = [[sourceId, []]];
  const visited = new Set([sourceId]);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [curr, path] = next;
    const sys = byId[curr];
    if (!sys) continue;
    for (const nId of (sys.connections ?? [])) {
      if (nId === destId) return { turns: path.length + 1, waypoints: [...path, nId] };
      if (!visited.has(nId)) { visited.add(nId); queue.push([nId, [...path, nId]]); }
    }
  }
  return null;
}

function computeTravelOptions(sourceId: any, destId: any, systems: any, galaxyDimensions: any) {
  if (!sourceId || !destId || sourceId === destId) return null;
  const sourceSys = systems.find((s: any) => s.id === sourceId);
  const destSys   = systems.find((s: any) => s.id === destId);
  if (!sourceSys || !destSys) return null;

  const lane = _bfsBuildPath(sourceId, destId, systems);

  const dims     = galaxyDimensions ?? { width: 3000, height: 2000 };
  const maxDiag  = Math.sqrt(dims.width * dims.width + dims.height * dims.height);
  const dx       = (destSys.position?.x ?? 0) - (sourceSys.position?.x ?? 0);
  const dy       = (destSys.position?.y ?? 0) - (sourceSys.position?.y ?? 0);
  const dist     = Math.sqrt(dx * dx + dy * dy);
  const maxT     = 8;
  const minT     = 2;
  const directTurns = Math.max(minT, Math.min(maxT, Math.ceil(dist / (maxDiag / maxT))));

  return { lane, direct: { turns: directTurns } };
}

// ─── Per-fleet order controls ─────────────────────────────────────────────────

function FleetOrderControls({ fleet, systems, galaxyDimensions }: any) {
  const { mode: gameMode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [mode, setMode]                       = useState<any>(null); // null|'move'|'patrol'|'raid'
  const [moveTarget, setMoveTarget]           = useState('');
  const [moveTravelMode, setMoveTravelMode]   = useState('lane'); // 'lane'|'direct'
  const [moveTravelOptions, setMoveTravelOptions] = useState<any>(null); // computed on moveTarget change
  const [patrolRoute, setPatrolRoute]         = useState<any[]>([]);
  const [raidTarget, setRaidTarget]           = useState('');
  const [feedback, setFeedback]               = useState<any>(null);

  const currentSys       = systems.find((s: any) => s.id === fleet.systemId);
  const connectedSystems = currentSys
    ? systems.filter((s: any) => currentSys.connections?.includes(s.id))
    : [];

  // All other systems sorted by name (destinations for Move)
  const allDestinations = systems
    .filter((s: any) => s.id !== fleet.systemId)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  // Recompute travel options whenever move target changes
  const handleMoveTargetChange = (newTargetId: any) => {
    setMoveTarget(newTargetId);
    if (!newTargetId) { setMoveTravelOptions(null); return; }
    const opts = computeTravelOptions(fleet.systemId, newTargetId, systems, galaxyDimensions);
    setMoveTravelOptions(opts);
    // Auto-select: prefer lane (faster) if available, else direct
    if (opts?.lane) setMoveTravelMode('lane');
    else setMoveTravelMode('direct');
  };

  // Systems reachable from the last waypoint in the patrol route (exclude already-picked)
  const patrolNextOptions = (() => {
    if (patrolRoute.length === 0) return connectedSystems;
    const lastSys = systems.find((s: any) => s.id === patrolRoute[patrolRoute.length - 1]);
    return systems.filter((s: any) =>
      lastSys?.connections?.includes(s.id) && !patrolRoute.includes(s.id)
    );
  })();

  function dispatchWithResult(sendEvent: any, resultEvent: any, detail: any, onResult: any) {
    const handler = (e: any) => {
      window.removeEventListener(resultEvent, handler);
      onResult(e.detail);
    };
    window.addEventListener(resultEvent, handler);
    window.dispatchEvent(new CustomEvent(sendEvent, { detail }));
  }

  function handleMove() {
    if (!moveTarget || !moveTravelMode) return;
    dispatchWithResult(
      'galaxy:stageFleetMove', 'galaxy:stageFleetMoveResult',
      { fleetId: fleet.id, destinationId: moveTarget, travelMode: moveTravelMode },
      (result: any) => {
        setFeedback(result.success ? 'Move staged.' : (result.error ?? 'Failed.'));
        if (result.success) {
          setMode(null);
          window.dispatchEvent(new CustomEvent('galaxy:fleetOrderSubmitted'));
        }
      }
    );
  }

  function handleCancelMove() {
    window.dispatchEvent(new CustomEvent('galaxy:cancelFleetMove', { detail: { fleetId: fleet.id } }));
    setFeedback('Move cancelled.');
    setMode(null);
  }

  function handleCommand(commandType: any, commandData: any) {
    dispatchWithResult(
      'galaxy:assignFleetCommand', 'galaxy:assignFleetCommandResult',
      { fleetId: fleet.id, commandType, commandData },
      (result: any) => {
        setFeedback(result.success
          ? `${COMMAND_LABELS[commandType]} order assigned.`
          : (result.error ?? 'Failed.'));
        if (result.success) {
          setMode(null);
          window.dispatchEvent(new CustomEvent('galaxy:fleetOrderSubmitted'));
        }
      }
    );
  }

  function handleCancelCommand() {
    window.dispatchEvent(new CustomEvent('galaxy:cancelFleetCommand', { detail: { fleetId: fleet.id } }));
    setFeedback('Order cancelled.');
    setMode(null);
  }

  const sysName = (id: any) => systems.find((s: any) => s.id === id)?.name ?? id;

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid #21262d', paddingTop: 6 }}>

      {/* ── Default: action buttons ── */}
      {mode === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* In-transit controls */}
          {fleet.inTransit && (
            <button style={BTN('#f85149')} onClick={handleCancelMove}>
              Cancel Move
            </button>
          )}

          {/* Stationary controls */}
          {!fleet.inTransit && allDestinations.length > 0 && (
            <button style={BTN('#58a6ff')} onClick={() => {
              setMode('move');
              const firstDest = allDestinations[0]?.id ?? '';
              handleMoveTargetChange(firstDest);
            }}>
              Move
            </button>
          )}
          {!fleet.inTransit && (
            <>
              <button style={BTN('#3fb950')} onClick={() => { setMode('patrol'); setPatrolRoute([]); }}>
                Patrol
              </button>
              {connectedSystems.length > 0 && (
                <button style={BTN('#d29922')} onClick={() => { setMode('raid'); setRaidTarget(connectedSystems[0]?.id ?? ''); }}>
                  Raid
                </button>
              )}
              <button style={BTN('#8b949e')} onClick={() => handleCommand('blockade', {})}>
                Blockade
              </button>
            </>
          )}

          {/* Cancel existing command */}
          {fleet.command && !fleet.inTransit && (
            <button style={BTN('#f85149')} onClick={handleCancelCommand}>
              Cancel {COMMAND_LABELS[fleet.command.type] ?? fleet.command.type}
            </button>
          )}
        </div>
      )}

      {/* ── Move ── */}
      {mode === 'move' && (
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Destination:</div>
          <select
            style={SELECT_STYLE}
            value={moveTarget}
            onChange={(e: any) => handleMoveTargetChange(e.target.value)}
          >
            {allDestinations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {moveTravelOptions && (
            <div style={{ marginTop: 6, marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Travel method:</div>
              {/* Lane option */}
              <label style={{ display: 'block', fontSize: 11, color: moveTravelOptions.lane ? '#c9d1d9' : '#6e7681', marginBottom: 3, cursor: moveTravelOptions.lane ? 'pointer' : 'default' }}>
                <input
                  type="radio" name={`travel-${fleet.id}`} value="lane"
                  checked={moveTravelMode === 'lane'}
                  disabled={!moveTravelOptions.lane}
                  onChange={() => setMoveTravelMode('lane')}
                  style={{ marginRight: 4 }}
                />
                {moveTravelOptions.lane
                  ? `Hyperspace lanes — ${moveTravelOptions.lane.turns} turn${moveTravelOptions.lane.turns !== 1 ? 's' : ''}`
                  : 'Hyperspace lanes — no path'}
              </label>
              {/* Direct option */}
              <label style={{ display: 'block', fontSize: 11, color: '#c9d1d9', marginBottom: 3, cursor: 'pointer' }}>
                <input
                  type="radio" name={`travel-${fleet.id}`} value="direct"
                  checked={moveTravelMode === 'direct'}
                  onChange={() => setMoveTravelMode('direct')}
                  style={{ marginRight: 4 }}
                />
                {`Direct travel \u2014 ${formatDuration(moveTravelOptions.direct.turns, gameMode, ticksPerSecond, ticksPerTurn)} (hidden from enemies)`}
              </label>
            </div>
          )}

          <button style={BTN('#58a6ff')} onClick={handleMove} disabled={!moveTarget || !moveTravelOptions}>Confirm</button>
          <button style={BTN('#8b949e')} onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      {/* ── Patrol route builder ── */}
      {mode === 'patrol' && (
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>
            Patrol route (2–4 connected systems):
          </div>
          <div style={{ fontSize: 11, color: '#c9d1d9', marginBottom: 6, minHeight: 16 }}>
            {patrolRoute.length === 0
              ? <span style={{ color: '#6e7681' }}>No systems added yet</span>
              : patrolRoute.map(id => sysName(id)).join(' \u2192 ')}
          </div>
          {patrolRoute.length < 4 && patrolNextOptions.length > 0 && (
            <select
              style={SELECT_STYLE}
              value=""
              onChange={(e: any) => { if (e.target.value) setPatrolRoute((r: any) => [...r, e.target.value]); }}
            >
              <option value="">{`+ Add next system\u2026`}</option>
              {patrolNextOptions.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {patrolRoute.length > 0 && (
            <button style={BTN('#f85149')} onClick={() => setPatrolRoute((r: any) => r.slice(0, -1))}>
              Remove last
            </button>
          )}
          {patrolRoute.length >= 2 && (
            <button style={BTN('#3fb950')} onClick={() => handleCommand('patrol', { route: patrolRoute })}>
              Assign Patrol
            </button>
          )}
          <button style={BTN('#8b949e')} onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      {/* ── Raid ── */}
      {mode === 'raid' && (
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Raid target:</div>
          <select style={SELECT_STYLE} value={raidTarget} onChange={e => setRaidTarget(e.target.value)}>
            {connectedSystems.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button style={BTN('#d29922')} onClick={() => handleCommand('raid', { target: raidTarget })}>
            Confirm Raid
          </button>
          <button style={BTN('#8b949e')} onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      {/* ── Feedback ── */}
      {feedback && (
        <div style={{ fontSize: 11, marginTop: 4, color: feedback.includes('Failed') || feedback.includes('Already') ? '#f85149' : '#3fb950' }}>
          {feedback}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function FleetStatusPanel({ onClose }: any) {
  const { mode: gameMode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [fleets, setFleets]                   = useState<any[]>([]);
  const [combatLog, setCombatLog]             = useState<any[]>([]);
  const [systems, setSystems]                 = useState<any[]>([]);
  const [galaxyDimensions, setGalaxyDimensions] = useState<any>(null);
  const [expanded, setExpanded]               = useState<any>({});

  useEffect(() => {
    const onFleetUpdate = (e: any) => {
      setFleets(e.detail?.fleets ?? []);
      setCombatLog(e.detail?.combatLog ?? []);
      setSystems(e.detail?.systems ?? []);
      setGalaxyDimensions(e.detail?.galaxyDimensions ?? null);
    };
    window.addEventListener('galaxy:fleetUpdate', onFleetUpdate);
    window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
    return () => window.removeEventListener('galaxy:fleetUpdate', onFleetUpdate);
  }, []);

  const toggleExpand = (fleetId: any) => {
    setExpanded((prev: any) => ({ ...prev, [fleetId]: !prev[fleetId] }));
  };

  const totalShips = fleets.reduce((sum, f) => sum + (f.ships?.length ?? 0), 0);
  const sysName = (id: any) => systems.find(s => s.id === id)?.name ?? id;

  return (
    <InfoPanelFrame
      panelId="fleet"
      title="Fleet Status"
      subtitle={fleets.length > 0 ? `${fleets.length} fleet(s) \u00b7 ${totalShips} ships` : 'No fleets'}
      onClose={onClose}
    >
      <div className="info-panel-section">
        <div className="info-panel-section-title">Fleet Overview</div>

        {fleets.length === 0 ? (
          <div className="info-empty-state">
            <span className="info-empty-icon">{UI_ICONS.emptyFleet}</span>
            <span className="info-empty-msg">No fleets</span>
          </div>
        ) : (
          fleets.map((fleet: any) => (
            <div key={fleet.id} style={{ marginBottom: 10, borderLeft: '2px solid #30363d', paddingLeft: 8 }}>
              {/* Fleet header row */}
              <div
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => toggleExpand(fleet.id)}
              >
                <span style={{ fontWeight: 600, color: '#c9d1d9' }}>
                  {fleet.name}
                  {fleet.inTransit ? ' ' + UI_ICONS.inTransit : ''}
                  {fleet.maintenancePenalty ? ' ' + UI_ICONS.warning : ''}
                </span>
                <span style={{ color: '#8b949e', fontSize: 12 }}>
                  {fleet.ships?.length ?? 0} ships {expanded[fleet.id] ? UI_ICONS.trendUp : UI_ICONS.trendDown}
                </span>
              </div>

              {/* Fleet status line */}
              <div style={{ color: '#8b949e', fontSize: 11, marginTop: 2 }}>
                {fleet.inTransit ? (() => {
                  const it   = fleet.inTransit;
                  const mode = it.travelMode ?? 'lane';
                  const dest = sysName(it.destinationSystemId);
                  if (mode === 'direct') {
                    return `En route \u2192 ${dest} \u00b7 direct (${formatDuration(it.turnsRemaining ?? 1, gameMode, ticksPerSecond, ticksPerTurn)} left)`;
                  }
                  const hopsLeft = it.waypoints.length - it.waypointIndex;
                  return `En route \u2192 ${dest} \u00b7 lanes (${hopsLeft} hop${hopsLeft !== 1 ? 's' : ''} left)`;
                })() : sysName(fleet.systemId)}
                {fleet.command ? ` \u00b7 ${COMMAND_LABELS[fleet.command.type] ?? fleet.command.type}` : ''}
              </div>

              {/* Expanded: ships + order controls */}
                  {expanded[fleet.id] && (
                <div style={{ marginTop: 4 }}>
                  {(fleet.ships ?? []).map((ship: any) => (
                    <div key={ship.id} style={{ fontSize: 11, color: '#8b949e', paddingLeft: 8 }}>
                      {ship.shipTypeId}
                      {ship.currentHull < ship.maxHull
                        ? ` (Hull: ${ship.currentHull}/${ship.maxHull})`
                        : ''}
                    </div>
                  ))}
                  <FleetOrderControls fleet={fleet} systems={systems} galaxyDimensions={galaxyDimensions} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {combatLog.length > 0 && (
        <div className="info-panel-section">
          <div className="info-panel-section-title">Recent Combats</div>
          {[...combatLog].reverse().slice(0, 5).map((entry: any, i: any) => (
            <div key={i} style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>
              <span style={{ color: '#c9d1d9' }}>{OUTCOME_LABELS[entry.outcome] ?? entry.outcome}</span>
              {' \u2014 '}
              {entry.attackerFactionId} vs {entry.defenderFactionId}
              {entry.systemId ? ` at ${sysName(entry.systemId)}` : ''}
              {` (${entry.rounds} rounds)`}
              {(entry.attackerLosses != null || entry.defenderLosses != null) && (
                <span style={{ color: '#6e7681' }}>
                  {` \u00b7 atk\u2212${entry.attackerLosses ?? 0} def\u2212${entry.defenderLosses ?? 0}`}
                </span>
              )}
              {entry.turnNumber != null && (
                <span style={{ color: '#6e7681' }}>{` \u00b7 T${entry.turnNumber}`}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </InfoPanelFrame>
  );
}


import React, { useState, useEffect, useRef } from 'react';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration } from '../utils/time-format.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  move:     'Move Here',
  raid:     'Raid',
  blockade: 'Blockade',
};

const ACTION_COLORS: Record<string, string> = {
  move:     '#58a6ff',
  raid:     '#f85149',
  blockade: '#f0883e',
  patrol:   '#3fb950',
};

// ─── Travel cost helpers (mirror FleetStatusPanel / fleet-state-manager logic) ──

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
  const dims    = galaxyDimensions ?? { width: 3000, height: 2000 };
  const maxDiag = Math.sqrt(dims.width * dims.width + dims.height * dims.height);
  const dx = (destSys.position?.x ?? 0) - (sourceSys.position?.x ?? 0);
  const dy = (destSys.position?.y ?? 0) - (sourceSys.position?.y ?? 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxT = 8;
  const minT = 2;
  const directTurns = Math.max(minT, Math.min(maxT, Math.ceil(dist / (maxDiag / maxT))));
  return { lane, direct: { turns: directTurns } };
}

// ─── SystemOverviewFleets ─────────────────────────────────────────────────────

export default function SystemOverviewFleets({ sys, playerFactionId, isOwnSystem }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [expanded,       setExpanded]       = useState(true);
  const [fleets,         setFleets]         = useState<any[]>([]);
  const [systemsById,    setSystemsById]    = useState<any>({});
  const [selectedFleetId, setSelectedFleetId] = useState('');
  const [selectedAction,  setSelectedAction]  = useState('');
  const [feedback,       setFeedback]       = useState<any>(null); // { ok, msg }
  const [systemsFull,    setSystemsFull]    = useState<any[]>([]);
  const [galaxyDims,     setGalaxyDims]     = useState<any>(null);
  const [moveTravelMode, setMoveTravelMode] = useState('lane'); // 'lane'|'direct'
  const [moveTravelOpts, setMoveTravelOpts] = useState<any>(null);  // { lane, direct }

  const sessionFactionIdRef = useRef<any>(null);
  const systemId = sys.id;

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!playerFactionId) return;

    // Set ref BEFORE dispatching — Phaser responds synchronously
    sessionFactionIdRef.current = playerFactionId;

    // galaxy:fleetUpdate fires after every fleet state change (including cancels)
    const onFleetUpdate = (e: any) => {
      const detail = e.detail ?? {};
      setFleets(detail.fleets ?? []);
      const sys = detail.systems ?? [];
      const lookup: Record<string, any> = {};
      sys.forEach((s: any) => { lookup[s.id] = s.name; });
      setSystemsById(lookup);
      setSystemsFull(sys);
      setGalaxyDims(detail.galaxyDimensions ?? null);
    };

    // Result events carry success/error messages
    const onMoveResult = (e: any) => {
      if (e.detail?.success) {
        setFeedback({ ok: true, msg: 'Fleet movement staged.' });
        setSelectedFleetId('');
        setSelectedAction('');
      } else {
        setFeedback({ ok: false, msg: e.detail?.error ?? 'Could not stage fleet movement.' });
      }
    };

    const onCommandResult = (e: any) => {
      if (e.detail?.success) {
        setFeedback({ ok: true, msg: 'Fleet command assigned.' });
        setSelectedFleetId('');
        setSelectedAction('');
      } else {
        setFeedback({ ok: false, msg: e.detail?.error ?? 'Could not assign fleet command.' });
      }
    };

    // Register listeners BEFORE dispatching
    window.addEventListener('galaxy:fleetUpdate',              onFleetUpdate);
    window.addEventListener('galaxy:stageFleetMoveResult',     onMoveResult);
    window.addEventListener('galaxy:assignFleetCommandResult', onCommandResult);

    window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));

    return () => {
      window.removeEventListener('galaxy:fleetUpdate',              onFleetUpdate);
      window.removeEventListener('galaxy:stageFleetMoveResult',     onMoveResult);
      window.removeEventListener('galaxy:assignFleetCommandResult', onCommandResult);
    };
  }, [systemId, playerFactionId]);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Fleets that already have orders targeting this system
  const fleetsTargetingSystem = fleets.filter(f =>
    (f.inTransit?.destinationSystemId === systemId) ||
    (f.command?.target === systemId)
  );

  const hasCurrent      = fleetsTargetingSystem.length > 0;
  const selectedFleet   = fleets.find(f => f.id === selectedFleetId) ?? null;
  const fleetHasOrders  = selectedFleet && (selectedFleet.inTransit != null || selectedFleet.command != null);

  // Actions available when selected fleet has no orders
  const availableActions = (selectedFleet && !fleetHasOrders)
    ? ['move', ...(!isOwnSystem ? ['raid', 'blockade'] : [])]
    : [];

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getFleetLocation = (fleet: any) => {
    if (fleet.inTransit) {
      const dest = systemsById[fleet.inTransit.destinationSystemId] ?? fleet.inTransit.destinationSystemId;
      return `In transit \u2192 ${dest}`;
    }
    return systemsById[fleet.systemId] ?? fleet.systemId ?? '...';
  };

  const getOrderLabel = (fleet: any) => {
    if (fleet.inTransit) {
      const tMode = fleet.inTransit.travelMode ?? 'lane';
      if (tMode === 'direct') {
        return `Moving (${formatDuration(fleet.inTransit.turnsRemaining ?? 1, mode, ticksPerSecond, ticksPerTurn)})`;
      }
      const hopsLeft = fleet.inTransit.waypoints.length - fleet.inTransit.waypointIndex;
      return `Moving (${hopsLeft} hop${hopsLeft !== 1 ? 's' : ''} left)`;
    }
    if (fleet.command?.type) {
      const t = fleet.command.type;
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return 'Ordered';
  };

  const getOrderColor = (fleet: any) => {
    if (fleet.inTransit) return ACTION_COLORS.move;
    return ACTION_COLORS[fleet.command?.type] ?? '#8b949e';
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAction = () => {
    if (!selectedFleetId || !selectedAction) return;
    setFeedback(null);
    if (selectedAction === 'move') {
      window.dispatchEvent(new CustomEvent('galaxy:stageFleetMove', {
        detail: { fleetId: selectedFleetId, destinationId: systemId, travelMode: moveTravelMode },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('galaxy:assignFleetCommand', {
        detail: {
          fleetId:     selectedFleetId,
          commandType: selectedAction,
          commandData: { target: systemId },
        },
      }));
    }
  };

  const handleCancelMove = (fleetId: any) => {
    setFeedback(null);
    window.dispatchEvent(new CustomEvent('galaxy:cancelFleetMove', { detail: { fleetId } }));
  };

  const handleCancelCommand = (fleetId: any) => {
    setFeedback(null);
    window.dispatchEvent(new CustomEvent('galaxy:cancelFleetCommand', { detail: { fleetId } }));
  };

  const handleSelectFleet = (id: any) => {
    setSelectedFleetId(id);
    setSelectedAction('');
    setFeedback(null);
  };

  // ── Compute travel options when move action + fleet are selected ────────────

  useEffect(() => {
    if (selectedAction !== 'move' || !selectedFleet) {
      setMoveTravelOpts(null);
      return;
    }
    const opts = computeTravelOptions(selectedFleet.systemId, systemId, systemsFull, galaxyDims);
    setMoveTravelOpts(opts);
    setMoveTravelMode(opts?.lane ? 'lane' : 'direct');
  }, [selectedAction, selectedFleetId, systemId, systemsFull, galaxyDims]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="info-panel-section sysdet-action-section">
      {/* Section header / toggle */}
      <div
        className="sysdet-section-toggle"
        onClick={() => setExpanded((v: any) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e: any) => e.key === 'Enter' && setExpanded((v: any) => !v)}
      >
        <span className="sysdet-section-toggle-title">
          Fleet Orders {hasCurrent ? `(${fleetsTargetingSystem.length})` : ''}
        </span>
        <span className="sysdet-section-toggle-chevron">{expanded ? '\u25b2' : '\u25bc'}</span>
      </div>

      {expanded && (
        <div className="sysdet-mission-body">
          {/* Feedback bar */}
          {feedback && (
            <div className={`sysdet-diplo-feedback${feedback.ok ? ' sysdet-diplo-feedback--ok' : ' sysdet-diplo-feedback--err'}`}>
              {feedback.msg}
              <button className="sysdet-diplo-feedback-dismiss" onClick={() => setFeedback(null)}>{'\u00d7'}</button>
            </div>
          )}

          {/* Fleets already targeting this system */}
          {hasCurrent && (
            <div className="sysdet-mission-current">
              {fleetsTargetingSystem.map(fleet => {
                const color   = getOrderColor(fleet);
                const label   = getOrderLabel(fleet);
                const isMove  = fleet.inTransit?.destinationSystemId === systemId;
                const isCmd   = fleet.command?.target === systemId;
                return (
                  <div key={fleet.id} className="sysdet-mission-row">
                    <div className="sysdet-mission-row-info">
                      <span className="sysdet-mission-tier-dot" style={{ background: color }} />
                      <span className="sysdet-mission-row-name">{fleet.name}</span>
                      <span
                        className="sysdet-mission-status-badge"
                        style={{ borderColor: color, color }}
                      >
                        {label}
                      </span>
                    </div>
                    {isMove && (
                      <button
                        className="sysdet-mission-cancel-btn"
                        onClick={() => handleCancelMove(fleet.id)}
                        title="Cancel movement order"
                      >
                        Cancel
                      </button>
                    )}
                    {isCmd && (
                      <button
                        className="sysdet-mission-cancel-btn"
                        onClick={() => handleCancelCommand(fleet.id)}
                        title="Cancel fleet command"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Fleet selector */}
          {fleets.length === 0 ? (
            <div className="info-empty-state" style={{ padding: '8px 0' }}>
              <span className="info-empty-msg">No fleets available.</span>
            </div>
          ) : (
            <div className="sysdet-mission-assign">
              <label className="sysdet-mission-label">Select Fleet</label>
              <select
                className="sysdet-mission-select"
                value={selectedFleetId}
                onChange={(e: any) => handleSelectFleet(e.target.value)}
              >
                <option value="">— select fleet —</option>
                {fleets.map((f: any) => {
                  const hasOrders = f.inTransit != null || f.command != null;
                  return (
                    <option key={f.id} value={f.id}>
                      {f.name} @ {getFleetLocation(f)}{hasOrders ? ' [ordered]' : ''}
                    </option>
                  );
                })}
              </select>

              {/* Fleet already has orders — show current order with cancel option */}
              {selectedFleet && fleetHasOrders && (
                <div className="sysdet-fleet-has-orders">
                  <span className="sysdet-muted">
                    Current order: <strong style={{ color: getOrderColor(selectedFleet) }}>{getOrderLabel(selectedFleet)}</strong>
                  </span>
                  {selectedFleet.inTransit && (
                    <button
                      className="sysdet-mission-cancel-btn"
                      onClick={() => handleCancelMove(selectedFleet.id)}
                    >
                      Cancel Move
                    </button>
                  )}
                  {selectedFleet.command && (
                    <button
                      className="sysdet-mission-cancel-btn"
                      onClick={() => handleCancelCommand(selectedFleet.id)}
                    >
                      Cancel {selectedFleet.command.type.charAt(0).toUpperCase() + selectedFleet.command.type.slice(1)}
                    </button>
                  )}
                </div>
              )}

              {/* Available actions for an unordered fleet */}
              {selectedFleet && !fleetHasOrders && (
                <div className="sysdet-fleet-actions">
                  {availableActions.map((action: any) => (
                    <button
                      key={action}
                      className={`sysdet-mission-type-btn${selectedAction === action ? ' sysdet-mission-type-btn--selected' : ''}`}
                      style={({ '--tier-color': ACTION_COLORS[action] ?? '#8b949e' } as any)}
                      onClick={() => setSelectedAction((prev: any) => prev === action ? '' : action)}
                    >
                      <span
                        className="sysdet-mission-type-name"
                        style={{ color: ACTION_COLORS[action] ?? '#8b949e' }}
                      >
                        {ACTION_LABELS[action]}
                      </span>
                    </button>
                  ))}

                  {/* Travel mode selector — shown when move is selected */}
                  {selectedAction === 'move' && moveTravelOpts && (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: '#0d1117', borderRadius: 4, border: '1px solid #30363d' }}>
                      <label style={{ display: 'block', fontSize: 11, color: moveTravelOpts.lane ? '#c9d1d9' : '#6e7681', marginBottom: 3, cursor: moveTravelOpts.lane ? 'pointer' : 'default' }}>
                        <input
                          type="radio" name={`travel-sof-${selectedFleetId}`} value="lane"
                          checked={moveTravelMode === 'lane'}
                          disabled={!moveTravelOpts.lane}
                          onChange={() => setMoveTravelMode('lane')}
                          style={{ marginRight: 5 }}
                        />
                        {moveTravelOpts.lane
                          ? `Hyperspace lanes — ${moveTravelOpts.lane.turns} hop${moveTravelOpts.lane.turns !== 1 ? 's' : ''}`
                          : 'Hyperspace lanes — no path'}
                      </label>
                      <label style={{ display: 'block', fontSize: 11, color: '#c9d1d9', cursor: 'pointer' }}>
                        <input
                          type="radio" name={`travel-sof-${selectedFleetId}`} value="direct"
                          checked={moveTravelMode === 'direct'}
                          onChange={() => setMoveTravelMode('direct')}
                          style={{ marginRight: 5 }}
                        />
                        {`Direct travel — ${formatDuration(moveTravelOpts.direct.turns, mode, ticksPerSecond, ticksPerTurn)} (hidden from enemies)`}
                      </label>
                    </div>
                  )}

                  {selectedAction && (
                    <button
                      className="sysdet-mission-confirm-btn"
                      onClick={handleAction}
                    >
                      Confirm Order
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

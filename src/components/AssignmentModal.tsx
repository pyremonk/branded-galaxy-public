/**
 * AssignmentModal — Four-tab character assignment overlay.
 *
 * Self-managing modal that opens via the game:openAssignmentModal event.
 * Covers Fleet command, Facility station, Mission launch, and Unassign flows.
 *
 * Spec: 010-character-assignment-spec.md (FR-CA-006, FR-CA-007)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import './AssignmentModal.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { portraitSrc, handlePortraitError } from '../utils/portrait.js';

// Portrait renderer — shows a PNG image for `.png` portrait values, glyph otherwise.
function AssignPortrait({ portrait, name }: any) {
  if (typeof portrait === 'string' && portrait.endsWith('.png')) {
    return (
      <img
        src={portraitSrc(portrait)}
        onError={handlePortraitError}
        alt={name}
        className="assign-modal-portrait assign-modal-portrait-img"
      />
    );
  }
  return <span className="assign-modal-portrait">{portrait ?? '\u25A1'}</span>;
}

// Facility types eligible for character station assignment
const ASSIGNABLE_FACILITIES: Record<string, any> = {
  research: { label: 'Research Facility', statKey: 'research',   formula: (v: any) => `+${Math.max(0, v - 5) * 5}% research speed`  },
  training: { label: 'Training Facility', statKey: 'diplomacy', formula: (v: any) => `+${Math.max(0, v - 5) * 10}% recruit production` },
  shipyard: { label: 'Shipyard',          statKey: 'leadership', formula: (v: any) => `+${Math.max(0, v - 5) * 5}% construction speed` }
};

const FACTION_DISPLAY_NAMES: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'The Autoforge',
  neutral:        'Neutral'
};

const TIER_COLORS: Record<string, string> = {
  recon:      '#8b949e',
  defensive:  '#58a6ff',
  offensive:  '#f85149',
  support:    '#3fb950'
};

const TABS = [
  { id: 'fleet',    label: 'Fleet'    },
  { id: 'facility', label: 'Facility' },
  { id: 'mission',  label: 'Mission'  },
  { id: 'unassign', label: 'Unassign' }
];

function bonusPreview(character: any, facilityTypeId: any) {
  const def = ASSIGNABLE_FACILITIES[facilityTypeId];
  if (!def || !character) return '—';
  const statVal = character.stats?.[def.statKey] ?? 0;
  return def.formula(statVal);
}

function leadershipBonus(character: any) {
  if (!character) return '—';
  const l = character.stats?.leadership ?? 0;
  return `+${Math.round((l / 20) * 100)}% fleet power`;
}

export function AssignmentModal() {
  const [isOpen,        setIsOpen]        = useState(false);
  useBlockPhaserInput(isOpen);
  const [character,     setCharacter]     = useState<any>(null);
  const [factionId,     setFactionId]     = useState<any>(null);
  const [activeTab,     setActiveTab]     = useState('fleet');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [successMsg,    setSuccessMsg]    = useState('');

  // Data from Phaser
  const [fleets,        setFleets]        = useState<any[]>([]);
  const [constructionSystems, setConstructionSystems] = useState<any>({});
  const [missionTypes,  setMissionTypes]  = useState<any[]>([]);
  const [galaxySystems, setGalaxySystems] = useState<any[]>([]);
  const [allCharacters, setAllCharacters] = useState<any[]>([]);

  // Mission tab local state
  const [selectedMissionType, setSelectedMissionType] = useState<any>(null);
  const [missionTargetId,     setMissionTargetId]     = useState('');

  // Refs to track pending data load — avoids stale-closure mismatches when
  // state updates haven't re-rendered yet before the response events fire.
  const pendingCharIdRef    = useRef<any>(null);
  const pendingFactionIdRef = useRef<any>(null);
  // Stable ref holding the faction for the current modal session. Set at open,
  // cleared at close. Used by data handlers that fire after pendingFactionIdRef
  // is already cleared (e.g. fleet/mission handlers run after char handler).
  const sessionFactionIdRef = useRef<any>(null);

  // ─── Open / close ────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleOpen = (e: any) => {
      const { characterId, factionId: fid, initialTab } = e.detail ?? {};
      if (!characterId || !fid) return;

      // We'll wait for the character data via the characterUpdate event
      setFactionId(fid);
      setActiveTab(initialTab ?? 'fleet');
      setErrorMsg('');
      setSuccessMsg('');
      setSelectedMissionType(null);
      setMissionTargetId('');
      setIsOpen(false); // will set true once character data arrives

      // Set refs BEFORE dispatching — Phaser responds synchronously so
      // handleCharUpdate fires during the dispatchEvent call, before any
      // code below it runs. Refs must be populated first.
      pendingCharIdRef.current    = characterId;
      pendingFactionIdRef.current = fid;
      sessionFactionIdRef.current = fid;

      // Request fresh data
      window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', { detail: { factionId: fid } }));
      window.dispatchEvent(new CustomEvent('game:requestGalaxySystems'));
      window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
      window.dispatchEvent(new CustomEvent('galaxy:requestConstructionUpdate'));
      window.dispatchEvent(new CustomEvent('game:requestMissionUpdate', { detail: { factionId: fid } }));
    };

    window.addEventListener('game:openAssignmentModal', handleOpen);
    return () => window.removeEventListener('game:openAssignmentModal', handleOpen);
  }, []);

  // ─── Data subscriptions ───────────────────────────────────────────────────────

  useEffect(() => {
    const handleCharUpdate = (e: any) => {
      const { factionId: fid, allCharacters: chars, characters } = e.detail ?? {};
      // Use the ref when waiting for the initial open (avoids stale-closure mismatch
      // where factionId state hasn't updated yet when the response fires).
      const expectedFid = pendingFactionIdRef.current ?? factionId;
      if (!fid || fid !== expectedFid) return;
      const all = chars ?? characters ?? [];
      setAllCharacters(all);

      // If we're waiting for a specific character
      if (pendingCharIdRef.current) {
        const found = all.find((c: any) => c.id === pendingCharIdRef.current);
        if (found) {
          setCharacter(found);
          setFactionId(fid);   // ensure state is in sync
          setIsOpen(true);
          pendingCharIdRef.current    = null;
          pendingFactionIdRef.current = null;
        }
      } else if (character) {
        // Refresh character data if the modal is already open
        const refreshed = all.find((c: any) => c.id === character.id);
        if (refreshed) setCharacter(refreshed);
      }
    };

    window.addEventListener('game:characterUpdate', handleCharUpdate);
    return () => window.removeEventListener('game:characterUpdate', handleCharUpdate);
  }, [factionId, character]);

  useEffect(() => {
    const handleFleetUpdate = (e: any) => {
      const { fleets: f = [], playerFactionId } = e.detail ?? {};
      const expectedFid = sessionFactionIdRef.current ?? factionId;
      if (!expectedFid || playerFactionId !== expectedFid) return;
      setFleets(f);
    };
    window.addEventListener('galaxy:fleetUpdate', handleFleetUpdate);
    return () => window.removeEventListener('galaxy:fleetUpdate', handleFleetUpdate);
  }, [factionId]);

  useEffect(() => {
    const handleConstructionUpdate = (e: any) => {
      const { systems = {} } = e.detail ?? {};
      setConstructionSystems(systems);
    };
    window.addEventListener('galaxy:constructionUpdate', handleConstructionUpdate);
    return () => window.removeEventListener('galaxy:constructionUpdate', handleConstructionUpdate);
  }, []);

  useEffect(() => {
    const handleMissionUpdate = (e: any) => {
      const { missionTypes: types = [], factionId: fid } = e.detail ?? {};
      const expectedFid = sessionFactionIdRef.current ?? factionId;
      if (fid && fid !== expectedFid) return;
      setMissionTypes(types);
    };
    window.addEventListener('game:missionUpdate', handleMissionUpdate);
    return () => window.removeEventListener('game:missionUpdate', handleMissionUpdate);
  }, [factionId]);

  useEffect(() => {
    const handleGalaxySystems = (e: any) => {
      setGalaxySystems(e.detail?.systems ?? []);
    };
    window.addEventListener('game:galaxySystems', handleGalaxySystems);
    return () => window.removeEventListener('game:galaxySystems', handleGalaxySystems);
  }, []);

  // ─── Assignment result handler ────────────────────────────────────────────────

  useEffect(() => {
    const handleResult = (e: any) => {
      const { success, error, factionId: fid } = e.detail ?? {};
      if (fid !== factionId) return;
      if (success) {
        setSuccessMsg('Assignment staged successfully.');
        setErrorMsg('');
        setTimeout(() => setIsOpen(false), 800);
      } else {
        setErrorMsg(error ?? 'Assignment failed.');
        setSuccessMsg('');
      }
    };
    window.addEventListener('game:assignCharacterResult', handleResult);
    return () => window.removeEventListener('game:assignCharacterResult', handleResult);
  }, [factionId]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setErrorMsg('');
    setSuccessMsg('');
    sessionFactionIdRef.current = null;
  }, []);

  // ─── Action dispatchers ───────────────────────────────────────────────────────

  const dispatchAssignment = useCallback((assignmentType: any, targetId: any, targetSystemId: any, facilityType: any) => {
    setErrorMsg('');
    window.dispatchEvent(new CustomEvent('game:assignCharacter', {
      detail: {
        factionId,
        characterId:    character?.id,
        assignmentType,
        targetId:       targetId       ?? null,
        targetSystemId: targetSystemId ?? null,
        facilityType:   facilityType   ?? null
      }
    }));
  }, [factionId, character]);

  const handleAssignFleet = useCallback((fleetId: any) => {
    dispatchAssignment('fleet', fleetId, null, null);
  }, [dispatchAssignment]);

  const handleAssignFacility = useCallback((systemId: any, facilityTypeId: any) => {
    dispatchAssignment('facility', null, systemId, facilityTypeId);
  }, [dispatchAssignment]);

  const handleUnassign = useCallback(() => {
    dispatchAssignment('unassign', null, null, null);
  }, [dispatchAssignment]);

  const handleStageMission = useCallback(() => {
    if (!selectedMissionType || !missionTargetId) {
      setErrorMsg('Select a mission type and a target system.');
      return;
    }
    const typeDef = missionTypes.find(t => t.id === selectedMissionType);
    window.dispatchEvent(new CustomEvent('game:stageMission', {
      detail: {
        factionId,
        missionType:  selectedMissionType,
        characterIds: [character.id],
        targetId:     missionTargetId,
        targetType:   typeDef?.targetType ?? 'system',
        tier:         typeDef?.tier       ?? 'support'
      }
    }));
    // Listen for result on stageMissionResult
  }, [factionId, character, selectedMissionType, missionTargetId, missionTypes]);

  useEffect(() => {
    const handleMissionResult = (e: any) => {
      const { success, error, factionId: fid } = e.detail ?? {};
      if (fid !== factionId) return;
      if (success) {
        setSuccessMsg('Mission staged.');
        setErrorMsg('');
        window.dispatchEvent(new CustomEvent('galaxy:missionSubmitted'));
        setTimeout(() => setIsOpen(false), 800);
      } else {
        setErrorMsg(error ?? 'Failed to stage mission.');
      }
    };
    window.addEventListener('game:stageMissionResult', handleMissionResult);
    return () => window.removeEventListener('game:stageMissionResult', handleMissionResult);
  }, [factionId]);

  if (!isOpen || !character) return null;

  // ─── Derived data ─────────────────────────────────────────────────────────────

  const charSysId = character.locationSystemId;

  // Fleets with open commander slot
  const playerFleets = fleets.filter(f => f.factionId === factionId || !f.factionId);
  const availableFleets = playerFleets.filter(f => !f.commanderId);
  const commandedFleets = playerFleets.filter(f => f.commanderId);

  // Facilities at the character's current system that accept a stationed character
  const sysConstructionState = charSysId ? constructionSystems[charSysId] : null;
  const sysFacilities = sysConstructionState?.facilities ?? [];
  const assignableFacilities = sysFacilities.filter((f: any) => ASSIGNABLE_FACILITIES[f.facilityId]);
  const facilityOccupied = (systemId: any, facilityTypeId: any) => {
    return allCharacters.some(
      c => c.status === 'stationed'
        && c.assignedFacility?.systemId === systemId
        && c.assignedFacility?.facilityType === facilityTypeId
    );
  };

  // Mission types available for this faction
  const availableMissions = missionTypes.filter((t: any) => {
    if (t.factionRestrictions?.length > 0 && !t.factionRestrictions.includes(factionId)) return false;
    return true;
  });

  // System target options for mission tab
  const missionTargetSystems = galaxySystems.filter((s: any) => s.id !== charSysId);

  const isUnassignable = character.status === 'stationed' || character.status === 'in-fleet';
  const isAvailable    = character.status === 'available' || character.status === 'stationed';

  return (
    <div className="assign-modal-backdrop" onClick={handleClose}>
      <div className="assign-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="assign-modal-header">
          <div className="assign-modal-title">
            <AssignPortrait portrait={character.portrait} name={character.name} />
            <div>
              <span className="assign-modal-name">{character.name}</span>
              <span className="assign-modal-status">
                {character.status.replace('-', '\u00A0')}
                {charSysId ? ` \u00B7 ${charSysId}` : ''}
              </span>
            </div>
          </div>
          <button className="assign-modal-close" onClick={handleClose}>{'✕'}</button>
        </div>

        {/* Tabs */}
        <div className="assign-modal-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`assign-modal-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setErrorMsg(''); setSuccessMsg(''); }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {errorMsg   && <div className="assign-modal-error">{errorMsg}</div>}
        {successMsg && <div className="assign-modal-success">{successMsg}</div>}

        {/* Tab body */}
        <div className="assign-modal-body">

          {/* ── Fleet tab ── */}
          {activeTab === 'fleet' && (
            <div className="assign-tab-content">
              {!isAvailable ? (
                <p className="assign-tab-hint">
                  {character.name} must be Available or Stationed to command a fleet.
                  Current status: <strong>{character.status}</strong>.
                </p>
              ) : (
                <>
                  <p className="assign-tab-hint">
                    Leadership {character.stats?.leadership ?? 0} grants{' '}
                    <strong>{leadershipBonus(character)}</strong> to the fleet.
                    Only fleets without a current commander are shown.
                  </p>
                  {availableFleets.length === 0 && (
                    <div className="assign-empty">No fleets with an open commander slot.</div>
                  )}
                  {availableFleets.map(fleet => (
                    <div key={fleet.id} className="assign-row assign-row--fleet">
                      <div className="assign-row-info">
                        <span className="assign-row-name">{fleet.name ?? fleet.id}</span>
                        <span className="assign-row-sub">
                          {fleet.currentSystemId ?? 'In transit'} &middot; {fleet.ships?.length ?? 0} ships
                        </span>
                      </div>
                      <button
                        className="assign-btn assign-btn--primary"
                        onClick={() => handleAssignFleet(fleet.id)}
                      >
                        Assign
                      </button>
                    </div>
                  ))}
                  {commandedFleets.length > 0 && (
                    <div className="assign-section-label">
                      Fleets already commanded
                    </div>
                  )}
                  {commandedFleets.map(fleet => (
                    <div key={fleet.id} className="assign-row assign-row--fleet assign-row--disabled">
                      <div className="assign-row-info">
                        <span className="assign-row-name">{fleet.name ?? fleet.id}</span>
                        <span className="assign-row-sub">Commander: {fleet.commanderId}</span>
                      </div>
                      <span className="assign-row-tag">Taken</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Facility tab ── */}
          {activeTab === 'facility' && (
            <div className="assign-tab-content">
              {!isAvailable ? (
                <p className="assign-tab-hint">
                  Character must be Available to staff a facility. Current status: <strong>{character.status}</strong>.
                </p>
              ) : !charSysId ? (
                <p className="assign-tab-hint">Character has no known location — cannot assign to a facility.</p>
              ) : assignableFacilities.length === 0 ? (
                <div className="assign-empty">
                  No staffable facilities at <strong>{charSysId}</strong>.
                  Build a Research Facility, Training Facility, or Shipyard here first.
                </div>
              ) : (
                <>
                  <p className="assign-tab-hint">
                    Facilities at <strong>{sysConstructionState?.name ?? charSysId}</strong>:
                  </p>
                  {assignableFacilities.map((fac: any) => {
                    const def      = ASSIGNABLE_FACILITIES[fac.facilityId];
                    const occupied = facilityOccupied(charSysId, fac.facilityId);
                    const preview  = bonusPreview(character, fac.facilityId);
                    return (
                      <div
                        key={fac.id}
                        className={`assign-row assign-row--facility${occupied ? ' assign-row--disabled' : ''}`}
                      >
                        <div className="assign-row-info">
                          <span className="assign-row-name">{def.label}</span>
                          <span className="assign-row-sub">{preview}</span>
                        </div>
                        {occupied ? (
                          <span className="assign-row-tag">Staffed</span>
                        ) : (
                          <button
                            className="assign-btn assign-btn--primary"
                            onClick={() => handleAssignFacility(charSysId, fac.facilityId)}
                          >
                            Station
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── Mission tab ── */}
          {activeTab === 'mission' && (
            <div className="assign-tab-content">
              {!isAvailable ? (
                <p className="assign-tab-hint">
                  Character must be Available or Stationed to go on a mission.
                  Current status: <strong>{character.status}</strong>.
                </p>
              ) : (
                <>
                  <p className="assign-tab-hint">
                    Select a mission type and target. {character.name} will be assigned as the operative.
                  </p>
                  <div className="assign-section-label">Mission Type</div>
                  <div className="assign-mission-grid">
                    {availableMissions.map((m: any) => (
                      <button
                        key={m.id}
                        className={`assign-mission-type-btn${selectedMissionType === m.id ? ' active' : ''}`}
                        style={({ '--tier-color': TIER_COLORS[m.tier] ?? '#8b949e' } as any)}
                        onClick={() => setSelectedMissionType(m.id)}
                      >
                        <span className="assign-mission-name">{m.name}</span>
                        <span className="assign-mission-tier" style={{ color: TIER_COLORS[m.tier] }}>{m.tier}</span>
                      </button>
                    ))}
                  </div>

                  {selectedMissionType && (
                    <>
                      <div className="assign-section-label">Target System</div>
                      <select
                        className="assign-select"
                        value={missionTargetId}
                        onChange={(e: any) => setMissionTargetId(e.target.value)}
                      >
                        <option value="">— Select a system —</option>
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          for (const s of missionTargetSystems) {
                            const key = s.loyalty ?? 'neutral';
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(s);
                          }
                          const order = ['brandAuthority', 'union', 'autoforge', 'neutral'];
                          const sorted = [
                            ...order.filter(k => groups[k]),
                            ...Object.keys(groups).filter(k => !order.includes(k))
                          ];
                          return sorted.map(faction => (
                            <optgroup key={faction} label={FACTION_DISPLAY_NAMES[faction] ?? faction}>
                              {groups[faction].map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
                              ))}
                            </optgroup>
                          ));
                        })()}
                      </select>
                      <button
                        className="assign-btn assign-btn--primary assign-btn--wide"
                        onClick={handleStageMission}
                        disabled={!missionTargetId}
                      >
                        Stage Mission
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Unassign tab ── */}
          {activeTab === 'unassign' && (
            <div className="assign-tab-content">
              {!isUnassignable ? (
                <div className="assign-empty">
                  {character.name} is not currently assigned to a fleet or facility.
                  {character.status === 'on-mission' && ' Missions cannot be cancelled here — use the Missions panel.'}
                </div>
              ) : (
                <>
                  <p className="assign-tab-hint">
                    Unassigning returns {character.name} to Available status.
                    <br />
                    Current assignment:
                    {character.status === 'in-fleet'   && ` Fleet commander of ${character.assignedFleetId ?? 'a fleet'}`}
                    {character.status === 'stationed'  && ` Stationed at ${character.assignedFacility?.systemId ?? '?'} (${character.assignedFacility?.facilityType ?? '?'})`}
                  </p>
                  <button
                    className="assign-btn assign-btn--danger assign-btn--wide"
                    onClick={handleUnassign}
                  >
                    Unassign {character.name}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

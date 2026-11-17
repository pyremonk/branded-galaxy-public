import React, { useState, useEffect, useRef } from 'react';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration } from '../utils/time-format.js';
import { portraitSrc, handlePortraitError } from '../utils/portrait.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER_COLORS = {
  support:   '#58a6ff',
  offensive: '#f85149',
  recon:     '#d2a8ff',
  defensive: '#3fb950',
};

const STAT_LABELS = {
  combat:     'Combat',
  espionage:  'Espionage',
  diplomacy:  'Diplomacy',
  leadership: 'Leadership',
  research:   'Research',
};

// ─── CharacterStatPreview ─────────────────────────────────────────────────────

function CharacterStatPreview({ character, missionType }: any) {
  if (!character) return null;
  const portrait    = character.portrait;
  const primaryStat = missionType?.primaryStat;

  return (
    <div className="sysdet-mission-stat-preview">
      {portrait?.endsWith('.png') && (
        <img
          src={portraitSrc(portrait)}
          onError={handlePortraitError}
          alt={character.name}
          className="sysdet-mission-portrait"
        />
      )}
      <div className="sysdet-mission-stat-rows">
        <div className="sysdet-mission-char-name">
          {character.name}
          <span className="sysdet-muted"> Lv{character.level}</span>
        </div>
        {Object.entries(STAT_LABELS).map(([key, label]) => (
          <div
            key={key}
            className={`sysdet-mission-stat-row${key === primaryStat ? ' sysdet-mission-stat-row--primary' : ''}`}
          >
            <span className="sysdet-mission-stat-label">{label}</span>
            <span className="sysdet-mission-stat-value">{character.stats?.[key] ?? 0}</span>
          </div>
        ))}
        {character.specializations?.length > 0 && (
          <div className="sysdet-mission-specs">
            {character.specializations.map((s: any) => (
              <span key={s} className="sysdet-mission-spec-badge">
                {s.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SystemOverviewMissions ───────────────────────────────────────────────────

export default function SystemOverviewMissions({ sys, playerFactionId, isOwnSystem }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [expanded,    setExpanded]    = useState<boolean>(true);
  const [missionData, setMissionData] = useState<any>({ staged: [], active: [], missionTypes: [] });
  const [characters,  setCharacters]  = useState<any[]>([]);
  const [selectedType,   setSelectedType]   = useState<any>(null);
  const [selectedCharId, setSelectedCharId] = useState('');
  const [feedback,    setFeedback]    = useState<any>(null); // { ok, msg }

  // useRef so handlers can read factionId synchronously (Phaser events fire synchronously)
  const sessionFactionIdRef = useRef<any>(null);

  const systemId     = sys.id;
  const loyaltyValue = sys.loyaltyValue ?? 0;

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!playerFactionId) return;

    // Set ref BEFORE dispatching — synchronous Phaser responses fire during dispatch
    sessionFactionIdRef.current = playerFactionId;

    const onMissionUpdate = (e: any) => {
      const expected = sessionFactionIdRef.current ?? playerFactionId;
      if (e.detail?.factionId !== expected) return;
      const { staged = [], active = [], missionTypes = [] } = e.detail;
      // Filter to missions targeting this system only
      const stagedHere = staged.filter((a: any) => a.payload?.targetId === systemId);
      const activeHere = active.filter((m: any) => m.targetId === systemId);
      setMissionData({ staged: stagedHere, active: activeHere, missionTypes });
    };

    const onCharUpdate = (e: any) => {
      const expected = sessionFactionIdRef.current ?? playerFactionId;
      if (e.detail?.factionId !== expected) return;
      const assignable = (e.detail.allCharacters ?? []).filter(
        (c: any) => c.status === 'available' || c.status === 'stationed'
      );
      setCharacters(assignable);
    };

    const onStageResult = (e: any) => {
      if (e.detail?.success) {
        setFeedback({ ok: true, msg: 'Mission staged \u2014 will resolve at end of turn.' });
        setSelectedType(null);
        setSelectedCharId('');
        window.dispatchEvent(new CustomEvent('galaxy:missionSubmitted'));
      } else {
        setFeedback({ ok: false, msg: e.detail?.error ?? 'Could not stage mission.' });
      }
      // Refresh state after staging attempt
      window.dispatchEvent(new CustomEvent('game:requestMissionUpdate',  { detail: { factionId: playerFactionId } }));
      window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', { detail: { factionId: playerFactionId } }));
    };

    const onCancelResult = (e: any) => {
      if (e.detail?.success) {
        setFeedback({ ok: true, msg: 'Mission cancelled.' });
      } else {
        setFeedback({ ok: false, msg: e.detail?.error ?? 'Could not cancel mission.' });
      }
      // Refresh after cancel
      window.dispatchEvent(new CustomEvent('game:requestMissionUpdate',  { detail: { factionId: playerFactionId } }));
      window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', { detail: { factionId: playerFactionId } }));
    };

    // Register listeners BEFORE dispatching (Phaser responds synchronously)
    window.addEventListener('game:missionUpdate',       onMissionUpdate);
    window.addEventListener('game:characterUpdate',     onCharUpdate);
    window.addEventListener('game:stageMissionResult',  onStageResult);
    window.addEventListener('game:cancelMissionResult', onCancelResult);

    window.dispatchEvent(new CustomEvent('game:requestMissionUpdate',  { detail: { factionId: playerFactionId } }));
    window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', { detail: { factionId: playerFactionId } }));

    return () => {
      window.removeEventListener('game:missionUpdate',       onMissionUpdate);
      window.removeEventListener('game:characterUpdate',     onCharUpdate);
      window.removeEventListener('game:stageMissionResult',  onStageResult);
      window.removeEventListener('game:cancelMissionResult', onCancelResult);
    };
  }, [systemId, playerFactionId]);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Filter mission types to those valid for this system
  const filteredTypes = missionData.missionTypes.filter((mt: any) => {
    if (mt.targetType !== 'system') return false;
    // research-assist and any ownFactionOnly missions require own system
    if (mt.ownFactionOnly && !isOwnSystem) return false;
    // incite-uprising has no place on your own system, or when enemy loyalty is already high
    if (mt.id === 'incite-uprising' && isOwnSystem) return false;
    if (mt.id === 'incite-uprising' && loyaltyValue >= 50) return false;
    return true;
  });

  const selectedMissionType = filteredTypes.find((t: any) => t.id === selectedType) ?? null;
  const selectedChar        = characters.find((c: any) => c.id === selectedCharId) ?? null;
  const hasCurrent          = missionData.staged.length > 0 || missionData.active.length > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStage = () => {
    if (!selectedType || !selectedCharId) return;
    setFeedback(null);
    window.dispatchEvent(new CustomEvent('game:stageMission', {
      detail: {
        factionId:   playerFactionId,
        missionType: selectedType,
        characterIds: [selectedCharId],
        targetId:    systemId,
        targetType:  'system',
        tier:        selectedMissionType?.tier ?? 'support',
      },
    }));
  };

  const handleCancelStaged = (actionId: any) => {
    setFeedback(null);
    window.dispatchEvent(new CustomEvent('game:cancelMission', { detail: { actionId } }));
  };

  const handleSelectType = (typeId: any) => {
    setSelectedType((prev: any) => (prev === typeId ? null : typeId));
    setSelectedCharId('');
    setFeedback(null);
  };

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
          Missions {hasCurrent ? `(${missionData.staged.length + missionData.active.length} active)` : ''}
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

          {/* Current missions targeting this system */}
          {hasCurrent && (
            <div className="sysdet-mission-current">
              {missionData.staged.map((a: any) => {
                const typeCfg = missionData.missionTypes.find((t: any) => t.id === a.payload?.missionType);
                const char    = characters.find((c: any) => c.id === a.payload?.characterIds?.[0]);
                return (
                  <div key={a.id} className="sysdet-mission-row sysdet-mission-row--staged">
                    <div className="sysdet-mission-row-info">
                      <span
                        className="sysdet-mission-tier-dot"
                        style={{ background: (TIER_COLORS as Record<string, string>)[typeCfg?.tier] ?? '#8b949e' }}
                      />
                      <span className="sysdet-mission-row-name">{typeCfg?.name ?? a.payload?.missionType}</span>
                      {char && (
                        <span className="sysdet-muted sysdet-mission-row-char">&mdash; {char.name}</span>
                      )}
                      <span className="sysdet-mission-status-badge sysdet-mission-status-badge--staged">Staged</span>
                    </div>
                    <button
                      className="sysdet-mission-cancel-btn"
                      onClick={() => handleCancelStaged(a.id)}
                      title="Cancel this staged mission"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
              {missionData.active.map((m: any) => {
                const typeCfg = missionData.missionTypes.find((t: any) => t.id === m.missionType);
                return (
                  <div key={m.missionId} className="sysdet-mission-row sysdet-mission-row--active">
                    <div className="sysdet-mission-row-info">
                      <span
                        className="sysdet-mission-tier-dot"
                        style={{ background: (TIER_COLORS as Record<string, string>)[typeCfg?.tier] ?? '#8b949e' }}
                      />
                      <span className="sysdet-mission-row-name">{typeCfg?.name ?? m.missionType}</span>
                      <span className="sysdet-muted sysdet-mission-row-char">
                        &mdash; {formatDuration(m.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)} left
                      </span>
                      <span className="sysdet-mission-status-badge sysdet-mission-status-badge--active">Active</span>
                    </div>
                    <span className="sysdet-muted" style={{ fontSize: 10 }}>In progress</span>
                  </div>
                );
              })}
            <hr className="sysdet-section-divider" />
            </div>
          )}

          {/* Assignment form — mission type selector */}
          {filteredTypes.length === 0 ? (
            <div className="info-empty-state" style={{ padding: '8px 0' }}>
              <span className="info-empty-msg">No missions available for this system.</span>
            </div>
          ) : (
            <>
              <div className="sysdet-mission-type-grid">
                {filteredTypes.map((mt: any) => (
                  <button
                    key={mt.id}
                    className={`sysdet-mission-type-btn${selectedType === mt.id ? ' sysdet-mission-type-btn--selected' : ''}`}
                    style={({ '--tier-color': (TIER_COLORS as Record<string, string>)[mt.tier] ?? '#8b949e' } as any)}
                    onClick={() => handleSelectType(mt.id)}
                    title={mt.description ?? mt.name}
                  >
                    <span
                      className="sysdet-mission-type-tier"
                      style={{ color: (TIER_COLORS as Record<string, string>)[mt.tier] ?? '#8b949e' }}
                    >
                      {mt.tier}
                    </span>
                    <span className="sysdet-mission-type-name">{mt.name}</span>
                  </button>
                ))}
              </div>

              {/* Character selection + stat preview */}
              {selectedMissionType && (
                <div className="sysdet-mission-assign">
                  <div className="sysdet-mission-assign-row">
                    <div className="sysdet-mission-char-select-wrap">
                      <label className="sysdet-mission-label">Character</label>
                      <select
                        className="sysdet-mission-select"
                        value={selectedCharId}
                        onChange={(e: any) => setSelectedCharId(e.target.value)}
                      >
                        <option value="">— select character —</option>
                        {characters.length === 0 && (
                          <option disabled>No available characters</option>
                        )}
                        {characters.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Lv{c.level}) &mdash;&nbsp;
                            {(STAT_LABELS as Record<string, string>)[selectedMissionType.primaryStat]}: {c.stats?.[selectedMissionType.primaryStat] ?? 0}
                          </option>
                        ))}
                      </select>
                      <button
                        className="sysdet-mission-confirm-btn"
                        disabled={!selectedCharId}
                        onClick={handleStage}
                      >
                        Assign Mission
                      </button>
                    </div>
                    <CharacterStatPreview character={selectedChar} missionType={selectedMissionType} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CharacterRosterPanel — Full character roster UI.
 * Shows all faction characters grouped by status with detail view.
 *
 * Spec: 009-character-roster-spec.md (FR-CR-009), 012-character-capture-rescue-spec.md (FR-CCR-009)
 */
import { useState, useEffect, useCallback } from 'react';
import { InfoPanelFrame } from './InfoPanelFrame';
import characterDefs from '../../core/character-definitions.json';
import './CharacterRosterPanel.css';
import { portraitSrc, handlePortraitError } from '../utils/portrait.js';

import { UI_ICONS, FACILITY_ICONS } from '../icons.js';

// Build a portrait lookup keyed by character ID so saved states with stale
// portraits are always overridden by the current definition value.
const PORTRAIT_BY_ID: Record<string, any> = {};
for (const roster of (Object.values(characterDefs.startingRosters ?? {}) as any[])) {
  for (const char of (roster as any[])) {
    PORTRAIT_BY_ID[char.id] = char.portrait;
  }
}
const getPortrait = (character: any) => PORTRAIT_BY_ID[character.id] ?? character.portrait ?? '\u25A1';

// Render a PNG portrait as <img> or fall back to the text-glyph <span>.
const isImgPortrait = (p: any) => typeof p === 'string' && p.endsWith('.png');
function PortraitIcon({ portrait, name, className }: any) {
  if (isImgPortrait(portrait)) {
    return (
      <img
        src={portraitSrc(portrait)}
        onError={handlePortraitError}
        alt={name}
        className={`${className} char-portrait-img`}
      />
    );
  }
  return <span className={className}>{portrait}</span>;
}

const STATUS_TABS = [
  { id: 'available',  label: 'Available'  },
  { id: 'on-mission', label: 'On Mission' },
  { id: 'in-fleet',   label: 'In Fleet'   },
  { id: 'stationed',  label: 'Stationed'  },
  { id: 'captured',   label: 'Captured'   },
  { id: 'archive',    label: 'Archive'    },
];

const STATUS_COLORS: Record<string, string> = {
  'available':  '#3fb950',
  'on-mission': '#f0883e',
  'in-fleet':   '#58a6ff',
  'stationed':  '#a371f7',
  'captured':   '#f85149',
  'dead':       '#484f58',
};

const STAT_LABELS: Record<string, string> = {
  combat:     'COM',
  espionage:  'ESP',
  diplomacy:  'DIP',
  leadership: 'LDR',
  research:   'RES',
};

function StatBar({ label, value, max = 10 }: any) {
  return (
    <div className="char-stat-row">
      <span className="char-stat-label">{label}</span>
      <div className="info-bar-track char-stat-track">
        <div
          className="info-bar-fill"
          style={{ width: `${(value / max) * 100}%`, background: _statColor(value) }}
        />
      </div>
      <span className="char-stat-value">{value}</span>
    </div>
  );
}

function _statColor(value: any) {
  if (value >= 8) return '#3fb950';
  if (value >= 5) return '#58a6ff';
  if (value >= 3) return '#f0883e';
  return '#f85149';
}

function XPBar({ xp, level }: any) {
  const threshold = level * 100;
  const pct = Math.min(100, (xp / threshold) * 100);
  return (
    <div className="char-xp-row">
      <span className="char-stat-label">XP</span>
      <div className="info-bar-track char-stat-track">
        <div className="info-bar-fill" style={{ width: `${pct}%`, background: '#e3b341' }} />
      </div>
      <span className="char-stat-value">{xp}/{threshold}</span>
    </div>
  );
}

function SpecTag({ tag }: any) {
  return <span className="char-spec-tag">{tag}</span>;
}

function CharacterCard({ character, onClick, isSelected, systemNames = {} }: any) {
  const statusColor = STATUS_COLORS[character.status] ?? '#8b949e';
  const isCaptured = character.status === 'captured';
  const isOnCIDuty = character.status === 'stationed'
    && character.assignedFacility?.facilityType === 'ci-duty';

  return (
    <button
      className={`char-card${isSelected ? ' char-card--selected' : ''}${isCaptured ? ' char-card--captured' : ''}`}
      onClick={() => onClick(character)}
    >
      <div className="char-card-portrait">
        <PortraitIcon portrait={getPortrait(character)} name={character.name} className="char-portrait-icon" />
        {isCaptured && <span className="char-captured-badge">{UI_ICONS.warning}</span>}
        {isOnCIDuty && <span className="char-ci-duty-badge">{FACILITY_ICONS.shield}</span>}
      </div>
      <div className="char-card-info">
        <div className="char-card-header">
          <span className="char-card-name">{character.name}</span>
          <span className="char-level-badge">Lv{character.level}</span>
        </div>
        <div className="char-card-meta">
          <span className="char-status-dot" style={{ color: statusColor }}>{UI_ICONS.statusDot}</span>
          <span className="char-status-label" style={{ color: statusColor }}>
            {isCaptured ? 'CAPTURED' : character.status.replace('-', ' ').toUpperCase()}
          </span>
          {character.locationSystemId && (
            <span className="char-location">{systemNames[character.locationSystemId] ?? character.locationSystemId}</span>
          )}
        </div>
        <div className="char-card-specs">
          {character.specializations.map((s: any) => <SpecTag key={s} tag={s} />)}
        </div>
      </div>
    </button>
  );
}

function CharacterDetail({ character, onClose, factionId, systemNames = {} }: any) {
  const isCaptured = character.status === 'captured';
  const isDead = character.status === 'dead';
  const statusColor = STATUS_COLORS[character.status] ?? '#8b949e';
  const isOnCIDuty = character.status === 'stationed'
    && character.assignedFacility?.facilityType === 'ci-duty';
  const canAssignCI = (character.status === 'available' || character.status === 'stationed')
    && !isDead && !isCaptured
    && (character.stats?.espionage ?? 0) >= 6;

  const handleInitiateRescue = useCallback(() => {
    window.dispatchEvent(new CustomEvent('galaxy:notify', {
      detail: {
        tier: 'info',
        message: `Rescue mission for ${character.name} — assign a character via the mission panel.`,
        locationId: character.locationSystemId
      }
    }));
    onClose();
  }, [character, onClose]);

  const handleAssignCIDuty = useCallback(() => {
    const systemId = character.locationSystemId;
    if (!systemId) {
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'warning', message: `${character.name} must be at a system to be assigned CI Duty.` }
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('game:assignCIDuty', {
      detail: { factionId, characterId: character.id, systemId }
    }));
    onClose();
  }, [character, factionId, onClose]);

  const handleCancelCIDuty = useCallback(() => {
    window.dispatchEvent(new CustomEvent('game:cancelCIDuty', {
      detail: { factionId, characterId: character.id }
    }));
    onClose();
  }, [character, factionId, onClose]);

  return (
    <div className="char-detail-overlay">
      <div className="char-detail-panel">
        <div className="char-detail-header">
          <div className="char-detail-portrait-wrap">
            <PortraitIcon portrait={getPortrait(character)} name={character.name} className="char-detail-portrait" />
            {isCaptured && <span className="char-detail-captured-badge">CAPTURED</span>}
          </div>
          <div className="char-detail-titles">
            <span className="char-detail-name">{character.name}</span>
            <div className="char-detail-meta">
              <span className="char-level-badge">Level {character.level}</span>
              <span className="char-status-dot" style={{ color: statusColor }}>{UI_ICONS.statusDot}</span>
              <span style={{ color: statusColor, fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                {character.status.replace('-', ' ')}
              </span>
            </div>
            {character.faction && (
              <span className="char-faction-label">{character.faction}</span>
            )}
          </div>
          <button className="info-panel-close" onClick={onClose}>{UI_ICONS.cancel}</button>
        </div>

        {character.background && (
          <div className="char-detail-section">
            <div className="info-panel-section-title">Background</div>
            <p className="char-background">{character.background}</p>
          </div>
        )}

        <div className="char-detail-section">
          <div className="info-panel-section-title">Experience</div>
          <XPBar xp={character.xp} level={character.level} />
        </div>

        <div className="char-detail-section">
          <div className="info-panel-section-title">Stats</div>
          {Object.entries(character.stats).map(([stat, val]) => (
            <StatBar key={stat} label={STAT_LABELS[stat] ?? stat} value={val} />
          ))}
        </div>

        {character.specializations.length > 0 && (
          <div className="char-detail-section">
            <div className="info-panel-section-title">Specializations</div>
            <div className="char-specs-list">
              {character.specializations.map((s: any) => <SpecTag key={s} tag={s} />)}
            </div>
          </div>
        )}

        {isCaptured && (
          <div className="char-detail-section char-detail-captured-section">
            <div className="info-panel-section-title" style={{ color: '#f85149' }}>Prisoner Status</div>
            <div className="info-row">
              <span className="info-row-label">Held by:</span>
              <span className="info-row-value" style={{ color: '#f85149' }}>{character.capturingFactionId ?? 'Unknown'}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">Location:</span>
              <span className="info-row-value">{systemNames[character.locationSystemId] ?? character.locationSystemId ?? 'Unknown'}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">Turns held:</span>
              <span className="info-row-value">{character.turnsInCaptivity ?? 0}</span>
            </div>
            <button className="char-rescue-btn" onClick={handleInitiateRescue}>
              {UI_ICONS.rescue}{' '}Initiate Rescue
            </button>
          </div>
        )}

        {isDead && (
          <div className="char-detail-section">
            <div className="info-panel-section-title" style={{ color: '#484f58' }}>Deceased</div>
            <p className="char-background" style={{ color: '#484f58' }}>
              This character has been lost permanently.
            </p>
          </div>
        )}

        {/* CI Duty assignment (FR-CI-007) */}
        {!isCaptured && !isDead && (
          <div className="char-detail-section">
            <div className="info-panel-section-title">Counter-Intelligence</div>
            {isOnCIDuty ? (
              <div>
                <div className="info-row">
                  <span className="info-row-label">Status:</span>
                  <span className="info-row-value" style={{ color: '#a371f7' }}>{FACILITY_ICONS.shield}{' '}On CI Duty</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">System:</span>
                  <span className="info-row-value">{systemNames[character.assignedFacility?.systemId] ?? character.assignedFacility?.systemId ?? '\u2014'}</span>
                </div>
                <button className="char-rescue-btn" style={{ marginTop: 8, borderColor: '#a371f7', color: '#a371f7' }} onClick={handleCancelCIDuty}>
                  Cancel CI Duty
                </button>
              </div>
            ) : canAssignCI ? (
              <div>
                <p className="char-background" style={{ fontSize: '11px', color: '#8b949e' }}>
                  Assign to CI Duty at their current system to raise counter-intelligence presence.
                  Requires Espionage ≥ 6.
                </p>
                <button className="char-rescue-btn" style={{ marginTop: 4, borderColor: '#a371f7', color: '#a371f7' }} onClick={handleAssignCIDuty}>
                  {FACILITY_ICONS.shield}{' '}Assign to CI Duty
                </button>
              </div>
            ) : (
              <p className="char-background" style={{ fontSize: '11px', color: '#484f58' }}>
                {character.stats?.espionage < 6
                  ? `Espionage ${character.stats?.espionage}/6 \u2014 not eligible for CI Duty`
                  : 'Not available for CI Duty'}
              </p>
            )}
          </div>
        )}

        {/* Character assignment — Mission / Fleet / Facility (spec 010 FR-CA-006) */}
        {!isCaptured && !isDead && (character.status === 'available' || character.status === 'stationed' || character.status === 'in-fleet') && (
          <div className="char-detail-section">
            <div className="info-panel-section-title">Assignment</div>
            {(character.status === 'available' || character.status === 'stationed') && (
              <button
                className="char-rescue-btn"
                style={{ borderColor: '#58a6ff', color: '#58a6ff' }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('game:openAssignmentModal', {
                    detail: { characterId: character.id, factionId }
                  }));
                  onClose();
                }}
              >
                {'→'} Assign to Fleet / Facility / Mission
              </button>
            )}
            {character.status === 'in-fleet' && (
              <>
                <p className="char-background" style={{ fontSize: '11px', color: '#8b949e' }}>
                  Fleet commander of {character.assignedFleetId ?? 'a fleet'}.
                </p>
                <button
                  className="char-rescue-btn"
                  style={{ marginTop: 4, borderColor: '#f0883e', color: '#f0883e' }}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('game:openAssignmentModal', {
                      detail: { characterId: character.id, factionId, initialTab: 'unassign' }
                    }));
                    onClose();
                  }}
                >
                  Manage Assignment
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CharacterRosterPanel({ onClose, playerFactionId }: any) {
  const [activeTab, setActiveTab]         = useState('available');
  const [characters, setCharacters]       = useState<any[]>([]);
  const [selectedChar, setSelectedChar]   = useState<any>(null);
  const [stagedAssignments, setStagedAssignments] = useState<any[]>([]);
  const [systemNames,  setSystemNames]    = useState({});

  // Subscribe to character updates from Phaser
  useEffect(() => {
    const factionId = playerFactionId ?? 'brandAuthority';

    const handler = (e: any) => {
      if (!e.detail?.factionId || e.detail.factionId !== factionId) return;
      const all = e.detail.allCharacters ?? e.detail.characters ?? [];
      setCharacters(all);
      if (e.detail.systemNames) setSystemNames(e.detail.systemNames);
    };

    window.addEventListener('game:characterUpdate', handler);

    // Request initial data
    window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', {
      detail: { factionId }
    }));

    return () => window.removeEventListener('game:characterUpdate', handler);
  }, [playerFactionId]);

  // Track staged character assignments for the pending summary
  useEffect(() => {
    const handleStaged = (e: any) => {
      const { success, actionId, characterName, assignmentType, targetId, targetSystemId, facilityType, factionId } = e.detail ?? {};
      if (!success || !actionId) return;
      if (factionId !== (playerFactionId ?? 'brandAuthority')) return;
      setStagedAssignments(prev => [
        ...prev,
        { actionId, characterName, assignmentType, targetId, targetSystemId, facilityType }
      ]);
    };
    const handleUnstaged = (e: any) => {
      const { success, actionId } = e.detail ?? {};
      if (!success || !actionId) return;
      setStagedAssignments(prev => prev.filter(a => a.actionId !== actionId));
    };
    const handleTurnUpdate = () => setStagedAssignments([]);

    window.addEventListener('game:stageCharacterAssignmentResult', handleStaged);
    window.addEventListener('game:unstageCharacterAssignmentResult', handleUnstaged);
    window.addEventListener('galaxy:turnUpdate', handleTurnUpdate);
    return () => {
      window.removeEventListener('game:stageCharacterAssignmentResult', handleStaged);
      window.removeEventListener('game:unstageCharacterAssignmentResult', handleUnstaged);
      window.removeEventListener('galaxy:turnUpdate', handleTurnUpdate);
    };
  }, [playerFactionId]);

  const tabCharacters = characters.filter(c => {
    if (activeTab === 'archive') return c.status === 'dead';
    return c.status === activeTab;
  });

  const totalActive = characters.filter(c => c.status !== 'dead').length;
  const capturedCount = characters.filter(c => c.status === 'captured').length;

  const subtitle = totalActive === 0
    ? 'No characters'
    : `${totalActive} active${capturedCount > 0 ? ` · ${capturedCount} captured` : ''}`;

  return (
    <>
      <InfoPanelFrame
        panelId="characters"
        title="Character Roster"
        subtitle={subtitle}
        onClose={onClose}
      >
        {/* Status tabs */}
        <div className="info-panel-tabs">
          {STATUS_TABS.map(({ id, label }) => {
            const count = id === 'archive'
              ? characters.filter(c => c.status === 'dead').length
              : characters.filter(c => c.status === id).length;
            return (
              <button
                key={id}
                className={`info-panel-tab${activeTab === id ? ' info-panel-tab--active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Character list */}
        <div className="char-list">
          {tabCharacters.length === 0 ? (
            <div className="info-panel-section">
              <div className="info-empty-state">
                <span className="info-empty-icon">
                  {activeTab === 'captured' ? UI_ICONS.warning : activeTab === 'archive' ? UI_ICONS.archive : UI_ICONS.emptyRoster}
                </span>
                <span className="info-empty-msg">
                  {activeTab === 'available' ? 'All characters are deployed' :
                   activeTab === 'captured'  ? 'No captured characters' :
                   activeTab === 'archive'   ? 'No fallen characters' :
                   `No characters ${activeTab.replace('-', ' ')}`}
                </span>
              </div>
            </div>
          ) : (
            tabCharacters.map(char => (
              <CharacterCard
                key={char.id}
                character={char}
                onClick={setSelectedChar}
                isSelected={selectedChar?.id === char.id}
                systemNames={systemNames}
              />
            ))
          )}
        </div>

        {/* Captured section summary */}
        {capturedCount > 0 && activeTab !== 'captured' && (
          <div className="char-captured-summary" onClick={() => setActiveTab('captured')}>
            <span className="char-captured-icon">{UI_ICONS.warning}</span>
            <span>{capturedCount} character{capturedCount > 1 ? 's' : ''} captured — click to view</span>
          </div>
        )}

        {/* Staged assignment pending summary (spec 010 FR-CA-006) */}
        {stagedAssignments.length > 0 && (
          <div className="char-staged-summary">
            <div className="char-staged-title">Pending Assignments ({stagedAssignments.length})</div>
            {stagedAssignments.map(a => (
              <div key={a.actionId} className="char-staged-row">
                <span className="char-staged-info">
                  <strong>{a.characterName}</strong>
                  {' \u2192 '}{a.assignmentType}
                  {a.assignmentType === 'fleet'    && a.targetId      && `: ${a.targetId}`}
                  {a.assignmentType === 'facility' && a.facilityType  && `: ${a.facilityType} @ ${a.targetSystemId ?? '?'}`}
                </span>
                <button
                  className="char-staged-unstage"
                  title="Unstage this assignment"
                  onClick={() => window.dispatchEvent(new CustomEvent('game:unstageCharacterAssignment', {
                    detail: { actionId: a.actionId, factionId: playerFactionId }
                  }))}
                >
                  {UI_ICONS.cancel}
                </button>
              </div>
            ))}
          </div>
        )}
      </InfoPanelFrame>

      {/* Character detail overlay */}
      {selectedChar && (
        <CharacterDetail
          character={selectedChar}
          factionId={playerFactionId}
          onClose={() => setSelectedChar(null)}
          systemNames={systemNames}
        />
      )}
    </>
  );
}

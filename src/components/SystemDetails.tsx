import React, { useState, useEffect } from 'react';
import { InfoPanelFrame } from './InfoPanelFrame';
import './SystemDetails.css';
import { RESOURCE_ICONS, SPECIAL_TYPE_ICONS, FACILITY_ICONS, UI_ICONS, SHIP_CLASS_ICONS } from '../icons.js';
import SystemOverviewMissions from './SystemOverviewMissions.jsx';
import SystemOverviewFleets from './SystemOverviewFleets.jsx';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDurationCompact, formatRateSuffix } from '../utils/time-format.js';
import constructionCfg from '../../core/construction-config.json';


// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FACTION_NAMES: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'The Autoforge',
  neutral:        'Neutral',
};

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#8b949e',
};

const SPECIAL_TYPE_NAMES: Record<string, string> = {
  manufacturingCenter: 'Manufacturing Center',
  researchFacility:    'Research Facility',
  tradeHub:            'Trade Hub',
  strategicChokepoint: 'Strategic Chokepoint',
  secretBase:          'Hidden Installation',
};

// SPECIAL_TYPE_ICONS imported from ../icons.js

const TABS = [
  { id: 'overview',    label: 'Overview'   },
  { id: 'resources',   label: 'Resources'  },
  { id: 'facilities',  label: 'Facilities' },
  { id: 'diplomacy',   label: 'Diplomacy'  },
  { id: 'intel',       label: 'Intel'      },
];

// â”€â”€â”€ Sub-panels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OverviewTab({ sys, factionColor, factionName, isOwnSystem, hasIntel, playerFactionId }: any) {
  const loyaltyValue = sys.loyaltyValue ?? 0;
  const isNeutral    = !sys.loyalty || sys.loyalty === 'neutral';
  const showLoyaltyDetail = isOwnSystem || hasIntel;

  const handleNavigate = (id: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:navigateTo', { detail: { systemId: id } }));
  };

  return (
    <>
      <div className="info-panel-section">
        <div className="info-panel-section-title">System</div>
        <div className="info-row">
          <span className="info-row-label">Sector</span>
          <span className="info-row-value sysdet-muted">{sys.sectorId}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">Population</span>
          <span className="info-row-value">
            {sys.population}
            <span className="sysdet-muted">/10</span>
          </span>
        </div>
        {sys.specialType && (
          <div className="info-row">
            <span className="info-row-label">Special</span>
            <span className="sysdet-badge" style={{ borderColor: '#58a6ff', color: '#58a6ff' }}>
              {(SPECIAL_TYPE_ICONS as Record<string, string>)[sys.specialType] ?? "★"}&nbsp;
              {SPECIAL_TYPE_NAMES[sys.specialType] ?? sys.specialType}
            </span>
          </div>
        )}
      </div>

      <div className="info-panel-section">
        <div className="info-panel-section-title">Control &amp; Loyalty</div>
        <div className="info-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="sysdet-faction-dot"
              style={{ background: factionColor }}
            />
            <span style={{ color: factionColor, fontFamily: 'monospace', fontSize: 13 }}>
              {factionName}
            </span>
            {!isNeutral && showLoyaltyDetail && (
              <span className="sysdet-loyalty-num" style={{ color: factionColor }}>
                {loyaltyValue}%
              </span>
            )}
            {!isNeutral && !showLoyaltyDetail && (
              <span className="sysdet-muted" style={{ fontSize: 11 }}>— (no intel)</span>
            )}
          </div>
          {!isNeutral && showLoyaltyDetail && (
            <div className="info-bar-track" style={{ width: '100%' }}>
              <div
                className="info-bar-fill"
                style={{
                  width: `${loyaltyValue}%`,
                  background: factionColor,
                  opacity: 0.75,
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="info-panel-section">
        <div className="info-panel-section-title">
          Hyperspace Routes ({sys.connections.length})
        </div>
        {sys.connections.length > 0 ? (
          <div className="sysdet-connections">
            {sys.connections.map(({ id, name }: any) => (
              <button
                key={id}
                className="sysdet-conn-tag"
                onClick={() => handleNavigate(id)}
                title={`Navigate to ${name}`}
              >
                {UI_ICONS.hyperspaceLane} {name}
              </button>
            ))}
          </div>
        ) : (
          <div className="info-empty-state" style={{ padding: '10px 0' }}>
            <span className="info-empty-msg">{UI_ICONS.warning} Orphaned system &#x2014; no hyperspace routes</span>
          </div>
        )}
      </div>

      {playerFactionId && (
        <>
          <SystemOverviewMissions
            sys={sys}
            playerFactionId={playerFactionId}
            isOwnSystem={isOwnSystem}
          />
          <SystemOverviewFleets
            sys={sys}
            playerFactionId={playerFactionId}
            isOwnSystem={isOwnSystem}
          />
        </>
      )}
    </>
  );
}

function ResourcesTab({ sys }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const lv         = sys.loyaltyValue ?? 75;
  const isNeutral  = !sys.loyalty || sys.loyalty === 'neutral';
  // Simulate loyalty-tier production modifier (mirrors resource-engine logic)
  const modifier   = isNeutral ? 0 : (lv >= 75 ? 1.0 : lv >= 50 ? 0.75 : lv >= 25 ? 0.5 : 0.25);

  const credits   = sys.resources?.credits   ?? 0;
  const materials = sys.resources?.materials ?? 0;

  const RESOURCES = [
    { key: 'credits',   label: 'Credits',   icon: RESOURCE_ICONS.credits,   base: credits,   color: '#f0883e' },
    { key: 'materials', label: 'Materials', icon: RESOURCE_ICONS.materials, base: materials, color: '#58a6ff' },
  ];

  return (
    <div className="info-panel-section">
      <div className="info-panel-section-title">Production per {formatRateSuffix(mode, ticksPerSecond, ticksPerTurn).slice(1)}</div>
      {RESOURCES.map(({ key, label, icon, base, color }) => {
        const effective = isNeutral ? 0 : Math.floor(base * modifier);
        return (
          <div key={key} className="sysdet-resource-row">
            <span className="sysdet-resource-icon">{icon}</span>
            <span className="sysdet-resource-label">{label}</span>
            <span className="sysdet-resource-value" style={{ color }}>
              +{effective}
              {!isNeutral && lv < 100 && (
                <span className="sysdet-resource-base"> (base {base})</span>
              )}
            </span>
          </div>
        );
      })}
      {isNeutral && (
        <p className="sysdet-note">
          Uncontrolled system â€” no production until claimed.
        </p>
      )}
      {!isNeutral && lv < 75 && (
        <p className="sysdet-note">
          Low loyalty reduces output. Invest in this system to increase production.
        </p>
      )}
    </div>
  );
}

function HPBar({ currentHP, maxHP }: any) {
  const pct = maxHP > 0 ? (currentHP / maxHP) * 100 : 0;
  const color = pct <= 0 ? '#f85149' : pct < 25 ? '#f85149' : pct < 50 ? '#d29922' : '#3fb950';
  return (
    <div className="fac-hp-track">
      <div className="fac-hp-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="fac-hp-label">{currentHP}/{maxHP}</span>
    </div>
  );
}

// FACILITY_ICONS imported from ../icons.js

const REINFORCE_COST = constructionCfg.troopReinforcementCost ?? { recruits: 10 };
const REINFORCE_TROOP_GAIN = 5;

const SPECIAL_ABILITY_LABELS: Record<string, string> = {
  carrierSynergy: 'Carrier Synergy \u2014 bonus CP when grouped with carrier-class ships',
  firstStrike:    'First Strike \u2014 attacks before enemies at the start of every combat round',
  evasion:        'Evasion \u2014 a portion of incoming fire misses this ship entirely',
  selfRepair:     'Self-Repair \u2014 recovers hull points after each engagement',
  capitalKiller:  'Capital Killer \u2014 deals bonus damage against capital-class ships',
};

function Chevron({ expanded }: any) {
  return (
    <span className={`fac-chevron${expanded ? ' fac-chevron--expanded' : ''}`}>
      {'\u25ba'}
    </span>
  );
}

const ACTION_LABELS: Record<string, string> = {
  build:    'Building',
  upgrade:  'Upgrading',
  repair:   'Repairing',
  demolish: 'Demolishing',
};

function FacilitiesTab({ sys, constructionState, playerFactionId }: any) {
  const { mode: gameMode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [shipProdError, setShipProdError] = React.useState<any>(null);
  const [expandedFacilities, setExpandedFacilities] = React.useState(new Set());
  const [expandedShips,      setExpandedShips]      = React.useState(new Set());

  const toggleFacAccordion  = (fid: any) => setExpandedFacilities(prev => { const s = new Set(prev); s.has(fid) ? s.delete(fid) : s.add(fid); return s; });
  const toggleShipAccordion = (tid: any) => setExpandedShips(prev => { const s = new Set(prev); s.has(tid) ? s.delete(tid) : s.add(tid); return s; });

  React.useEffect(() => {
    const handler = (e: any) => {
      const { success, error } = e.detail ?? {};
      if (!success && error) {
        setShipProdError(error);
        // Auto-clear after 4 seconds
        setTimeout(() => setShipProdError(null), 4000);
      } else if (success) {
        setShipProdError(null);
      }
    };
    window.addEventListener('galaxy:queueShipProductionResult', handler);
    return () => window.removeEventListener('galaxy:queueShipProductionResult', handler);
  }, []);

  const systemState   = constructionState?.systems?.[sys.id];
  const facilities    = systemState?.facilities ?? [];
  const queue         = systemState?.queue ?? [];
  const groundTroops  = systemState?.groundTroops ?? 0;
  const facilityDefs: Record<string, any>  = constructionState?.facilityDefs ?? {};
  const isOwned           = sys.loyalty === playerFactionId;
  const groundMax         = 20;

  // Ship production extras
  const productionQueues = constructionState?.productionQueues ?? {};
  const shipTypes: any[] = constructionState?.shipTypes ?? [];
  const completedTechs   = constructionState?.completedTechs ?? [];
  const resourceState    = constructionState?.resourceState ?? { credits: 0, materials: 0, recruits: 0, influence: 0 };
  const canAffordReinforce = (resourceState.recruits ?? 0) >= (REINFORCE_COST.recruits ?? 10);

  // Shipyard facility at this system (determines ship production availability + level gate)
  const shipyard      = facilities.find((f: any) => f.facilityId === 'shipyard');
  const shipyardLevel = shipyard?.level ?? 0;

  // Ship production queue for this system
  const shipProdQueue = productionQueues[sys.id] ?? [];

  const getDefName = (fid: any) => facilityDefs[fid]?.name ?? fid;

  const handleBuild = (facilityId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityBuild', {
      detail: { systemId: sys.id, facilityId, factionId: playerFactionId }
    }));
    // Notify tutorial engine that a construction item was queued
    window.dispatchEvent(new CustomEvent('galaxy:constructionQueued'));
  };

  const handleUpgrade = (instanceId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityUpgrade', {
      detail: { systemId: sys.id, instanceId, factionId: playerFactionId }
    }));
  };

  const handleRepair = (instanceId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityRepair', {
      detail: { systemId: sys.id, instanceId, factionId: playerFactionId }
    }));
  };

  const handleDemolish = (instanceId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityDemolish', {
      detail: { systemId: sys.id, instanceId, factionId: playerFactionId }
    }));
  };

  const handleCancelQueue = (qitemId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:cancelQueueItem', {
      detail: { systemId: sys.id, qitemId, factionId: playerFactionId }
    }));
  };

  const handleReinforce = () => {
    window.dispatchEvent(new CustomEvent('galaxy:reinforceTroops', {
      detail: { systemId: sys.id, factionId: playerFactionId }
    }));
  };

  const handleQueueShip = (shipTypeId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueShipProduction', {
      detail: { systemId: sys.id, shipTypeId, factionId: playerFactionId }
    }));
  };

  const handleCancelShipProd = (queueItemId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:cancelShipProduction', {
      detail: { systemId: sys.id, queueItemId, factionId: playerFactionId }
    }));
  };

  const builtIds   = new Set(facilities.map((f: any) => f.facilityId));
  const queuedIds  = new Set(queue.filter((q: any) => q.action === 'build').map((q: any) => q.facilityId));
  const allTypes   = Object.keys(facilityDefs);
  const buildable  = allTypes.filter(fid => !builtIds.has(fid) && !queuedIds.has(fid));

  return (
    <>
      {/* Ground Troops */}
      <div className="info-panel-section">
        <div className="info-panel-section-title">Ground Defense</div>
        <div className="info-row">
          <span className="info-row-label">Troops</span>
          <div style={{ flex: 1, marginLeft: 8 }}>
            <div className="fac-hp-track">
              <div className="fac-hp-fill" style={{
                width: `${(groundTroops / groundMax) * 100}%`,
                background: '#3fb950'
              }} />
              <span className="fac-hp-label">{groundTroops}/{groundMax}</span>
            </div>
          </div>
          {isOwned && (
            <button
              className="fac-action-btn"
              onClick={handleReinforce}
              disabled={!canAffordReinforce}
              title={canAffordReinforce ? `Spend ${REINFORCE_COST.recruits} Recruits for +${REINFORCE_TROOP_GAIN} troops` : 'Not enough Recruits'}
            >
              + Reinforce
            </button>
          )}
        </div>
        {isOwned && (
          <div className="fac-reinforce-cost">
            Cost:&nbsp;
            <span className={!canAffordReinforce ? 'cost--insufficient' : ''}>{REINFORCE_COST.recruits} Recruits</span>
            {' \u2192 +' + REINFORCE_TROOP_GAIN + ' troops'}
          </div>
        )}
      </div>

      {/* Built Facilities */}
      <div className="info-panel-section">
        <div className="info-panel-section-title">Facilities ({facilities.length})</div>
        {facilities.length > 0 ? (
          <div className="fac-list">
            {facilities.map((fac: any) => {
              const def    = facilityDefs[fac.facilityId];
              const icon   = (FACILITY_ICONS as Record<string, string>)[fac.facilityId] ?? '\u2302';
              const pct    = fac.maxHP > 0 ? fac.currentHP / fac.maxHP : 0;
              const canUpg = def?.upgradable && fac.level < (def?.maxLevel ?? 1) && pct >= 0.5;
              const needRep = fac.currentHP < fac.maxHP && fac.currentHP > 0;
              return (
                <div
                  key={fac.id}
                  className={`fac-item${pct <= 0 ? ' fac-item--destroyed' : pct < 0.25 ? ' fac-item--critical' : pct < 0.5 ? ' fac-item--damaged' : ''}`}
                >
                  <div className="fac-item-header">
                    <span className="fac-icon">{icon}</span>
                    <span className="fac-name">{def?.name ?? fac.facilityId}</span>
                    <span className="fac-level">Lv {fac.level ?? 1}</span>
                    {pct <= 0 && <span className="fac-badge fac-badge--destroyed">DESTROYED</span>}
                    {pct > 0 && pct < 0.5 && <span className="fac-badge fac-badge--damaged">DAMAGED</span>}
                  </div>
                  <HPBar currentHP={fac.currentHP} maxHP={fac.maxHP} />
                  {isOwned && pct > 0 && (
                    <div className="fac-actions">
                      {canUpg && (
                        <button className="fac-action-btn" onClick={() => handleUpgrade(fac.id)}>Upgrade</button>
                      )}
                      {needRep && (
                        <button className="fac-action-btn" onClick={() => handleRepair(fac.id)}>Repair</button>
                      )}
                      <button className="fac-action-btn fac-action-btn--danger" onClick={() => handleDemolish(fac.id)}>Demolish</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="info-empty-state">
            <span className="info-empty-icon">{UI_ICONS.facilitiesEmpty}</span>
            <span className="info-empty-msg">No facilities constructed</span>
          </div>
        )}
      </div>

      {/* Construction Queue */}
      <div className="info-panel-section">
        <div className="info-panel-section-title">Construction Queue ({queue.length}/3)</div>
        {queue.length > 0 ? (
          <div className="fac-queue-list">
            {queue.map((item: any, idx: any) => {
              const def  = facilityDefs[item.facilityId];
              const name = def?.name ?? item.facilityId;
              const prog = def ? (1 - item.turnsRemaining / (def.buildTime ?? 1)) : 0;
              return (
                <div key={item.id} className="fac-queue-item">
                  <div className="fac-queue-header">
                    <span className="fac-queue-pos">{idx + 1}</span>
                    <span className="fac-queue-label">
                      {ACTION_LABELS[item.action] ?? item.action}: {name}
                    </span>
                    <span className="fac-queue-turns">{formatDurationCompact(item.turnsRemaining, gameMode, ticksPerSecond, ticksPerTurn)}</span>
                    {isOwned && (
                      <button
                        className="fac-action-btn fac-action-btn--danger fac-action-btn--sm"
                        onClick={() => handleCancelQueue(item.id)}
                        title={item.started ? 'Cancel (no refund)' : 'Cancel (50% refund)'}
                      >
                        {UI_ICONS.cancel}
                      </button>
                    )}
                  </div>
                  <div className="fac-progress-track">
                    <div className="fac-progress-fill" style={{ width: `${Math.max(5, prog * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="info-empty-state">
            <span className="info-empty-icon">{UI_ICONS.queueEmpty}</span>
            <span className="info-empty-msg">Queue empty</span>
          </div>
        )}
      </div>

      {/* Ship Production — only visible when a Shipyard is present and system is owned */}
      {isOwned && shipyard && (
        <div className="info-panel-section">
          <div className="info-panel-section-title">
            {FACILITY_ICONS.shipyard} Ship Production (Shipyard Lv {shipyardLevel})
          </div>

          {/* Active production queue */}
          {shipProdQueue.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              {shipProdQueue.map((item: any, idx: any) => {
                const type = shipTypes.find((t: any) => t.id === item.shipTypeId);
                const name = type?.name ?? item.shipTypeId;
                const cls  = type?.class ?? '';
                return (
                  <div key={item.id} className="ship-prod-queue-item">
                    <div className="ship-prod-queue-header">
                      <span className="ship-prod-queue-pos">{idx + 1}</span>
                      <span className={`ship-prod-class-badge ship-prod-class-badge--${cls}`}>{cls}</span>
                      <span className="ship-prod-queue-label">{name}</span>
                      <span className="ship-prod-queue-turns">{formatDurationCompact(item.turnsRemaining, gameMode, ticksPerSecond, ticksPerTurn)}</span>
                      <button
                        className="fac-action-btn fac-action-btn--danger fac-action-btn--sm"
                        onClick={() => handleCancelShipProd(item.id)}
                        title="Cancel (full refund)"
                      >
                        {UI_ICONS.cancel}
                      </button>
                    </div>
                    <div className="fac-progress-track">
                      <div className="fac-progress-fill" style={{
                        width: `${Math.max(5, ((type?.productionTime ?? 1) - item.turnsRemaining) / (type?.productionTime ?? 1) * 100)}%`
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="info-empty-state" style={{ marginBottom: 8 }}>
              <span className="info-empty-icon">{UI_ICONS.queueEmpty}</span>
              <span className="info-empty-msg">No ships in production</span>
            </div>
          )}

          {/* Buildable ship types */}
          {shipProdError && (
            <div className="ship-prod-error">{UI_ICONS.warning} {shipProdError}</div>
          )}
          <div className="ship-prod-build-list">
            {shipTypes
              .filter((t: any) => t.faction === 'all' || t.faction === playerFactionId)
              .map((t: any) => {
                const techLocked  = t.requiresTech && !completedTechs.includes(t.requiresTech);
                const levelLocked = (t.requiresFacilityLevel ?? 1) > shipyardLevel;
                const isLocked    = techLocked || levelLocked;
                const shipCredits   = t.productionCost?.credits   ?? 0;
                const shipMaterials = t.productionCost?.materials  ?? 0;
                const canAfford   = !isLocked &&
                  (resourceState.credits   ?? 0) >= shipCredits &&
                  (resourceState.materials ?? 0) >= shipMaterials;
                const classIcon   = (SHIP_CLASS_ICONS as Record<string, string>)[t.class] ?? '\u25A1';
                let lockReason = '';
                if (levelLocked) lockReason = `Shipyard Lv ${t.requiresFacilityLevel} required`;
                else if (techLocked) lockReason = `Requires tech: ${t.requiresTech}`;
                const isShipExpanded = expandedShips.has(t.id);

                return (
                  <div
                    key={t.id}
                    className={`ship-prod-build-item${isLocked ? ' ship-prod-locked' : ''}`}
                    onClick={() => toggleShipAccordion(t.id)}
                  >
                    <div className="ship-prod-build-header" title={lockReason || undefined}>
                      <span className="ship-prod-build-icon">{classIcon}</span>
                      <div className="ship-prod-build-info">
                        <span className="ship-prod-build-name">
                          {t.name}
                          &nbsp;
                          <span className={`ship-prod-class-badge ship-prod-class-badge--${t.class}`}>{t.class}</span>
                        </span>
                        <span className="ship-prod-build-stats">
                          CP {t.combatPower} &middot; Hull {t.hullPoints} &middot; Spd {t.speed}
                        </span>
                        <span className="ship-prod-build-cost">
                          <span className={!isLocked && (resourceState.credits ?? 0) < shipCredits ? 'cost--insufficient' : ''}>{shipCredits}cr</span>
                          {' + '}
                          <span className={!isLocked && (resourceState.materials ?? 0) < shipMaterials ? 'cost--insufficient' : ''}>{shipMaterials}mat</span>
                          {' \u00b7 '}{t.productionTime}t
                        </span>
                      </div>
                      <Chevron expanded={isShipExpanded} />
                      {isLocked ? (
                        <span className="ship-prod-lock-icon" onClick={(e) => e.stopPropagation()} title={lockReason}>{UI_ICONS.locked}</span>
                      ) : (
                        <button
                          className="fac-action-btn"
                          disabled={!canAfford}
                          title={!canAfford ? 'Insufficient resources' : `Build ${t.name}`}
                          onClick={(e) => { e.stopPropagation(); handleQueueShip(t.id); }}
                        >
                          Build
                        </button>
                      )}
                    </div>
                    {isShipExpanded && (
                      <div className="ship-prod-build-body">
                        {t.description && <p className="ship-prod-build-desc">{t.description}</p>}
                        {t.specialAbility && SPECIAL_ABILITY_LABELS[t.specialAbility] && (
                          <p className="ship-prod-ability">{'\u2605'} {SPECIAL_ABILITY_LABELS[t.specialAbility]}</p>
                        )}
                        <p className="ship-prod-maintenance">Maintenance: {t.maintenanceCost}cr/month</p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Add to Queue */}
      {isOwned && buildable.length > 0 && (
        <div className="info-panel-section">
          <div className="info-panel-section-title">Build Facility</div>
          <div className="fac-build-list">
            {buildable.map(fid => {
              const def = facilityDefs[fid];
              if (!def) return null;
              const icon = (FACILITY_ICONS as Record<string, string>)[fid] ?? '\u2302';
              const costCredits   = def.cost?.credits   ?? 0;
              const costMaterials = def.cost?.materials  ?? 0;
              const canAffordFac  = (resourceState.credits ?? 0) >= costCredits &&
                                    (resourceState.materials ?? 0) >= costMaterials;
              const isExpanded    = expandedFacilities.has(fid);
              return (
                <div key={fid} className="fac-build-item" onClick={() => toggleFacAccordion(fid)}>
                  <div className="fac-build-header">
                    <span className="fac-icon">{icon}</span>
                    <div className="fac-build-info">
                      <span className="fac-name">{def.name}</span>
                      <span className="fac-build-cost">
                        <span className={(resourceState.credits ?? 0) < costCredits ? 'cost--insufficient' : ''}>{costCredits}cr</span>
                        {' + '}
                        <span className={(resourceState.materials ?? 0) < costMaterials ? 'cost--insufficient' : ''}>{costMaterials}mat</span>
                        {' \u00b7 '}{def.buildTime}t
                      </span>
                    </div>
                    <Chevron expanded={isExpanded} />
                    <button
                      className="fac-action-btn"
                      disabled={!canAffordFac}
                      title={canAffordFac ? `Build ${def.name}` : 'Insufficient resources'}
                      onClick={(e) => { e.stopPropagation(); handleBuild(fid); }}
                    >
                      Build
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="fac-build-body">
                      <p className="fac-build-desc">{def.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Diplomacy & Loyalty Tab ──────────────────────────────────────────────────

const DIPLO_ACTION_LABELS: Record<string, string> = {
  propaganda:          'Propaganda Campaign',
  tradeAgreement:      'Trade Agreement',
  resourceInvestment:  'Resource Investment',
  allianceProposal:    'Alliance Proposal',
  diplomaticHold:      'Diplomatic Hold',
};

const ACTION_EFFECTS: Record<string, string> = {
  propaganda:          '+10 loyalty (Brand Authority: +11)',
  tradeAgreement:      '+20 loyalty · +10% production for 3 turns',
  resourceInvestment:  '+15 loyalty · +5% materials (permanent)',
  allianceProposal:    '+30 loyalty · Outpost placed',
  diplomaticHold:      'Blocks diplomatic conversion for 3 turns',
};

const TREND_ICONS: Record<string, string> = { rising: UI_ICONS.trendUp, falling: UI_ICONS.trendDown, stable: UI_ICONS.trendStable };

function DiplomacyTab({ sys, playerFactionId }: any) {
  const [actions,   setActions]   = React.useState<any[]>([]);
  const [history,   setHistory]   = React.useState<any[]>([]);
  const [loyalties, setLoyalties] = React.useState(sys.loyalties ?? {});
  const [trends,    setTrends]    = React.useState<any>({});
  const [confirm,   setConfirm]   = React.useState<any>(null); // { type, label, costStr }
  const [feedback,  setFeedback]  = React.useState<any>(null); // { ok, msg }

  const systemId    = sys.id;
  const allFactions = ['brandAuthority', 'union', 'autoforge'];

  React.useEffect(() => {
    // IMPORTANT: Register listeners BEFORE dispatching initial requests.
    // CustomEvent dispatch is synchronous — the response fires immediately, so any
    // listener registered in a separate useEffect (which runs after this one) will
    // miss the response entirely, leaving the tab stuck on "Loading".
    const onActions = (e: any) => {
      if (e.detail?.systemId !== systemId) return;
      setActions(e.detail.actions ?? []);
      setHistory(e.detail.history ?? []);
    };
    const onLoyalty = (e: any) => {
      const data = e.detail?.loyaltyData?.[systemId];
      if (!data) return;
      setLoyalties(data.loyalties ?? {});
      setTrends(data.trends ?? {});
    };
    const onStagedResult = (e: any) => {
      const detail = e.detail ?? {};
      if (detail.success) {
        setFeedback({ ok: true, msg: 'Action staged \u2014 will resolve at end of turn.' });
        setConfirm(null);
      } else {
        setFeedback({ ok: false, msg: detail.error ?? 'Could not stage action.' });
        setConfirm(null);
      }
      // Refresh available actions after staging
      window.dispatchEvent(new CustomEvent('galaxy:requestDiplomacyActions', {
        detail: { systemId, factionId: playerFactionId }
      }));
    };

    window.addEventListener('galaxy:diplomacyActionsResult',      onActions);
    window.addEventListener('galaxy:loyaltyUpdate',               onLoyalty);
    window.addEventListener('galaxy:stageDiplomaticActionResult', onStagedResult);

    // Now dispatch — listeners are already registered above
    if (playerFactionId) {
      window.dispatchEvent(new CustomEvent('galaxy:requestDiplomacyActions', {
        detail: { systemId, factionId: playerFactionId }
      }));
      window.dispatchEvent(new CustomEvent('galaxy:requestLoyaltyUpdate', {
        detail: { systemId }
      }));
    }

    return () => {
      window.removeEventListener('galaxy:diplomacyActionsResult',      onActions);
      window.removeEventListener('galaxy:loyaltyUpdate',               onLoyalty);
      window.removeEventListener('galaxy:stageDiplomaticActionResult', onStagedResult);
    };
  }, [systemId, playerFactionId]);

  const openConfirm = (type: any, cost: any) => {
    const costStr = Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' + ');
    setConfirm({ type, label: DIPLO_ACTION_LABELS[type] ?? type, costStr });
    setFeedback(null);
  };

  const handleConfirmedStage = () => {
    if (!confirm) return;
    window.dispatchEvent(new CustomEvent('galaxy:stageDiplomaticAction', {
      detail: { actionType: confirm.type, factionId: playerFactionId, targetSystemId: systemId }
    }));
  };

  const displayLoyalties = sys.loyalties ?? loyalties;

  return (
    <>
      <div className="info-panel-section">
        <div className="info-panel-section-title">Faction Loyalty</div>
        {allFactions.map(fId => {
          const val   = Math.trunc(displayLoyalties[fId] ?? 0);
          const color = FACTION_COLORS[fId] ?? '#8b949e';
          const trend = trends[fId] ?? 'stable';
          return (
            <div key={fId} className="sysdet-loyalty-row">
              <span className="sysdet-faction-dot" style={{ background: color }} />
              <span className="sysdet-loyalty-fname" style={{ color }}>{FACTION_NAMES[fId]}</span>
              <span className="sysdet-loyalty-trend">{TREND_ICONS[trend]}</span>
              <div className="sysdet-loyalty-bar-track">
                <div
                  className="sysdet-loyalty-bar-fill"
                  style={{ width: `${val}%`, background: color }}
                />
              </div>
              <span className="sysdet-loyalty-val" style={{ color }}>{val}</span>
            </div>
          );
        })}
        {(!sys.loyalty || sys.loyalty === 'neutral') && (
          <p className="sysdet-note">Neutral \u2014 no faction holds \u2265 40 loyalty here.</p>
        )}
      </div>

      <div className="info-panel-section">
        <div className="info-panel-section-title">Diplomatic Actions</div>

        {feedback && (
          <div className={`sysdet-diplo-feedback${feedback.ok ? ' sysdet-diplo-feedback--ok' : ' sysdet-diplo-feedback--err'}`}>
            {feedback.msg}
            <button className="sysdet-diplo-feedback-dismiss" onClick={() => setFeedback(null)}>{UI_ICONS.cancel}</button>
          </div>
        )}

        {confirm && (
          <div className="sysdet-diplo-confirm">
            <div className="sysdet-diplo-confirm-msg">
              Stage <strong>{confirm.label}</strong> for <strong>{confirm.costStr}</strong>?
              <br />
              <span className="sysdet-muted">Resources are reserved now and consumed when the turn resolves. You can cancel before submitting.</span>
            </div>
            <div className="sysdet-diplo-confirm-btns">
              <button className="sysdet-diplo-btn" onClick={handleConfirmedStage}>Confirm</button>
              <button className="sysdet-diplo-btn sysdet-diplo-btn--cancel" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}

        {!playerFactionId ? (
          <div className="info-empty-state">
            <span className="info-empty-msg">No active faction selected.</span>
          </div>
        ) : actions.length === 0 ? (
          <div className="info-empty-state">
            <span className="info-empty-msg">No diplomatic actions available.</span>
          </div>
        ) : (
          <div className="sysdet-diplo-actions">
            {actions.map(({ type, cost, valid, reason }) => {
              const costStr = Object.entries(cost)
                .map(([k, v]) => `${v} ${k}`)
                .join(' + ');
              const isPending = confirm?.type === type;
              return (
                <div
                  key={type}
                  className={`sysdet-diplo-action${valid ? '' : ' sysdet-diplo-action--disabled'}${isPending ? ' sysdet-diplo-action--pending' : ''}`}
                >
                  <div className="sysdet-diplo-action-header">
                    <span className="sysdet-diplo-action-name">{DIPLO_ACTION_LABELS[type] ?? type}</span>
                    <span className="sysdet-diplo-cost">{costStr}</span>
                  </div>
                  <div className="sysdet-diplo-action-effect">{ACTION_EFFECTS[type]}</div>
                  {!valid && <div className="sysdet-diplo-reason">{reason}</div>}
                  {valid && !isPending && (
                    <button className="sysdet-diplo-btn" onClick={() => openConfirm(type, cost)}>
                      Stage Action
                    </button>
                  )}
                  {valid && isPending && (
                    <span className="sysdet-muted" style={{ fontSize: 11 }}>Awaiting confirmation above\u2026</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="info-panel-section">
          <div className="info-panel-section-title">Recent Actions</div>
          <div className="sysdet-diplo-history">
            {history.map((h, i) => (
              <div key={i} className="sysdet-diplo-history-item">
                <span className="sysdet-muted">T{h.turn}</span>
                {' '}
                <span style={{ color: FACTION_COLORS[h.factionId] ?? '#8b949e' }}>
                  {FACTION_NAMES[h.factionId] ?? h.factionId}
                </span>
                {' \u2014 '}
                <span>{DIPLO_ACTION_LABELS[h.type] ?? h.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const INTEL_TYPE_LABELS: Record<string, string> = {
  system_loyalty:     'Loyalty Report',
  fleet_composition:  'Fleet Composition',
  facility_status:    'Facility Status',
  character_location: 'Character Location',
  resource_output:    'Resource Output',
  event_warning:      'Event Warning',
};

function IntelTab({ items = [], sys }: any) {
  if (!items.length) {
    return (
      <div className="info-panel-section">
        <div className="info-panel-section-title">Intelligence</div>
        <div className="info-empty-state">
          <span className="info-empty-icon">🔎</span>
          <span className="info-empty-msg">No active intelligence reports for this system</span>
          <span className="info-empty-sub">Conduct spy missions or deploy outposts to gather intel.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="info-panel-section">
      <div className="info-panel-section-title">Intelligence ({items.length})</div>
      <div className="sysdet-intel-list">
        {items.map((item: any) => {
          const typeLabel = INTEL_TYPE_LABELS[item.type] ?? item.type;
          const expirySuffix = item.expiresOnTurn != null
            ? `Expires T${item.expiresOnTurn}`
            : null;
          // Build a human-readable data summary
          const dataSummary = Object.entries(item.data ?? {})
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' · ');
          return (
            <div key={item.id} className="sysdet-intel-item">
              <div className="sysdet-intel-item-header">
                <span className="sysdet-badge" style={{ borderColor: '#58a6ff', color: '#58a6ff' }}>
                  ◆ {typeLabel}
                </span>
                {expirySuffix && (
                  <span className="sysdet-muted" style={{ fontSize: 11 }}>{expirySuffix}</span>
                )}
              </div>
              {dataSummary && (
                <div className="sysdet-intel-data sysdet-muted">{dataSummary}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * SystemDetails â€” right-side information panel for a selected star system.
 * Spec: 035-information-panels-spec.md (FR-IP-001)
 */
export function SystemDetails({ phaserGame }: any) {
  const [selectedSystem,    setSelectedSystem]    = useState<any>(null);
  const [isVisible,         setIsVisible]         = useState(false);
  const [activeTab,         setActiveTab]         = useState('overview');
  const [constructionState, setConstructionState] = useState<any>(null);
  const [intelItems,        setIntelItems]        = useState<any[]>([]);
  const [playerFactionId,   setPlayerFactionId]   = useState(
    phaserGame?.registry?.get('playerFactionId') ?? 'brandAuthority'
  );

  // Listen via window events so we never depend on the Phaser scene reference
  // being populated at React mount time (fixes blank panel on system click).
  useEffect(() => {
    const onOpen  = (e: any) => {
      if (e.detail?.panel !== 'system' || !e.detail?.systemData) return;
      setSelectedSystem(e.detail.systemData);
      setIsVisible(true);
      setActiveTab('overview');
    };
    const onClose = (e: any) => {
      if (e.detail?.panel === 'system') setIsVisible(false);
    };

    window.addEventListener('galaxy:panelOpen',  onOpen);
    window.addEventListener('galaxy:panelClose', onClose);
    return () => {
      window.removeEventListener('galaxy:panelOpen',  onOpen);
      window.removeEventListener('galaxy:panelClose', onClose);
    };
  }, []);

  // Listen for construction state updates from Phaser
  useEffect(() => {
    const handler = (e: any) => {
      setConstructionState(e.detail ?? null);
      if (e.detail?.playerFactionId) setPlayerFactionId(e.detail.playerFactionId);
    };
    window.addEventListener('galaxy:constructionUpdate', handler);
    // Request initial state
    window.dispatchEvent(new CustomEvent('galaxy:requestConstructionUpdate'));
    return () => window.removeEventListener('galaxy:constructionUpdate', handler);
  }, []);

  // Listen for intel state updates from Phaser (fog-of-war gating, IntelTab content)
  useEffect(() => {
    const handler = (e: any) => {
      const { items = [], factionId } = e.detail ?? {};
      setIntelItems(items);
      if (factionId) setPlayerFactionId(factionId);
    };
    window.addEventListener('galaxy:intelUpdate', handler);
    // Request current state on mount
    window.dispatchEvent(new CustomEvent('galaxy:requestIntelUpdate'));
    return () => window.removeEventListener('galaxy:intelUpdate', handler);
  }, []);

  if (!isVisible || !selectedSystem) return null;

  const sys          = selectedSystem;
  const factionColor = FACTION_COLORS[sys.loyalty] ?? '#8b949e';
  const factionName  = FACTION_NAMES[sys.loyalty]  ?? sys.loyalty ?? 'Unknown';

  // Intel-gating variables
  const isOwnSystem         = sys.loyalty === playerFactionId;
  const intelItemsForSystem = intelItems.filter(i => i.systemId === sys.id);
  const hasAnyIntel         = intelItemsForSystem.length > 0;
  const hasFacilityIntel    = intelItemsForSystem.some(i => i.type === 'facility_status');

  const handleClose = () => {
    setIsVisible(false);
    if (phaserGame?.scene.scenes[1]) {
      phaserGame.scene.scenes[1].deselectSystem();
    }
  };

  return (
    <InfoPanelFrame
      panelId="system"
      title={sys.name}
      subtitle={`${factionName} · Pop ${sys.population}`}
      onClose={handleClose}
      className="system-details-panel"
    >
      {/* Tab strip */}
      <div className="info-panel-tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`info-panel-tab${activeTab === id ? ' info-panel-tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          sys={sys}
          factionColor={factionColor}
          factionName={factionName}
          isOwnSystem={isOwnSystem}
          hasIntel={hasAnyIntel}
          playerFactionId={playerFactionId}
        />
      )}
      {activeTab === 'resources' && (
        isOwnSystem || hasAnyIntel
          ? <ResourcesTab sys={sys} />
          : (
            <div className="info-panel-section">
              <div className="info-empty-state">
                <span className="info-empty-icon">{UI_ICONS.locked}</span>
                <span className="info-empty-msg">Intelligence required</span>
                <span className="info-empty-sub">Gather intel on this system to view resource details.</span>
              </div>
            </div>
          )
      )}
      {activeTab === 'facilities' && (
        isOwnSystem || hasFacilityIntel
          ? <FacilitiesTab sys={sys} constructionState={constructionState} playerFactionId={playerFactionId} />
          : (
            <div className="info-panel-section">
              <div className="info-empty-state">
                <span className="info-empty-icon">{UI_ICONS.locked}</span>
                <span className="info-empty-msg">Intelligence required</span>
                <span className="info-empty-sub">Gather facility status intel on this system to view facility details.</span>
              </div>
            </div>
          )
      )}
      {activeTab === 'diplomacy'  && <DiplomacyTab  sys={sys} playerFactionId={playerFactionId} />}
      {activeTab === 'intel'      && <IntelTab items={intelItemsForSystem} sys={sys} />}
    </InfoPanelFrame>
  );
}

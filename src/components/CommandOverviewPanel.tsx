/**
 * CommandOverviewPanel — Multi-system facilities overview.
 * Shows all facilities across all player-controlled systems with HP,
 * queue status, and quick-action buttons.
 * Spec: 019-base-management-spec.md (FR-BM-003 through FR-BM-005)
 */
import React, { useState, useEffect } from 'react';
import { InfoPanelFrame } from './InfoPanelFrame';
import { FACILITY_ICONS, UI_ICONS } from '../icons.js';
import './CommandOverviewPanel.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDurationCompact } from '../utils/time-format.js';


const SPECIAL_ICONS: Record<string, string> = {
  manufacturingCenter:  '\u2699',
  researchFacility:     '\u2b21',
  tradeHub:             '\u25c6',
  strategicChokepoint:  '\u2b1f',
};

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#8b949e',
};

const FACTION_NAMES: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'Autoforge',
  neutral:        'Neutral / Uncontrolled',
};

function HPMini({ currentHP, maxHP }: any) {
  const pct   = maxHP > 0 ? (currentHP / maxHP) * 100 : 0;
  const color = pct <= 0 ? '#f85149' : pct < 25 ? '#f85149' : pct < 50 ? '#d29922' : '#3fb950';
  return (
    <div className="cov-hp-track" title={`${currentHP}/${maxHP} HP`}>
      <div className="cov-hp-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function FacilityRow({ fac, facilityDef, systemId, factionId, onUpgrade, onRepair }: any) {
  const pct      = fac.maxHP > 0 ? fac.currentHP / fac.maxHP : 0;
  const canUpg   = facilityDef?.upgradable && fac.level < (facilityDef?.maxLevel ?? 1) && pct >= 0.5;
  const needRep  = fac.currentHP < fac.maxHP && fac.currentHP > 0;
  const icon     = (FACILITY_ICONS as Record<string, string>)[fac.facilityId] ?? UI_ICONS.facilitiesEmpty;
  const damaged  = pct > 0 && pct < 0.5;
  const critical = pct > 0 && pct < 0.25;
  return (
    <div className={`cov-fac-row${critical ? ' cov-fac-row--critical' : damaged ? ' cov-fac-row--damaged' : ''}`}>
      <span className="cov-fac-icon">{icon}</span>
      <span className="cov-fac-name">{facilityDef?.name ?? fac.facilityId}</span>
      <span className="cov-fac-level">Lv{fac.level ?? 1}</span>
      <HPMini currentHP={fac.currentHP} maxHP={fac.maxHP} />
      <span className="cov-fac-hp-text">
        {fac.currentHP <= 0 ? UI_ICONS.cancel : `${fac.currentHP}/${fac.maxHP}`}
      </span>
      <div className="cov-fac-actions">
        {canUpg && (
          <button className="cov-btn" onClick={() => onUpgrade(systemId, fac.id, factionId)}>↑ Upgrade</button>
        )}
        {needRep && (
          <button className="cov-btn" onClick={() => onRepair(systemId, fac.id, factionId)}>✚ Repair</button>
        )}
      </div>
    </div>
  );
}

function QueueRow({ item, facilityDef }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const buildTime = facilityDef?.buildTime ?? 1;
  const prog = buildTime > 0 ? Math.max(5, (1 - item.turnsRemaining / buildTime) * 100) : 90;
  return (
    <div className="cov-queue-row">
      <span className="cov-queue-label">
        {item.action.charAt(0).toUpperCase() + item.action.slice(1)}: {facilityDef?.name ?? item.facilityId}
      </span>
      <span className="cov-queue-turns">{formatDurationCompact(item.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)}</span>
      <div className="cov-progress-track">
        <div className="cov-progress-fill" style={{ width: `${prog}%` }} />
      </div>
    </div>
  );
}

/**
 * CommandOverviewPanel component.
 * @param {{ onClose: Function, playerFactionId?: string }} props
 */
export function CommandOverviewPanel({ onClose, playerFactionId: initialFactionId }: any) {
  const [constructionData, setConstructionData]  = useState<any>(null);
  const [galaxySystems,    setGalaxySystems]     = useState<any[]>([]);
  const [playerFactionId,  setPlayerFactionId]   = useState<any>(initialFactionId ?? 'brandAuthority');
  const [sortMode,         setSortMode]          = useState('name'); // 'name' | 'queue' | 'damage'
  const [actionResults,    setActionResults]     = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      setConstructionData(e.detail ?? null);
      if (e.detail?.playerFactionId) setPlayerFactionId(e.detail.playerFactionId);
    };
    window.addEventListener('galaxy:constructionUpdate', handler);
    window.dispatchEvent(new CustomEvent('galaxy:requestConstructionUpdate'));
    return () => window.removeEventListener('galaxy:constructionUpdate', handler);
  }, []);

  // Track result notifications
  useEffect(() => {
    const resultEvents = [
      'galaxy:queueFacilityUpgradeResult',
      'galaxy:queueFacilityRepairResult'
    ];
    const handler = (e: any) => {
      const r = e.detail ?? {};
      setActionResults(r.success ? null : r.error ?? 'Action failed');
      if (!r.success) setTimeout(() => setActionResults(null), 3000);
    };
    resultEvents.forEach(ev => window.addEventListener(ev, handler));
    return () => resultEvents.forEach(ev => window.removeEventListener(ev, handler));
  }, []);

  const handleUpgrade = (systemId: any, instanceId: any, factionId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityUpgrade', {
      detail: { systemId, instanceId, factionId }
    }));
  };

  const handleRepair = (systemId: any, instanceId: any, factionId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:queueFacilityRepair', {
      detail: { systemId, instanceId, factionId }
    }));
  };

  const handleNavigate = (systemId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:navigateTo', { detail: { systemId } }));
    // Don't call onClose — galaxy:panelOpen { panel: 'system' } (dispatched synchronously
    // inside galaxy:navigateTo) sets activePanel to 'system', which unmounts this panel
    // and shifts the nav correctly. Calling onClose here would override that with null.
  };

  const facilityDefs: Record<string, any> = constructionData?.facilityDefs ?? {};

  // Build system rows from constructionData
  const systemRows = (Object.entries(constructionData?.systems ?? {}) as [string, any][]).map(([sysId, state]) => ({
    systemId:      sysId,
    systemName:    state.name ?? sysId,
    specialType:   state.specialType ?? null,
    ownerFactionId: state.ownerFactionId ?? 'neutral',
    facilities:    state.facilities ?? [],
    queue:         state.queue ?? [],
    groundTroops:  state.groundTroops ?? 0,
  }));

  // Sort within each group
  const sortedRows = [...systemRows].sort((a, b) => {
    if (sortMode === 'queue') return (b.queue.length) - (a.queue.length);
    if (sortMode === 'damage') {
      const dmgA = a.facilities.filter((f: any) => f.currentHP < f.maxHP).length;
      const dmgB = b.facilities.filter((f: any) => f.currentHP < f.maxHP).length;
      return dmgB - dmgA;
    }
    return a.systemName.localeCompare(b.systemName);
  });

  // Group by faction: player faction first, then other factions, then neutral
  const factionOrder = (fid: any) => {
    if (fid === playerFactionId) return 0;
    if (fid === 'neutral') return 2;
    return 1;
  };
  const factionGroups = sortedRows.reduce((acc: Record<string, any[]>, row: any) => {
    const fid = row.ownerFactionId;
    if (!acc[fid]) acc[fid] = [];
    acc[fid].push(row);
    return acc;
  }, {} as Record<string, any[]>);
  const groupKeys = Object.keys(factionGroups).sort((a, b) => {
    const orderDiff = factionOrder(a) - factionOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return (FACTION_NAMES[a] ?? a).localeCompare(FACTION_NAMES[b] ?? b);
  });

  const totalFacilities = systemRows.reduce((s, r) => s + r.facilities.length, 0);
  const totalDamaged    = systemRows.reduce((s, r) =>
    s + r.facilities.filter((f: any) => f.currentHP < f.maxHP && f.currentHP > 0).length, 0);

  return (
    <InfoPanelFrame
      panelId="commandOverview"
      title="Command Overview"
      subtitle={`${totalFacilities} facilities · ${totalDamaged} damaged`}
      onClose={onClose}
      className="cov-panel"
    >
      {/* Error toast */}
      {actionResults && (
        <div className="cov-error-toast">{actionResults}</div>
      )}

      {/* Sort controls */}
      <div className="cov-sort-bar">
        <span className="cov-sort-label">Sort:</span>
        {['name', 'queue', 'damage'].map(mode => (
          <button
            key={mode}
            className={`cov-sort-btn${sortMode === mode ? ' cov-sort-btn--active' : ''}`}
            onClick={() => setSortMode(mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* System rows */}
      {groupKeys.length === 0 ? (
        <div className="info-empty-state">
          <span className="info-empty-icon">{UI_ICONS.facilitiesEmpty}</span>
          <span className="info-empty-msg">No construction data available</span>
        </div>
      ) : (
        <div className="cov-system-list">
          {groupKeys.map(factionId => {
            const factionColor = FACTION_COLORS[factionId] ?? FACTION_COLORS.neutral;
            const factionLabel = FACTION_NAMES[factionId] ?? factionId;
            const isPlayer = factionId === playerFactionId;
            const rows = factionGroups[factionId];
            return (
              <div key={factionId} className="cov-faction-group">
                <div
                  className={`cov-faction-header${isPlayer ? ' cov-faction-header--player' : ''}`}
                  style={({ '--faction-color': factionColor } as any)}
                >
                  <span className="cov-faction-pip" style={{ background: factionColor }} />
                  <span className="cov-faction-label">{factionLabel}</span>
                  <span className="cov-faction-count">{rows.length} sys</span>
                  {isPlayer && <span className="cov-faction-you">YOU</span>}
                </div>
                {rows.map(({ systemId, systemName, specialType, ownerFactionId, facilities, queue, groundTroops }: any) => (
                  <div key={systemId} className="cov-system-row">
                    <div className="cov-system-header">
                      <button
                        className="cov-system-name"
                        style={{ color: factionColor }}
                        onClick={() => handleNavigate(systemId)}
                        title="Navigate to system"
                      >
                        {(SPECIAL_ICONS as Record<string, string>)[specialType] ?? UI_ICONS.hyperspaceLane} {systemName}
                      </button>
                      <span className="cov-system-meta">
                        {facilities.length} fac · {queue.length} queued · {groundTroops} troops
                      </span>
                    </div>

                    {facilities.map((fac: any) => (
                      <FacilityRow
                        key={fac.id}
                        fac={fac}
                        facilityDef={facilityDefs[fac.facilityId]}
                        systemId={systemId}
                        factionId={ownerFactionId}
                        onUpgrade={handleUpgrade}
                        onRepair={handleRepair}
                      />
                    ))}

                    {queue.map((item: any) => (
                      <QueueRow
                        key={item.id}
                        item={item}
                        facilityDef={facilityDefs[item.facilityId]}
                      />
                    ))}

                    {facilities.length === 0 && queue.length === 0 && (
                      <div className="cov-empty-system">No facilities</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </InfoPanelFrame>
  );
}

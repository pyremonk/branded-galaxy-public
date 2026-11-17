/**
 * IntelReportsPanel — Full intelligence reports UI.
 *
 * Shows all active intel items for the player faction grouped by threat level.
 * Includes Threat Summary, filterable/sortable Intel Browser, expiry alerts,
 * and age indicators.
 *
 * Spec: 042-intel-system-spec.md, 043-intelligence-reports-spec.md
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration } from '../utils/time-format.js';
import { InfoPanelFrame } from './InfoPanelFrame';
import './IntelReportsPanel.css';


// ─── Constants ────────────────────────────────────────────────────────────────

const INTEL_TYPE_LABELS: Record<string, string> = {
  system_loyalty:     'System Loyalty',
  fleet_composition:  'Fleet Composition',
  facility_status:    'Facility Status',
  character_location: 'Character Location',
  resource_output:    'Resource Output',
  event_warning:      'Event Warning',
  troop_count:        'Troop Count',
  facility_count:     'Facility Count',
  fleet_position:     'Fleet Position',
  facility:           'Facility Status',
};

const INTEL_TYPE_ICONS: Record<string, string> = {
  system_loyalty:     '🏳',
  fleet_composition:  '⚓',
  facility_status:    '⚙',
  character_location: '👤',
  resource_output:    '💰',
  event_warning:      '⚠',
  troop_count:        '⚔',
  facility_count:     '⚙',
  fleet_position:     '⚓',
  facility:           '⚙',
};

const SOURCE_LABELS: Record<string, string> = {
  patrol:  'Patrol',
  mission: 'Mission',
  outpost: 'Outpost',
  event:   'Event',
};

const FILTER_TYPES = [
  { id: 'fleet',     label: 'Fleet',     types: ['fleet_composition', 'fleet_position'] },
  { id: 'loyalty',   label: 'Loyalty',   types: ['system_loyalty'] },
  { id: 'facility',  label: 'Facility',  types: ['facility_status', 'facility_count', 'facility'] },
  { id: 'character', label: 'Character', types: ['character_location'] },
  { id: 'resource',  label: 'Resource',  types: ['resource_output', 'troop_count'] },
  { id: 'event',     label: 'Event',     types: ['event_warning'] },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function getItemSummary(item: any) {
  const d = item.data ?? {};
  switch (item.type) {
    case 'system_loyalty':
      return `Loyalty: ${d.loyaltyValue ?? '?'} (${d.controlledBy ?? 'unknown'})`;
    case 'fleet_composition':
      return d.shipCount != null
        ? `${d.shipCount} ships (${d.controlledBy ?? '?'})`
        : `Fleet present (${d.controlledBy ?? '?'})`;
    case 'fleet_position':
      return `Fleet ${d.value ?? 'present'} at ${item.systemId}`;
    case 'facility_status': {
      const facs = d.facilities ?? [];
      if (facs.length === 0) return 'No facilities detected';
      return facs.map((f: any) => `${f.type ?? f} Lvl ${f.level ?? 1}`).join(', ');
    }
    case 'facility_count':
      return `${d.value ?? 0} facilities`;
    case 'facility':
      return `${d.value ?? 'unknown'} facility`;
    case 'character_location': {
      const chars = d.characters ?? [];
      return chars.length > 0 ? chars.map((c: any) => c.name).join(', ') : 'Characters detected';
    }
    case 'resource_output':
      return `Credits: ${d.credits ?? 0}, Materials: ${d.materials ?? 0}`;
    case 'troop_count':
      return `Troops: ${d.value ?? 0}`;
    case 'event_warning':
      return d.message ?? 'Event warning';
    default:
      return JSON.stringify(d).slice(0, 40);
  }
}

function getAgeColor(turnsAgo: any) {
  if (turnsAgo <= 1) return '#3fb950';
  if (turnsAgo <= 2) return '#e3b341';
  return '#f0883e';
}

function getThreatLevel(item: any) {
  if (item.type === 'event_warning') return 'event';
  if (item.type === 'system_loyalty') {
    const loyalty = item.data?.loyaltyValue ?? 100;
    if (loyalty < 40) return 'high';
    if (loyalty < 60) return 'moderate';
  }
  if (item.type === 'fleet_composition' || item.type === 'fleet_position') {
    return 'high';
  }
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThreatRow({ item, currentTurn, onFocusSystem }: any) {
  const turnsLeft = item.expiresOnTurn - currentTurn;
  const isExpiringSoon = turnsLeft === 1;
  const level = getThreatLevel(item);
  const color = level === 'high' ? '#f85149' : level === 'event' ? '#58a6ff' : '#e3b341';

  return (
    <div
      className="intel-threat-row"
      style={{ borderLeftColor: color, cursor: 'pointer' }}
      onClick={() => onFocusSystem(item.systemId)}
      title={`Focus map on ${item.systemId}`}
    >
      <span className="intel-threat-icon" style={{ color }}>
        {level === 'event' ? '🔵' : level === 'high' ? '🔴' : '🟡'}
      </span>
      <span className="intel-threat-system">{item.systemId}</span>
      <span className="intel-threat-type">{INTEL_TYPE_LABELS[item.type] ?? item.type}</span>
      {isExpiringSoon && <span className="intel-expiring-tag">(Expiring)</span>}
    </div>
  );
}

function IntelItemRow({ item, currentTurn }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const turnsLeft = item.expiresOnTurn - currentTurn;
  const turnsAgo  = currentTurn - item.revealedOnTurn;
  const isExpiringSoon = turnsLeft === 1;
  const ageColor = getAgeColor(turnsAgo);

  return (
    <div className={`intel-item-row${isExpiringSoon ? ' intel-item-row--expiring' : ''}`}>
      <div className="intel-item-main">
        <span className="intel-item-icon">{INTEL_TYPE_ICONS[item.type] ?? '📋'}</span>
        <div className="intel-item-body">
          <div className="intel-item-header">
            <span className="intel-item-system">{item.systemId}</span>
            <span className="intel-item-type">{INTEL_TYPE_LABELS[item.type] ?? item.type}</span>
            <span className="intel-item-source">{SOURCE_LABELS[item.source] ?? item.source}</span>
          </div>
          <div className="intel-item-summary">{getItemSummary(item)}</div>
        </div>
      </div>
      <div className="intel-item-meta">
        <span className="intel-item-age" style={{ color: ageColor }}>
          {turnsAgo === 0 ? 'Just gathered' : `Gathered ${turnsAgo} turn${turnsAgo !== 1 ? 's' : ''} ago`}
        </span>
        <span className={`intel-item-expiry${isExpiringSoon ? ' intel-item-expiry--soon' : ''}`}>
          {turnsLeft <= 0 ? 'Expired' : `Expires in ${formatDuration(turnsLeft, mode, ticksPerSecond, ticksPerTurn)}`}
        </span>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function IntelReportsPanel({ onClose, playerFactionId }: any) {
  const [items,         setItems]         = useState<any[]>([]);
  const [currentTurn,   setCurrentTurn]   = useState(1);
  const [activeFilters, setActiveFilters] = useState(new Set(FILTER_TYPES.map(f => f.id)));
  const [systemFilter,  setSystemFilter]  = useState('');
  const [showExpiring,  setShowExpiring]  = useState(false);
  const [sortBy,        setSortBy]        = useState('expiry');

  useEffect(() => {
    const factionId = playerFactionId ?? 'brandAuthority';

    const handler = (e: any) => {
      if (e.detail?.factionId && e.detail.factionId !== factionId) return;
      if (Array.isArray(e.detail?.items)) setItems(e.detail.items);
      if (e.detail?.currentTurn) setCurrentTurn(e.detail.currentTurn);
    };

    window.addEventListener('galaxy:intelUpdate', handler);
    window.dispatchEvent(new CustomEvent('galaxy:requestIntelUpdate'));

    return () => window.removeEventListener('galaxy:intelUpdate', handler);
  }, [playerFactionId]);

  const handleFocusSystem = useCallback((systemId: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:navigateTo', { detail: { systemId } }));
  }, []);

  const toggleFilter = useCallback((filterId: any) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filterId)) next.delete(filterId);
      else next.add(filterId);
      return next;
    });
  }, []);

  const systemsWithIntel = useMemo(() =>
    [...new Set(items.map(i => i.systemId))].sort(),
    [items]
  );

  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesFilter = FILTER_TYPES.some(f => activeFilters.has(f.id) && f.types.includes(item.type));
      if (!matchesFilter) return false;
      if (systemFilter && item.systemId !== systemFilter) return false;
      if (showExpiring && (item.expiresOnTurn - currentTurn) !== 1) return false;
      return true;
    });

    switch (sortBy) {
      case 'expiry':  result.sort((a, b) => a.expiresOnTurn - b.expiresOnTurn); break;
      case 'system':  result.sort((a, b) => a.systemId.localeCompare(b.systemId)); break;
      case 'type':    result.sort((a, b) => a.type.localeCompare(b.type)); break;
      default: break;
    }
    return result;
  }, [items, activeFilters, systemFilter, showExpiring, sortBy, currentTurn]);

  const threatItems = useMemo(() =>
    items.filter(item => getThreatLevel(item) != null),
    [items]
  );

  const subtitle = items.length === 0
    ? 'No active intel'
    : `${items.length} active item${items.length !== 1 ? 's' : ''}`;

  return (
    <InfoPanelFrame
      panelId="intel"
      title="Intel Reports"
      subtitle={subtitle}
      onClose={onClose}
    >
      {/* Threat Summary */}
      {threatItems.length > 0 && (
        <div className="info-panel-section intel-threat-section">
          <div className="info-panel-section-title">⚠ Threat Summary</div>
          <div className="intel-threat-list">
            {threatItems.map(item => (
              <ThreatRow
                key={item.id ?? `${item.systemId}-${item.type}`}
                item={item}
                currentTurn={currentTurn}
                onFocusSystem={handleFocusSystem}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="info-panel-section intel-filter-section">
        <div className="info-panel-section-title">Filters</div>
        <div className="intel-filter-row">
          {FILTER_TYPES.map(f => (
            <button
              key={f.id}
              className={`intel-filter-btn${activeFilters.has(f.id) ? ' intel-filter-btn--active' : ''}`}
              onClick={() => toggleFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="intel-filter-row">
          <select
            className="intel-system-select"
            value={systemFilter}
            onChange={e => setSystemFilter(e.target.value)}
          >
            <option value="">All Systems</option>
            {systemsWithIntel.map(sid => (
              <option key={sid} value={sid}>{sid}</option>
            ))}
          </select>
          <label className="intel-expiring-label">
            <input
              type="checkbox"
              checked={showExpiring}
              onChange={e => setShowExpiring(e.target.checked)}
            />
            Expiring Soon
          </label>
          <select
            className="intel-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="expiry">Sort: Expiry</option>
            <option value="system">Sort: System</option>
            <option value="type">Sort: Type</option>
          </select>
        </div>
      </div>

      {/* Intel Browser */}
      <div className="info-panel-section">
        <div className="info-panel-section-title">Intel Browser ({filteredItems.length})</div>
        {items.length === 0 ? (
          <div className="info-empty-state">
            <span className="info-empty-icon">🔎</span>
            <span className="info-empty-msg">No intelligence gathered yet.</span>
            <span className="info-empty-sub">Use fleet patrols or spy missions to collect intel.</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="info-empty-state">
            <span className="info-empty-msg">No items match the current filters.</span>
          </div>
        ) : (
          <div className="intel-item-list">
            {filteredItems.map(item => (
              <IntelItemRow
                key={item.id ?? `${item.systemId}-${item.type}-${item.revealedOnTurn}`}
                item={item}
                currentTurn={currentTurn}
              />
            ))}
          </div>
        )}
      </div>
    </InfoPanelFrame>
  );
}

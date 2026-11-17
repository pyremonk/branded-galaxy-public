/**
 * MapFilterHUD — Galaxy-map overlay filter toolbar.
 *
 * Seven mutually exclusive filter modes toggled by clicking icon-buttons
 * or pressing F1–F7. Dispatches 'galaxy:applyFilter' to the Phaser layer.
 * Sub-filters appear as a secondary row for modes that support them.
 *
 * Spec: 034-galaxy-map-filters-spec.md (FR-GMF-001 through FR-GMF-011)
 */
import { useState, useEffect, useCallback } from 'react';
import './MapFilterHUD.css';
import factionDefsData from '../../core/faction-definitions.json';
import constructionConfig from '../../core/construction-config.json';

/** Faction list derived from static definitions */
const FACTION_LIST = factionDefsData.factions.map(f => ({
  id:    f.id,
  name:  f.displayName,
  color: f.color?.primary ?? '#8b949e',
}));

/** Facility type list derived from construction config */
const FACILITY_TYPE_LIST = Object.values(constructionConfig.facilityTypes).map(f => ({
  id:   f.id,
  name: f.name,
}));

/** Build sub-filter option list for a given filter mode (FR-GMF-010) */
function getSubFilterOptions(mode: any) {
  switch (mode) {
    case 'faction':
      return [
        ...FACTION_LIST.map(f => ({ id: f.id, label: f.name, color: f.color })),
        { id: 'neutral', label: 'Neutral', color: '#8b949e' },
      ];
    case 'loyalty':
      return FACTION_LIST.map(f => ({ id: f.id, label: f.name, color: f.color }));
    case 'facilities':
      return [
        ...FACILITY_TYPE_LIST.map(f => ({ id: f.id, label: f.name, color: null })),
        { id: 'idle_shipyard', label: 'Idle Shipyards',           color: null },
        { id: 'idle_queue',    label: 'Idle Construction Queues', color: null },
      ];
    case 'missions':
      return [
        { id: null, label: 'All Factions', color: null },
        ...FACTION_LIST.map(f => ({ id: f.id, label: f.name, color: f.color })),
      ];
    default:
      return [];
  }
}

/** Filter mode definitions (FR-GMF-001, FR-GMF-011) */
const FILTERS = [
  {
    mode:         'faction',
    label:        'Faction',
    icon:         '\u29BF',
    shortcut:     'F1',
    title:        'Faction Filter — your faction systems highlighted; all others greyed out',
    hasSubFilter: true,
  },
  {
    mode:         'loyalty',
    label:        'Loyalty',
    icon:         '\u2665',
    shortcut:     'F2',
    title:        'Loyalty Filter — circle size shows loyalty score for focus faction',
    hasSubFilter: true,
  },
  {
    mode:         'resources',
    label:        'Resources',
    icon:         '\u25C8',
    shortcut:     'F3',
    title:        'Resource Filter — circle size shows credit/material output per system',
    hasSubFilter: false,
  },
  {
    mode:         'fleet',
    label:        'Fleets',
    icon: (
      <svg
        className="map-filter-icon-svg"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 2C11.4477 2 11 2.4477 11 3V9.346L8.637 7.284C8.236 6.954 7.616 6.978 7.275 7.388C6.935 7.798 6.959 8.418 7.37 8.759L11 12.346V21C11 21.553 11.4477 22 12 22C12.5523 22 13 21.553 13 21V12.346L16.63 8.759C17.041 8.418 17.065 7.798 16.725 7.388C16.384 6.978 15.764 6.954 15.363 7.284L13 9.346V3C13 2.4477 12.5523 2 12 2Z" />
      </svg>
    ),
    shortcut:     'F4',
    title:        'Fleet Filter — systems with stationed fleets highlighted; en-route destinations distinct',
    hasSubFilter: false,
  },
  {
    mode:         'facilities',
    label:        'Facilities',
    icon:         '\u2699',
    shortcut:     'F5',
    title:        'Facility Filter — systems with facilities in faction color; sub-filter by type',
    hasSubFilter: true,
  },
  {
    mode:         'threat',
    label:        'Threat',
    icon:         '\u26A0',
    shortcut:     'F6',
    title:        'Threat Filter — red border on enemy systems within 2 hops with stationed fleets',
    hasSubFilter: false,
  },
  {
    mode:         'missions',
    label:        'Missions',
    icon:         '\u25CE',
    shortcut:     'F7',
    title:        'Mission Filter — systems with active missions highlighted in faction color',
    hasSubFilter: true,
  },
];

export function MapFilterHUD() {
  const [activeFilter, setActiveFilter] = useState<any>(null);  // null = no filter active (FR-GMF-002)
  const [subFilter,    setSubFilter]    = useState<any>(null);
  const [hasFleets,    setHasFleets]    = useState(false);

  // Enable fleet filter as soon as Phaser reports fleet data (FR-GMF-006)
  useEffect(() => {
    const onFleetUpdate = (e: any) => {
      const fleets = e.detail?.fleets ?? [];
      setHasFleets(fleets.length > 0);
    };
    window.addEventListener('galaxy:fleetUpdate', onFleetUpdate);
    // Request current state in case the event already fired before mount
    window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
    return () => window.removeEventListener('galaxy:fleetUpdate', onFleetUpdate);
  }, []);

  /** Dispatch the active filter + sub-filter to Phaser */
  const dispatchFilter = useCallback((mode: any, sf: any) => {
    window.dispatchEvent(new CustomEvent('galaxy:applyFilter', {
      detail: { mode: mode ?? 'none', subFilter: sf ?? null },
    }));
  }, []);

  /** Toggle a top-level filter on/off (FR-GMF-002 toggle-off behavior) */
  const selectFilter = useCallback((mode: any, e?: any) => {
    e?.currentTarget?.blur();
    if (activeFilter === mode) {
      // Clicking an already-active filter button deactivates it
      setActiveFilter(null);
      setSubFilter(null);
      dispatchFilter(null, null);
    } else {
      setActiveFilter(mode);
      setSubFilter(null);
      dispatchFilter(mode, null);
    }
  }, [activeFilter, dispatchFilter]);

  /** Select or toggle a sub-filter option (FR-GMF-010) */
  const selectSubFilter = useCallback((optionId: any) => {
    const next = subFilter === optionId ? null : optionId;
    setSubFilter(next);
    dispatchFilter(activeFilter, next);
  }, [activeFilter, subFilter, dispatchFilter]);

  /** Clear all filters and return to default state (FR-GMF-002 Clear Filter) */
  const clearFilter = useCallback(() => {
    setActiveFilter(null);
    setSubFilter(null);
    dispatchFilter(null, null);
  }, [dispatchFilter]);

  // F1–F7 keyboard shortcuts (FR-GMF-011)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const idx = ['F1','F2','F3','F4','F5','F6','F7'].indexOf(e.key);
      if (idx === -1) return;
      e.preventDefault();
      const filter = FILTERS[idx];
      const isDisabled = filter.mode === 'fleet' ? !hasFleets : false;
      if (!isDisabled) selectFilter(filter.mode);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectFilter, hasFleets]);

  const activeFilterDef  = FILTERS.find(f => f.mode === activeFilter);
  const subFilterOptions = activeFilterDef?.hasSubFilter ? getSubFilterOptions(activeFilter) : [];

  return (
    <div className="map-filter-hud">
      <div className="map-filter-toolbar">
        {FILTERS.map(({ mode, label, icon, shortcut, title, hasSubFilter }) => {
          const disabled = mode === 'fleet' ? !hasFleets : false;
          const isActive = activeFilter === mode && !disabled;
          return (
            <button
              key={mode}
              className={[
                'map-filter-btn',
                isActive ? 'map-filter-btn--active' : '',
                disabled ? 'map-filter-btn--disabled' : '',
              ].filter(Boolean).join(' ')}
              onClick={(e) => !disabled && selectFilter(mode, e)}
              title={disabled && mode === 'fleet' ? 'Fleet Positions — no fleets deployed yet' : title}
              disabled={disabled}
              aria-pressed={isActive}
            >
              <span className="map-filter-icon">{icon}</span>
              <span className="map-filter-label">{label}</span>
              <span className="map-filter-key">{shortcut}</span>
            </button>
          );
        })}

        {/* Clear Filter button — visible whenever a filter is active (FR-GMF-002, FR-GMF-011) */}
        {activeFilter !== null && (
          <button
            className="map-filter-clear-btn"
            onClick={clearFilter}
            title="Clear active filter — return to default view"
          >
            <span className="map-filter-icon">&#x2715;</span>
            <span className="map-filter-label">Clear</span>
          </button>
        )}
      </div>

      {/* Sub-filter row — shown when active mode has sub-filter support (FR-GMF-010) */}
      {subFilterOptions.length > 0 && (
        <div className="map-filter-subbar">
          {subFilterOptions.map(({ id, label, color }) => (
            <button
              key={id ?? '__all__'}
              className={[
                'map-filter-sub-btn',
                subFilter === id ? 'map-filter-sub-btn--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => selectSubFilter(id)}
              style={color ? ({ '--sub-btn-color': color } as any) : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

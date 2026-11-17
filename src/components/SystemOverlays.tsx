/**
 * SystemOverlays — React layer that renders per-system labels directly on top
 * of the Phaser canvas using screen-space coordinates emitted by MainStage.
 *
 * Replaces Phaser canvas text for:
 *   - System name labels (at zoom ≥ 1.3)
 *   - Special-type icons (below the circle dot)
 *   - Fleet count badges (fleet filter mode only, count > 0)
 *
 * Event consumed: galaxy:systemOverlays
 *   { overlays, zoom, filterMode, fleetData }
 */
import { useState, useEffect } from 'react';
import './SystemOverlays.css';

const SPECIAL_ICONS: Record<string, string> = {
  manufacturingCenter: '⚙',
  researchFacility:    '⬡',
  tradeHub:            '◆',
  strategicChokepoint: '⬟',
};

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#8b949e',
};

export function SystemOverlays() {
  const [overlays,      setOverlays]      = useState<any[]>([]);
  const [zoom,          setZoom]          = useState(1);
  const [filterMode,    setFilterMode]    = useState<any>('none');
  const [fleetData,     setFleetData]     = useState<any>({});
  const [fleetPresence, setFleetPresence] = useState<any>({});

  useEffect(() => {
    const handler = (e: any) => {
      const d = e.detail;
      setOverlays(d.overlays       ?? []);
      setZoom(d.zoom               ?? 1);
      setFilterMode(d.filterMode   ?? 'none');
      setFleetData(d.fleetData     ?? {});
      setFleetPresence(d.fleetPresence ?? {});
    };
    window.addEventListener('galaxy:systemOverlays', handler);
    return () => window.removeEventListener('galaxy:systemOverlays', handler);
  }, []);

  const showSpecial = zoom >= 0.75;
  const showFleet   = filterMode === 'fleet';
  const showResource = filterMode === 'resources';

  return (
    <div className="sys-overlays" aria-hidden="true">
      {overlays.map((sys: any) => {
        // Fogged systems: show name in dim grey only — no faction reveal
        if (sys.isFogged) {
          const fontSize = Math.max(8, Math.round(11 * zoom));
          return (
            <div key={sys.id}>
              <div
                className="sys-overlay-name"
                style={{
                  left:     sys.x,
                  top:      sys.y - sys.radius - 5,
                  color:    '#4a5058',
                  fontSize: `${fontSize}px`,
                }}
              >
                {sys.name}
              </div>
            </div>
          );
        }

        const nameColor   = FACTION_COLORS[sys.loyalty] ?? '#8b949e';
        const fleetCount  = showFleet ? (fleetData[sys.id] ?? 0) : 0;
        const factionFleets = fleetPresence[sys.id] ?? [];
        const icon        = sys.specialType ? (SPECIAL_ICONS[sys.specialType] ?? '★') : null;
        const fontSize   = Math.max(8, Math.round(11 * zoom));

        return (
          <div key={sys.id}>
            {/* System name — always visible, font scales with zoom */}
            <div
              className="sys-overlay-name"
              style={{
                left:     sys.x,
                top:      sys.y - sys.radius - 5,
                color:    nameColor,
                fontSize: `${fontSize}px`,
              }}
            >
              {sys.name}
            </div>

            {/* Special-type icon — below the circle */}
            {showSpecial && icon && (
              <div
                className="sys-overlay-special"
                style={{
                  left: sys.x,
                  top:  sys.y + sys.radius + 5,
                }}
              >
                {icon}
              </div>
            )}

            {/* Resource output label — below special icon, resources filter only */}
            {showResource && sys.resourceOutput > 0 && (
              <div
                className="sys-overlay-resource"
                style={{
                  left: sys.x,
                  top:  sys.y + sys.radius + (showSpecial && icon ? 20 : 5),
                }}
              >
                {Math.round(sys.resourceOutput)}
              </div>
            )}

            {/* Intel indicator — top-right corner of circle */}
            {sys.hasIntel && (
              <div
                className="sys-overlay-intel"
                style={{
                  left: sys.x + sys.radius,
                  top:  sys.y - sys.radius,
                }}
              >
                ◆
              </div>
            )}

            {/* Per-faction fleet badges — bottom-right of circle, always visible */}
            {factionFleets.length > 0 && (
              <div
                className="sys-overlay-fleet-stack"
                style={{
                  left: sys.x + sys.radius + 15,
                  top:  sys.y + sys.radius + 15,
                }}
              >
                {factionFleets.map(({ factionId, count }: any) => (
                  <div
                    key={factionId}
                    className="sys-overlay-fleet-badge"
                    style={{ color: FACTION_COLORS[factionId] ?? '#8b949e' }}
                  >
                    <span className="sys-overlay-fleet-icon">◈</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

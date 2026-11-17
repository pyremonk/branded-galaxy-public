/**
 * SystemTooltip — React overlay that follows the cursor when hovering a
 * galaxy system node.  Replaces the old Phaser canvas tooltip.
 *
 * Events consumed (window):
 *   galaxy:systemHover    { detail: systemData }  — show tooltip
 *   galaxy:systemHoverEnd {}                       — hide tooltip
 */
import { useState, useEffect, useRef } from 'react';
import './SystemTooltip.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatRateSuffix } from '../utils/time-format.js';

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

export function SystemTooltip() {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [visible,  setVisible]  = useState(false);
  const [data,     setData]     = useState<any>(null);
  const [pos,      setPos]      = useState({ x: 0, y: 0 });
  const tooltipRef = useRef(null);

  useEffect(() => {
    const onHover    = (e: any) => { setData(e.detail); setVisible(true); };
    const onHoverEnd = ()  => setVisible(false);

    window.addEventListener('galaxy:systemHover',    onHover);
    window.addEventListener('galaxy:systemHoverEnd', onHoverEnd);
    return () => {
      window.removeEventListener('galaxy:systemHover',    onHover);
      window.removeEventListener('galaxy:systemHoverEnd', onHoverEnd);
    };
  }, []);

  // Follow mouse using native mousemove — no Phaser dependency needed
  useEffect(() => {
    const onMove = (e: any) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (!visible || !data) return null;

  const factionColor = FACTION_COLORS[data.loyalty] ?? '#8b949e';
  const factionName  = FACTION_NAMES[data.loyalty]  ?? data.loyalty ?? 'Unknown';
  const cr = data.resources?.credits   ?? 0;
  const mt = data.resources?.materials ?? 0;

  // Keep tooltip inside viewport
  const OFFSET_X = 16;
  const OFFSET_Y = -12;
  const W = 180; // matches CSS min-width
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  let left = pos.x + OFFSET_X;
  let top  = pos.y + OFFSET_Y;
  if (left + W > vpW - 8) left = pos.x - W - OFFSET_X;
  if (top < 8)             top  = 8;
  if (top + 140 > vpH)    top  = vpH - 148;

  return (
    <div
      ref={tooltipRef}
      className="sys-tooltip"
      style={{ left, top }}
      aria-hidden="true"
    >
      <div className="sys-tooltip-name">{data.name}</div>
      <div className="sys-tooltip-faction" style={{ color: factionColor }}>
        {factionName}
      </div>
      <div className="sys-tooltip-divider" />
      <div className="sys-tooltip-row">
        <span className="sys-tooltip-label">Population</span>
        <span className="sys-tooltip-value">{data.population}<span className="sys-tooltip-muted">/10</span></span>
      </div>
      <div className="sys-tooltip-row">
        <span className="sys-tooltip-label">Credits</span>
        <span className="sys-tooltip-value">{cr > 0 ? `+${cr}` : cr}<span className="sys-tooltip-muted">{formatRateSuffix(mode, ticksPerSecond, ticksPerTurn)}</span></span>
      </div>
      <div className="sys-tooltip-row">
        <span className="sys-tooltip-label">Materials</span>
        <span className="sys-tooltip-value">{mt > 0 ? `+${mt}` : mt}<span className="sys-tooltip-muted">{formatRateSuffix(mode, ticksPerSecond, ticksPerTurn)}</span></span>
      </div>
      {data.specialType && (
        <div className="sys-tooltip-special">{data.specialType.replace(/([A-Z])/g, ' $1').trim()}</div>
      )}
    </div>
  );
}

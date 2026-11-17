import { useState, useEffect, useCallback } from 'react';
import './ResourceHUD.css';
import { RESOURCE_ICONS } from '../icons.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatRateSuffix, formatTurnLabel, formatDuration, formatRateSuffixCompact } from '../utils/time-format.js';

const RESOURCE_LABELS: Record<string, string> = {
  credits:   'Credits',
  materials: 'Materials',
  recruits:  'Recruits',
  influence: 'Influence'
};

const RESOURCE_ORDER = ['credits', 'materials', 'recruits', 'influence'];

const FORECAST_TURNS = 5;

/**
 * Determine color class based on current vs cap ratio.
 * - Near-cap (>90%): red warning
 * - Green (>50% cap)
 * - Yellow (25–50%)
 * - Orange (10–25%)
 * - Red (<10%)
 */
function getResourceColorClass(current: any, cap: any) {
  const ratio = cap > 0 ? current / cap : 0;
  if (ratio > 0.90) return 'resource-near-cap';
  if (ratio > 0.50) return 'resource-healthy';
  if (ratio > 0.25) return 'resource-medium';
  if (ratio > 0.10) return 'resource-low';
  return 'resource-critical';
}

/**
 * Format a number with thousands separators.
 */
function fmt(n: any) {
  return Math.floor(n).toLocaleString();
}

/**
 * Trend arrow and class for a resource.
 */
function TrendIndicator({ trend }: any) {
  if (!trend || trend === 'stable') return <span className="trend-stable" title="Stable production">→</span>;
  if (trend === 'rising')  return <span className="trend-rising"  title="Production trending up">↑</span>;
  if (trend === 'falling') return <span className="trend-falling" title="Production trending down">↓</span>;
  return null;
}

/**
 * Calculate forecast warnings — cap overflow or depletion within N turns.
 */
function getForecastWarnings(resources: any, caps: any, avgProd: any, turns = FORECAST_TURNS) {
  const warnings = [];
  for (const r of RESOURCE_ORDER) {
    const cur  = resources[r] ?? 0;
    const cap  = caps[r]     ?? Infinity;
    const prod = avgProd[r]  ?? 0;
    if (prod <= 0) continue;

    // Turns until cap overflow
    if (cur > 0 && cap > cur) {
      const turnsToFill = Math.ceil((cap - cur) / prod);
      if (turnsToFill <= turns) {
        warnings.push({
          type: 'cap',
          resource: r,
          icon: (RESOURCE_ICONS as Record<string, string>)[r],
          label: RESOURCE_LABELS[r],
          turns: turnsToFill
        });
      }
    }
  }
  // Depletion warnings (resource going to 0 within N turns — only relevant if net spend > prod)
  // Handled separately — here we just surface them from the state
  return warnings;
}

/**
 * ResourceHUD — persistent top-right overlay showing all four resources.
 *
 * Listens to the 'galaxy:resourceUpdate' custom window event emitted by MainStage,
 * and optionally renders a breakdown panel on click.
 *
 * @param {{ onOpenBreakdown: function }} props
 */
export function ResourceHUD({ onOpenBreakdown }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [resourceData, setResourceData] = useState<any>(null);
  const [tooltipFor,   setTooltipFor]   = useState<any>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set());
  const [errorMsg, setErrorMsg] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => setResourceData(e.detail);
    window.addEventListener('galaxy:resourceUpdate', handler);
    return () => window.removeEventListener('galaxy:resourceUpdate', handler);
  }, []);

  // Listen for insufficient-resource errors emitted by game
  useEffect(() => {
    const handler = (e: any) => {
      setErrorMsg(e.detail?.message ?? 'Insufficient resources');
      setTimeout(() => setErrorMsg(null), 3500);
    };
    window.addEventListener('galaxy:insufficientResources', handler);
    return () => window.removeEventListener('galaxy:insufficientResources', handler);
  }, []);

  const handleResourceClick = useCallback(() => {
    if (onOpenBreakdown) onOpenBreakdown();
  }, [onOpenBreakdown]);

  if (!resourceData) return null;

  const { resources, caps, productionThisTurn, productionHistory, currentTurn } = resourceData;

  // Compute average production from history (or fallback to this turn)
  const avgProd = productionHistory?.length > 0
    ? Object.fromEntries(RESOURCE_ORDER.map(r => [
        r,
        Math.floor(productionHistory.reduce((s: any, t: any) => s + (t[r] || 0), 0) / productionHistory.length)
      ]))
    : { credits: 0, materials: 0, recruits: 0, influence: 0 };

  // Compute trends from production history
  function computeTrend(resource: any) {
    if (!productionHistory || productionHistory.length < 6) return 'stable';
    const recent = productionHistory.slice(-3);
    const older  = productionHistory.slice(-6, -3);
    const avgR = recent.reduce((s: any, t: any) => s + (t[resource] || 0), 0) / 3;
    const avgO = older.reduce( (s: any, t: any) => s + (t[resource] || 0), 0) / 3;
    if (avgO === 0) return 'stable';
    const ratio = (avgR - avgO) / Math.abs(avgO);
    if (ratio >  0.05) return 'rising';
    if (ratio < -0.05) return 'falling';
    return 'stable';
  }

  const warnings = getForecastWarnings(resources, caps, avgProd);
  const activeWarnings = warnings.filter(w => !dismissedWarnings.has(`${w.resource}-${w.type}`));

  return (
    <div className="resource-hud" role="complementary" aria-label="Resource Overview">
      <div className="resource-hud-header">
        <span className="resource-hud-turn">{formatTurnLabel(currentTurn)}</span>
        <button
          className="resource-hud-details-btn"
          onClick={handleResourceClick}
          title="Open resource breakdown"
        >
          Details
        </button>
      </div>

      {/* Error feedback */}
      {errorMsg && (
        <div className="resource-error-banner" role="alert">
          ⚠ {errorMsg}
        </div>
      )}

      {/* Forecast warnings */}
      {activeWarnings.map(w => (
        <div key={`${w.resource}-${w.type}`} className="resource-warning-banner">
          <span>{w.icon} {w.label} at cap in ~{w.turns} turn{w.turns !== 1 ? 's' : ''} — consider spending</span>
          <button
            className="resource-warning-dismiss"
            onClick={() => setDismissedWarnings(prev => new Set([...prev, `${w.resource}-${w.type}`]))}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="resource-hud-rows">
        {RESOURCE_ORDER.map(key => {
          const current = resources[key] ?? 0;
          const cap     = caps[key]     ?? 1;
          const prod    = productionThisTurn[key] ?? 0;
          const colorClass = getResourceColorClass(current, cap);
          const trend   = computeTrend(key);

          return (
            <div
              key={key}
              className={`resource-row ${colorClass}`}
              onMouseEnter={() => setTooltipFor(key)}
              onMouseLeave={() => setTooltipFor(null)}
              onClick={handleResourceClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleResourceClick(); }}
              aria-label={`${RESOURCE_LABELS[key]}: ${fmt(current)} of ${fmt(cap)}`}
            >
              <span className="resource-icon">{(RESOURCE_ICONS as Record<string, string>)[key]}</span>
              <span className="resource-label">{RESOURCE_LABELS[key]}</span>
              <span className="resource-value">{fmt(current)}</span>
              <span className="resource-cap">/ {fmt(cap)}</span>
              <span className="resource-production">
                {prod >= 0 ? '+' : ''}{fmt(prod)}{formatRateSuffix(mode, ticksPerSecond, ticksPerTurn)}
              </span>
              <TrendIndicator trend={trend} />

              {tooltipFor === key && (
                <div className="resource-tooltip" role="tooltip">
                  <strong>{RESOURCE_LABELS[key]}</strong>
                  <div>Current: {fmt(current)}</div>
                  <div>Cap: {fmt(cap)}</div>
                  <div>This turn: {prod >= 0 ? '+' : ''}{fmt(prod)}</div>
                  <div>Avg{formatRateSuffixCompact(mode, ticksPerSecond, ticksPerTurn)}: {fmt(avgProd[key] ?? 0)}</div>
                  <div>Utilization: {cap > 0 ? Math.round(current / cap * 100) : 0}%</div>
                  {avgProd[key] > 0 && cap > current && (
                    <div>To cap: ~{formatDuration(Math.ceil((cap - current) / avgProd[key]), mode, ticksPerSecond, ticksPerTurn)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { ResourceTrends } from './ResourceTrends';
import { RESOURCE_ICONS } from '../icons.js';
import './ResourceBreakdown.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatTurnLabel, formatRateSuffix } from '../utils/time-format.js';

const RESOURCE_ORDER  = ['credits', 'materials', 'recruits', 'influence'];
const RESOURCE_LABELS: Record<string, string> = { credits: 'Credits', materials: 'Materials', recruits: 'Recruits', influence: 'Influence' };

const SPECIAL_LABELS = {
  manufacturingCenter:  'Mfg. Center (+50% mat)',
  researchFacility:     'Research (+30% inf)',
  tradeHub:             'Trade Hub (+40% cred)',
  strategicChokepoint:  'Chokepoint (+20% inf)'
};

function fmt(n: any) {
  return Math.floor(n).toLocaleString();
}

function sign(n: any) {
  const v = Math.floor(n);
  return v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString();
}

/**
 * ResourceBreakdown — full-screen modal overlay showing per-system production,
 * spending this turn, net change, and forecasted next turn.
 *
 * @param {{ onClose: function, onOpenTransactionLog: function }} props
 */
export function ResourceBreakdown({ onClose, onOpenTransactionLog }: any) {
  useBlockPhaserInput();
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [data, setData] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Capture the latest resource update
    const handler = (e: any) => setData(e.detail);
    window.addEventListener('galaxy:resourceUpdate', handler);
    return () => window.removeEventListener('galaxy:resourceUpdate', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: any) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Request latest data on mount
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('galaxy:requestResourceUpdate'));
  }, []);

  if (!data) {
    return (
      <div className="breakdown-overlay" role="dialog" aria-modal="true" aria-label="Resource Breakdown">
        <div className="breakdown-panel">
          <div className="breakdown-loading">Loading resource data…</div>
        </div>
      </div>
    );
  }

  const {
    resources, caps, productionThisTurn, spendingThisTurn,
    productionHistory, queuedSpending, currentTurn
  } = data;

  // Compute per-resource net change
  const netChange: Record<string, number> = {};
  RESOURCE_ORDER.forEach(r => {
    netChange[r] = (productionThisTurn[r] ?? 0) - (spendingThisTurn[r] ?? 0);
  });

  // Forecast next turn (simple: current + production, capped)
  const forecast: Record<string, number> = {};
  RESOURCE_ORDER.forEach(r => {
    const avgProd = productionHistory.length > 0
      ? Math.floor(productionHistory.reduce((s: any, t: any) => s + (t[r] || 0), 0) / productionHistory.length)
      : (productionThisTurn[r] ?? 0);
    forecast[r] = Math.min((resources[r] ?? 0) + avgProd, caps[r] ?? Infinity);
  });

  // Spending transactions this turn from transactionLog (not directly available in event;
  // we use spendingThisTurn totals per resource instead)
  const hasSpending = RESOURCE_ORDER.some(r => (spendingThisTurn[r] ?? 0) > 0);
  const hasQueued   = RESOURCE_ORDER.some(r => (queuedSpending[r] ?? 0) > 0);

  return (
    <div
      className="breakdown-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Resource Breakdown"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="breakdown-panel">
        {/* Header */}
        <div className="breakdown-header">
          <h2 className="breakdown-title">Resource Breakdown — {formatTurnLabel(currentTurn)}</h2>
          <button className="breakdown-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Production Summary */}
        <section className="breakdown-section">
          <h3 className="breakdown-section-title">Production Summary</h3>
          <table className="breakdown-table">
            <thead>
              <tr>
                <th></th>
                <th>Resource</th>
                <th>Current</th>
                <th>Cap</th>
                <th>Produced</th>
                <th>Spent</th>
                <th>Net</th>
                <th>Next {formatRateSuffix(mode, ticksPerSecond, ticksPerTurn).slice(1)} (est.)</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_ORDER.map(r => (
                <tr key={r}>
                  <td>{(RESOURCE_ICONS as Record<string, string>)[r]}</td>
                  <td className="bd-label">{RESOURCE_LABELS[r]}</td>
                  <td className="bd-num">{fmt(resources[r] ?? 0)}</td>
                  <td className="bd-num bd-cap">{fmt(caps[r] ?? 0)}</td>
                  <td className="bd-num bd-prod">{sign(productionThisTurn[r] ?? 0)}</td>
                  <td className="bd-num bd-spend">{spendingThisTurn[r] ? `-${fmt(spendingThisTurn[r])}` : '—'}</td>
                  <td className={`bd-num ${netChange[r] >= 0 ? 'bd-prod' : 'bd-spend'}`}>{sign(netChange[r])}</td>
                  <td className="bd-num bd-forecast">{fmt(forecast[r])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Spending This Turn */}
        {(hasSpending || hasQueued) && (
          <section className="breakdown-section">
            <h3 className="breakdown-section-title">Spending This Turn</h3>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Resource</th>
                  <th>Committed</th>
                  <th>Queued / Pending</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCE_ORDER.filter(r => (spendingThisTurn[r] ?? 0) > 0 || (queuedSpending[r] ?? 0) > 0).map(r => (
                  <tr key={r}>
                    <td>{(RESOURCE_ICONS as Record<string, string>)[r]}</td>
                    <td className="bd-label">{RESOURCE_LABELS[r]}</td>
                    <td className="bd-num bd-spend">{spendingThisTurn[r] ? `-${fmt(spendingThisTurn[r])}` : '—'}</td>
                    <td className="bd-num bd-queued">{queuedSpending[r] ? `-${fmt(queuedSpending[r])}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Production History Chart */}
        {productionHistory.length > 0 && (
          <section className="breakdown-section">
            <h3 className="breakdown-section-title">Production Trends</h3>
            <ResourceTrends
              productionHistory={productionHistory}
              caps={caps}
            />
          </section>
        )}

        {/* Production History Table */}
        {productionHistory.length > 0 && (
          <section className="breakdown-section">
            <h3 className="breakdown-section-title">
              Production History (last {productionHistory.length} turns)
            </h3>
            <div className="breakdown-history-scroll">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Turn</th>
                    {RESOURCE_ORDER.map(r => <th key={r}>{(RESOURCE_ICONS as Record<string, string>)[r]} {RESOURCE_LABELS[r]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...productionHistory].reverse().map((entry, i) => (
                    <tr key={i} className={i === 0 ? 'bd-latest' : ''}>
                      <td className="bd-num">{entry.turn}</td>
                      {RESOURCE_ORDER.map(r => (
                        <td key={r} className="bd-num bd-prod">{sign(entry[r] ?? 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="breakdown-footer">
          {onOpenTransactionLog && (
            <button className="breakdown-txlog-btn" onClick={onOpenTransactionLog}>
              View Transaction Log
            </button>
          )}
          <span>Click outside or press <kbd>Esc</kbd> to close.</span>
        </div>
      </div>
    </div>
  );
}

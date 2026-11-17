import { useState, useMemo } from 'react';
import './TransactionLog.css';
import { RESOURCE_ICONS } from '../icons.js';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { formatTurnLabelCompact } from '../utils/time-format.js';

const RESOURCE_ORDER  = ['credits', 'materials', 'recruits', 'influence', 'all'];
const TYPE_ORDER      = ['production', 'spending', 'refund', 'adjustment', 'all'];

const TYPE_CLASS: Record<string, string> = {
  production:  'tx-production',
  spending:    'tx-spending',
  refund:      'tx-refund',
  adjustment:  'tx-adjustment'
};

function sign(n: any) {
  const v = Math.floor(n);
  return v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString();
}

/**
 * TransactionLog — sortable, filterable list of all resource transactions.
 *
 * @param {{
 *   transactions: Array<{ turn, timestamp, type, resource, amount, source, details }>,
 *   onClose: function
 * }} props
 */
export function TransactionLog({ transactions = [], onClose }: any) {
  useBlockPhaserInput();
  const resourceIcons = RESOURCE_ICONS as Record<string, string>;
  const [filterResource, setFilterResource] = useState('all');
  const [filterType,     setFilterType]     = useState('all');
  const [turnFrom,       setTurnFrom]       = useState('');
  const [turnTo,         setTurnTo]         = useState('');

  const filtered = useMemo(() => {
    let rows = [...transactions].reverse(); // most recent first

    if (filterResource !== 'all') {
      rows = rows.filter(tx => tx.resource === filterResource);
    }
    if (filterType !== 'all') {
      rows = rows.filter(tx => tx.type === filterType);
    }
    const from = parseInt(turnFrom, 10);
    const to   = parseInt(turnTo,   10);
    if (!isNaN(from)) rows = rows.filter(tx => tx.turn >= from);
    if (!isNaN(to))   rows = rows.filter(tx => tx.turn <= to);

    return rows;
  }, [transactions, filterResource, filterType, turnFrom, turnTo]);

  function exportCSV() {
    const header = 'turn,timestamp,type,resource,amount,source,details';
    const rows   = filtered.map(tx =>
      [tx.turn, tx.timestamp, tx.type, tx.resource, tx.amount, tx.source,
       JSON.stringify(tx.details ?? {})].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'transaction-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="txlog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Transaction Log"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="txlog-panel">
        {/* Header */}
        <div className="txlog-header">
          <h2 className="txlog-title">Transaction Log ({transactions.length} entries)</h2>
          <div className="txlog-header-actions">
            <button className="txlog-export-btn" onClick={exportCSV} title="Export as CSV">
              Export CSV
            </button>
            <button className="txlog-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Filters */}
        <div className="txlog-filters">
          <label className="txlog-filter-group">
            <span>Resource</span>
            <select value={filterResource} onChange={e => setFilterResource(e.target.value)}>
              <option value="all">All</option>
              {['credits','materials','recruits','influence'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label className="txlog-filter-group">
            <span>Type</span>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All</option>
              {['production','spending','refund','adjustment'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="txlog-filter-group">
            <span>Turn from</span>
            <input
              type="number" min="1" placeholder="1"
              value={turnFrom}
              onChange={e => setTurnFrom(e.target.value)}
              className="txlog-turn-input"
            />
          </label>

          <label className="txlog-filter-group">
            <span>To</span>
            <input
              type="number" min="1" placeholder="—"
              value={turnTo}
              onChange={e => setTurnTo(e.target.value)}
              className="txlog-turn-input"
            />
          </label>

          <span className="txlog-count">{filtered.length} shown</span>
        </div>

        {/* Log Table */}
        <div className="txlog-scroll">
          {filtered.length === 0 ? (
            <div className="txlog-empty">No transactions match current filters.</div>
          ) : (
            <table className="txlog-table">
              <thead>
                <tr>
                  <th>Turn</th>
                  <th>Type</th>
                  <th></th>
                  <th>Resource</th>
                  <th>Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, i) => (
                  <tr key={i} className={TYPE_CLASS[tx.type] ?? ''}>
                    <td className="txlog-turn">{formatTurnLabelCompact(tx.turn)}</td>
                    <td className="txlog-type">{tx.type}</td>
                    <td className="txlog-icon">{resourceIcons[tx.resource] ?? '?'}</td>
                    <td className="txlog-resource">{tx.resource}</td>
                    <td className="txlog-amount">{sign(tx.amount)}</td>
                    <td className="txlog-source">{tx.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="txlog-footer">
          Press <kbd>Esc</kbd> or click outside to close.
        </div>
      </div>
    </div>
  );
}

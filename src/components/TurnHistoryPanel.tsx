/**
 * TurnHistoryPanel — Scrollable log of all past Turn Summaries.
 *
 * Opened by clicking the turn number button in TopBarHUD.
 * Available at any time during the Action Phase.
 * Summaries are displayed newest-to-oldest; each is collapsible.
 *
 * Props:
 *   turnHistory  Array  — [{ turn, entries[] }, ...] newest-first
 *   onClose      Function
 *
 * Spec: 036-notifications-alerts-spec.md (FR-NA-006)
 */
import { useState, useCallback } from 'react';
import './TurnHistoryPanel.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { UI_ICONS } from '../icons.js';
import { formatTurnLabel } from '../utils/time-format.js';

const CATEGORY_LABELS: Record<string, string> = {
  resolution:  'Resolution',
  maintenance: 'Maintenance',
  alert:       `${UI_ICONS.warning} Alert`,
  system:      '\u2014 System \u2014',
};

const CATEGORY_COLORS: Record<string, string> = {
  resolution:  '#58a6ff',
  maintenance: '#3fb950',
  alert:       '#f85149',
  system:      '#6e7681',
};

function TurnHistoryEntry({ record, playerFactionId }: any) {
  const [expanded, setExpanded] = useState(true);

  const handleGoto = useCallback((systemId: any) => {
    if (systemId) {
      window.dispatchEvent(new CustomEvent('galaxy:navigateTo', {
        detail: { systemId }
      }));
    }
  }, []);

  const visibleEntries = playerFactionId
    ? record.entries.filter((e: any) => e.factionId === null || e.factionId === playerFactionId)
    : record.entries;

  const urgentEntries  = visibleEntries.filter((e: any) => e.urgent);
  const regularEntries = visibleEntries.filter((e: any) => !e.urgent);

  return (
    <div className="thp-entry">
      <button
        className="thp-entry-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="thp-entry-turn">{formatTurnLabel(record.turn)}</span>
        <span className="thp-entry-count">{visibleEntries.length} event{visibleEntries.length !== 1 ? 's' : ''}</span>
        <span className="thp-entry-caret">{expanded ? UI_ICONS.trendUp : UI_ICONS.trendDown}</span>
      </button>

      {expanded && (
        <div className="thp-entry-body">
          {visibleEntries.length === 0 && (
            <div className="thp-empty">No events recorded.</div>
          )}

          {urgentEntries.length > 0 && (
            <div className="thp-section">
              <div className="thp-section-label" style={{ color: CATEGORY_COLORS.alert }}>
                {CATEGORY_LABELS.alert}
              </div>
              {urgentEntries.map((evt: any, i: any) => (
                <div key={i} className="thp-event thp-event--alert">
                  <span className="thp-message">{evt.message}</span>
                  {evt.systemId && (
                    <button
                      className="thp-goto"
                      onClick={() => handleGoto(evt.systemId)}
                      title="Navigate to location"
                    >
                      Goto
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {regularEntries.length > 0 && (
            <div className="thp-section">
              {regularEntries.map((evt: any, i: any) => {
                const color = CATEGORY_COLORS[evt.category] ?? '#8b949e';
                return (
                  <div key={i} className="thp-event">
                    <span className="thp-category" style={{ color }}>
                      {CATEGORY_LABELS[evt.category] ?? evt.category}
                    </span>
                    <span className="thp-message">{evt.message}</span>
                    {evt.systemId && (
                      <button
                        className="thp-goto"
                        onClick={() => handleGoto(evt.systemId)}
                        title="Navigate to location"
                      >
                        Goto
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TurnHistoryPanel({ turnHistory = [], onClose, playerFactionId = null }: any) {
  useBlockPhaserInput();
  return (
    <div className="thp-backdrop" onClick={onClose}>
      <div className="thp-panel" onClick={e => e.stopPropagation()}>

        <div className="thp-header">
          <span className="thp-title">Turn History</span>
          <button className="thp-close" onClick={onClose} aria-label="Close turn history">
            {UI_ICONS.cancel}
          </button>
        </div>

        <div className="thp-list">
          {turnHistory.length === 0 && (
            <div className="thp-empty thp-empty--panel">
              No turn history yet. End your first turn to see a summary here.
            </div>
          )}
          {turnHistory.map((record: any) => (
            <TurnHistoryEntry key={record.turn} record={record} playerFactionId={playerFactionId} />
          ))}
        </div>

      </div>
    </div>
  );
}

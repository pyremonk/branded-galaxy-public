/**
 * AlertHistoryPanel — accordion-style alert log modal.
 *
 * Hierarchy:
 *   Turn (Month N)
 *     Your Forces  |  Enemy Activity
 *       Critical Failures & Failures
 *       Critical Successes & Successes
 *       Informational
 *       Tips  (Your Forces only)
 *         Message row  →  expands inline to show outcome details
 *
 * Spec: 063-player-alerts-spec.md (FR-PA-005)
 */

import { useState, useEffect } from 'react';
import { useAlerts } from '../contexts/AlertContext.jsx';
import { ALERT_ICONS, UI_ICONS } from '../icons.js';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { audioManager } from '../../core/audio-manager.js';
import { OUTCOME_GROUPS, renderMessage } from './messageUtils.js';
import './AlertHistoryPanel.css';

const OUTCOME_TIER_COLORS: Record<string, string> = {
  'Critical Success': '#3fb950',
  'Success':          '#58a6ff',
  'Failure':          '#f85149',
  'Critical Failure': '#ff4444',
};

const TIPS_GROUP = { key: 'tips', label: 'Tips', icon: '\u2699', color: '#8b949e' };

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Maps an alert's tier string (or category) to an OUTCOME_GROUPS bucket key. */
function tierToGroupKey(tier: any, category: any) {
  if (category === 'tip') return 'tips';
  if (tier === 'Critical Success' || tier === 'Success') return 'successes';
  if (tier === 'Critical Failure' || tier === 'Failure') return 'failures';
  return 'info';
}

/**
 * Groups alerts into { turn, playerAlerts, enemyAlerts } entries sorted descending.
 * enemyAlerts: actorFactionId is set and differs from the player faction.
 * playerAlerts: everything else.
 */
function groupAlertsByTurn(alerts: any, playerFactionId: any) {
  const turnMap = new Map<number, { playerAlerts: any[]; enemyAlerts: any[] }>();
  for (const alert of alerts) {
    const { turn, actorFactionId } = alert;
    if (!turnMap.has(turn)) turnMap.set(turn, { playerAlerts: [], enemyAlerts: [] });
    const entry = turnMap.get(turn);
    if (!entry) continue;
    if (actorFactionId && actorFactionId !== playerFactionId) {
      entry.enemyAlerts.push(alert);
    } else {
      entry.playerAlerts.push(alert);
    }
  }
  return Array.from(turnMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([turn, { playerAlerts, enemyAlerts }]) => ({ turn, playerAlerts, enemyAlerts }));
}

/** Organise a flat alert array into outcome buckets. */
function bucketAlerts(alerts: any) {
  const buckets: Record<string, any[]> = { failures: [], successes: [], info: [], tips: [] };
  for (const alert of alerts) {
    const key = tierToGroupKey(alert.outcome?.tier ?? null, alert.category);
    buckets[key].push(alert);
  }
  return buckets;
}

/** Toggle a key's presence in a Set-based state value. */
function toggleSet(set: any, setter: any, key: any) {
  setter((prev: any) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Chevron({ expanded }: any) {
  return (
    <span
      className={`ah-chevron${expanded ? ' ah-chevron--open' : ''}`}
      aria-hidden="true"
    >
      {UI_ICONS.chevronRight}
    </span>
  );
}

function MessageRow({ alert, expanded, onToggle, onGoTo }: any) {
  const { outcome, category, message } = alert;
  const alertIcons = ALERT_ICONS as Record<string, string>;
  const tierColor = OUTCOME_TIER_COLORS[outcome?.tier] ?? null;
  return (
    <div className="ah-message-block">
      <button
        className={`ah-message-row${expanded ? ' ah-message-row--open' : ''}`}
        onClick={() => { audioManager.playUIClick(); onToggle(alert.id); }}
        aria-expanded={expanded}
      >
        <span className="ah-message-icon" aria-hidden="true">
          {alertIcons[category] ?? alertIcons.event}
        </span>
        <span className="ah-message-text">{renderMessage(message)}</span>
        <Chevron expanded={expanded} />
      </button>
      {expanded && (
        <div className="ah-message-outcome">
          {outcome?.summary && (
            <div className="ah-outcome-summary">
              <span>{outcome.summary}</span>
              {outcome.tier && (
                <span
                  className="ah-outcome-tier"
                  style={tierColor ? { color: tierColor, borderColor: tierColor } : {}}
                >
                  {outcome.tier}
                </span>
              )}
            </div>
          )}
          {outcome?.details && outcome.details.length > 0 && (
            <div className="ah-outcome-details">
              {outcome.details.map((row: any, i: any) => (
                <div key={i} className="ah-outcome-row">
                  <span className="ah-outcome-label">{row.label}</span>
                  <span className="ah-outcome-value">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          {outcome?.systemId && (
            <button
              className="ah-outcome-goto-btn"
              onClick={() => onGoTo(outcome.systemId)}
            >
              {UI_ICONS.hyperspaceLane} Go to {outcome.systemName ?? 'System'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({ group, collapsed, onToggle, expandedMessages, onToggleMessage, onGoTo }: any) {
  const { label, icon, color, alerts } = group;
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="ah-category-section">
      <button
        className="ah-category-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <Chevron expanded={!collapsed} />
        <span className="ah-category-icon" style={{ color }} aria-hidden="true">{icon}</span>
        <span className="ah-category-label" style={{ color }}>{label}</span>
        <span className="ah-category-count">({alerts.length})</span>
      </button>
      {!collapsed && (
        <div className="ah-category-body">
          {alerts.map((alert: any) => (
            <MessageRow
              key={alert.id}
              alert={alert}
              expanded={expandedMessages.has(alert.id)}
              onToggle={onToggleMessage}
              onGoTo={onGoTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FactionSection({
  label, alerts, includeTips, catKeyPrefix,
  collapsedFactions, collapsedCategories, expandedMessages,
  onToggleFaction, onToggleCategory, onToggleMessage, onGoTo,
}: any) {
  const factionKey  = `${catKeyPrefix}-${label}`;
  const isCollapsed = collapsedFactions.has(factionKey);
  const buckets     = bucketAlerts(alerts);
  const groups = [
    ...OUTCOME_GROUPS.map(g => ({ ...g, alerts: buckets[g.key] ?? [] })),
    ...(includeTips ? [{ ...TIPS_GROUP, alerts: buckets.tips ?? [] }] : []),
  ].filter(g => g.alerts.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="ah-faction-section">
      <button
        className="ah-faction-header"
        onClick={() => onToggleFaction(factionKey)}
        aria-expanded={!isCollapsed}
      >
        <Chevron expanded={!isCollapsed} />
        <span className="ah-faction-label">{label}</span>
        <span className="ah-faction-count">({alerts.length})</span>
      </button>
      {!isCollapsed && (
        <div className="ah-faction-body">
          {groups.map(group => {
            const catKey = `${factionKey}-${group.key}`;
            return (
              <CategorySection
                key={group.key}
                group={group}
                collapsed={collapsedCategories.has(catKey)}
                onToggle={() => onToggleCategory(catKey)}
                expandedMessages={expandedMessages}
                onToggleMessage={onToggleMessage}
                onGoTo={onGoTo}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {{ onClose: Function }} props
 */
export function AlertHistoryPanel({ onClose }: any) {
  useBlockPhaserInput();

  const { alerts, playerFactionId } = useAlerts();

  // Accordion state — all sections default expanded, messages default collapsed
  const [collapsedTurns,      setCollapsedTurns]      = useState<Set<string>>(() => new Set());
  const [collapsedFactions,   setCollapsedFactions]   = useState<Set<string>>(() => new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [expandedMessages,    setExpandedMessages]    = useState<Set<string>>(() => new Set());

  // Escape key dismisses
  useEffect(() => {
    const handler = (e: any) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify AlertBar that the panel closed so it can resume pacing
  const handleClose = () => {
    window.dispatchEvent(new CustomEvent('alertPanel:closed'));
    onClose();
  };

  const handleGoToSystem = (systemId: any) => {
    audioManager.playUIClick();
    window.dispatchEvent(new CustomEvent('galaxy:navigateTo', { detail: { systemId } }));
    handleClose();
  };

  const handleToggleMessage = (id: any) => toggleSet(expandedMessages, setExpandedMessages, id);

  const grouped = groupAlertsByTurn(alerts, playerFactionId);

  return (
    <div
      className="alert-history-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Alert History"
      onClick={handleClose}
    >
      <div
        className="alert-history-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="alert-history-header">
          <span className="alert-history-title">Alert History</span>
          <button
            className="alert-history-close"
            onClick={handleClose}
            aria-label="Close alert history"
          >
            {UI_ICONS.cancel}
          </button>
        </div>

        {/* ── Accordion body ─────────────────────────────────────────── */}
        <div className="ah-accordion">
          {alerts.length === 0 ? (
            <div className="alert-history-empty">No alerts yet this session.</div>
          ) : (
            grouped.map(({ turn, playerAlerts, enemyAlerts }) => {
              const turnKey         = String(turn);
              const isTurnCollapsed = collapsedTurns.has(turnKey);
              const totalCount      = playerAlerts.length + enemyAlerts.length;
              return (
                <div key={turn} className="ah-turn-section">
                  <button
                    className="ah-turn-header"
                    onClick={() => toggleSet(collapsedTurns, setCollapsedTurns, turnKey)}
                    aria-expanded={!isTurnCollapsed}
                  >
                    <Chevron expanded={!isTurnCollapsed} />
                    <span className="ah-turn-label">Month {turn}</span>
                    <span className="ah-turn-count">({totalCount})</span>
                  </button>
                  {!isTurnCollapsed && (
                    <div className="ah-turn-body">
                      {playerAlerts.length > 0 && (
                        <FactionSection
                          label="Your Forces"
                          alerts={playerAlerts}
                          includeTips={true}
                          catKeyPrefix={turnKey}
                          collapsedFactions={collapsedFactions}
                          collapsedCategories={collapsedCategories}
                          expandedMessages={expandedMessages}
                          onToggleFaction={(k: any) => toggleSet(collapsedFactions, setCollapsedFactions, k)}
                          onToggleCategory={(k: any) => toggleSet(collapsedCategories, setCollapsedCategories, k)}
                          onToggleMessage={handleToggleMessage}
                          onGoTo={handleGoToSystem}
                        />
                      )}
                      {enemyAlerts.length > 0 && (
                        <FactionSection
                          label="Enemy Activity"
                          alerts={enemyAlerts}
                          includeTips={false}
                          catKeyPrefix={turnKey}
                          collapsedFactions={collapsedFactions}
                          collapsedCategories={collapsedCategories}
                          expandedMessages={expandedMessages}
                          onToggleFaction={(k: any) => toggleSet(collapsedFactions, setCollapsedFactions, k)}
                          onToggleCategory={(k: any) => toggleSet(collapsedCategories, setCollapsedCategories, k)}
                          onToggleMessage={handleToggleMessage}
                          onGoTo={handleGoToSystem}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}


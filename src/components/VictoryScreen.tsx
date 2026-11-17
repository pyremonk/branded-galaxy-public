import { useState, useEffect, useCallback } from 'react';
import { victoryNotificationEngine } from '../../core/victory-notification-engine.js';
import { victoryConfigLoader } from '../../core/victory-config-loader.js';
import { intelligenceFilter } from '../../core/victory-intelligence-filter.js';
import './VictoryScreen.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration, formatTurnLabel } from '../utils/time-format.js';

// ─── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Return progress percentage for any condition type, 0-100.
 * Delegates to VictoryNotificationEngine which already does this correctly.
 */
function getProgressPercent(condition: any) {
  return victoryNotificationEngine.getProgressPercent(condition);
}

/**
 * CSS class name for a given progress percent.
 */
function progressColorClass(pct: any) {
  if (pct >= 95) return 'vs-color-red';
  if (pct >= 80) return 'vs-color-orange';
  if (pct >= 50) return 'vs-color-green';
  if (pct >= 25) return 'vs-color-yellow';
  return 'vs-color-gray';
}

/**
 * Estimate turns-to-victory from recent progress history.
 * @param {string} conditionId
 * @param {number} remainingPct
 * @param {Object} history - map of conditionId → [pct1, pct2, pct3, ...]
 */
function estimateTurnsToVictory(conditionId: any, currentPct: any, history: any) {
  const hist = history?.[conditionId];
  if (!hist || hist.length < 2) return null;

  const recent3 = hist.slice(-3);
  const deltas = [];
  for (let i = 1; i < recent3.length; i++) {
    deltas.push(recent3[i] - recent3[i - 1]);
  }
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avgDelta <= 0) return null;

  const remaining = 100 - currentPct;
  return Math.ceil(remaining / avgDelta);
}

/**
 * Human-readable value label for a condition.
 */
function getValueLabel(condition: any, conditionId: any) {
  if (!condition || !condition.unlocked) return null;
  switch (condition.type) {
    case 'percentage':
      return `${condition.current ?? 0}% / ${condition.required}%`;
    case 'counter':
      return `${(condition.current ?? 0).toLocaleString()} / ${condition.required.toLocaleString()}`;
    case 'threshold-with-secondary':
      return `${(condition.current ?? 0).toLocaleString()} credits / ${condition.secondaryCurrent ?? 0}% hubs`;
    case 'composite':
      return null;  // Shown as sub-conditions
    case 'boolean-composite':
      return null;
    case 'mission-chain': {
      const done = condition.missionChain?.filter((s: any) => s.completed).length ?? 0;
      return `${done} / ${condition.required} steps`;
    }
    default:
      return null;
  }
}

// ─── Sub-condition list ───────────────────────────────────────────────────────

function SubConditions({ condition, config }: any) {
  if (!condition) return null;

  if (condition.type === 'boolean-composite') {
    const configConds = config?.conditions ?? [];
    return (
      <ul className="vs-sub-conditions">
        {configConds.map((c: any) => (
          <li key={c.key}>
            <span className={condition.conditions?.[c.key] ? 'vs-check-true' : 'vs-check-false'}>
              {condition.conditions?.[c.key] ? '✓' : '✗'}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
    );
  }

  if (condition.type === 'composite') {
    const configConds = config?.conditions ?? [];
    return (
      <ul className="vs-sub-conditions">
        {configConds.map((c: any) => {
          const cur = condition.current?.[c.key];
          const req = condition.required?.[c.key];
          const met = typeof req === 'boolean' ? cur === req : (cur ?? 0) >= req;
          const label = typeof req === 'boolean'
            ? `${c.label}: ${met ? 'Yes' : 'No'}`
            : `${c.label}: ${cur ?? 0} / ${req}`;
          return (
            <li key={c.key}>
              <span className={met ? 'vs-check-true' : 'vs-check-false'}>
                {met ? '✓' : '✗'}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
    );
  }

  if (condition.type === 'mission-chain') {
    return (
      <ul className="vs-sub-conditions">
        {(condition.missionChain ?? []).map((step: any, i: any) => (
          <li key={step.id}>
            <span className={step.completed ? 'vs-check-true' : 'vs-check-false'}>
              {step.completed ? '✓' : `${i + 1}.`}
            </span>
            {config?.missionChain?.find((s: any) => s.id === step.id)?.label ?? step.id}
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

// ─── Single condition row ─────────────────────────────────────────────────────

function ConditionRow({ conditionId, condition, config, history }: any) {
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [expanded, setExpanded] = useState(false);

  if (!condition) return null;

  const locked  = !condition.unlocked;
  const pct     = locked ? 0 : getProgressPercent(condition);
  const eta     = !locked ? estimateTurnsToVictory(conditionId, pct, history) : null;
  const valLabel = getValueLabel(condition, conditionId);
  const diff    = config?.difficulty ?? 'medium';
  const colorCls = progressColorClass(pct);

  const rowClass = [
    'vs-condition-row',
    locked    ? 'vs-locked'   : '',
    expanded  ? 'vs-expanded' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClass} onClick={() => !locked && setExpanded(e => !e)}>
      <div className="vs-condition-top">
        <span className="vs-lock-icon">{locked ? '🔒' : ''}</span>
        <span className="vs-condition-name">{config?.name ?? conditionId}</span>
        <span className={`vs-difficulty-badge vs-diff-${diff}`}>{diff}</span>
        {!locked && <span className="vs-pct-label">{pct}%</span>}
      </div>

      {!locked && (
        <>
          <div className="vs-progress-bar-track">
            <div
              className={`vs-progress-bar-fill ${colorCls}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="vs-value-row">
            <span>{valLabel}</span>
            {eta != null && <span className="vs-eta">ETA: ~{formatDuration(eta, mode, ticksPerSecond, ticksPerTurn)}</span>}
          </div>
        </>
      )}

      {locked && (
        <div className="vs-unlock-note">
          🔒 Requires: {config?.unlockCondition?.techId ?? 'Unknown Technology'}
        </div>
      )}

      {expanded && !locked && (
        <div className="vs-detail-panel">
          <p className="vs-detail-description">{config?.description}</p>
          <SubConditions condition={condition} config={config} />
        </div>
      )}
    </div>
  );
}

// ─── Opponent section ─────────────────────────────────────────────────────────

function OpponentFactionSection({ factionId, filteredProgress, configLoader }: any) {
  const FACTION_LABELS: Record<string, string> = {
    brandAuthority: 'Brand Authority',
    union: 'Union',
    autoforge: 'Autoforge'
  };

  const entries = (Object.entries(filteredProgress ?? {}) as [string, any][]).filter(([k]) => !k.startsWith('_'));

  return (
    <div className="vs-opponent-faction">
      <p className="vs-opp-faction-name">{FACTION_LABELS[factionId] ?? factionId}</p>
      {entries.map(([conditionId, condition]) => {
        if (condition.hidden || !condition.unlocked) {
          return (
            <div key={conditionId} className="vs-opp-condition-row">
              <span className="vs-intel-required">
                {configLoader.getCondition(conditionId)?.name ?? conditionId}: Intel Required
              </span>
            </div>
          );
        }

        if (condition.tierBracket != null) {
          // Tier visibility only
          const name = configLoader.getCondition(conditionId)?.name ?? conditionId;
          return (
            <div key={conditionId} className="vs-opp-condition-row">
              <div className="vs-condition-top">
                <span className="vs-condition-name">{name}</span>
              </div>
              <div className="vs-progress-bar-track">
                <div
                  className={`vs-progress-bar-fill ${progressColorClass(condition.tierBracket)}`}
                  style={{ width: `${condition.tierBracket + 12}%` }}
                />
              </div>
              <div className="vs-value-row">
                <span style={{ color: '#484f58' }}>{condition.tierBracket}–{condition.tierBracket + 24}%</span>
              </div>
            </div>
          );
        }

        // Full visibility
        const pct = getProgressPercent(condition);
        const isWarning  = pct >= 80 && pct < 95;
        const isImminent = pct >= 95;
        const rowClass = [
          'vs-opp-condition-row',
          isWarning  ? 'vs-opp-warning'  : '',
          isImminent ? 'vs-opp-imminent' : ''
        ].filter(Boolean).join(' ');

        const name = configLoader.getCondition(conditionId)?.name ?? conditionId;

        return (
          <div key={conditionId} className={rowClass}>
            <div className="vs-condition-top">
              <span className="vs-condition-name">{name}</span>
              {isImminent && <span className="vs-threat-label vs-threat-imminent">⚠ IMMINENT</span>}
              {isWarning  && <span className="vs-threat-label vs-threat-warning">⚡ APPROACHING</span>}
              <span className="vs-pct-label">{pct}%</span>
            </div>
            <div className="vs-progress-bar-track">
              <div
                className={`vs-progress-bar-fill ${progressColorClass(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── VictoryScreen main component ────────────────────────────────────────────

/**
 * Full-screen victory progress panel, opened via V key or HUD click.
 *
 * Props:
 *  onClose       - function()
 *  playerFactionId  - string
 *  allFactions   - { [factionId]: { id, victoryProgress } }
 *  currentTurn   - number
 *  gameState     - full victoryGameState (for intelligence filter)
 */
export function VictoryScreen({ onClose, playerFactionId, allFactions, currentTurn, gameState }: any) {
  useBlockPhaserInput();
  const [history] = useState<any>({});  // conditionId → [pct, pct, ...] – accumulated per render

  // Load config once
  const [configLoader] = useState(() => {
    victoryConfigLoader.load();
    return victoryConfigLoader;
  });

  // Track progress history for ETA calculation
  useEffect(() => {
    const vp = allFactions?.[playerFactionId]?.victoryProgress;
    if (!vp) return;
    for (const [id, cond] of (Object.entries(vp) as [string, any][])) {
      if (id.startsWith('_') || !cond.unlocked) continue;
      const pct = getProgressPercent(cond);
      history[id] = [...(history[id] ?? []), pct].slice(-5);
    }
  });

  // Close on Escape key
  useEffect(() => {
    const handler = (e: any) => { if (e.key === 'Escape' || e.key === 'v' || e.key === 'V') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const playerVP     = allFactions?.[playerFactionId]?.victoryProgress;
  const playerConfig = configLoader.getConditionsForFaction(playerFactionId);

  const opponentIds = Object.keys(allFactions ?? {}).filter(id => id !== playerFactionId);

  return (
    <div className="victory-screen-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="victory-screen">

        {/* Header */}
        <div className="victory-screen-header">
          <h2>Victory Conditions</h2>
          <div className="vs-header-right">
            <span className="vs-turn-badge">{formatTurnLabel(currentTurn ?? 1)}</span>
            <button className="vs-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Player faction conditions */}
        <div className="vs-section">
          <p className="vs-section-title">Your Victory Paths</p>
          {playerConfig.map(cfg => (
            <ConditionRow
              key={cfg.id}
              conditionId={cfg.id}
              condition={playerVP?.[cfg.id]}
              config={cfg}
              history={history}
            />
          ))}
        </div>

        {/* Opponent threats */}
        {opponentIds.length > 0 && (
          <div className="vs-section">
            <p className="vs-section-title">Opposition Threats</p>
            {opponentIds.map(oppId => {
              const oppFaction = allFactions[oppId];
              if (!oppFaction) return null;
              const filtered = intelligenceFilter.filterOpponentProgress(
                playerFactionId,
                oppFaction,
                gameState ?? {}
              );
              return (
                <OpponentFactionSection
                  key={oppId}
                  factionId={oppId}
                  filteredProgress={filtered}
                  configLoader={configLoader}
                />
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

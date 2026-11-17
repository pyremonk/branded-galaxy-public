import { useMemo } from 'react';
import { victoryNotificationEngine } from '../../core/victory-notification-engine.js';
import { victoryConfigLoader } from '../../core/victory-config-loader.js';
import './VictoryHUD.css';

/**
 * Return the normalized 0-100 progress percent for a condition.
 */
function getProgressPercent(condition: any) {
  return victoryNotificationEngine.getProgressPercent(condition);
}

/**
 * Return CSS class for a given progress percent.
 */
function progressColorClass(pct: any) {
  if (pct >= 95) return 'vs-color-red';
  if (pct >= 80) return 'vs-color-orange';
  if (pct >= 50) return 'vs-color-green';
  if (pct >= 25) return 'vs-color-yellow';
  return 'vs-color-gray';
}

/**
 * Find the closest (highest-percent) unlocked victory condition.
 * @param {Object} victoryProgress
 * @returns {{ conditionId: string, pct: number } | null}
 */
function findClosestVictory(victoryProgress: any) {
  if (!victoryProgress) return null;

  let best: any = null;
  for (const [id, condition] of (Object.entries(victoryProgress) as [string, any][])) {
    if (id.startsWith('_') || !condition.unlocked) continue;
    const pct = getProgressPercent(condition);
    if (!best || pct > best.pct) {
      best = { conditionId: id, pct };
    }
  }
  return best;
}

/**
 * Check if any opponent faction has a condition at >= 80% visible progress.
 * @param {string} playerFactionId
 * @param {Object} allFactions
 * @returns {{ level: 'warning'|'imminent', factionId: string, conditionName: string } | null}
 */
function checkOpponentThreats(playerFactionId: any, allFactions: any, configLoader: any) {
  let highest: any = null;

  for (const [factionId, faction] of (Object.entries(allFactions ?? {}) as [string, any][])) {
    if (factionId === playerFactionId) continue;
    if (!faction.victoryProgress) continue;

    for (const [conditionId, condition] of (Object.entries(faction.victoryProgress) as [string, any][])) {
      if (conditionId.startsWith('_') || !condition.unlocked) continue;
      const pct = getProgressPercent(condition);
      if (pct < 80) continue;

      const condName = configLoader.getCondition(conditionId)?.name ?? conditionId;
      const level = pct >= 95 ? 'imminent' : 'warning';

      if (!highest || pct > highest.pct) {
        highest = { level, factionId, conditionId, conditionName: condName, pct };
      }
    }
  }
  return highest;
}

/**
 * VictoryHUD - Compact always-visible victory progress indicator.
 *
 * Props:
 *   playerFactionId   - string
 *   victoryProgress   - player faction's victoryProgress object
 *   allFactions       - { [factionId]: { id, victoryProgress } }
 *   onOpenVictoryScreen - function()
 */
export function VictoryHUD({ playerFactionId, victoryProgress, allFactions, onOpenVictoryScreen }: any) {
  // Load config (idempotent)
  useMemo(() => {
    try { victoryConfigLoader.load(); } catch (_) { /* already loaded */ }
  }, []);

  const closest  = findClosestVictory(victoryProgress);
  const threat   = checkOpponentThreats(playerFactionId, allFactions, victoryConfigLoader);
  const condName = closest
    ? (victoryConfigLoader.getCondition(closest.conditionId)?.name ?? closest.conditionId)
    : null;

  const pct      = closest?.pct ?? 0;
  const colorCls = progressColorClass(pct);

  const threatIcon = threat
    ? (threat.level === 'imminent' ? '🔴' : '⚠️')
    : null;

  const threatTitle = threat
    ? `${threat.conditionName}: ${Math.round(threat.pct)}% (${threat.factionId})`
    : undefined;

  return (
    <div
      className="victory-hud"
      onClick={onOpenVictoryScreen}
      title={threatTitle ?? 'Click to open Victory Conditions (V)'}
      style={{ position: 'relative' }}
    >
      {threatIcon && (
        <span className="vh-warning" title={threatTitle}>{threatIcon}</span>
      )}

      <div className="vh-label">Victory Progress</div>

      {closest ? (
        <>
          <div className="vh-condition-name">{condName}</div>
          <div className="vh-bar-track">
            <div
              className={`vh-bar-fill ${colorCls}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="vh-pct-row">
            <span>Closest path</span>
            <span className="vh-pct-value">{pct}%</span>
          </div>
        </>
      ) : (
        <div className="vh-no-progress">No progress yet</div>
      )}
    </div>
  );
}

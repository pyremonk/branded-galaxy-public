import { useState } from 'react';
import { victoryNotificationEngine } from '../../core/victory-notification-engine.js';
import { victoryConfigLoader } from '../../core/victory-config-loader.js';
import { PostGameStats } from './PostGameStats.jsx';
import './VictoryEndScreen.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';
import { formatTurnLabel } from '../utils/time-format.js';

const FACTION_LABELS: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'Union',
  autoforge:      'Autoforge'
};

const VICTORY_FLAVOR: Record<string, string> = {
  'vc-ba-territorial-control':  'The Brand Authority\'s corporate banner now flies over every star system in the galaxy.',
  'vc-ba-military-elimination': 'All resistance has been crushed. The Brand Authority reigns supreme by force of arms.',
  'vc-ba-economic-dominance':   'Economic control means total control. The galaxy\'s wealth flows through Brand Authority coffers.',
  'vc-ba-discovery':            'The rebel stronghold has been found and destroyed. The resistance is finished.',
  'vc-un-cumulative-loyalty':   'The hearts of the galaxy\'s people have been won. The Union\'s message echoes through every system.',
  'vc-un-survival':             'The resistance has endured. Through 100 turns of struggle, the Union proved it cannot be extinguished.',
  'vc-un-liberation':           'System by system, the oppressed were freed. The galaxy remembers who stood with them.',
  'vc-un-heroic':               'The revolutionary flame has spread beyond all control. The people have risen.',
  'vc-af-system-dependency':    'Autoforge technology is embedded into every corner of galactic civilization. There is no going back.',
  'vc-af-research':             'Technological singularity achieved. The galaxy has been remade by Autoforge\'s vision.',
  'vc-af-manufacturing':        'A thousand machines produced — the galaxy reshaped by industrial might.',
  'vc-af-peaceful':             'Coexistence, not conquest. Autoforge has changed the galaxy without firing a single shot.'
};

const DEFEAT_MESSAGES: Record<string, string> = {
  brandAuthority: 'The corporate machine falters. Your expansion has been halted.',
  union:          'The resistance flickers but is not extinguished. There will be another day.',
  autoforge:      'The machines return to standby. The integration was incomplete.'
};

/**
 * VictoryEndScreen — full-screen win/defeat overlay.
 *
 * Props:
 *   winner         - { factionId, conditionId, turnNumber }
 *   playerFactionId
 *   allFactions    - { [factionId]: { id, victoryProgress } }
 *   finalStats     - stats snapshot from VictoryValidator
 *   onContinue     - function()  — continue playing after victory
 *   onReturnToMenu - function()
 */
export function VictoryEndScreen({
  winner,
  playerFactionId,
  allFactions,
  finalStats,
  onContinue,
  onReturnToMenu
}: any) {
  useBlockPhaserInput();
  const [showStats, setShowStats] = useState(false);

  // Load config (idempotent)
  try { victoryConfigLoader.load(); } catch (_) {}

  const isVictory = winner?.factionId === playerFactionId;
  const factionLabel   = FACTION_LABELS[winner?.factionId] ?? winner?.factionId;
  const conditionName  = victoryConfigLoader.getCondition(winner?.conditionId)?.name ?? winner?.conditionId;
  const flavorText     = VICTORY_FLAVOR[winner?.conditionId] ?? '';
  const turnCount      = winner?.turnNumber ?? 0;

  // For defeat: find player's closest victory
  const playerVP       = allFactions?.[playerFactionId]?.victoryProgress;
  const closestEntry   = playerVP ? _findClosest(playerVP) : null;
  const closestName    = closestEntry
    ? victoryConfigLoader.getCondition(closestEntry.conditionId)?.name ?? closestEntry.conditionId
    : null;

  const overlayClass = isVictory
    ? 'victory-end-overlay ve-victory-bg'
    : 'victory-end-overlay ve-defeat-bg';

  if (showStats) {
    return (
      <PostGameStats
        finalStats={finalStats}
        winner={winner}
        allFactions={allFactions}
        onClose={() => setShowStats(false)}
      />
    );
  }

  return (
    <div className={overlayClass}>
      <div className="victory-end-panel">

        {/* Header */}
        <div className="ve-header">
          <p className="ve-result-label">
            {isVictory ? '— Victory —' : '— Defeat —'}
          </p>
          <h1 className={`ve-result-title ${isVictory ? 've-win' : 've-lose'}`}>
            {isVictory ? 'GALAXY SECURED' : 'RESISTANCE FALLS'}
          </h1>
          <p className="ve-result-subtitle">
            {isVictory
              ? `${factionLabel} achieved ${conditionName} \u2014 ${formatTurnLabel(turnCount)}`
              : `${factionLabel} achieved ${conditionName} on ${formatTurnLabel(turnCount)}`}
          </p>
          {flavorText && (
            <p style={{ color: '#8b949e', fontSize: '13px', marginTop: '10px', fontStyle: 'italic' }}>
              "{flavorText}"
            </p>
          )}
        </div>

        {/* Key stats */}
        <div className="ve-stats-section">
          <p className="ve-section-title">Final Statistics</p>
          <div className="ve-stat-grid">
            <div className="ve-stat-item">
              <div className="ve-stat-value">{turnCount}</div>
              <div className="ve-stat-label">Turns Played</div>
            </div>
            <div className="ve-stat-item">
              <div className="ve-stat-value">{finalStats?.galaxySize ?? '—'}</div>
              <div className="ve-stat-label">Total Systems</div>
            </div>
            <div className="ve-stat-item">
              <div className="ve-stat-value">
                {finalStats?.perFact?.[playerFactionId]?.finalSystemsControlled ?? '—'}
              </div>
              <div className="ve-stat-label">Systems Held</div>
            </div>
            <div className="ve-stat-item">
              <div className="ve-stat-value">
                {finalStats?.perFact?.[playerFactionId]?.peakSystemsControlled ?? '—'}
              </div>
              <div className="ve-stat-label">Peak Control</div>
            </div>
            <div className="ve-stat-item">
              <div className="ve-stat-value">
                {finalStats?.perFact?.[playerFactionId]?.technologiesCompleted ?? '—'}
              </div>
              <div className="ve-stat-label">Techs Researched</div>
            </div>
            <div className="ve-stat-item">
              <div className="ve-stat-value">
                {finalStats?.gameDurationMs
                  ? `${Math.round(finalStats.gameDurationMs / 60000)}m`
                  : '—'}
              </div>
              <div className="ve-stat-label">Duration</div>
            </div>
          </div>
        </div>

        {/* Defeat: closest victory info */}
        {!isVictory && closestEntry && (
          <div className="ve-defeat-closest">
            <p style={{ margin: 0 }}>
              You were{' '}
              <span className="ve-closest-highlight">{100 - closestEntry.pct}%</span>
              {' '}away from{' '}
              <span className="ve-closest-highlight">{closestName}</span> victory.
            </p>
            <p style={{ margin: '6px 0 0', color: '#484f58', fontSize: '11px' }}>
              {DEFEAT_MESSAGES[playerFactionId] ?? 'Better luck next time.'}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="ve-actions">
          {onContinue && (
            <button className="ve-btn ve-btn-secondary" onClick={onContinue}>
              Continue Playing
            </button>
          )}
          <button className="ve-btn ve-btn-primary" onClick={() => setShowStats(true)}>
            View Statistics
          </button>
          <button className="ve-btn ve-btn-danger" onClick={onReturnToMenu}>
            Return to Menu
          </button>
        </div>

      </div>
    </div>
  );
}

/**
 * @param {Object} victoryProgress
 * @returns {{ conditionId: string, pct: number } | null}
 */
function _findClosest(victoryProgress: any) {
  let best: any = null;
  for (const [id, condition] of (Object.entries(victoryProgress) as [string, any][])) {
    if (id.startsWith('_') || !condition.unlocked) continue;
    const pct = victoryNotificationEngine.getProgressPercent(condition);
    if (!best || pct > best.pct) best = { conditionId: id, pct };
  }
  return best;
}

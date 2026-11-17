import { useState } from 'react';
import { victoryConfigLoader } from '../../core/victory-config-loader.js';
import './PostGameStats.css';

const FACTION_LABELS: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'Union',
  autoforge:      'Autoforge'
};

const TABS = ['General', 'Faction Stats', 'Victory', 'Opponents'];

/**
 * PostGameStats — tabbed end-game statistics panel with JSON export.
 *
 * Props:
 *   finalStats   - stats object from VictoryValidator._collectFinalStats()
 *   winner       - { factionId, conditionId, turnNumber }
 *   allFactions  - { [factionId]: { id, victoryProgress } }
 *   onClose      - function()
 */
export function PostGameStats({ finalStats, winner, allFactions, onClose }: any) {
  const [activeTab, setActiveTab] = useState(0);

  // Load config (idempotent)
  try { victoryConfigLoader.load(); } catch (_) {}

  const conditionName = victoryConfigLoader.getCondition(winner?.conditionId)?.name ?? winner?.conditionId;
  const winnerLabel   = FACTION_LABELS[winner?.factionId] ?? winner?.factionId;

  function exportJSON() {
    const data = JSON.stringify({ finalStats, winner, timestamp: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `branded-galaxy-stats-turn${winner?.turnNumber ?? 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="post-game-overlay">
      <div className="post-game-panel">

        <div className="pg-header">
          <h2>Game Statistics</h2>
          <button className="pg-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="pg-tabs">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className={`pg-tab ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="pg-content">
          {activeTab === 0 && (
            <GeneralTab finalStats={finalStats} winner={winner} winnerLabel={winnerLabel} conditionName={conditionName} />
          )}
          {activeTab === 1 && (
            <FactionStatsTab finalStats={finalStats} />
          )}
          {activeTab === 2 && (
            <VictoryTab finalStats={finalStats} winner={winner} conditionName={conditionName} allFactions={allFactions} />
          )}
          {activeTab === 3 && (
            <OpponentsTab finalStats={finalStats} winner={winner} allFactions={allFactions} />
          )}

          <button className="pg-export-btn" onClick={exportJSON}>
            ⬇ Export JSON
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ finalStats, winner, winnerLabel, conditionName }: any) {
  const durationMs = finalStats?.gameDurationMs;
  const durationStr = durationMs
    ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
    : '—';

  return (
    <>
      <p className="pg-section-title">Game Summary</p>
      <table className="pg-stat-table">
        <tbody>
          <tr><td>Winner</td><td className="pg-highlight">{winnerLabel}</td></tr>
          <tr><td>Victory Type</td><td className="pg-highlight">{conditionName}</td></tr>
          <tr><td>Turns Played</td><td>{winner?.turnNumber ?? '—'}</td></tr>
          <tr><td>Galaxy Size</td><td>{finalStats?.galaxySize ?? '—'} systems</td></tr>
          <tr><td>Factions</td><td>{finalStats?.factionCount ?? '—'}</td></tr>
          <tr><td>Duration</td><td>{durationStr}</td></tr>
        </tbody>
      </table>
    </>
  );
}

// ─── Faction Stats Tab ────────────────────────────────────────────────────────

function FactionStatsTab({ finalStats }: any) {
  const perFact = finalStats?.perFact ?? {};
  const factionIds = Object.keys(perFact);

  return (
    <>
      <p className="pg-section-title">Per-Faction Performance</p>
      <table className="pg-stat-table">
        <thead>
          <tr>
            <th>Faction</th>
            <th>Final Systems</th>
            <th>Peak Systems</th>
            <th>Techs Done</th>
            <th>Units Produced</th>
          </tr>
        </thead>
        <tbody>
          {factionIds.map(id => {
            const f = perFact[id];
            return (
              <tr key={id}>
                <td>{FACTION_LABELS[id] ?? id}</td>
                <td>{f.finalSystemsControlled ?? '—'}</td>
                <td>{f.peakSystemsControlled ?? '—'}</td>
                <td>{f.technologiesCompleted ?? '—'}</td>
                <td>{f.unitsProduced ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ─── Victory Tab ──────────────────────────────────────────────────────────────

function VictoryTab({ finalStats, winner, conditionName, allFactions }: any) {
  return (
    <>
      <p className="pg-section-title">Victory Details</p>
      <table className="pg-stat-table">
        <tbody>
          <tr><td>Condition</td><td className="pg-highlight">{conditionName}</td></tr>
          <tr><td>Achieved on Turn</td><td>{winner?.turnNumber ?? '—'}</td></tr>
          <tr>
            <td>Winner's Closest Other</td>
            <td>
              {(() => {
                const closest = finalStats?.perFact?.[winner?.factionId]?.closestVictory;
                if (!closest) return '—';
                const cn = victoryConfigLoader.getCondition(closest.conditionId)?.name ?? closest.conditionId;
                return `${cn} (${closest.progressPercent}%)`;
              })()}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ─── Opponents Tab ────────────────────────────────────────────────────────────

function OpponentsTab({ finalStats, winner }: any) {
  const perFact = finalStats?.perFact ?? {};
  const opponents = (Object.entries(perFact) as [string, any][]).filter(([id]) => id !== winner?.factionId);

  return (
    <>
      <p className="pg-section-title">Opponent Final Positions</p>
      <table className="pg-stat-table">
        <thead>
          <tr>
            <th>Faction</th>
            <th>Closest Victory</th>
            <th>Progress</th>
            <th>Final Systems</th>
          </tr>
        </thead>
        <tbody>
          {opponents.map(([id, f]) => {
            const cv   = f.closestVictory;
            const name = cv ? (victoryConfigLoader.getCondition(cv.conditionId)?.name ?? cv.conditionId) : '—';
            return (
              <tr key={id}>
                <td>{FACTION_LABELS[id] ?? id}</td>
                <td>{name}</td>
                <td>{cv ? `${cv.progressPercent}%` : '—'}</td>
                <td>{f.finalSystemsControlled ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

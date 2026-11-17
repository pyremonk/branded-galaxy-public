/**
 * TurnSummaryHUD — Turn summary panel shown as the final step of the
 * sequential Action Phase start flow.
 *
 * Rendered by ResolutionHUD for stepType='turnSummary'.
 * Receives summary data as props and calls onContinue when dismissed.
 *
 * Layout:
 *   - Player section (Alerts → Messages by outcome group → Tips)
 *   - Enemy faction sections in initiative order
 *     (only messages that touched player-owned systems)
 *
 * Props:
 *   summary          Array   — events from the previous turn's resolution/maintenance
 *   turn             number  — the current (new) turn number
 *   onContinue       Function — called when player continues to the Action Phase
 *   playerFactionId  string  — the player's faction ID
 *
 * Spec: 036-notifications-alerts-spec.md (FR-NA-005)
 */
import { useCallback, useMemo } from 'react';
import './TurnSummaryHUD.css';
import { FACTION_DATA, OUTCOME_GROUPS, renderMessage } from './messageUtils.js';
import { formatTurnLabel } from '../utils/time-format.js';

// ─── Covert op types formerly used for the narrow "Detected Activity" filter ───
// Kept for compatibility but replaced by the broader enemyEvents filter below.
const COVERT_OP_TYPES = new Set(['reconnaissance', 'espionage', 'false_intel', 'sabotage', 'incite_uprising']);

// ─── OutcomeGroup sub-component ──────────────────────────────────────────────

function OutcomeGroup({ label, icon, color, events, onGoto }: any) {
  if (events.length === 0) return null;
  return (
    <div className="tsm-outcome-group">
      <div className="tsm-group-header">
        <span className="tsm-group-icon" style={{ color }}>{icon}</span>
        <span className="tsm-group-label">{label}</span>
      </div>
      {events.map((evt: any, i: any) => (
        <div key={i} className="tsm-row">
          <span className="tsm-row-message">{renderMessage(evt.message)}</span>
          {evt.systemId && (
            <button className="turn-summary-goto" onClick={() => onGoto(evt.systemId)}>
              Goto
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TurnSummaryHUD({
  summary = [],
  turn,
  onContinue,
  playerFactionId,
}: any) {
  const handleGoto = useCallback((systemId: any) => {
    if (systemId) {
      window.dispatchEvent(new CustomEvent('galaxy:navigateTo', {
        detail: { systemId }
      }));
    }
  }, []);

  // ── Player events ─────────────────────────────────────────────────────────
  // Alerts: player's own urgent events + urgent events from enemies that
  // impacted the player's systems (e.g. enemy attack on player system).
  const playerAlerts = useMemo(() =>
    summary.filter(
      (e: any) => e.urgent && (
        e.factionId === playerFactionId ||
        e.systemOwnerFactionId === playerFactionId
      )
    ),
    [summary, playerFactionId]
  );

  const playerMessages = useMemo(() =>
    summary.filter(
      (e: any) => !e.urgent && e.domain !== 'tip' && e.factionId === playerFactionId
    ),
    [summary, playerFactionId]
  );

  const playerTips = useMemo(() =>
    summary.filter((e: any) => e.domain === 'tip'),
    [summary]
  );

  // Enemy covert-op failures targeting player systems — shows defense working.
  // Only reconnaissance, espionage, and false_intel mission types are surfaced;
  // other mission failures are shown in the enemy faction section instead.
  const detectedActivity = useMemo(() =>
    summary.filter((e: any) =>
      e.factionId !== playerFactionId &&
      e.domain === 'mission' &&
      e.systemOwnerFactionId === playerFactionId &&
      COVERT_OP_TYPES.has(e.missionType) &&
      (e.outcome === 'failure' || e.outcome === 'critical_failure')
    ),
    [summary, playerFactionId]
  );

  // All other enemy events that touched player-owned systems (combat, fleet, invasion,
  // sabotage successes, diplomacy, etc.) — displayed in the Enemy Activity section.
  const enemyEvents = useMemo(() =>
    summary.filter((e: any) =>
      e.factionId !== playerFactionId &&
      e.domain !== 'tip' &&
      e.systemOwnerFactionId === playerFactionId &&
      !(e.domain === 'mission' && COVERT_OP_TYPES.has(e.missionType) && (e.outcome === 'failure' || e.outcome === 'critical_failure'))
    ),
    [summary, playerFactionId]
  );

  // ── Empty-state logic ─────────────────────────────────────────────────────
  const hasPlayerContent =
    playerAlerts.length > 0 || playerMessages.length > 0 ||
    playerTips.length > 0 || detectedActivity.length > 0;
  const isEmpty = !hasPlayerContent && enemyEvents.length === 0;

  const playerLabel = FACTION_DATA[playerFactionId]?.shortName ?? playerFactionId ?? 'Your Faction';
  const playerColor = FACTION_DATA[playerFactionId]?.color ?? '#c9d1d9';

  return (
    <div className="turn-summary-hud">
      {/* ── Header ── */}
      <div className="turn-summary-header">
        <span className="turn-summary-title">{formatTurnLabel(turn - 1)} Summary</span>
      </div>

      {/* ── Scrollable body ── */}
      <div className="turn-summary-body">
        {isEmpty && (
          <div className="turn-summary-empty">No events this turn.</div>
        )}

        {/* ── Player section ── */}
        {hasPlayerContent && (
          <div className="tsm-faction-section tsm-faction-section--player">
            <div className="tsm-faction-header">
              <span className="tsm-faction-name" style={{ color: playerColor }}>
                {playerLabel}
              </span>
            </div>

            {/* Alerts subsection */}
            {playerAlerts.length > 0 && (
              <div className="tsm-subsection">
                <div className="tsm-subsection-header">
                  <span className="tsm-subsection-icon" style={{ color: '#f85149' }}>&#x26a0;</span>
                  <span className="tsm-subsection-label">Alerts</span>
                </div>
                {playerAlerts.map((evt: any, i: any) => (
                  <div key={i} className="tsm-row tsm-row--alert">
                    <span className="tsm-row-message">{renderMessage(evt.message)}</span>
                    {evt.playerChoice && (
                      <span className="tsm-choice">&#x2192; {evt.playerChoice}</span>
                    )}
                    {evt.systemId && (
                      <button
                        className="turn-summary-goto"
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

            {/* Messages subsection — grouped by outcome */}
            {playerMessages.length > 0 && (
              <div className="tsm-subsection">
                {OUTCOME_GROUPS.map(group => (
                  <OutcomeGroup
                    key={group.key}
                    label={group.label}
                    icon={group.icon}
                    color={group.color}
                    events={playerMessages.filter((e: any) => group.outcomes.includes(e.outcome))}
                    onGoto={handleGoto}
                  />
                ))}
              </div>
            )}

            {/* Detected Activity subsection — enemy covert-op failures on player systems */}
            {detectedActivity.length > 0 && (
              <div className="tsm-subsection">
                <div className="tsm-subsection-header">
                  <span className="tsm-subsection-icon" style={{ color: '#3fb950' }}>&#x25c6;</span>
                  <span className="tsm-subsection-label">Detected Activity</span>
                </div>
                {detectedActivity.map((evt: any, i: any) => (
                  <div key={i} className="tsm-row">
                    <span className="tsm-row-message">{renderMessage(evt.message)}</span>
                    {evt.systemId && (
                      <button
                        className="turn-summary-goto"
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

            {/* Tips subsection */}
            {playerTips.length > 0 && (
              <div className="tsm-subsection">
                <div className="tsm-subsection-header">
                  <span className="tsm-subsection-icon" style={{ color: '#8b949e' }}>&#x2699;</span>
                  <span className="tsm-subsection-label">Tips</span>
                </div>
                {playerTips.map((evt: any, i: any) => (
                  <div key={i} className="tsm-row tsm-row--tip">
                    <span className="tsm-row-message">{evt.message}</span>
                    {evt.systemId && (
                      <button
                        className="turn-summary-goto"
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
          </div>
        )}


        {/* ── Enemy Activity section — events from other factions at player systems ── */}
        {enemyEvents.length > 0 && (
          <div className="tsm-faction-section tsm-faction-section--enemy">
            <div className="tsm-faction-header">
              <span className="tsm-faction-name" style={{ color: '#f85149' }}>
                Enemy Activity
              </span>
            </div>
            <div className="tsm-subsection">
              {OUTCOME_GROUPS.map(group => {
                const groupEvents = enemyEvents.filter((e: any) => group.outcomes.includes(e.outcome));
                return (
                  <OutcomeGroup
                    key={group.key}
                    label={group.label}
                    icon={group.icon}
                    color={group.color}
                    events={groupEvents}
                    onGoto={handleGoto}
                  />
                );
              })}
              {/* Catch-all for events whose outcome doesn't match any group */}
              {enemyEvents.filter((e: any) => !OUTCOME_GROUPS.some(g => g.outcomes.includes(e.outcome))).map((evt: any, i: any) => (
                <div key={`ea-other-${i}`} className="tsm-row">
                  <span className="tsm-row-message">{renderMessage(evt.message)}</span>
                  {evt.systemId && (
                    <button className="turn-summary-goto" onClick={() => handleGoto(evt.systemId)} title="Navigate to location">
                      Goto
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}


      </div>
      <div className="turn-summary-footer">
        <button className="turn-summary-dismiss-btn" onClick={onContinue}>
          Continue to {formatTurnLabel(turn)}
        </button>
      </div>
    </div>
  );
}


/**
 * ResolutionHUD — sequential step presenter for the Resolution Phase.
 *
 * Displays a floating bottom-center panel for each resolution step that
 * involves the player (fleet arrivals, combats, missions, invasions, etc.)
 * with Continue and Skip All controls.
 *
 * Visual style matches TurnSummaryHUD (monospace, #161b22 background, orange
 * accents, outcome groups with faction-colored names) while staying anchored
 * to the bottom of the viewport so the map remains visible.
 *
 * For the final 'turnSummary' step it delegates to TurnSummaryHUD.
 *
 * Events consumed:
 *   galaxy:resolutionStepStart  { label, stepType, systemId?, detail? }
 *   galaxy:resolutionPhaseEnd   (hides the HUD)
 *
 * Events dispatched:
 *   galaxy:resolutionContinue   (player pressed Continue)
 *   galaxy:resolutionSkipAll    (player pressed Skip All)
 *
 * Spec: 028-turn-structure-spec.md (FR-TS-003)
 */
import { useState, useEffect, useCallback } from 'react';
import { TurnSummaryHUD } from './TurnSummaryHUD';
import { OUTCOME_GROUPS, renderMessage } from './messageUtils.js';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import './ResolutionHUD.css';

// Human-readable labels for each step type (shown in the orange header)
const STEP_TYPE_LABELS: Record<string, string> = {
  fleetArrival:  'Fleet Movement',
  combat:        'Space Combat',
  invasion:      'Invasion',
  missions:      'Missions',
  construction:  'Construction',
  events:        'Events',
  turnSummary:   'Turn Summary',
  systemGroup:   'System Events',
};

// ── OutcomeGroup sub-component ────────────────────────────────────────────────

function ResOutcomeGroup({ label, icon, color, events, onGoto }: any) {
  if (!events || events.length === 0) return null;
  return (
    <div className="res-outcome-group">
      <div className="res-group-header">
        <span className="res-group-icon" style={{ color }}>{icon}</span>
        <span className="res-group-label">{label}</span>
      </div>
      {events.map((evt: any, i: any) => (
        <div key={i} className="res-row">
          <span className="res-row-message">{renderMessage(evt.message)}</span>
          {evt.systemId && (
            <button className="res-goto-btn" onClick={() => onGoto(evt.systemId)}>
              Goto
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResolutionHUD() {
  const { mode } = useGameTime();
  /**
   * @type {[{label:string, stepType:string, systemId?:string, detail?:object}|null, Function]}
   */
  const [step, setStep] = useState<any>(null);
  const [waiting, setWaiting] = useState(false); // true while awaiting player input

  // ── Listen for resolution step start ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      const { label, stepType, systemId, detail } = e.detail ?? {};
      setStep({ label: label ?? '', stepType: stepType ?? 'fleetArrival', systemId, detail });
      setWaiting(true);
    };
    window.addEventListener('galaxy:resolutionStepStart', handler);
    return () => window.removeEventListener('galaxy:resolutionStepStart', handler);
  }, []);

  // ── Listen for resolution phase end ──────────────────────────────────────
  useEffect(() => {
    const handler = () => { setStep(null); setWaiting(false); };
    window.addEventListener('galaxy:resolutionPhaseEnd', handler);
    return () => window.removeEventListener('galaxy:resolutionPhaseEnd', handler);
  }, []);

  const handleContinue = useCallback(() => {
    setWaiting(false); // disable button until next step arrives
    window.dispatchEvent(new CustomEvent('galaxy:resolutionContinue'));
  }, []);

  const handleSkipAll = useCallback(() => {
    setStep(null);     // hide immediately — no more steps will be presented
    setWaiting(false);
    window.dispatchEvent(new CustomEvent('galaxy:resolutionSkipAll'));
  }, []);

  const handleGoto = useCallback((systemId: any) => {
    if (systemId) {
      window.dispatchEvent(new CustomEvent('galaxy:navigateTo', { detail: { systemId } }));
    }
  }, []);

  // Sync mode: resolution runs headlessly — don't show blocking UI
  // (spec 062 FR-UTD-011). Results appear as SyncTurnToast instead.
  if (mode === 'sync') return null;

  if (!step) return null;

  const { label, stepType, detail } = step;
  const isSummary = stepType === 'turnSummary';
  const headerLabel = detail?.stepLabel ?? STEP_TYPE_LABELS[stepType] ?? stepType;

  // For the turn-summary step, delegate to TurnSummaryHUD at its own position.
  if (isSummary) {
    return (
      <TurnSummaryHUD
        summary={(detail ?? {}).summary ?? []}
        turn={(detail ?? {}).turn}
        onContinue={handleContinue}
        playerFactionId={(detail ?? {}).playerFactionId ?? null}
        initiativeOrder={(detail ?? {}).initiativeOrder ?? []}
      />
    );
  }

  // Structured events provided by _resolutionGroupStep
  const structuredEvents = Array.isArray(detail?.events) ? detail.events : null;

  return (
    <div className="resolution-hud">
      <div className="resolution-hud-card">

        {/* ── Header ── */}
        <div className="resolution-hud-header">
          <span className="resolution-hud-title">{headerLabel}</span>
        </div>

        {/* ── Scrollable body ── */}
        <div className="resolution-hud-body">
          {structuredEvents
            ? (
              // Outcome groups (missions, construction, events, invasion)
              OUTCOME_GROUPS.map(group => (
                <ResOutcomeGroup
                  key={group.key}
                  label={group.label}
                  icon={group.icon}
                  color={group.color}
                  events={structuredEvents.filter((e: any) => group.outcomes.includes(e.outcome))}
                  onGoto={handleGoto}
                />
              ))
            )
            : (
              // Plain-text fallback (fleet arrivals, combat)
              <p className="resolution-hud-plain-label">{label}</p>
            )}
        </div>

        {/* ── Footer ── */}
        <div className="resolution-hud-footer">
          <button
            className="resolution-btn resolution-btn-continue"
            onClick={handleContinue}
            disabled={!waiting}
            style={{ opacity: waiting ? 1 : 0.5, cursor: waiting ? 'pointer' : 'default' }}
          >
            Continue &#9654;
          </button>
          <button
            className="resolution-btn resolution-btn-skip"
            onClick={handleSkipAll}
          >
            Skip All &#9193;
          </button>
        </div>

      </div>
    </div>
  );
}

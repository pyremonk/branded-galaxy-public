/**
 * ActionPhaseSequencer — Previously orchestrated alert/combat/summary presentation
 * at the start of each Action Phase.
 *
 * With the new sequential Resolution Phase (ResolutionHUD.jsx), all step-by-step
 * confirmation, combat results, and the turn summary are now presented DURING
 * resolution via ResolutionHUD before galaxy:phaseStart fires. As a result:
 *
 *  - Combat results → shown individually during resolution (ResolutionHUD)
 *  - Turn summary   → shown as the final resolution step (TurnSummaryHUD embedded
 *                     in ResolutionHUD), with turnSummary cleared before beginActionPhase
 *  - Critical alerts → included as urgent entries in TurnSummaryHUD
 *
 * This component is retained as a stub so callers in App.jsx do not need to change.
 * It can be repurposed for future notification needs.
 *
 * Spec: 028-turn-structure-spec.md (FR-TS-003, FR-TS-006)
 */
export function ActionPhaseSequencer() {
  // All presentation is now handled by ResolutionHUD + TurnSummaryHUD during resolution.
  return null;
}

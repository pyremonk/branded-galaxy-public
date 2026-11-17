import { useState, useEffect, useCallback } from 'react';
import { UI_ICONS } from '../icons';
import './TutorialOverlay.css';

/**
 * TutorialOverlay — displays tutorial step prompts in the lower-left corner.
 *
 * Props:
 *   onNewGame       () => void  — start a fresh game
 *   onReturnToMenu  () => void  — return to main menu
 *   onReplay        () => void  — replay tutorial from beginning
 *   onComplete      () => void  — called when tutorial completes (persist flag)
 */
export function TutorialOverlay({ onNewGame, onReturnToMenu, onReplay, onComplete, inline = false }: any) {
  const [activeStep,    setActiveStep]    = useState<any>(null);
  const [stepIndex,     setStepIndex]     = useState(0);
  const [total,         setTotal]         = useState(0);
  const [conditionMet,  setConditionMet]  = useState(false);
  const [showComplete,  setShowComplete]  = useState(false);

  // Listen for tutorial step events from TutorialEngine
  useEffect(() => {
    const onStep = (e: any) => {
      const { step, stepIndex: idx, total: tot } = e.detail ?? {};
      setActiveStep(step ?? null);
      setStepIndex(idx ?? 0);
      setTotal(tot ?? 0);
      // Condition is not yet met when a new step begins
      setConditionMet(!step?.condition);
    };

    const onComplete = () => {
      setActiveStep(null);
      setShowComplete(true);
    };

    window.addEventListener('galaxy:tutorialStep',     onStep);
    window.addEventListener('galaxy:tutorialComplete', onComplete);
    return () => {
      window.removeEventListener('galaxy:tutorialStep',     onStep);
      window.removeEventListener('galaxy:tutorialComplete', onComplete);
    };
  }, []);

  // Mark condition met when relevant game events fire
  useEffect(() => {
    if (!activeStep?.condition) return;

    const CONDITION_EVENTS: Record<string, string> = {
      'pan':                  'galaxy:tutorialPanZoom',
      'panelOpen:system':     'galaxy:panelOpen',
      'panelOpen:fleet':      'galaxy:panelOpen',
      'panelOpen:characters': 'galaxy:panelOpen',
      'constructionQueued':   'galaxy:constructionQueued',
      'turnSubmitted':        'galaxy:turnSubmitted',
      'fleetOrderSubmitted':  'galaxy:fleetOrderSubmitted',
      'missionSubmitted':     'galaxy:missionSubmitted',
      'researchStarted':      'galaxy:researchStarted',
    };

    const condition = activeStep.condition;
    const eventName = CONDITION_EVENTS[condition];
    if (!eventName) return;

    const handler = (e: any) => {
      // For panelOpen:X we need to match the panel id
      if (condition.startsWith('panelOpen:')) {
        const expectedPanel = condition.split(':')[1];
        if ((e.detail?.panel ?? '') !== expectedPanel) return;
      }
      // For pan+zoom both must happen — TutorialEngine handles that, so here
      // we just watch for the engine having already advanced (condition clears)
      setConditionMet(true);
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [activeStep]);

  const handleGotIt = useCallback(() => {
    if (!conditionMet) return;
    window.dispatchEvent(new CustomEvent('galaxy:tutorialAdvance'));
  }, [conditionMet]);

  const handleSkip = useCallback(() => {
    window.dispatchEvent(new CustomEvent('galaxy:tutorialSkip'));
  }, []);

  const handleComplete = useCallback(() => {
    setShowComplete(false);
    onComplete?.();
  }, [onComplete]);

  // Completion modal
  if (showComplete) {
    return (
      <div className="tut-complete-backdrop" role="dialog" aria-modal="true" aria-label="Tutorial Complete">
        <div className="tut-complete-modal">
          <div className="tut-complete-icon">{UI_ICONS.trophy}</div>
          <h2 className="tut-complete-title">Tutorial Complete!</h2>
          <p className="tut-complete-body">
            You've mastered the basics of Branded Galaxy. The galaxy awaits your conquest!
          </p>
          <div className="tut-complete-actions">
            <button className="tut-btn tut-btn--primary" onClick={() => { handleComplete(); onNewGame?.(); }}>
              Start New Game
            </button>
            <button className="tut-btn tut-btn--secondary" onClick={() => { handleComplete(); onReplay?.(); }}>
              Replay Tutorial
            </button>
            <button className="tut-btn tut-btn--ghost" onClick={() => { handleComplete(); onReturnToMenu?.(); }}>
              Return to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeStep) return null;

  const isLastStep   = stepIndex === total - 1;
  const buttonLabel  = isLastStep ? 'Finish' : 'Got it';

  const cardContent = (
    <>
      <div className="tut-header">
        <span className="tut-step-count">Step {stepIndex + 1} of {total}</span>
        <span className="tut-title">{activeStep.title}</span>
      </div>

      <p className="tut-instruction">{activeStep.instruction}</p>

      {activeStep.hint && (
        <p className="tut-hint">{activeStep.hint}</p>
      )}

      <div className="tut-footer">
        {activeStep.skipable && (
          <button className="tut-skip" onClick={handleSkip} aria-label="Skip this step">
            Skip
          </button>
        )}
        <button
          className={`tut-btn tut-btn--primary${!conditionMet ? ' tut-btn--disabled' : ''}`}
          onClick={handleGotIt}
          disabled={!conditionMet}
          aria-disabled={!conditionMet}
        >
          {activeStep.condition && !conditionMet ? '...' : buttonLabel}
        </button>
      </div>
    </>
  );

  // Inline mode — render the card directly inside LeftSidePanel (no fixed wrapper)
  if (inline) {
    return (
      <div
        className="tut-card"
        aria-live="polite"
        aria-label={`Tutorial step ${stepIndex + 1} of ${total}: ${activeStep.title}`}
      >
        {cardContent}
      </div>
    );
  }

  // Standalone mode — fixed-position overlay (kept for potential standalone use)
  return (
    <div
      className="tut-overlay"
      aria-live="polite"
      aria-label={`Tutorial step ${stepIndex + 1} of ${total}: ${activeStep.title}`}
    >
      <div className="tut-card">
        {cardContent}
      </div>
    </div>
  );
}

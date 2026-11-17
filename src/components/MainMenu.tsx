/**
 * MainMenu — Post-authentication menu offering Continue / Tutorial / New Game / Load Game.
 *
 * Props:
 *   hasAutoSave      — boolean: show "Continue" button if true
 *   tutorialComplete — boolean: controls tutorial button prominence
 *   onContinue       — () => void
 *   onLoadGame       — () => void
 *   onNewGame        — () => void
 *   onTutorial       — () => void
 *   onAudioSettings  — () => void (opens audio settings panel)
 */
import './MainMenu.css';

export function MainMenu({ hasAutoSave, tutorialComplete, onContinue, onLoadGame, onNewGame, onTutorial, onAudioSettings }: any) {
  return (
    <div className="mm-overlay">
      <div className="mm-panel">
        <h1 className="mm-title">BRANDED GALAXY</h1>
        <p className="mm-subtitle">Command. Conquer. Persist.</p>

        <div className="mm-buttons">
          {hasAutoSave && (
            <button className="mm-btn mm-btn--continue" onClick={onContinue}>
              Continue
            </button>
          )}
          {/* Prominent tutorial button for first-time players */}
          {!tutorialComplete && (
            <button className="mm-btn mm-btn--tutorial" onClick={onTutorial}>
              Start Tutorial
            </button>
          )}
          <button className="mm-btn mm-btn--new" onClick={onNewGame}>
            New Game
          </button>
          <button className="mm-btn mm-btn--load" onClick={onLoadGame}>
            Load Game
          </button>
          {/* Secondary tutorial button after first completion */}
          {tutorialComplete && (
            <button className="mm-btn mm-btn--tutorial-secondary" onClick={onTutorial}>
              Tutorial
            </button>
          )}
          {/* Audio settings (spec 052 FR-AU-005) */}
          <button className="mm-btn mm-btn--audio" onClick={onAudioSettings}>
            🔊 Audio Settings
          </button>
        </div>
      </div>
    </div>
  );
}

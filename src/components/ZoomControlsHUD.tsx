/**
 * ZoomControlsHUD — React zoom in/out controls for the galaxy map.
 *
 * Dispatches 'game:zoomIn' / 'game:zoomOut' events, which Phaser's
 * buildHUD() listens for and calls this.zoomCamera(±0.2).
 *
 * Keyboard +/- and mouse-wheel zoom remain wired directly in Phaser.
 */
import './ZoomControlsHUD.css';

export function ZoomControlsHUD() {
  const zoomIn = () => window.dispatchEvent(new CustomEvent('game:zoomIn'));
  const zoomOut = () => window.dispatchEvent(new CustomEvent('game:zoomOut'));
  const zoomIn100 = () => window.dispatchEvent(new CustomEvent('game:zoomIn100'));
  const zoomOut100 = () => window.dispatchEvent(new CustomEvent('game:zoomOut100'));

  return (
    <div className="zoom-controls-hud">
      <button
        className="zoom-btn zoom-btn--small"
        onClick={zoomIn100}
        title="Zoom in 100%"
        aria-label="Zoom in 100%"
      >
        +100%
      </button>
      <button
        className="zoom-btn"
        onClick={zoomIn}
        title="Zoom in (+)"
        aria-label="Zoom in"
      >
        [+]
      </button>
      <button
        className="zoom-btn"
        onClick={zoomOut}
        title="Zoom out (-)"
        aria-label="Zoom out"
      >
        [-]
      </button>
      <button
        className="zoom-btn zoom-btn--small"
        onClick={zoomOut100}
        title="Zoom out 100%"
        aria-label="Zoom out 100%"
      >
        -100%
      </button>
    </div>
  );
}

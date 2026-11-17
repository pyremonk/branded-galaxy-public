/**
 * MiniMap — Canvas-based miniature overview of the galaxy map.
 *
 * Subscribes to galaxy:systemOverlays to draw:
 *   - Filter-mode-aware coloured system dots (matches the active MapFilterHUD filter)
 *   - Current viewport rectangle
 *
 * Clicking inside the canvas pans the Phaser camera to that world position
 * via the galaxy:navigateToWorld event.
 *
 * Rendered inside .map-nav-panel (alongside ZoomControlsHUD) which provides
 * the fixed positioning, background, and border.
 */
import { useRef, useEffect } from 'react';
import './MiniMap.css';

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#8b949e',
};

const MAP_W = 160;
const MAP_H = 160;

/** Return a CSS hex colour for a system dot based on the active filter. */
function getSystemColor(sys: any, filterMode: any, fleetData: any, avgOutput: any, playerFactionId: any, subFilter: any) {
  switch (filterMode) {

    case 'faction': {
      const targetId = subFilter ?? playerFactionId ?? 'brandAuthority';
      const loy = sys.loyalty;
      const isHighlighted = targetId === 'neutral'
        ? !loy || loy === 'neutral'
        : loy === targetId;
      if (isHighlighted) return FACTION_COLORS[loy] ?? '#8b949e';
      return '#2d3340';
    }

    case 'loyalty': {
      const focusId = subFilter ?? playerFactionId ?? 'brandAuthority';
      // Controlled systems: faction color. Non-controlled: dim grey (represents transparent white)
      if (sys.loyalty === focusId) return FACTION_COLORS[sys.loyalty] ?? '#8b949e';
      return '#3d444d';
    }

    case 'resources': {
      const out = sys.resourceOutput ?? 0;
      if (out === 0) return '#484f58';
      const avg = avgOutput || 1;
      if (out < avg * 0.6) return '#2d3340';
      // Use faction color for average and above
      return FACTION_COLORS[sys.loyalty] ?? '#58a6ff';
    }

    case 'fleet': {
      const count = (fleetData ?? {})[sys.id] ?? 0;
      if (count > 0) return FACTION_COLORS[sys.loyalty] ?? '#58a6ff';
      return '#2d3340';
    }

    case 'facilities': {
      if (subFilter === 'idle_shipyard') {
        if (sys.idleShipyard) return FACTION_COLORS[sys.loyalty] ?? '#3fb950';
        return '#484f58';
      }
      if (subFilter === 'idle_queue') {
        if (sys.idleQueue) return FACTION_COLORS[sys.loyalty] ?? '#3fb950';
        return '#484f58';
      }
      if (sys.hasFacilities) return FACTION_COLORS[sys.loyalty] ?? '#3fb950';
      return '#484f58';
    }

    case 'threat': {
      if (sys.isThreat) return '#f85149';
      const loy = sys.loyalty;
      if (!loy || loy === 'neutral') return '#8b949e';
      return FACTION_COLORS[loy] ?? '#8b949e';
    }

    case 'missions': {
      if (sys.hasMission) return FACTION_COLORS[sys.loyalty] ?? '#8b949e';
      return '#2d3340';
    }

    default: // 'none' — no filter active, faction colors
      return FACTION_COLORS[sys.loyalty] ?? '#8b949e';
  }
}

export function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef  = useRef<any>({
    overlays:         [],
    camScrollX:       0,
    camScrollY:       0,
    camZoom:          1,
    camViewW:         1920,
    camViewH:         1080,
    worldMinX:        0,
    worldMinY:        0,
    worldTotalW:      4000,
    worldTotalH:      3000,
    filterMode:       'none',
    subFilter:        null,
    playerFactionId:  'brandAuthority',
    fleetData:        {},
  });

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const {
      overlays, camScrollX, camScrollY, camZoom, camViewW, camViewH,
      worldMinX, worldMinY, worldTotalW, worldTotalH, filterMode, fleetData,
      subFilter, playerFactionId,
    } = stateRef.current;

    // Scale factors: world → minimap pixels.
    // The origin is worldMinX/worldMinY (typically -300,-300 from the camera
    // bounds padding).  Every coordinate must be offset by that origin before
    // scaling so that the full scrollable range maps onto [0, MAP_W/MAP_H].
    const sx = MAP_W / worldTotalW;
    const sy = MAP_H / worldTotalH;

    ctx.clearRect(0, 0, MAP_W, MAP_H);

    // Background
    ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Pre-compute average resource output for the resources filter
    const avgOutput = overlays.length
      ? overlays.reduce((s: any, o: any) => s + (o.resourceOutput ?? 0), 0) / overlays.length
      : 1;

    // System dots — offset by the world origin so dots land at the correct
    // minimap position even when minX/minY are negative.
    for (const sys of overlays as any[]) {
      if (sys.isFogged) continue;
      const px = (sys.wx - worldMinX) * sx;
      const py = (sys.wy - worldMinY) * sy;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = getSystemColor(sys, filterMode, fleetData, avgOutput, playerFactionId, subFilter);
      ctx.fill();
    }

    // Viewport rectangle — the actual visible area in world space.
    //
    // Phaser zooms around the viewport CENTRE, so camScrollX/Y alone is NOT the
    // world coordinate of the left/top edge except at zoom=1.  The correct
    // world-space left edge is:
    //   worldLeft = scrollX + viewW/2 × (1 − 1/zoom)
    //
    // Derivation:
    //   worldCenter = scrollX + viewW/2              (always true in Phaser 3)
    //   worldLeft   = worldCenter − (viewW/zoom)/2
    //               = scrollX + viewW/2 − viewW/(2×zoom)
    //               = scrollX + viewW/2 × (1 − 1/zoom)
    //
    // At zoom=1 this collapses to scrollX (matches old behaviour).
    // At zoom<1 (zoomed out) worldLeft < scrollX — the rect shifts LEFT.
    // At zoom>1 (zoomed in)  worldLeft > scrollX — the rect shifts RIGHT.
    const worldLeft = camScrollX + (camViewW / 2) * (1 - 1 / camZoom);
    const worldTop  = camScrollY + (camViewH / 2) * (1 - 1 / camZoom);
    const vx = (worldLeft - worldMinX) * sx;
    const vy = (worldTop  - worldMinY) * sy;
    const vw = (camViewW / camZoom) * sx;
    const vh = (camViewH / camZoom) * sy;

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(vx, vy, vw, vh);
    // Subtle tint inside the viewport rect
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(vx, vy, vw, vh);
  };

  useEffect(() => {
    const handler = (e: any) => {
      const d  = e.detail;
      const wb = d.worldBounds ?? {};
      stateRef.current = {
        overlays:        d.overlays        ?? [],
        camScrollX:      d.camera?.scrollX ?? 0,
        camScrollY:      d.camera?.scrollY ?? 0,
        camZoom:         d.camera?.zoom    ?? 1,
        camViewW:        d.camera?.viewW   ?? 1920,
        camViewH:        d.camera?.viewH   ?? 1080,
        // Use full scrollable range when available; fall back to system-extent bounds.
        worldMinX:       wb.minX   ?? 0,
        worldMinY:       wb.minY   ?? 0,
        worldTotalW:     wb.totalW ?? wb.w ?? 4000,
        worldTotalH:     wb.totalH ?? wb.h ?? 3000,
        filterMode:      d.filterMode       ?? 'none',
        subFilter:       d.subFilter        ?? null,
        playerFactionId: d.playerFactionId  ?? 'brandAuthority',
        fleetData:       d.fleetData        ?? {},
      };
      draw();
    };
    window.addEventListener('galaxy:systemOverlays', handler);
    return () => window.removeEventListener('galaxy:systemOverlays', handler);
  }, []);

  const handleClick = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Normalise click to canvas pixel space (accounts for CSS scaling).
    const px = (e.clientX - rect.left) * (MAP_W / rect.width);
    const py = (e.clientY - rect.top)  * (MAP_H / rect.height);
    const { worldMinX, worldMinY, worldTotalW, worldTotalH } = stateRef.current;
    // Invert the same origin-offset transform used in draw() so the clicked
    // minimap pixel maps back to the correct world coordinate.
    const worldX = worldMinX + (px / MAP_W) * worldTotalW;
    const worldY = worldMinY + (py / MAP_H) * worldTotalH;
    window.dispatchEvent(new CustomEvent('galaxy:navigateToWorld', {
      detail: { worldX, worldY }
    }));
  };

  return (
    <div className="minimap">
      <div className="minimap-title">MAP</div>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        width={MAP_W}
        height={MAP_H}
        onClick={handleClick}
        title="Click to navigate"
      />
    </div>
  );
}

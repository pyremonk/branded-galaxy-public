import './ResourceTrends.css';

const RESOURCE_COLORS: Record<string, string> = {
  credits:   '#58a6ff',
  materials: '#f0883e',
  recruits:  '#3fb950',
  influence: '#d2a8ff'
};

const RESOURCE_LABELS: Record<string, string> = {
  credits:   'Credits',
  materials: 'Materials',
  recruits:  'Recruits',
  influence: 'Influence'
};

const RESOURCE_ORDER: string[] = ['credits', 'materials', 'recruits', 'influence'];

const CHART_W = 520;
const CHART_H = 160;
const PAD     = { top: 16, right: 20, bottom: 28, left: 48 };

/**
 * Render a sparkline for multiple resources over history entries.
 * @param {{
 *   productionHistory: Array,
 *   caps: Object,
 *   activeResources: string[]
 * }} props
 */
export function ResourceTrends({ productionHistory, caps, activeResources }: any) {
  if (!productionHistory || productionHistory.length === 0) {
    return <div className="trends-empty">No production history yet.</div>;
  }

  const active = activeResources ?? RESOURCE_ORDER;
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top  - PAD.bottom;

  // Find global max across all active resources for shared Y axis
  const allValues = productionHistory.flatMap((entry: any) =>
    active.map((r: any) => entry[r] ?? 0)
  );
  const maxVal = Math.max(...allValues, 1);

  function toX(idx: any) {
    const steps = productionHistory.length - 1;
    return PAD.left + (steps > 0 ? (idx / steps) * innerW : innerW / 2);
  }

  function toY(val: any) {
    return PAD.top + innerH - (val / maxVal) * innerH;
  }

  function buildPath(resource: any) {
    return productionHistory
      .map((entry: any, i: any) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(entry[resource] ?? 0).toFixed(1)}`)
      .join(' ');
  }

  // Y-axis ticks (0, half, max)
  const yTicks = [0, Math.floor(maxVal / 2), maxVal];

  // X-axis labels (turn numbers)
  const xTicks = productionHistory.map((e: any, i: any) => ({
    x: toX(i),
    label: e.turn ?? (i + 1)
  }));

  return (
    <div className="resource-trends">
      {/* Legend */}
      <div className="trends-legend">
        {active.map((r: any) => (
          <span key={r} className="trends-legend-item">
            <span className="trends-legend-dot" style={{ background: RESOURCE_COLORS[r] }} />
            {RESOURCE_LABELS[r]}
          </span>
        ))}
      </div>

      <svg
        width={CHART_W}
        height={CHART_H}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="trends-chart"
        aria-label="Production history chart"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(tick)}
              x2={PAD.left + innerW} y2={toY(tick)}
              stroke="#21262d" strokeWidth="1"
            />
            <text
              x={PAD.left - 6} y={toY(tick) + 4}
              textAnchor="end"
              fontSize="9"
              fill="#484f58"
            >
              {tick.toLocaleString()}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTicks.map(({ x, label }: any, i: any) => (
          // Show at most 10 labels to avoid overlap
          i % Math.max(1, Math.ceil(xTicks.length / 10)) === 0 ? (
            <text
              key={i}
              x={x} y={PAD.top + innerH + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#484f58"
            >
              {label}
            </text>
          ) : null
        ))}

        {/* Cap reference line (credits cap as representative) */}
        {caps?.credits && (
          <line
            x1={PAD.left} y1={toY(Math.min(caps.credits, maxVal))}
            x2={PAD.left + innerW} y2={toY(Math.min(caps.credits, maxVal))}
            stroke="#30363d" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Resource lines */}
        {active.map((r: any) => (
          <path
            key={r}
            d={buildPath(r)}
            fill="none"
            stroke={RESOURCE_COLORS[r]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Data points (last point highlighted) */}
        {active.map((r: any) => {
          const last = productionHistory[productionHistory.length - 1];
          return (
            <circle
              key={r}
              cx={toX(productionHistory.length - 1)}
              cy={toY(last[r] ?? 0)}
              r="3"
              fill={RESOURCE_COLORS[r]}
            />
          );
        })}
      </svg>
    </div>
  );
}

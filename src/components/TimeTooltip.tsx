/**
 * TimeTooltip — enriched tooltip wrapper for sync mode.
 *
 * In async mode, renders children unchanged.
 * In sync mode, wraps children with a <span> whose title shows
 * tick/second breakdown for the given turn duration.
 *
 * Spec: 062-unified-time-display-spec.md  (FR-UTD-006)
 */

import React from 'react';
import { useGameTime } from '../contexts/GameTimeContext.jsx';

/**
 * @param {{ turns: number, children: React.ReactNode }} props
 */
export default function TimeTooltip({ turns, children }: any) {
  const { mode, ticksPerSecond, ticksPerTurn, currentTick } = useGameTime();

  if (mode === 'async') return children;

  const ticks = turns * ticksPerTurn;
  const seconds = ticksPerSecond > 0 ? ticks / ticksPerSecond : 0;

  const secondsLabel = seconds < 60
    ? `${Math.round(seconds)}s`
    : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;

  const nextBoundaryTick = Math.ceil((currentTick + 1) / ticksPerTurn) * ticksPerTurn;

  const tip = [
    `${turns} turn${turns !== 1 ? 's' : ''} \u2248 ${ticks} ticks (${secondsLabel})`,
    `Next turn boundary: tick ${nextBoundaryTick}`,
  ].join('\n');

  return (
    <span title={tip}>
      {children}
    </span>
  );
}

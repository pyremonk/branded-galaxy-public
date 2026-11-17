/**
 * Game Time Context — provides mode, turn, and tick state to all child
 * components without prop-drilling.
 *
 * This is the project's first React Context.  The provider subscribes to
 * the three existing custom DOM events that carry time state and exposes a
 * single `useGameTime()` hook.
 *
 * Spec: 062-unified-time-display-spec.md  (FR-UTD-002)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_TICKS_PER_TURN } from '../../core/timescale-config.js';

type GameTimeMode = 'async' | 'sync';

interface GameTimeContextValue {
  mode: GameTimeMode;
  currentTurn: number;
  currentTick: number;
  ticksPerSecond: number;
  ticksPerTurn: number;
  paused: boolean;
}

interface GameTimeProviderProps {
  children: React.ReactNode;
  initialTurn?: number;
}

interface SyncModeChangedDetail {
  active?: boolean;
}

interface SyncPauseChangedDetail {
  paused?: boolean;
}

interface SyncTickUpdateDetail {
  tickNumber?: number;
  ticksPerSecond?: number;
  ticksPerTurn?: number;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GameTimeContext = createContext<GameTimeContextValue>({
  mode: 'async',
  currentTurn: 1,
  currentTick: 0,
  ticksPerSecond: 1,
  ticksPerTurn: DEFAULT_TICKS_PER_TURN,
  paused: false,
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** @returns {{ mode: 'async'|'sync', currentTurn: number, currentTick: number, ticksPerSecond: number, ticksPerTurn: number, paused: boolean }} */
export function useGameTime() {
  return useContext(GameTimeContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Wrap the in-game component tree with this provider.
 * It listens to window custom events and keeps state in sync.
 *
 * @param {{ children: React.ReactNode, initialTurn?: number }} props
 */
export function GameTimeProvider({ children, initialTurn = 1 }: GameTimeProviderProps) {
  const [mode, setMode] = useState<GameTimeMode>('async');
  const [currentTurn, setCurrentTurn] = useState(initialTurn);
  const [currentTick, setCurrentTick] = useState(0);
  const [ticksPerSecond, setTicksPerSecond] = useState(1);
  const [ticksPerTurn, setTicksPerTurn] = useState(DEFAULT_TICKS_PER_TURN);
  const [paused, setPaused] = useState(false);

  // galaxy:turnUpdate  →  { turn: number }
  const handleTurnUpdate = useCallback((e: Event) => {
    const turn = (e as CustomEvent<{ turn?: number }>).detail?.turn;
    if (typeof turn === 'number') setCurrentTurn(turn);
  }, []);

  // galaxy:syncModeChanged  →  { active: boolean, isHost: boolean }
  const handleSyncModeChanged = useCallback((e: Event) => {
    const active = (e as CustomEvent<SyncModeChangedDetail>).detail?.active;
    setMode(active ? 'sync' : 'async');
    if (!active) {
      // Reset tick and pause state when returning to async
      setCurrentTick(0);
      setPaused(false);
    }
  }, []);

  // galaxy:syncPauseChanged  →  { paused: boolean }
  const handleSyncPauseChanged = useCallback((e: Event) => {
    setPaused((e as CustomEvent<SyncPauseChangedDetail>).detail?.paused ?? false);
  }, []);

  // galaxy:syncTickUpdate  →  { tickNumber, ticksPerSecond, timePerTick, ticksPerTurn, tickInTurn }
  const handleSyncTickUpdate = useCallback((e: Event) => {
    const d = (e as CustomEvent<SyncTickUpdateDetail>).detail;
    if (!d) return;
    if (typeof d.tickNumber === 'number') setCurrentTick(d.tickNumber);
    if (typeof d.ticksPerSecond === 'number') setTicksPerSecond(d.ticksPerSecond);
    if (typeof d.ticksPerTurn === 'number') setTicksPerTurn(d.ticksPerTurn);
  }, []);

  useEffect(() => {
    window.addEventListener('galaxy:turnUpdate', handleTurnUpdate);
    window.addEventListener('galaxy:syncModeChanged', handleSyncModeChanged);
    window.addEventListener('galaxy:syncTickUpdate', handleSyncTickUpdate);
    window.addEventListener('galaxy:syncPauseChanged', handleSyncPauseChanged);
    return () => {
      window.removeEventListener('galaxy:turnUpdate', handleTurnUpdate);
      window.removeEventListener('galaxy:syncModeChanged', handleSyncModeChanged);
      window.removeEventListener('galaxy:syncTickUpdate', handleSyncTickUpdate);
      window.removeEventListener('galaxy:syncPauseChanged', handleSyncPauseChanged);
    };
  }, [handleTurnUpdate, handleSyncModeChanged, handleSyncTickUpdate, handleSyncPauseChanged]);

  const value = useMemo(() => ({
    mode,
    currentTurn,
    currentTick,
    ticksPerSecond,
    ticksPerTurn,
    paused,
  }), [mode, currentTurn, currentTick, ticksPerSecond, ticksPerTurn, paused]);

  return (
    <GameTimeContext.Provider value={value}>
      {children}
    </GameTimeContext.Provider>
  );
}

export default GameTimeContext;

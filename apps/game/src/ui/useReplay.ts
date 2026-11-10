import { useCallback, useEffect, useReducer, useState } from 'react';
import { REPLAY_INTERVAL_MS, replayReducer, startReplayState } from './replay.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface ReplayControl {
  readonly index: number;
  readonly playing: boolean;
  /** True under prefers-reduced-motion: Replay then steps one frame per press. */
  readonly reduced: boolean;
  readonly replay: () => void;
}

/**
 * Steps through `frameCount` frames at about 4 per second; static (last frame) under reduced motion.
 * `resetKey` is whatever defines the frames (the example or the solution): when it changes, playback restarts.
 */
export function useReplay(frameCount: number, resetKey: unknown): ReplayControl {
  const [reduced] = useState(prefersReducedMotion);
  const [state, dispatch] = useReducer(replayReducer, undefined, () => startReplayState(frameCount, reduced));

  useEffect(() => {
    dispatch({ type: 'reset', frameCount, reduced });
  }, [resetKey, frameCount, reduced]);

  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: 'tick', frameCount }), REPLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [state.playing, state.index, frameCount]);

  const replay = useCallback(() => dispatch({ type: 'replay', frameCount, reduced }), [frameCount, reduced]);

  return { index: Math.min(state.index, Math.max(0, frameCount - 1)), playing: state.playing, reduced, replay };
}

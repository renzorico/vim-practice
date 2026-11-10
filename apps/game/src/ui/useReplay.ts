import { useCallback, useEffect, useState } from 'react';
import { initialFrameIndex, REPLAY_INTERVAL_MS } from './replay.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface ReplayControl {
  readonly index: number;
  readonly playing: boolean;
  readonly replay: () => void;
}

/** Steps through `frameCount` frames at about 4 per second; static (last frame) under reduced motion. */
export function useReplay(frameCount: number): ReplayControl {
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(() => initialFrameIndex(reduced, frameCount));
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= frameCount - 1) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setIndex((current) => current + 1), REPLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, frameCount]);

  const replay = useCallback(() => {
    setIndex(0);
    setPlaying(true);
  }, []);

  return { index: Math.min(index, Math.max(0, frameCount - 1)), playing, replay };
}

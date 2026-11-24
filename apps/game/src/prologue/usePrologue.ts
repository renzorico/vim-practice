import { useCallback, useEffect, useRef, useState } from 'react';
import { synth } from '../audio/synth.js';
import { AUTO_WAIT_MS, CAPTIONS, CHARACTERS_PER_SECOND } from './data.js';

const FRAME_MS = 1000 / CHARACTERS_PER_SECOND;
export const MAX_TICK_MS = 100;
const ANIMATION_MS = [1800, 1800, 1800, 1800, 3000, 0, 0, 2600] as const;
export function usePrologue(onComplete: () => void, soundEnabled: boolean) {
  const [frame, setFrame] = useState({ beat: 0, elapsed: 0 });
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const caption = CAPTIONS[frame.beat] ?? CAPTIONS[0];
  const shown = reduced ? caption.length : Math.min(caption.length, Math.floor(frame.elapsed / FRAME_MS));
  const actions = useRef({ next: (): void => {}, complete: onComplete });
  const next = useCallback(() => {
    if (shown < caption.length) setFrame(value => ({ ...value, elapsed: caption.length * FRAME_MS }));
    else if (frame.beat === CAPTIONS.length - 1) onComplete();
    else setFrame(value => ({ beat: value.beat + 1, elapsed: 0 }));
  }, [shown, caption, frame.beat, onComplete]);
  actions.current = { next, complete: onComplete };
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = (): void => setReduced(media?.matches ?? false);
    media?.addEventListener?.('change', change);
    return () => media?.removeEventListener?.('change', change);
  }, []);
  // Once text and art settle, use a single pausable deadline instead of rendering idle frames.
  const moving = frame.elapsed < Math.max(ANIMATION_MS[frame.beat] ?? 0, caption.length * FRAME_MS);
  useEffect(() => {
    if (reduced || (!moving && frame.beat === 7)) return;
    let previous = Date.now();
    let remaining = Math.max(0, caption.length * FRAME_MS + AUTO_WAIT_MS - frame.elapsed);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const pause = (): void => {
      if (running && !moving) remaining = Math.max(0, remaining - Math.max(0, Date.now() - previous));
      clearTimeout(timer); clearInterval(timer); timer = undefined; running = false;
    };
    const resume = (): void => {
      pause();
      if (typeof document !== 'undefined' && document.hidden) return;
      previous = Date.now(); running = true;
      if (!moving) {
        timer = setTimeout(() => { running = false; actions.current.next(); }, remaining);
        return;
      }
      timer = setInterval(() => {
        const now = Date.now();
        const delta = Math.max(0, Math.min(MAX_TICK_MS, now - previous));
        previous = now;
        if (delta > 0) setFrame(value => ({ ...value, elapsed: value.elapsed + delta }));
      }, FRAME_MS);
    };
    resume();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
    return () => { pause(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume); };
    // elapsed is captured when entering a beat or switching from animation to its idle deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, moving, frame.beat]);
  useEffect(() => {
    if (!soundEnabled || reduced || shown === 0 || shown >= caption.length || shown % 3 !== 0) return;
    return synth.play([{ kind: 'voice', offsetMs: 0, pitch: 300 }]);
  }, [soundEnabled, reduced, shown, caption]);
  useEffect(() => {
    if (soundEnabled && frame.beat === 3) return synth.play([{ kind: 'fixed', offsetMs: 0 }]);
  }, [soundEnabled, frame.beat]);
  const handleKey = useCallback((event: KeyboardEvent): void => {
    if (event.key === 'Tab') return;
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || /^F\d+$/.test(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') actions.current.complete();
    else if (event.key === 'Enter') actions.current.next();
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [handleKey]);
  return { beat: frame.beat, elapsed: frame.elapsed, shown, reduced, next, handleKey };
}

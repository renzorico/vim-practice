import { useEffect, useRef, useState } from 'react';
import type { Session } from '../play2/session.js';
import { cuesFor } from './cues.js';
import { readSound, saveSound } from './settings.js';
import { speakerPitch, synth } from './synth.js';

export function useSound(session: Session, started: boolean) {
  const [enabled, setEnabled] = useState(readSound);
  const previous = useRef(session);
  useEffect(() => {
    synth.setEnabled(enabled);
    const unlock = (): void => synth.unlock();
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('click', unlock, true);
    return () => {
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('click', unlock, true);
      synth.stop();
    };
  }, [enabled]);
  useEffect(() => {
    const before = previous.current;
    previous.current = session;
    if (!started || before === session || before.world.stage !== session.world.stage
      || before.lastEvents === session.lastEvents) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    synth.play(cuesFor(session.lastEvents, before.world, session.world, reducedMotion));
  }, [session, started]);
  useEffect(() => { if (!started) synth.stop(); }, [started]);
  const toggle = (): void => {
    const next = !enabled;
    synth.setEnabled(next);
    saveSound(next);
    setEnabled(next);
    if (next) synth.unlock();
  };
  return { enabled, toggle };
}

export function useStarChimes(visible: boolean, stars: number): void {
  useEffect(() => {
    if (!visible) return;
    return synth.play(Array.from({ length: stars }, (_, index) => ({
      kind: 'star', offsetMs: 650 + index * 190, pitch: 660 + index * 165,
    })));
  }, [visible, stars]);
}

/** Called by the existing text reveal clock; no second timer or key handler. */
export function useDialogueSound(speaker: string, shown: number, reduced: boolean): void {
  const last = useRef(0);
  const instantPlayed = useRef(false);
  const cancel = useRef<() => void>(() => {});
  useEffect(() => {
    if (speaker === 'scribe') cancel.current = synth.play([{ kind: 'paper', offsetMs: 0 }]);
    return () => cancel.current();
  }, [speaker]);
  useEffect(() => {
    const group = Math.floor(shown / 3);
    const blip = reduced ? shown > 0 && !instantPlayed.current : group > last.current;
    if (speaker !== 'system' && speaker !== 'scribe' && blip) {
      if (reduced) instantPlayed.current = true;
      cancel.current();
      cancel.current = synth.play([{ kind: 'voice', offsetMs: 0, pitch: speakerPitch(speaker) }]);
    }
    last.current = group;
  }, [shown, speaker, reduced]);
}

import { useEffect, useRef, useState } from 'react';
import type { Session } from '../session.js';
import { isStuck, nextShown, orderHints, startEffort, updateEffort, type Effort } from './hints.js';

export interface HintsView {
  /** The hint on show, its number and the total; null when none is. */
  readonly hint: { readonly text: string; readonly number: number; readonly total: number } | null;
  readonly available: boolean;
  readonly stuck: boolean;
}
/** Hints belong to the screen, not the session: asking costs no turn and changes nothing in the world. */
export function useHints(session: Session, hints: readonly string[], objective: string, guideKeys: readonly string[], requests: number): HintsView {
  const { world, lastEvents } = session;
  const key = `${world.stage}:${objective}`;
  const [effort, setEffort] = useState<Effort>(() => startEffort(key, world.turn));
  const [shown, setShown] = useState(0);
  const seen = useRef(lastEvents);
  useEffect(() => {
    const fresh = seen.current !== lastEvents;
    seen.current = lastEvents;
    setEffort(previous => updateEffort(previous, key, world.turn,
      fresh && lastEvents.some(event => event.type === 'bump'), fresh && lastEvents.some(event => event.type === 'player-moved')));
  }, [key, world.turn, lastEvents]);
  const asked = useRef(requests);
  const ordered = orderHints(hints, objective, guideKeys);
  const total = ordered.length;
  const current = useRef(key);
  useEffect(() => {
    // A new objective puts the last one's hints away.
    if (current.current !== key) { current.current = key; asked.current = requests; setShown(0); return; }
    if (asked.current === requests) return;
    asked.current = requests;
    setShown(previous => nextShown(previous, total));
  }, [key, requests, total]);
  const text = shown > 0 ? ordered[shown - 1] : undefined;
  return { hint: text === undefined ? null : { text, number: shown, total }, available: total > 0,
    stuck: total > 0 && shown === 0 && effort.objective === key && isStuck(effort, world.turn) };
}

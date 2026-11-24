import { useEffect, useRef, useState } from 'react';
import type { WorldEvent } from '@escape/world';
import type { Session } from '../session.js';
import { hintsFor, isStuck, nextShown, startEffort, updateEffort, type Effort, type Outcome } from './hints.js';

export interface HintsView {
  /** The hint on show, its number and the total; null when none is. */
  readonly hint: { readonly text: string; readonly number: number; readonly total: number } | null;
  readonly available: boolean;
  readonly stuck: boolean;
}
export interface HintsInput {
  readonly session: Session;
  readonly hints: readonly string[];
  readonly objective: string;
  readonly guideKeys: readonly string[];
  /** Counts `:hint`; only its changes matter. */
  readonly requests: number;
  /** Something covers the field: a request made now is dropped, not saved up. */
  readonly quiet: boolean;
  readonly scriptId: string;
}
export function outcomeOf(events: readonly WorldEvent[]): Outcome {
  if (events.some(event => event.type === 'checkpoint-restored')) return 'restart';
  if (events.some(event => event.type === 'bump')) return 'bump';
  return events.some(event => event.type === 'turn-ended') ? 'turn' : 'nothing';
}
/** Hints belong to the screen, not the session: asking costs no turn and changes nothing in the world. */
export function useHints({ session, hints, objective, guideKeys, requests, quiet, scriptId }: HintsInput): HintsView {
  const { world, lastEvents } = session;
  const key = `${world.stage}:${scriptId}:${objective}`;
  const [effort, setEffort] = useState<Effort>(() => startEffort(key, world.turn));
  const [asked, setAsked] = useState({ key, shown: 0 });
  const seenEvents = useRef(lastEvents);
  useEffect(() => {
    const fresh = seenEvents.current !== lastEvents;
    seenEvents.current = lastEvents;
    setEffort(previous => updateEffort(previous, key, world.turn, fresh ? outcomeOf(lastEvents) : 'nothing'));
  }, [key, world.turn, lastEvents]);
  const available = hintsFor(hints, objective, guideKeys);
  const total = available.length;
  // A new objective puts the last one's hints away: what was asked belongs to its key.
  const shown = asked.key === key ? Math.min(asked.shown, total) : 0;
  const seenRequests = useRef(requests);
  useEffect(() => {
    if (seenRequests.current === requests) return;
    seenRequests.current = requests;
    if (!quiet) setAsked({ key, shown: nextShown(shown, total) });
  }, [requests, quiet, key, shown, total]);
  const text = shown > 0 ? available[shown - 1] : undefined;
  return { hint: text === undefined ? null : { text, number: shown, total }, available: total > 0,
    stuck: total > 0 && shown === 0 && effort.objective === key && isStuck(effort, world.turn) };
}

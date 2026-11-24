import { keyParts } from '../KeyText.js';

/** Turns on one objective, or blocked moves in a row, after which a hint is offered (never forced). */
export const STUCK_TURNS = 14;
export const STUCK_BUMPS = 4;

const keysIn = (text: string): readonly string[] => keyParts(text).filter(part => part.keycap).map(part => part.text);

/** Only the hints that name a key of the current objective or guide, so none gives a later one away; if none does, all as written. */
export function hintsFor(hints: readonly string[], objective: string, guideKeys: readonly string[]): readonly string[] {
  const wanted = new Set([...keysIn(objective), guideKeys.join('')]);
  const fits = (hint: string): boolean => keysIn(hint).some(key => wanted.has(key));
  const fitting = hints.filter(fits);
  return fitting.length > 0 ? fitting : hints;
}

export interface Effort { readonly objective: string; readonly sinceTurn: number; readonly bumps: number }
export function startEffort(objective: string, turn: number): Effort { return { objective, sinceTurn: turn, bumps: 0 }; }
/** What one key press did, as far as being stuck goes. */
export type Outcome = 'bump' | 'turn' | 'restart' | 'nothing';
/** A new objective or a restart starts over; only bumps with no turn between them add up. */
export function updateEffort(effort: Effort, objective: string, turn: number, outcome: Outcome): Effort {
  if (effort.objective !== objective || turn < effort.sinceTurn || outcome === 'restart') return startEffort(objective, turn);
  if (outcome === 'bump') return { ...effort, bumps: effort.bumps + 1 };
  return outcome === 'turn' && effort.bumps > 0 ? { ...effort, bumps: 0 } : effort;
}
export function isStuck(effort: Effort, turn: number): boolean {
  return turn - effort.sinceTurn >= STUCK_TURNS || effort.bumps >= STUCK_BUMPS;
}
/** `:hint` shows the next one, and after the last puts them away. */
export function nextShown(shown: number, total: number): number { return total === 0 ? 0 : (shown + 1) % (total + 1); }

import type { WorldEvent, WorldState } from '@escape/world';
import { animationSteps, cellsBetween } from '../scene/animate.js';

export type CueKind = 'step' | 'jump' | 'land' | 'bump' | 'fixed' | 'delete' | 'put'
  | 'undo' | 'redo' | 'hit' | 'death' | 'clear' | 'trigger' | 'lever' | 'search-miss'
  | 'voice' | 'paper' | 'star';
export interface Cue {
  readonly kind: CueKind;
  readonly offsetMs: number;
  readonly distance?: number;
  readonly row?: boolean;
  /** A counted walk is one cue containing at most four steps and a final tail. */
  readonly pulsesMs?: readonly number[];
  readonly pitch?: number;
}
const PRIORITY: Readonly<Record<CueKind, number>> = {
  death: 5, clear: 5, hit: 5, trigger: 4, lever: 4, delete: 3, put: 3, undo: 3,
  redo: 3, fixed: 3, 'search-miss': 3, bump: 2, step: 1, jump: 1, land: 1,
  voice: 0, paper: 0, star: 0,
};

/** Presentation only: command identities and movement endpoints come from the engines. */
export function cuesFor(events: readonly WorldEvent[], previous: WorldState, next: WorldState, reducedMotion = false): Cue[] {
  const cues: Cue[] = [];
  const add = (kind: CueKind): void => { cues.push({ kind, offsetMs: 0 }); };
  if (events.some(event => event.type === 'player-died') || (next.status === 'dead' && previous.status !== 'dead')) add('death');
  else if (events.some(event => event.type === 'player-hit') || next.hearts < previous.hearts) add('hit');
  if (events.some(event => event.type === 'stage-cleared') || (next.status === 'cleared' && previous.status !== 'cleared')) add('clear');
  if (events.some(event => event.type === 'trigger-fired')) add('trigger');
  const steps = animationSteps(events, reducedMotion, next.pending !== null);
  for (const event of events) {
    if (event.type === 'bump') add(event.reason === 'fixed' ? 'fixed' : 'bump');
    if (event.type === 'engine-error' && event.error.code === 'pattern-not-found') add('search-miss');
    if (event.type !== 'command') continue;
    const { id, kind } = event.command;
    const before = event.in === 'script' ? previous.script?.engine : previous.pending?.engine ?? previous.engine;
    const after = event.in === 'script' ? next.script?.engine : next.engine;
    const changed = events.some(item => item.type === 'rows-changed' && item.by === 'player')
      || (before !== undefined && after !== undefined && before.changeSeq !== after.changeSeq);
    if (kind === 'undo') { if (changed) add(id === '<C-r>' ? 'redo' : 'undo'); }
    else if (changed && ['edit', 'operator', 'repeat', 'ex'].includes(kind)) {
      const shorter = before && after && after.lines.join('\n').length < before.lines.join('\n').length;
      cues.push({ kind: shorter ? 'delete' : 'put', offsetMs: 0,
        row: id === 'dd' || (before !== undefined && after !== undefined && after.lines.length < before.lines.length) });
    }
  }
  for (const step of steps) {
    if (step.type !== 'walk' && step.type !== 'jump' && step.type !== 'blink' && step.type !== 'scroll') continue;
    const distance = cellsBetween(step.from, step.to);
    if (step.type === 'walk') {
      const pulsesMs = Array.from({ length: Math.min(distance, 4) }, (_, index) => index * step.durationMs / distance);
      if (distance > 4) pulsesMs.push(step.durationMs);
      cues.push({ kind: 'step', offsetMs: 0, distance, pulsesMs });
    } else {
      cues.push({ kind: 'jump', offsetMs: 0, distance }, { kind: 'land', offsetMs: step.durationMs });
    }
  }
  // Keep each jump and its landing together when selecting the three highest-priority outcomes.
  const groups: [Cue, ...Cue[]][] = [];
  for (const cue of cues) {
    const previous = groups[groups.length - 1];
    if (cue.kind === 'land' && previous?.[0]?.kind === 'jump') previous.push(cue);
    else groups.push([cue]);
  }
  return groups.sort((left, right) => PRIORITY[right[0].kind] - PRIORITY[left[0].kind]).slice(0, 3).flat();
}

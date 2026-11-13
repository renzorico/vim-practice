import type { Position } from '@escape/engine';
import type { WorldEvent } from '@escape/world';

export const PLAYBACK_BUDGET_MS = 90;
const WALK_DURATION_MS = 60;

type AnimationHint =
  | { readonly type: 'walk' | 'jump'; readonly from: Position; readonly to: Position }
  | { readonly type: 'bump'; readonly at: Position }
  | { readonly type: 'hit' }
  | { readonly type: 'entity-move'; readonly entity: string; readonly from: Position; readonly to: Position }
  | { readonly type: 'entity-remove' | 'entity-spawn'; readonly entity: string }
  | { readonly type: 'rows'; readonly fromLine: number; readonly toLine: number; readonly lineDelta: number };

export type AnimationStep = AnimationHint & { readonly durationMs: number; readonly start: number; readonly end: number };

/** This describes presentation only; endpoints and walk/jump semantics come from WorldSim. */
export function animationSteps(events: readonly WorldEvent[], reducedMotion = false, pending = false): AnimationStep[] {
  const hints: AnimationHint[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'player-moved': {
        const distance = Math.abs(event.to.line - event.from.line) + Math.abs(event.to.col - event.from.col);
        if (distance > 0) hints.push({ type: event.style === 'jump' || distance > 1 ? 'jump' : 'walk', from: event.from, to: event.to });
        break;
      }
      case 'bump': hints.push({ type: 'bump', at: event.at }); break;
      case 'player-hit': hints.push({ type: 'hit' }); break;
      case 'entity-moved': hints.push({ type: 'entity-move', entity: event.entity, from: event.from, to: event.to }); break;
      case 'entity-removed': hints.push({ type: 'entity-remove', entity: event.entity }); break;
      case 'entity-spawned': hints.push({ type: 'entity-spawn', entity: event.entity }); break;
      case 'rows-changed': if (!pending) hints.push({ type: 'rows', fromLine: event.fromLine, toLine: event.toLine, lineDelta: event.lineDelta }); break;
    }
  }
  const total = reducedMotion || hints.length === 0 ? 0
    : hints.some(hint => hint.type === 'jump' || hint.type === 'rows' && hint.lineDelta > 0) ? PLAYBACK_BUDGET_MS : WALK_DURATION_MS;
  // Actors share the same clock. Removal follows its own actor's movement.
  return hints.map(hint => {
    const delayed = hint.type === 'entity-remove' && hints.some(other => other.type === 'entity-move' && other.entity === hint.entity);
    const start = delayed ? 0.65 : 0;
    const end = hint.type === 'entity-move' && hints.some(other => other.type === 'entity-remove' && other.entity === hint.entity) ? 0.65 : 1;
    return { ...hint, durationMs: total * (end - start), start, end };
  });
}

/** Reverse structural row shifts so simultaneous deletion/build animates from the old field. */
export function rowAnimationStart(line: number, rows: readonly { readonly fromLine: number; readonly lineDelta: number }[]): number {
  let source = line;
  for (const row of [...rows].reverse()) {
    if (row.lineDelta > 0 && source >= row.fromLine && source < row.fromLine + row.lineDelta) {
      source = row.fromLine + row.lineDelta;
    } else if (source >= row.fromLine + Math.max(0, row.lineDelta)) {
      source -= row.lineDelta;
    }
  }
  return source;
}

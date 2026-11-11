import type { Position } from '@escape/engine';
import type { WorldEvent } from '@escape/world';

export const PLAYBACK_BUDGET_MS = 240;
const CELL_DURATION_MS = 45;

type AnimationHint =
  | { readonly type: 'walk' | 'jump'; readonly from: Position; readonly to: Position }
  | { readonly type: 'bump'; readonly at: Position }
  | { readonly type: 'hit' }
  | { readonly type: 'entity-move'; readonly entity: string; readonly from: Position; readonly to: Position }
  | { readonly type: 'entity-remove' | 'entity-spawn'; readonly entity: string }
  | { readonly type: 'rows'; readonly fromLine: number; readonly toLine: number; readonly lineDelta: number };

export type AnimationStep = AnimationHint & { readonly durationMs: number };

/** This describes presentation only; endpoints and walk/jump semantics come from WorldSim. */
export function animationSteps(events: readonly WorldEvent[], reducedMotion = false): AnimationStep[] {
  const hints: AnimationHint[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'player-moved': {
        if (event.style === 'jump') {
          hints.push({ type: 'jump', from: event.from, to: event.to });
          break;
        }
        const distance = Math.max(Math.abs(event.to.line - event.from.line), Math.abs(event.to.col - event.from.col));
        let from = event.from;
        for (let cell = 1; cell <= distance; cell += 1) {
          const to = {
            line: event.from.line + Math.sign(event.to.line - event.from.line) * Math.min(cell, Math.abs(event.to.line - event.from.line)),
            col: event.from.col + Math.sign(event.to.col - event.from.col) * Math.min(cell, Math.abs(event.to.col - event.from.col)),
          };
          hints.push({ type: 'walk', from, to });
          from = to;
        }
        break;
      }
      case 'bump': hints.push({ type: 'bump', at: event.at }); break;
      case 'player-hit': hints.push({ type: 'hit' }); break;
      case 'entity-moved': hints.push({ type: 'entity-move', entity: event.entity, from: event.from, to: event.to }); break;
      case 'entity-removed': hints.push({ type: 'entity-remove', entity: event.entity }); break;
      case 'entity-spawned': hints.push({ type: 'entity-spawn', entity: event.entity }); break;
      case 'rows-changed': hints.push({ type: 'rows', fromLine: event.fromLine, toLine: event.toLine, lineDelta: event.lineDelta }); break;
    }
  }
  // Floor to whole milliseconds so floating-point addition cannot exceed the budget.
  const durationMs = reducedMotion || hints.length === 0 ? 0
    : Math.min(CELL_DURATION_MS, Math.floor(PLAYBACK_BUDGET_MS / hints.length));
  return hints.map(hint => ({ ...hint, durationMs }));
}

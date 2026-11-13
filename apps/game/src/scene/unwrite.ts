import type { WorldEvent } from '@escape/world';
import { PLAYBACK_BUDGET_MS } from './animate.js';

export interface UnwritingRow {
  readonly line: number;
  readonly durationMs: number;
}
/** Pre-edit row indices are supplied by the simulation; this plan never infers Vim edits. */
export function unwritingPlan(events: readonly WorldEvent[], reducedMotion = false): readonly UnwritingRow[] {
  return events.flatMap(event => event.type === 'rows-changed' && event.by === 'entity' && event.lineDelta < 0
    ? Array.from({ length: -event.lineDelta }, (_, offset) => ({
      line: event.fromLine + offset, durationMs: reducedMotion ? 0 : PLAYBACK_BUDGET_MS,
    })) : []);
}

/** Each column dissolves after the previous one, on the scene's single playback clock. */
export function unwritingAlpha(col: number, columns: number, progress: number): number {
  return 1 - Math.max(0, Math.min(1, progress * (columns + 1) - col));
}

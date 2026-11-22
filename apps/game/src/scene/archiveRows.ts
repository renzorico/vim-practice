import type { WorldEvent, WorldState } from '@escape/world';

export interface ArchiveRows {
  readonly type: 'delete' | 'put';
  readonly fromLine: number;
  readonly count: number;
}
/** Use the engine's exact edit boundaries, including p's leading line break. */
export function archiveRows(before: WorldState | undefined, after: WorldState,
  events: readonly WorldEvent[]): ArchiveRows | null {
  if (!before || before.stage !== 'archive' || after.stage !== before.stage || after.pending !== null
    || !events.some(event => event.type === 'rows-changed' && event.by === 'player')) return null;
  const snapshot = after.engine.undoStack.at(-1);
  const edit = snapshot?.edits[0];
  const delta = after.engine.lines.length - before.engine.lines.length;
  if (!edit || snapshot?.edits.length !== 1 || delta === 0
    || events.some(event => event.type === 'command' && event.command.kind === 'undo')) return null;
  const prefix = before.engine.lines.join('\n').slice(0, edit.start);
  const fromLine = prefix.split('\n').length - 1 + (delta > 0 && edit.inserted.startsWith('\n') ? 1 : 0);
  return { type: delta < 0 ? 'delete' : 'put', fromLine, count: Math.abs(delta) };
}

/** Fold first, then close the gap; put unfolds while opening space below. */
export function archiveRowPose(plan: ArchiveRows, line: number, progress: number): {
  readonly line: number; readonly scale: number;
} {
  if (line < plan.fromLine) return { line, scale: 1 };
  const ease = (value: number): number => 1 - (1 - value) ** 3;
  if (plan.type === 'put') {
    const fraction = ease(progress);
    return line < plan.fromLine + plan.count
      ? { line: plan.fromLine + (line - plan.fromLine) * fraction, scale: fraction }
      : { line: line - plan.count * (1 - fraction), scale: 1 };
  }
  const slide = ease(Math.max(0, (progress - 0.45) / 0.55));
  return { line: line + plan.count * (1 - slide), scale: 1 };
}

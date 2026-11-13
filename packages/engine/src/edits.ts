import type { EngineState, Position, Snapshot, TextEdit } from './types.js';

export function offsetAt(lines: readonly string[], at: Position): number {
  return lines.slice(0, at.line).reduce((sum, line) => sum + line.length + 1, 0) + at.col;
}

/** The only buffer-writing helper: record semantic ranges before changing text. */
export function applyTextEdits(state: EngineState, edits: readonly TextEdit[]): EngineState {
  let text = state.lines.join('\n');
  const actual: TextEdit[] = [];
  for (const edit of edits) {
    if (text.slice(edit.start, edit.start + edit.removed) === edit.inserted) continue;
    text = text.slice(0, edit.start) + edit.inserted + text.slice(edit.start + edit.removed);
    actual.push(edit);
  }
  if (actual.length === 0) return state;
  const last = state.undoStack.length - 1;
  return { ...state, lines: text.split('\n'), undoStack: last < 0 ? state.undoStack : state.undoStack.map((entry, index) =>
    index === last ? { ...entry, edits: [...entry.edits, ...actual] } : entry) };
}

export function inverseEdits(snapshot: Snapshot): TextEdit[] {
  let text = snapshot.lines.join('\n');
  const inverses: TextEdit[] = [];
  for (const edit of snapshot.edits) {
    inverses.push({ start: edit.start, removed: edit.inserted.length,
      inserted: text.slice(edit.start, edit.start + edit.removed) });
    text = text.slice(0, edit.start) + edit.inserted + text.slice(edit.start + edit.removed);
  }
  return inverses.reverse();
}

/** Extract recorded writes, including a session extending the existing top entry. */
export function editsSince(before: EngineState, after: EngineState): readonly TextEdit[] {
  if (before.lines.join('\n') === after.lines.join('\n')) return [];
  if (after.undoStack.length < before.undoStack.length) {
    return before.undoStack.slice(after.undoStack.length).reverse().flatMap(inverseEdits);
  }
  return after.undoStack.flatMap((entry, index) => {
    const previous = before.undoStack[index];
    return entry.edits.slice(previous?.seq === entry.seq ? previous.edits.length : 0);
  });
}

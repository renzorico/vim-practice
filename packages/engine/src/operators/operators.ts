import { applyTextEdits, offsetAt } from '../edits.js';
import type { CommandOutcome, Range } from '../modules.js';
import type { EngineError, EngineState, Position, RegisterName } from '../types.js';
import { linewiseText, writeRegister } from './registers.js';
import { charLengthAt, clamp, extractText, lastCol, lineAt, removeText } from './text.js';

/** Snapshot before a change so `u` can restore it. A new change clears the redo history. */
export function pushUndo(state: EngineState): EngineState {
  // The new revision number must differ from savedSeq even after undo moved changeSeq
  // below it (edit, save, undo, edit), otherwise `modified` would read false.
  const changeSeq = Math.max(state.changeSeq, state.savedSeq) + 1;
  return {
    ...state,
    undoStack: [...state.undoStack, { lines: state.lines, cursor: state.cursor, seq: state.changeSeq, edits: [] }],
    redoStack: [],
    changeSeq,
    modified: changeSeq !== state.savedSeq,
  };
}

export function failure(state: EngineState, message: string): CommandOutcome {
  const error: EngineError = { code: 'invalid-range', message };
  return { state, error };
}

export function success(state: EngineState): CommandOutcome {
  return { state, error: null };
}

/** A charwise region with an exclusive end, after Vim's end-of-line adjustments. */
interface CharRegion {
  readonly start: Position;
  readonly end: Position;
}

function isRangeInBuffer(lines: readonly string[], range: Range): boolean {
  const { start, end } = range;
  const ordered = range.linewise
    ? start.line <= end.line
    : start.line < end.line || (start.line === end.line && start.col <= end.col);
  return start.line >= 0 && end.line < lines.length && start.col >= 0 && end.col >= 0 && ordered;
}

/**
 * Turns a charwise Range into start + exclusive end.
 * - Exclusive range ending in column 0 of a later line stops at the end of the
 *   previous line (first half of Vim's "o_v" rule, so `dw` on a last word never
 *   joins lines). The other half, promotion to linewise when the start is at or
 *   before the first non-blank (`d/target<CR>`), needs the motion and belongs to
 *   engine.ts, which then passes a linewise Range.
 * - Inclusive range ending past the last character (visual selection over a line
 *   break, or an empty line inside a multi-line selection) also takes the line break.
 */
function resolveCharRegion(lines: readonly string[], range: Range): CharRegion {
  const { start, end } = range;
  const startLine = lineAt(lines, start.line);
  const regionStart: Position = { line: start.line, col: Math.min(start.col, startLine.length) };

  if (!range.inclusive && end.col === 0 && end.line > start.line) {
    const previousLine = end.line - 1;
    return { start: regionStart, end: { line: previousLine, col: lineAt(lines, previousLine).length } };
  }

  const endLine = lineAt(lines, end.line);
  const exclusiveCol = range.inclusive ? end.col + Math.max(1, charLengthAt(endLine, end.col)) : end.col;
  const overshoots = range.inclusive && end.col >= endLine.length;
  // An inclusive range cannot be told apart from a visual selection here, so an
  // empty line selected on its own (`vd`) takes its line break. engine.ts must pass
  // an exclusive empty range for `d$`, `de`, `dl` on an empty line (Vim does nothing).
  if (overshoots && end.line < lines.length - 1) {
    return { start: regionStart, end: { line: end.line + 1, col: 0 } };
  }
  return { start: regionStart, end: { line: end.line, col: Math.min(exclusiveCol, endLine.length) } };
}

function isEmptyRegion(region: CharRegion): boolean {
  return region.start.line === region.end.line && region.start.col === region.end.col;
}

/** Deletes a charwise region into the register. Cursor lands on the start, clamped unless `forInsert`. */
export function deleteCharRegion(
  state: EngineState,
  region: CharRegion,
  register: RegisterName | null,
  forInsert: boolean,
): EngineState {
  const text = extractText(state.lines, region.start, region.end);
  let next = pushUndo(state);
  if (text.length > 0) {
    next = writeRegister(next, register, text, false, 'delete');
  }
  const lines = removeText(state.lines, region.start, region.end);
  const col = forInsert ? region.start.col : Math.min(region.start.col, lastCol(lineAt(lines, region.start.line)));
  return {
    ...applyTextEdits(next, [{ start: offsetAt(state.lines, region.start), removed: text.length, inserted: '' }]),
    cursor: { line: region.start.line, col },
    desiredCol: col,
    modified: true,
  };
}

function deleteLines(state: EngineState, range: Range, register: RegisterName | null): EngineState {
  const removed = state.lines.slice(range.start.line, range.end.line + 1);
  const remaining = [...state.lines.slice(0, range.start.line), ...state.lines.slice(range.end.line + 1)];
  const lines = remaining.length > 0 ? remaining : [''];
  const line = Math.min(range.start.line, lines.length - 1);
  const col = clamp(state.desiredCol, 0, lastCol(lineAt(lines, line)));
  const next = writeRegister(pushUndo(state), register, linewiseText(removed), true, 'delete');
  // Delete the following newline; at EOF take the preceding newline instead.
  const start = offsetAt(state.lines, { line: range.start.line, col: 0 });
  const end = offsetAt(state.lines, { line: range.end.line, col: removed[removed.length - 1]?.length ?? 0 });
  const hasFollowing = range.end.line < state.lines.length - 1;
  const editStart = hasFollowing || range.start.line === 0 ? start : start - 1;
  const editEnd = hasFollowing ? end + 1 : end;
  return { ...applyTextEdits(next, [{ start: editStart, removed: editEnd - editStart, inserted: '' }]),
    cursor: { line, col }, desiredCol: col, modified: true };
}

function changeLines(state: EngineState, range: Range, register: RegisterName | null): EngineState {
  const removed = state.lines.slice(range.start.line, range.end.line + 1);
  const next = writeRegister(pushUndo(state), register, linewiseText(removed), true, 'delete');
  return {
    ...applyTextEdits(next, [{ start: offsetAt(state.lines, { line: range.start.line, col: 0 }), removed: removed.join('\n').length, inserted: '' }]),
    cursor: { line: range.start.line, col: 0 },
    desiredCol: 0,
    mode: 'insert',
    modified: true,
  };
}

function operatorDelete(state: EngineState, range: Range, register: RegisterName | null): CommandOutcome {
  if (!isRangeInBuffer(state.lines, range)) {
    return failure(state, 'Invalid range');
  }
  if (range.linewise) {
    return success(deleteLines(state, range, register));
  }
  const region = resolveCharRegion(state.lines, range);
  if (isEmptyRegion(region)) {
    return success(state);
  }
  return success(deleteCharRegion(state, region, register, false));
}

function operatorChange(state: EngineState, range: Range, register: RegisterName | null): CommandOutcome {
  if (!isRangeInBuffer(state.lines, range)) {
    return failure(state, 'Invalid range');
  }
  if (range.linewise) {
    return success(changeLines(state, range, register));
  }
  const region = resolveCharRegion(state.lines, range);
  const changed = isEmptyRegion(region)
    ? { ...pushUndo(state), cursor: region.start, desiredCol: region.start.col, modified: true }
    : deleteCharRegion(state, region, register, true);
  return success({ ...changed, mode: 'insert' });
}

function operatorYank(state: EngineState, range: Range, register: RegisterName | null): CommandOutcome {
  if (!isRangeInBuffer(state.lines, range)) {
    return failure(state, 'Invalid range');
  }
  if (range.linewise) {
    const yanked = state.lines.slice(range.start.line, range.end.line + 1);
    const next = writeRegister(state, register, linewiseText(yanked), true, 'yank');
    if (range.start.line === state.cursor.line) {
      return success(next);
    }
    const col = clamp(range.start.col, 0, lastCol(lineAt(state.lines, range.start.line)));
    return success({ ...next, cursor: { line: range.start.line, col }, desiredCol: col });
  }
  const region = resolveCharRegion(state.lines, range);
  const text = extractText(state.lines, region.start, region.end);
  const next = text.length > 0 ? writeRegister(state, register, text, false, 'yank') : state;
  const col = clamp(region.start.col, 0, lastCol(lineAt(state.lines, region.start.line)));
  return success({ ...next, cursor: { line: region.start.line, col }, desiredCol: col });
}

export const operators = {
  d: operatorDelete,
  c: operatorChange,
  y: operatorYank,
} as const;

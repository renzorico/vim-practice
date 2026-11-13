import { applyTextEdits, offsetAt } from '../edits.js';
import type { CommandOutcome, SimpleCommandFn, SimpleCommandSpec } from '../modules.js';
import type { EngineState, Position, RegisterName } from '../types.js';
import { deleteCharRegion, failure, operators, pushUndo, success } from './operators.js';
import { readRegister } from './registers.js';
import { advanceChars, charLengthAt, clamp, firstNonBlankCol, lastCol, lineAt, retreatChars } from './text.js';

const LINE_BREAK_KEY = '<CR>';
const CANCEL_KEY = '<Esc>';
const NAMED_KEY_CHARS: Readonly<Record<string, string>> = {
  '<Space>': ' ',
  '<Tab>': '\t',
  '<lt>': '<',
  '<Bar>': '|',
  '<Bslash>': '\\',
};
const MIN_JOIN_LINES = 2;
const OLDEST_CHANGE_MESSAGE = 'Already at oldest change';
const NEWEST_CHANGE_MESSAGE = 'Already at newest change';

function atCursor(state: EngineState): { line: string; col: number } {
  return { line: lineAt(state.lines, state.cursor.line), col: state.cursor.col };
}

function withCursor(state: EngineState, cursor: Position): EngineState {
  return { ...state, cursor, desiredCol: cursor.col };
}

function x(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  const { line, col } = atCursor(state);
  if (line.length === 0) {
    return success(state);
  }
  const end = { line: state.cursor.line, col: advanceChars(line, col, Math.max(1, count)) };
  return success(deleteCharRegion(state, { start: state.cursor, end }, register, false));
}

function X(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  const { col } = atCursor(state);
  const { line } = atCursor(state);
  const startCol = retreatChars(line, col, Math.max(1, count));
  if (startCol === col) {
    return success(state);
  }
  const start = { line: state.cursor.line, col: startCol };
  return success(deleteCharRegion(state, { start, end: state.cursor }, register, false));
}

function replacementFor(arg: string | null): { kind: 'char'; char: string } | { kind: 'break' } | { kind: 'cancel' } {
  if (arg === null || arg === CANCEL_KEY) {
    return { kind: 'cancel' };
  }
  if (arg === LINE_BREAK_KEY) {
    return { kind: 'break' };
  }
  const named = NAMED_KEY_CHARS[arg];
  if (named !== undefined) {
    return { kind: 'char', char: named };
  }
  return Array.from(arg).length === 1 ? { kind: 'char', char: arg } : { kind: 'cancel' };
}

function r(state: EngineState, count: number, _register: RegisterName | null, arg: string | null): CommandOutcome {
  const replacement = replacementFor(arg);
  if (replacement.kind === 'cancel') {
    return success(state);
  }
  const { line, col } = atCursor(state);
  const length = Math.max(1, count);
  const endCol = advanceChars(line, col, length);
  if (Array.from(line.slice(col, endCol)).length < length) {
    return failure(state, 'Not enough characters to replace');
  }
  const before = line.slice(0, col);
  const undoable = pushUndo(state);
  const index = state.cursor.line;
  if (replacement.kind === 'break') {
    return success({ ...withCursor(applyTextEdits(undoable, [{ start: offsetAt(state.lines, state.cursor), removed: endCol - col, inserted: '\n' }]), { line: index + 1, col: 0 }), modified: true });
  }
  const replaced = before + replacement.char.repeat(length);
  const cursor = { line: index, col: retreatChars(replaced, replaced.length, 1) };
  return success({ ...withCursor(applyTextEdits(undoable, [{ start: offsetAt(state.lines, state.cursor), removed: endCol - col, inserted: replacement.char.repeat(length) }]), cursor), modified: true });
}

function paste(state: EngineState, count: number, register: RegisterName | null, after: boolean): CommandOutcome {
  const value = readRegister(state, register);
  if (value === undefined || value.text.length === 0) {
    return failure(state, `Nothing in register ${register ?? '"'}`);
  }
  const repeat = Math.max(1, count);
  const undoable = pushUndo(state);
  const index = state.cursor.line;

  if (value.linewise) {
    const body = value.text.endsWith('\n') ? value.text.slice(0, -1) : value.text;
    const pasted = Array.from({ length: repeat }, () => body.split('\n')).flat();
    const at = after ? index + 1 : index;
    const lines = [...state.lines.slice(0, at), ...pasted, ...state.lines.slice(at)];
    const cursor = { line: at, col: firstNonBlankCol(lineAt(lines, at)) };
    return success({ ...withCursor(applyTextEdits(undoable, [{
      // Whole rows carry a following newline, except appending at EOF uses a preceding one.
      start: at < state.lines.length ? offsetAt(state.lines, { line: at, col: 0 }) : state.lines.join('\n').length,
      removed: 0, inserted: at < state.lines.length ? pasted.join('\n') + '\n' : '\n' + pasted.join('\n'),
    }]), cursor), modified: true });
  }

  const { line, col } = atCursor(state);
  const insertCol = after ? col + charLengthAt(line, col) : col;
  const parts = value.text.repeat(repeat).split('\n');
  const head = line.slice(0, insertCol);
  const tail = line.slice(insertCol);
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  const replacement =
    parts.length === 1 ? [head + first + tail] : [head + first, ...parts.slice(1, -1), last + tail];
  const lines = [...state.lines.slice(0, index), ...replacement, ...state.lines.slice(index + 1)];
  const pastedEnd = head + first;
  const cursor =
    parts.length === 1
      ? { line: index, col: retreatChars(pastedEnd, pastedEnd.length, 1) }
      : { line: index, col: Math.min(insertCol, lastCol(lineAt(lines, index))) };
  return success({ ...withCursor(applyTextEdits(undoable, [{ start: offsetAt(state.lines, { line: index, col: insertCol }), removed: 0, inserted: value.text.repeat(repeat) }]), cursor), modified: true });
}

function p(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  return paste(state, count, register, true);
}

function P(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  return paste(state, count, register, false);
}

/** Last line index covered by a count-prefixed D, C or Y; null when Vim fails (already on the last line). */
function lastCountedLine(state: EngineState, count: number): number | null {
  const lastLine = state.lines.length - 1;
  if (count > 1 && state.cursor.line >= lastLine) {
    return null;
  }
  return Math.min(state.cursor.line + Math.max(1, count) - 1, lastLine);
}

function D(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  const endLine = lastCountedLine(state, count);
  if (endLine === null) {
    return failure(state, 'Count exceeds the number of lines');
  }
  const end = { line: endLine, col: lineAt(state.lines, endLine).length };
  if (endLine === state.cursor.line && end.col <= state.cursor.col) {
    return success(state);
  }
  return success(deleteCharRegion(state, { start: state.cursor, end }, register, false));
}

function C(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  const endLine = lastCountedLine(state, count);
  if (endLine === null) {
    return failure(state, 'Count exceeds the number of lines');
  }
  const end = { line: endLine, col: lineAt(state.lines, endLine).length };
  const nothingToDelete = endLine === state.cursor.line && end.col <= state.cursor.col;
  const changed = nothingToDelete
    ? { ...pushUndo(state), modified: true }
    : deleteCharRegion(state, { start: state.cursor, end }, register, true);
  return success({ ...changed, mode: 'insert' });
}

function Y(state: EngineState, count: number, register: RegisterName | null): CommandOutcome {
  const endLine = lastCountedLine(state, count);
  if (endLine === null) {
    return failure(state, 'Count exceeds the number of lines');
  }
  const start = { line: state.cursor.line, col: state.cursor.col };
  return operators.y(state, { start, end: { line: endLine, col: 0 }, linewise: true, inclusive: false }, register);
}

function joinLines(state: EngineState, count: number): CommandOutcome {
  const lastLine = state.lines.length - 1;
  let joined = Math.max(MIN_JOIN_LINES, count);
  if (state.cursor.line + joined - 1 > lastLine) {
    if (joined <= MIN_JOIN_LINES) {
      return failure(state, 'No line to join');
    }
    joined = lastLine - state.cursor.line + 1;
  }
  let text = lineAt(state.lines, state.cursor.line);
  let cursorCol = 0;
  const edits = [];
  for (let offset = 1; offset < joined; offset += 1) {
    const original = lineAt(state.lines, state.cursor.line + offset);
    const next = original.replace(/^[ \t]+/, '');
    const lastChar = text.slice(-1);
    const needsSpace = next.length > 0 && next[0] !== ')' && text.length > 0 && lastChar !== '\t' && lastChar !== ' ';
    edits.push({ start: offsetAt(state.lines, { line: state.cursor.line, col: text.length }), removed: 1 + original.length - next.length, inserted: needsSpace ? ' ' : '' });
    cursorCol = text.length;
    text += (needsSpace ? ' ' : '') + next;
  }
  const col = clamp(cursorCol, 0, lastCol(text));
  const undoable = pushUndo(state);
  return success({ ...withCursor(applyTextEdits(undoable, edits), { line: state.cursor.line, col }), modified: true });
}

function J(state: EngineState, count: number): CommandOutcome {
  return joinLines(state, count);
}

function restore(state: EngineState, from: 'undo' | 'redo'): EngineState {
  const source = from === 'undo' ? state.undoStack : state.redoStack;
  const snapshot = source[source.length - 1];
  if (snapshot === undefined) {
    return state;
  }
  const current = { lines: state.lines, cursor: state.cursor, seq: state.changeSeq, edits: snapshot.edits };
  const undoStack = from === 'undo' ? source.slice(0, -1) : [...state.undoStack, current];
  const redoStack = from === 'undo' ? [...state.redoStack, current] : source.slice(0, -1);
  const line = clamp(snapshot.cursor.line, 0, snapshot.lines.length - 1);
  const col = clamp(snapshot.cursor.col, 0, lastCol(lineAt(snapshot.lines, line)));
  return {
    ...state,
    lines: snapshot.lines,
    cursor: { line, col },
    desiredCol: col,
    undoStack,
    redoStack,
    mode: 'normal',
    changeSeq: snapshot.seq,
    modified: snapshot.seq !== state.savedSeq,
  };
}

function stepHistory(state: EngineState, count: number, from: 'undo' | 'redo'): CommandOutcome {
  const source = from === 'undo' ? state.undoStack : state.redoStack;
  if (source.length === 0) {
    const message = from === 'undo' ? OLDEST_CHANGE_MESSAGE : NEWEST_CHANGE_MESSAGE;
    return { state, error: { code: 'nothing-to-undo', message } };
  }
  let next = state;
  const steps = Math.min(Math.max(1, count), source.length);
  for (let step = 0; step < steps; step += 1) {
    next = restore(next, from);
  }
  return success(next);
}

function u(state: EngineState, count: number): CommandOutcome {
  return stepHistory(state, count, 'undo');
}

function ctrlR(state: EngineState, count: number): CommandOutcome {
  return stepHistory(state, count, 'redo');
}

function spec(id: string, fn: SimpleCommandFn, needsArg = false): SimpleCommandSpec {
  return { id, needsArg, fn };
}

export const simpleCommands: Readonly<Record<string, SimpleCommandSpec>> = {
  x: spec('x', x),
  X: spec('X', X),
  r: spec('r', r, true),
  p: spec('p', p),
  P: spec('P', P),
  D: spec('D', D),
  C: spec('C', C),
  Y: spec('Y', Y),
  J: spec('J', J),
  u: spec('u', u),
  '<C-r>': spec('<C-r>', ctrlR),
};

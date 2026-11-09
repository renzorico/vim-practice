import type { EngineState, Position } from '../types.js';
import type { MotionFn, MotionResult, MotionSpec } from '../modules.js';
import { findPattern, repeatLastSearch, searchWordUnderCursor } from './search.js';
import {
  END_OF_LINE_COL,
  charwise,
  firstNonBlankCol,
  isOperatorPending,
  lastCol,
  lineAt,
  linewise,
  samePosition,
} from './text.js';
import { wordMotion } from './words.js';

export { findPattern };

const PERCENT_SCALE = 100;
const MARK_NAME = /^[a-zA-Z]$/;

type FindCommand = 'f' | 'F' | 't' | 'T';

// --- Left, right, up, down ---------------------------------------------------------------

const moveLeft: MotionFn = (state, count) => {
  if (state.cursor.col === 0) return null;
  return charwise({ line: state.cursor.line, col: Math.max(0, state.cursor.col - count) }, false);
};

const moveRight: MotionFn = (state, count) => {
  const length = lineAt(state, state.cursor.line).length;
  // An operator may reach the end-of-line position (`dl` on the last character).
  const maxCol = isOperatorPending(state) ? length : lastCol(lineAt(state, state.cursor.line));
  if (state.cursor.col >= maxCol) return null;
  return charwise({ line: state.cursor.line, col: Math.min(maxCol, state.cursor.col + count) }, false);
};

function moveVertically(state: EngineState, delta: number): MotionResult | null {
  const lastLine = state.lines.length - 1;
  const line = Math.min(lastLine, Math.max(0, state.cursor.line + delta));
  if (line === state.cursor.line) return null;
  const col = Math.min(state.desiredCol, lastCol(lineAt(state, line)));
  return {
    target: { line, col },
    linewise: true,
    inclusive: false,
    statePatch: { desiredCol: state.desiredCol },
  };
}

const moveDown: MotionFn = (state, count) => moveVertically(state, count);
const moveUp: MotionFn = (state, count) => moveVertically(state, -count);

// --- Line start / end, file start / end --------------------------------------------------

const lineStart: MotionFn = (state) => charwise({ line: state.cursor.line, col: 0 }, false);

const firstNonBlank: MotionFn = (state) =>
  charwise({ line: state.cursor.line, col: firstNonBlankCol(lineAt(state, state.cursor.line)) }, false);

const lineEnd: MotionFn = (state, count) => {
  const lastLine = state.lines.length - 1;
  // `2$` on the last line fails; a count past the end otherwise clamps to the last line.
  if (count > 1 && state.cursor.line >= lastLine) return null;
  const line = Math.min(lastLine, state.cursor.line + count - 1);
  return charwise({ line, col: lastCol(lineAt(state, line)) }, true, { desiredCol: END_OF_LINE_COL });
};

/** Linewise jump to the first non-blank, used by ' marks (Vim does this regardless of 'startofline'). */
function gotoLineFirstNonBlank(state: EngineState, line: number): MotionResult {
  const clamped = Math.min(state.lines.length - 1, Math.max(0, line));
  return linewise({ line: clamped, col: firstNonBlankCol(lineAt(state, clamped)) });
}

function gotoLine(state: EngineState, line: number): MotionResult {
  const clamped = Math.min(state.lines.length - 1, Math.max(0, line));
  // Neovim default 'nostartofline': gg/G keep the remembered column instead of jumping to the first non-blank.
  const col = Math.max(0, Math.min(state.desiredCol, lastCol(lineAt(state, clamped))));
  return { ...linewise({ line: clamped, col }), statePatch: { desiredCol: state.desiredCol } };
}

const gotoFirstLine: MotionFn = (state, count, hasCount) => gotoLine(state, hasCount ? count - 1 : 0);
const gotoLastLine: MotionFn = (state, count, hasCount) => gotoLine(state, hasCount ? count - 1 : state.lines.length - 1);

// --- f F t T ; , -------------------------------------------------------------------------

/**
 * Port of Vim's searchc(). When repeating a t/T with count 1, the first adjacent match is
 * skipped so `;` always moves (Vim's default 'cpoptions' without ';').
 */
function findInLine(state: EngineState, count: number, command: FindCommand, char: string, isRepeat: boolean): MotionResult | null {
  const line = lineAt(state, state.cursor.line);
  const forward = command === 'f' || command === 't';
  const till = command === 't' || command === 'T';
  const step = forward ? 1 : -1;
  let col = state.cursor.col;
  let mayMatch = !(isRepeat && till && count === 1);
  for (let found = 0; found < count; found += 1) {
    for (;;) {
      col += step;
      if (col < 0 || col >= line.length) return null;
      if (line[col] === char && mayMatch) break;
      mayMatch = true;
    }
  }
  if (till) col -= step;
  const target = { line: state.cursor.line, col };
  // Backward finds are exclusive (`dF,` keeps the starting character); forward ones are inclusive.
  return charwise(target, forward, isRepeat ? undefined : { lastFind: { command, char } });
}

function makeFindMotion(command: FindCommand): MotionFn {
  return (state, count, _hasCount, arg) => (arg === null || arg.length === 0 ? null : findInLine(state, count, command, arg, false));
}

const REVERSED_FIND: Readonly<Record<FindCommand, FindCommand>> = { f: 'F', F: 'f', t: 'T', T: 't' };

const repeatFind: MotionFn = (state, count) =>
  state.lastFind === null ? null : findInLine(state, count, state.lastFind.command, state.lastFind.char, true);

const repeatFindReversed: MotionFn = (state, count) =>
  state.lastFind === null ? null : findInLine(state, count, REVERSED_FIND[state.lastFind.command], state.lastFind.char, true);

// --- % ---------------------------------------------------------------------------------

const BRACKET_PAIRS: Readonly<Record<string, { readonly match: string; readonly forward: boolean }>> = {
  '(': { match: ')', forward: true },
  '[': { match: ']', forward: true },
  '{': { match: '}', forward: true },
  ')': { match: '(', forward: false },
  ']': { match: '[', forward: false },
  '}': { match: '{', forward: false },
};

/**
 * True when `col` sits inside a double-quoted string. Like Vim, quotes are ignored on lines
 * with an odd number of unescaped quotes.
 */
function isInsideQuotes(line: string, col: number): boolean {
  let total = 0;
  let before = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '\\') {
      index += 1;
    } else if (line[index] === '"') {
      total += 1;
      if (index < col) before += 1;
    }
  }
  return total % 2 === 0 && before % 2 === 1;
}

function findMatchingBracket(lines: readonly string[], from: Position, same: string, other: string, forward: boolean): Position | null {
  const startInQuotes = isInsideQuotes(lines[from.line] ?? '', from.col);
  let depth = 0;
  let line = from.line;
  let col = from.col;
  const step = forward ? 1 : -1;
  for (;;) {
    col += step;
    while (col < 0 || col >= (lines[line] ?? '').length) {
      line += step;
      if (line < 0 || line >= lines.length) return null;
      col = forward ? 0 : (lines[line] ?? '').length - 1;
    }
    const char = lines[line]?.[col];
    if (char !== same && char !== other) continue;
    if (isInsideQuotes(lines[line] ?? '', col) !== startInQuotes) continue;
    if (char === same) depth += 1;
    else if (char === other) {
      if (depth === 0) return { line, col };
      depth -= 1;
    }
  }
}

const matchBracket: MotionFn = (state, count, hasCount) => {
  if (hasCount) {
    // N% jumps to the line N percent of the way through the file.
    const line = Math.floor((count * state.lines.length + PERCENT_SCALE - 1) / PERCENT_SCALE) - 1;
    return count > PERCENT_SCALE ? null : gotoLine(state, line);
  }
  const text = lineAt(state, state.cursor.line);
  let col = state.cursor.col;
  while (col < text.length && BRACKET_PAIRS[text[col] ?? ''] === undefined) col += 1;
  const pair = BRACKET_PAIRS[text[col] ?? ''];
  if (pair === undefined) return null;
  const char = text[col] ?? '';
  const target = findMatchingBracket(state.lines, { line: state.cursor.line, col }, char, pair.match, pair.forward);
  return target === null ? null : charwise(target, true);
};

// --- { } -------------------------------------------------------------------------------

/** Port of Vim's findpar(): a paragraph boundary is an empty line. */
function moveParagraph(state: EngineState, count: number, forward: boolean): MotionResult | null {
  const lastLine = state.lines.length - 1;
  const step = forward ? 1 : -1;
  let current = state.cursor.line;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    let sawText = false;
    for (let first = true; ; first = false) {
      if (lineAt(state, current).length > 0) sawText = true;
      if (!first && sawText && lineAt(state, current).length === 0) break;
      const next = current + step;
      if (next < 0 || next > lastLine) {
        if (remaining > 1) return null;
        break;
      }
      current = next;
    }
  }
  const text = lineAt(state, current);
  const reachedEnd = forward && current === lastLine && text.length > 0;
  const target = { line: current, col: reachedEnd ? text.length - 1 : 0 };
  // An operator on the final character still has a range (`d}` there deletes it).
  if (samePosition(target, state.cursor) && !(reachedEnd && isOperatorPending(state))) return null;
  return charwise(target, reachedEnd);
}

const paragraphForward: MotionFn = (state, count) => moveParagraph(state, count, true);
const paragraphBackward: MotionFn = (state, count) => moveParagraph(state, count, false);

// --- Marks -----------------------------------------------------------------------------

export const setMark = (state: EngineState, name: string): EngineState =>
  MARK_NAME.test(name) ? { ...state, marks: { ...state.marks, [name]: state.cursor } } : state;

const jumpToMarkLine: MotionFn = (state, _count, _hasCount, arg) => {
  const mark = arg === null ? undefined : state.marks[arg];
  return mark === undefined ? null : gotoLineFirstNonBlank(state, mark.line);
};

const jumpToMarkExact: MotionFn = (state, _count, _hasCount, arg) => {
  const mark = arg === null ? undefined : state.marks[arg];
  if (mark === undefined) return null;
  const line = Math.min(state.lines.length - 1, mark.line);
  return charwise({ line, col: Math.min(mark.col, lastCol(lineAt(state, line))) }, false);
};

// --- Registry --------------------------------------------------------------------------

const spec = (id: string, fn: MotionFn, needsArg = false): MotionSpec => ({ id, needsArg, fn });

export const motions: Readonly<Record<string, MotionSpec>> = Object.fromEntries(
  [
    spec('h', moveLeft),
    spec('l', moveRight),
    spec('j', moveDown),
    spec('k', moveUp),
    spec('0', lineStart),
    spec('^', firstNonBlank),
    spec('$', lineEnd),
    spec('gg', gotoFirstLine),
    spec('G', gotoLastLine),
    spec('w', (state, count) => wordMotion(state, count, 'w', false)),
    spec('b', (state, count) => wordMotion(state, count, 'b', false)),
    spec('e', (state, count) => wordMotion(state, count, 'e', false)),
    spec('W', (state, count) => wordMotion(state, count, 'w', true)),
    spec('B', (state, count) => wordMotion(state, count, 'b', true)),
    spec('E', (state, count) => wordMotion(state, count, 'e', true)),
    spec('f', makeFindMotion('f'), true),
    spec('F', makeFindMotion('F'), true),
    spec('t', makeFindMotion('t'), true),
    spec('T', makeFindMotion('T'), true),
    spec(';', repeatFind),
    spec(',', repeatFindReversed),
    spec('%', matchBracket),
    spec('{', paragraphBackward),
    spec('}', paragraphForward),
    spec('n', (state, count) => repeatLastSearch(state, count, true)),
    spec('N', (state, count) => repeatLastSearch(state, count, false)),
    spec('*', (state, count) => searchWordUnderCursor(state, count, true)),
    spec('#', (state, count) => searchWordUnderCursor(state, count, false)),
    spec("'", jumpToMarkLine, true),
    spec('`', jumpToMarkExact, true),
  ].map((motion) => [motion.id, motion]),
);

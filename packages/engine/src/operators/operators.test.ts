import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state.js';
import type { CommandOutcome, Range } from '../modules.js';
import type { EngineState, RegisterValue } from '../types.js';
import { operators, pushUndo, simpleCommands, writeRegister } from './index.js';

function state(lines: string[], line = 0, col = 0, registers: Record<string, RegisterValue> = {}): EngineState {
  return { ...createInitialState(lines, { line, col }), registers };
}

function charRange(startLine: number, startCol: number, endLine: number, endCol: number, inclusive: boolean): Range {
  return { start: { line: startLine, col: startCol }, end: { line: endLine, col: endCol }, linewise: false, inclusive };
}

function lineRange(startLine: number, endLine: number, startCol = 0): Range {
  return { start: { line: startLine, col: startCol }, end: { line: endLine, col: 0 }, linewise: true, inclusive: false };
}

function simple(
  id: string,
  from: EngineState,
  count = 1,
  register: string | null = null,
  arg: string | null = null,
): CommandOutcome {
  const spec = simpleCommands[id];
  if (spec === undefined) {
    throw new Error(`missing simple command ${id}`);
  }
  return spec.fn(from, count, register, arg);
}

function cursorOf(outcome: CommandOutcome): [number, number] {
  return [outcome.state.cursor.line, outcome.state.cursor.col];
}

const linewise = (text: string): RegisterValue => ({ text, linewise: true });
const charwise = (text: string): RegisterValue => ({ text, linewise: false });

describe('operator d', () => {
  it('deletes an exclusive charwise range (dw)', () => {
    const out = operators.d(state(['one two'], 0, 0), charRange(0, 0, 0, 4, false), null);
    expect(out.state.lines).toEqual(['two']);
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.registers['-']).toEqual(charwise('one '));
    expect(out.state.registers['"']).toEqual(charwise('one '));
    expect(out.state.modified).toBe(true);
  });

  it('deletes an inclusive range (de) and clamps the cursor', () => {
    const out = operators.d(state(['abc def'], 0, 4), charRange(0, 4, 0, 6, true), null);
    expect(out.state.lines).toEqual(['abc ']);
    expect(cursorOf(out)).toEqual([0, 3]);
  });

  it('pushes an undo snapshot and clears redo', () => {
    const start = { ...state(['abc']), redoStack: [{ lines: ['zzz'], cursor: { line: 0, col: 0 }, seq: 5 }] };
    const out = operators.d(start, charRange(0, 0, 0, 1, false), null);
    expect(out.state.undoStack).toEqual([{ lines: ['abc'], cursor: { line: 0, col: 0 }, seq: 0 }]);
    expect(out.state.redoStack).toEqual([]);
  });

  it('deletes two lines for a linewise range (dj)', () => {
    const out = operators.d(state(['a', 'b', 'c'], 0, 0), lineRange(0, 1), null);
    expect(out.state.lines).toEqual(['c']);
    expect(out.state.registers['1']).toEqual(linewise('a\nb\n'));
    expect(out.state.registers['-']).toBeUndefined();
  });

  it('moves the cursor to the new last line when the last line is deleted (dd)', () => {
    const out = operators.d(state(['a', 'b', 'c'], 2, 0), lineRange(2, 2, 0), null);
    expect(out.state.lines).toEqual(['a', 'b']);
    expect(cursorOf(out)).toEqual([1, 0]);
  });

  it('leaves one empty line when every line is deleted', () => {
    const out = operators.d(state(['a']), lineRange(0, 0), null);
    expect(out.state.lines).toEqual(['']);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('keeps the remembered column after a linewise delete, clamped', () => {
    const out = operators.d(state(['abc', '  def'], 0, 2), lineRange(0, 0, 2), null);
    expect(out.state.lines).toEqual(['  def']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('joins lines for a multi-line charwise delete', () => {
    const out = operators.d(state(['abc', 'def'], 0, 1), charRange(0, 1, 1, 1, true), null);
    expect(out.state.lines).toEqual(['af']);
    expect(out.state.registers['1']).toEqual(charwise('bc\nde'));
    expect(cursorOf(out)).toEqual([0, 1]);
  });

  it('does not join lines when an exclusive range ends in column 0 (dw on a last word)', () => {
    const out = operators.d(state(['foo', 'bar'], 0, 0), charRange(0, 0, 1, 0, false), null);
    expect(out.state.lines).toEqual(['', 'bar']);
  });

  it('includes the line break of an empty line inside a visual selection', () => {
    const out = operators.d(state(['a', '', 'b'], 0, 0), charRange(0, 0, 1, 0, true), null);
    expect(out.state.lines).toEqual(['b']);
    expect(out.state.registers['"']).toEqual(charwise('a\n\n'));
  });

  it('does nothing for an empty exclusive region (dl on an empty line)', () => {
    const start = state(['', 'x']);
    const out = operators.d(start, charRange(0, 0, 0, 0, false), null);
    expect(out.state).toBe(start);
    expect(out.error).toBeNull();
  });

  it('writes a named register without touching "- and keeps "1 for multi-line deletes', () => {
    const named = operators.d(state(['ab']), charRange(0, 0, 0, 1, false), 'a');
    expect(named.state.registers['a']).toEqual(charwise('a'));
    expect(named.state.registers['-']).toBeUndefined();
    const multi = operators.d(state(['a', 'b']), lineRange(0, 0), 'a');
    expect(multi.state.registers['a']).toEqual(linewise('a\n'));
    expect(multi.state.registers['1']).toEqual(linewise('a\n'));
  });

  it('discards text into the black hole register', () => {
    const out = operators.d(state(['a', 'b']), lineRange(0, 0), '_');
    expect(out.state.registers).toEqual({});
    expect(out.state.lines).toEqual(['b']);
  });

  it('rejects ranges outside the buffer', () => {
    const out = operators.d(state(['a']), lineRange(0, 3), null);
    expect(out.error?.code).toBe('invalid-range');
    expect(out.state.lines).toEqual(['a']);
  });

  it('rejects a reversed range', () => {
    const out = operators.d(state(['abc']), charRange(0, 2, 0, 0, false), null);
    expect(out.error?.code).toBe('invalid-range');
  });
});

describe('operator y', () => {
  it('yanks charwise into "0 and the unnamed register without editing', () => {
    const out = operators.y(state(['abc def'], 0, 4), charRange(0, 0, 0, 3, false), null);
    expect(out.state.registers['0']).toEqual(charwise('abc'));
    expect(out.state.registers['"']).toEqual(charwise('abc'));
    expect(out.state.lines).toEqual(['abc def']);
    expect(out.state.modified).toBe(false);
    expect(out.state.undoStack).toEqual([]);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('yanks linewise with a trailing newline in the register text', () => {
    const out = operators.y(state(['a', 'b', 'c'], 0, 0), lineRange(0, 1), null);
    expect(out.state.registers['0']).toEqual(linewise('a\nb\n'));
  });

  it('keeps the cursor when yanking downwards (yj, yy)', () => {
    const out = operators.y(state(['abc', 'def'], 0, 2), lineRange(0, 1, 2), null);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('moves the cursor up when yanking upwards (yk)', () => {
    const out = operators.y(state(['ab', 'cd'], 1, 1), lineRange(0, 1, 1), null);
    expect(cursorOf(out)).toEqual([0, 1]);
  });

  it('yanks a multi-line charwise range', () => {
    const out = operators.y(state(['abc', 'def'], 0, 1), charRange(0, 1, 1, 1, true), null);
    expect(out.state.registers['0']).toEqual(charwise('bc\nde'));
    expect(cursorOf(out)).toEqual([0, 1]);
  });

  it('with a named register does not fill "0', () => {
    const out = operators.y(state(['abc']), charRange(0, 0, 0, 1, false), 'b');
    expect(out.state.registers['b']).toEqual(charwise('a'));
    expect(out.state.registers['0']).toBeUndefined();
    expect(out.state.registers['"']).toEqual(charwise('a'));
  });
});

describe('operator c', () => {
  it('deletes charwise and enters insert at the start', () => {
    const out = operators.c(state(['abc def'], 0, 0), charRange(0, 0, 0, 3, false), null);
    expect(out.state.lines).toEqual([' def']);
    expect(out.state.mode).toBe('insert');
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.registers['-']).toEqual(charwise('abc'));
    expect(out.state.modified).toBe(true);
    expect(out.state.undoStack).toHaveLength(1);
  });

  it('may leave the cursor past the last character (c to end of line)', () => {
    const out = operators.c(state(['abc def'], 0, 4), charRange(0, 4, 0, 6, true), null);
    expect(out.state.lines).toEqual(['abc ']);
    expect(cursorOf(out)).toEqual([0, 4]);
  });

  it('keeps an empty line for a linewise change and does not autoindent', () => {
    const out = operators.c(state(['  ab', 'cd'], 0, 3), lineRange(0, 0), null);
    expect(out.state.lines).toEqual(['', 'cd']);
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.mode).toBe('insert');
    expect(out.state.registers['1']).toEqual(linewise('  ab\n'));
  });

  it('collapses several lines into one empty line (2cc)', () => {
    const out = operators.c(state(['ab', 'cd']), lineRange(0, 1), null);
    expect(out.state.lines).toEqual(['']);
  });

  it('enters insert for an empty region without editing text', () => {
    const out = operators.c(state(['abc'], 0, 1), charRange(0, 1, 0, 1, false), null);
    expect(out.state.lines).toEqual(['abc']);
    expect(out.state.mode).toBe('insert');
    expect(cursorOf(out)).toEqual([0, 1]);
  });
});

describe('writeRegister', () => {
  const base = state(['x']);

  it('yank fills unnamed and "0', () => {
    const out = writeRegister(base, null, 'hi', false, 'yank');
    expect(out.registers).toEqual({ '"': charwise('hi'), '0': charwise('hi') });
  });

  it('small delete fills "- and unnamed only', () => {
    const out = writeRegister(base, null, 'hi', false, 'delete');
    expect(out.registers).toEqual({ '"': charwise('hi'), '-': charwise('hi') });
  });

  it('linewise delete shifts "1-"9', () => {
    let current = base;
    for (let index = 1; index <= 10; index += 1) {
      current = writeRegister(current, null, `l${index}\n`, true, 'delete');
    }
    expect(current.registers['1']).toEqual(linewise('l10\n'));
    expect(current.registers['2']).toEqual(linewise('l9\n'));
    expect(current.registers['9']).toEqual(linewise('l2\n'));
    expect(current.registers['10']).toBeUndefined();
  });

  it('multi-line charwise delete also goes to "1', () => {
    const out = writeRegister(base, null, 'a\nb', false, 'delete');
    expect(out.registers['1']).toEqual(charwise('a\nb'));
    expect(out.registers['-']).toBeUndefined();
  });

  it('black hole leaves the state untouched', () => {
    expect(writeRegister(base, '_', 'x', false, 'delete')).toBe(base);
  });

  it('uppercase appends charwise to charwise', () => {
    const first = writeRegister(base, 'a', 'abc', false, 'yank');
    const out = writeRegister(first, 'A', 'def', false, 'yank');
    expect(out.registers['a']).toEqual(charwise('abcdef'));
    expect(out.registers['"']).toEqual(charwise('abcdef'));
    expect(out.registers['A']).toBeUndefined();
  });

  it('uppercase append of linewise to charwise makes it linewise on a new line', () => {
    const first = writeRegister(base, 'a', 'abc', false, 'yank');
    const out = writeRegister(first, 'A', 'x\n', true, 'yank');
    expect(out.registers['a']).toEqual(linewise('abc\nx\n'));
  });

  it('uppercase append of charwise to linewise adds a line', () => {
    const first = writeRegister(base, 'a', 'x\n', true, 'yank');
    const out = writeRegister(first, 'A', 'abc', false, 'yank');
    expect(out.registers['a']).toEqual(linewise('x\nabc\n'));
  });

  it('uppercase with nothing stored behaves like a plain write', () => {
    const out = writeRegister(base, 'A', 'abc', false, 'yank');
    expect(out.registers['a']).toEqual(charwise('abc'));
  });

  it('explicit unnamed register name acts like no name', () => {
    const out = writeRegister(base, '"', 'hi', false, 'yank');
    expect(out.registers['0']).toEqual(charwise('hi'));
  });

  it('is immutable', () => {
    writeRegister(base, null, 'hi', false, 'yank');
    expect(base.registers).toEqual({});
  });
});

describe('pushUndo', () => {
  it('snapshots lines and cursor and clears redo', () => {
    const start = { ...state(['a'], 0, 0), redoStack: [{ lines: ['b'], cursor: { line: 0, col: 0 }, seq: 5 }] };
    const out = pushUndo(start);
    expect(out.undoStack).toEqual([{ lines: ['a'], cursor: { line: 0, col: 0 }, seq: 0 }]);
    expect(out.redoStack).toEqual([]);
  });
});

describe('x and X', () => {
  it('x deletes the character under the cursor into "-', () => {
    const out = simple('x', state(['abc'], 0, 1));
    expect(out.state.lines).toEqual(['ac']);
    expect(cursorOf(out)).toEqual([0, 1]);
    expect(out.state.registers['-']).toEqual(charwise('b'));
  });

  it('3x stops at the end of the line and clamps the cursor', () => {
    const out = simple('x', state(['abc'], 0, 1), 3);
    expect(out.state.lines).toEqual(['a']);
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.registers['-']).toEqual(charwise('bc'));
  });

  it('x at the last column moves the cursor left', () => {
    const out = simple('x', state(['abc'], 0, 2));
    expect(out.state.lines).toEqual(['ab']);
    expect(cursorOf(out)).toEqual([0, 1]);
  });

  it('x on an empty line does nothing', () => {
    const start = state(['', 'b']);
    const out = simple('x', start);
    expect(out.state).toBe(start);
    expect(out.error).toBeNull();
  });

  it('x with a named register', () => {
    const out = simple('x', state(['ab']), 1, 'a');
    expect(out.state.registers['a']).toEqual(charwise('a'));
    expect(out.state.registers['-']).toBeUndefined();
  });

  it('X deletes before the cursor', () => {
    const out = simple('X', state(['abc'], 0, 1));
    expect(out.state.lines).toEqual(['bc']);
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.registers['-']).toEqual(charwise('a'));
  });

  it('2X stops at the start of the line', () => {
    const out = simple('X', state(['abc'], 0, 2), 5);
    expect(out.state.lines).toEqual(['c']);
    expect(out.state.registers['-']).toEqual(charwise('ab'));
  });

  it('X at column 0 does nothing', () => {
    const start = state(['abc']);
    expect(simple('X', start).state).toBe(start);
  });
});

describe('r', () => {
  it('replaces one character, cursor stays', () => {
    const out = simple('r', state(['abc'], 0, 1), 1, null, 'x');
    expect(out.state.lines).toEqual(['axc']);
    expect(cursorOf(out)).toEqual([0, 1]);
    expect(out.state.modified).toBe(true);
    expect(out.state.undoStack).toHaveLength(1);
  });

  it('2rx replaces two characters, cursor on the last', () => {
    const out = simple('r', state(['abcd'], 0, 1), 2, null, 'x');
    expect(out.state.lines).toEqual(['axxd']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('fails when the count exceeds the rest of the line', () => {
    const start = state(['abc'], 0, 1);
    const out = simple('r', start, 3, null, 'x');
    expect(out.error).not.toBeNull();
    expect(out.state).toBe(start);
  });

  it('fails on an empty line', () => {
    expect(simple('r', state(['']), 1, null, 'x').error).not.toBeNull();
  });

  it('r<CR> splits the line, cursor at the start of the new line', () => {
    const out = simple('r', state(['abc'], 0, 1), 1, null, '<CR>');
    expect(out.state.lines).toEqual(['a', 'c']);
    expect(cursorOf(out)).toEqual([1, 0]);
  });

  it('2r<CR> replaces two characters with one break', () => {
    const out = simple('r', state(['abcd']), 2, null, '<CR>');
    expect(out.state.lines).toEqual(['', 'cd']);
  });

  it('r<Esc> cancels', () => {
    const start = state(['abc']);
    expect(simple('r', start, 1, null, '<Esc>').state).toBe(start);
  });

  it('r<Space> writes a space', () => {
    expect(simple('r', state(['abc']), 1, null, '<Space>').state.lines).toEqual([' bc']);
  });
});

describe('p and P', () => {
  const word = { '"': charwise('abc'), '0': charwise('abc') };

  it('p pastes charwise after the cursor, cursor on the last pasted character', () => {
    const out = simple('p', state(['abc def'], 0, 0, word));
    expect(out.state.lines).toEqual(['aabcbc def']);
    expect(cursorOf(out)).toEqual([0, 3]);
    expect(out.state.modified).toBe(true);
    expect(out.state.undoStack).toHaveLength(1);
  });

  it('P pastes charwise before the cursor', () => {
    const out = simple('P', state(['abc def'], 0, 4, word));
    expect(out.state.lines).toEqual(['abc abcdef']);
    expect(cursorOf(out)).toEqual([0, 6]);
  });

  it('3p repeats the text', () => {
    const out = simple('p', state(['abc def'], 0, 0, word), 3);
    expect(out.state.lines).toEqual(['aabcabcabcbc def']);
    expect(cursorOf(out)).toEqual([0, 9]);
  });

  it('3P repeats the text', () => {
    const out = simple('P', state(['abc def'], 0, 0, word), 3);
    expect(out.state.lines).toEqual(['abcabcabcabc def']);
    expect(cursorOf(out)).toEqual([0, 8]);
  });

  it('p on an empty line inserts at column 0', () => {
    const out = simple('p', state([''], 0, 0, { '"': charwise('x') }));
    expect(out.state.lines).toEqual(['x']);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('p pastes linewise below, cursor on first non-blank', () => {
    const out = simple('p', state(['ab', 'cd'], 0, 1, { '"': linewise('  x\n') }));
    expect(out.state.lines).toEqual(['ab', '  x', 'cd']);
    expect(cursorOf(out)).toEqual([1, 2]);
  });

  it('P pastes linewise above', () => {
    const out = simple('P', state(['ab', 'cd'], 1, 0, { '"': linewise('x\n') }));
    expect(out.state.lines).toEqual(['ab', 'x', 'cd']);
    expect(cursorOf(out)).toEqual([1, 0]);
  });

  it('3p repeats linewise text', () => {
    const out = simple('p', state(['a', 'b'], 0, 0, { '"': linewise('a\n') }), 3);
    expect(out.state.lines).toEqual(['a', 'a', 'a', 'a', 'b']);
    expect(cursorOf(out)).toEqual([1, 0]);
  });

  it('multi-line charwise p splits the line, cursor at the start of the pasted text', () => {
    const out = simple('p', state(['abc', 'def'], 0, 1, { '"': charwise('bc\nde') }));
    expect(out.state.lines).toEqual(['abbc', 'dec', 'def']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('multi-line charwise P', () => {
    const out = simple('P', state(['abc', 'def'], 0, 1, { '"': charwise('bc\nde') }));
    expect(out.state.lines).toEqual(['abc', 'debc', 'def']);
    expect(cursorOf(out)).toEqual([0, 1]);
  });

  it('reads a named register', () => {
    const out = simple('p', state(['x'], 0, 0, { a: charwise('A') }), 1, 'a');
    expect(out.state.lines).toEqual(['xA']);
  });

  it('reads the lowercase register for an uppercase name', () => {
    const out = simple('p', state(['x'], 0, 0, { a: charwise('A') }), 1, 'A');
    expect(out.state.lines).toEqual(['xA']);
  });

  it('fails on an empty register', () => {
    const start = state(['x']);
    const out = simple('p', start, 1, 'a');
    expect(out.error).not.toBeNull();
    expect(out.state).toBe(start);
  });

  it('fails on the black hole register', () => {
    expect(simple('p', state(['x'], 0, 0, { '"': charwise('a') }), 1, '_').error).not.toBeNull();
  });

  it('xp swaps two characters', () => {
    const afterX = simple('x', state(['abc'], 0, 1)).state;
    const out = simple('p', afterX);
    expect(out.state.lines).toEqual(['acb']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });
});

describe('D, C, Y', () => {
  it('D deletes to the end of the line', () => {
    const out = simple('D', state(['abc'], 0, 1));
    expect(out.state.lines).toEqual(['a']);
    expect(cursorOf(out)).toEqual([0, 0]);
    expect(out.state.registers['-']).toEqual(charwise('bc'));
  });

  it('D on an empty line does nothing', () => {
    const start = state(['', 'a']);
    expect(simple('D', start).state).toBe(start);
  });

  it('2D deletes to the end of the next line and joins', () => {
    const out = simple('D', state(['abc', '  def', 'ghi'], 0, 2), 2);
    expect(out.state.lines).toEqual(['ab', 'ghi']);
    expect(cursorOf(out)).toEqual([0, 1]);
    expect(out.state.registers['1']).toEqual(charwise('c\n  def'));
  });

  it('2D fails on the last line', () => {
    const start = state(['abc']);
    const out = simple('D', start, 2);
    expect(out.error).not.toBeNull();
    expect(out.state).toBe(start);
  });

  it('C deletes to the end of the line and enters insert at the end', () => {
    const out = simple('C', state(['abc def'], 0, 4));
    expect(out.state.lines).toEqual(['abc ']);
    expect(out.state.mode).toBe('insert');
    expect(cursorOf(out)).toEqual([0, 4]);
    expect(out.state.registers['-']).toEqual(charwise('def'));
  });

  it('C on an empty line only enters insert', () => {
    const out = simple('C', state(['']));
    expect(out.state.mode).toBe('insert');
    expect(out.state.lines).toEqual(['']);
  });

  it('Y yanks the line linewise without moving the cursor', () => {
    const out = simple('Y', state(['abc', 'def'], 0, 2));
    expect(out.state.registers['0']).toEqual(linewise('abc\n'));
    expect(cursorOf(out)).toEqual([0, 2]);
    expect(out.state.modified).toBe(false);
  });

  it('2Y yanks two lines', () => {
    const out = simple('Y', state(['a', 'b', 'c']), 2);
    expect(out.state.registers['0']).toEqual(linewise('a\nb\n'));
  });

  it('Y with a too-large count clamps when not on the last line', () => {
    const out = simple('Y', state(['a', 'b']), 5);
    expect(out.state.registers['0']).toEqual(linewise('a\nb\n'));
  });

  it('Y fails with a count on the last line', () => {
    expect(simple('Y', state(['a', 'b'], 1, 0), 2).error).not.toBeNull();
  });
});

describe('J', () => {
  it('joins with one space and drops leading whitespace', () => {
    const out = simple('J', state(['abc', '  def']));
    expect(out.state.lines).toEqual(['abc def']);
    expect(cursorOf(out)).toEqual([0, 3]);
    expect(out.state.modified).toBe(true);
    expect(out.state.undoStack).toHaveLength(1);
  });

  it('adds no space before a closing parenthesis', () => {
    expect(simple('J', state(['a', ')b'])).state.lines).toEqual(['a)b']);
  });

  it('adds no extra space after trailing whitespace', () => {
    const out = simple('J', state(['a ', 'b']));
    expect(out.state.lines).toEqual(['a b']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('adds no space when the next line is empty', () => {
    const out = simple('J', state(['a', '', 'b']));
    expect(out.state.lines).toEqual(['a', 'b']);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('adds no space when the current line is empty', () => {
    expect(simple('J', state(['', 'b'])).state.lines).toEqual(['b']);
  });

  it('3J joins three lines, cursor at the last join', () => {
    const out = simple('J', state(['a', '  b', 'c']), 3);
    expect(out.state.lines).toEqual(['a b c']);
    expect(cursorOf(out)).toEqual([0, 3]);
  });

  it('a too-large count joins what is left', () => {
    expect(simple('J', state(['a', 'b']), 5).state.lines).toEqual(['a b']);
  });

  it('fails on the last line', () => {
    const start = state(['a']);
    const out = simple('J', start);
    expect(out.error).not.toBeNull();
    expect(out.state).toBe(start);
  });

  it('joins only the lines below the cursor line', () => {
    expect(simple('J', state(['x', 'a', 'b', 'c'], 1, 0)).state.lines).toEqual(['x', 'a b', 'c']);
  });
});

describe('u and <C-r>', () => {
  it('undo restores lines and cursor and fills redo', () => {
    const changed = simple('x', state(['abc'], 0, 1)).state;
    const out = simple('u', changed);
    expect(out.state.lines).toEqual(['abc']);
    expect(cursorOf(out)).toEqual([0, 1]);
    expect(out.state.undoStack).toEqual([]);
    expect(out.state.redoStack).toHaveLength(1);
    expect(out.state.modified).toBe(false);
    expect(out.error).toBeNull();
  });

  it('redo reapplies the change', () => {
    const changed = simple('x', state(['abc'], 0, 1)).state;
    const undone = simple('u', changed).state;
    const out = simple('<C-r>', undone);
    expect(out.state.lines).toEqual(['ac']);
    expect(cursorOf(out)).toEqual([0, 1]);
    expect(out.state.redoStack).toEqual([]);
    expect(out.state.undoStack).toHaveLength(1);
    expect(out.state.modified).toBe(true);
  });

  it('reports nothing-to-undo with Vim message at the oldest change', () => {
    const out = simple('u', state(['abc']));
    expect(out.error).toEqual({ code: 'nothing-to-undo', message: 'Already at oldest change' });
  });

  it('reports nothing-to-undo with Vim message at the newest change', () => {
    const out = simple('<C-r>', state(['abc']));
    expect(out.error).toEqual({ code: 'nothing-to-undo', message: 'Already at newest change' });
  });

  it('undoes several steps in order', () => {
    let current = state(['abc'], 0, 0);
    current = simple('x', current).state;
    current = simple('x', current).state;
    expect(current.lines).toEqual(['c']);
    current = simple('u', current).state;
    expect(current.lines).toEqual(['bc']);
    current = simple('u', current).state;
    expect(current.lines).toEqual(['abc']);
    expect(simple('u', current).error?.code).toBe('nothing-to-undo');
  });

  it('3u undoes up to three changes and stops at the oldest', () => {
    let current = state(['abcd'], 0, 0);
    current = simple('x', current).state;
    current = simple('x', current).state;
    const out = simple('u', current, 3);
    expect(out.state.lines).toEqual(['abcd']);
    expect(out.error).toBeNull();
  });

  it('a new change clears the redo stack', () => {
    let current = simple('x', state(['abc'])).state;
    current = simple('u', current).state;
    current = simple('x', current).state;
    expect(current.redoStack).toEqual([]);
    expect(simple('<C-r>', current).error?.code).toBe('nothing-to-undo');
  });

  it('undoes a linewise delete', () => {
    const deleted = operators.d(state(['a', 'b', 'c'], 1, 0), lineRange(1, 1), null).state;
    expect(deleted.lines).toEqual(['a', 'c']);
    expect(simple('u', deleted).state.lines).toEqual(['a', 'b', 'c']);
  });

  it('undo after a paste', () => {
    const pasted = simple('p', state(['a'], 0, 0, { '"': linewise('b\n') })).state;
    expect(simple('u', pasted).state.lines).toEqual(['a']);
  });

  it('undo returns to normal mode', () => {
    const changed = { ...simple('x', state(['abc'])).state, mode: 'insert' as const };
    expect(simple('u', changed).state.mode).toBe('normal');
  });
});

describe('review regressions', () => {
  it('vd on an empty non-final line deletes its line break and registers it', () => {
    const out = operators.d(state(['a', '', 'b'], 1, 0), charRange(1, 0, 1, 0, true), null);
    expect(out.state.lines).toEqual(['a', 'b']);
    expect(out.state.registers['1']).toEqual(charwise('\n'));
    expect(cursorOf(out)).toEqual([1, 0]);
  });

  it('vy on an empty non-final line yanks the line break', () => {
    const out = operators.y(state(['a', '', 'b'], 1, 0), charRange(1, 0, 1, 0, true), null);
    expect(out.state.registers['0']).toEqual(charwise('\n'));
    expect(out.state.lines).toEqual(['a', '', 'b']);
  });

  it('d/target style range promoted to linewise by engine.ts deletes whole lines', () => {
    const out = operators.d(state(['abc', 'target'], 0, 0), lineRange(0, 0), null);
    expect(out.state.lines).toEqual(['target']);
  });

  it('multi-line charwise paste after the last character keeps the cursor on the line', () => {
    const out = simple('p', state(['abc'], 0, 2, { '"': charwise('\nx') }));
    expect(out.state.lines).toEqual(['abc', 'x']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });

  it('edit, save, undo keeps modified true', () => {
    const edited = simple('x', state(['abc'])).state;
    expect(edited.modified).toBe(true);
    const saved = { ...edited, savedSeq: edited.changeSeq, modified: false, saved: true };
    const undone = simple('u', saved).state;
    expect(undone.changeSeq).toBe(0);
    expect(undone.modified).toBe(true);
    const redone = simple('<C-r>', undone).state;
    expect(redone.changeSeq).toBe(saved.changeSeq);
    expect(redone.modified).toBe(false);
  });

  it('undoing back to the saved revision is not modified', () => {
    const edited = simple('x', state(['abc'])).state;
    expect(simple('u', edited).state.modified).toBe(false);
  });

  it('a new edit after save and undo is modified even when seq numbers would collide', () => {
    const edited = simple('x', state(['abc'])).state;
    const saved = { ...edited, savedSeq: edited.changeSeq, modified: false };
    const undone = simple('u', saved).state;
    const again = simple('x', undone).state;
    expect(again.changeSeq).not.toBe(again.savedSeq);
    expect(again.modified).toBe(true);
  });

  it('pushUndo increments changeSeq and records the previous seq', () => {
    const out = pushUndo(state(['a']));
    expect(out.changeSeq).toBe(1);
    expect(out.undoStack[0]?.seq).toBe(0);
    expect(out.modified).toBe(true);
  });

  it('a huge undo count stops at the available history', () => {
    let current = state(['abc']);
    current = simple('x', current).state;
    const out = simple('u', current, Number.MAX_SAFE_INTEGER);
    expect(out.state.lines).toEqual(['abc']);
    expect(out.error).toBeNull();
    const redo = simple('<C-r>', out.state, Number.MAX_SAFE_INTEGER);
    expect(redo.state.lines).toEqual(['bc']);
  });

  it('x deletes a whole surrogate pair', () => {
    const out = simple('x', state(['a😀b'], 0, 1));
    expect(out.state.lines).toEqual(['ab']);
    expect(out.state.registers['-']).toEqual(charwise('😀'));
  });

  it('2x counts characters, not UTF-16 units', () => {
    expect(simple('x', state(['😀😀😀']), 2).state.lines).toEqual(['😀']);
  });

  it('x on a final emoji leaves the cursor on it start', () => {
    const out = simple('x', state(['a😀'], 0, 1));
    expect(out.state.lines).toEqual(['a']);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('X deletes the whole character before the cursor', () => {
    const out = simple('X', state(['😀b'], 0, 2));
    expect(out.state.lines).toEqual(['b']);
    expect(out.state.registers['-']).toEqual(charwise('😀'));
  });

  it('r replaces a whole emoji and counts characters', () => {
    expect(simple('r', state(['😀b']), 1, null, 'x').state.lines).toEqual(['xb']);
    expect(simple('r', state(['😀b']), 2, null, 'x').state.lines).toEqual(['xx']);
    expect(simple('r', state(['😀b']), 3, null, 'x').error).not.toBeNull();
  });

  it('r with an emoji argument keeps the cursor on the emoji start', () => {
    const out = simple('r', state(['abc']), 1, null, '😀');
    expect(out.state.lines).toEqual(['😀bc']);
    expect(cursorOf(out)).toEqual([0, 0]);
  });

  it('p after an emoji does not split it', () => {
    const out = simple('p', state(['😀'], 0, 0, { '"': charwise('x') }));
    expect(out.state.lines).toEqual(['😀x']);
    expect(cursorOf(out)).toEqual([0, 2]);
  });
});

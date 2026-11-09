import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state.js';
import type { EngineState, Mode } from '../types.js';
import { findPattern, motions, setMark } from './index.js';

interface RunOptions {
  readonly count?: number;
  readonly hasCount?: boolean;
  readonly arg?: string | null;
  readonly mode?: Mode;
  readonly patch?: Partial<EngineState>;
}

function stateFor(lines: string[], line: number, col: number, options: RunOptions = {}): EngineState {
  return { ...createInitialState(lines, { line, col }), mode: options.mode ?? 'normal', ...options.patch };
}

/** Runs a motion and returns "line,col" or null. */
function land(id: string, lines: string[], at: [number, number], options: RunOptions = {}): string | null {
  const spec = motions[id];
  if (spec === undefined) throw new Error(`no motion ${id}`);
  const count = options.count ?? 1;
  const result = spec.fn(stateFor(lines, at[0], at[1], options), count, options.hasCount ?? options.count !== undefined, options.arg ?? null);
  return result === null ? null : `${result.target.line},${result.target.col}`;
}

function run(id: string, lines: string[], at: [number, number], options: RunOptions = {}) {
  const spec = motions[id];
  if (spec === undefined) throw new Error(`no motion ${id}`);
  return spec.fn(stateFor(lines, at[0], at[1], options), options.count ?? 1, options.hasCount ?? options.count !== undefined, options.arg ?? null);
}

describe('registry', () => {
  it('exposes every required motion id', () => {
    const ids = ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G', 'f', 'F', 't', 'T', ';', ',', '%', '{', '}', 'n', 'N', '*', '#', "'", '`'];
    for (const id of ids) expect(motions[id]?.id).toBe(id);
  });

  it('marks only f F t T quote and backtick as needing an argument', () => {
    const withArg = Object.values(motions).filter((spec) => spec.needsArg).map((spec) => spec.id).sort();
    expect(withArg).toEqual(["'", '`', 'F', 'T', 'f', 't'].sort());
  });
});

describe('h l', () => {
  it('h moves left', () => expect(land('h', ['abc'], [0, 2])).toBe('0,1'));
  it('h stops at column 0 without wrapping', () => expect(land('h', ['abc', 'def'], [1, 0])).toBeNull());
  it('3h clamps at the line start', () => expect(land('h', ['abcdef'], [0, 2], { count: 5 })).toBe('0,0'));
  it('l moves right', () => expect(land('l', ['abc'], [0, 0])).toBe('0,1'));
  it('l fails on the last character in normal mode', () => expect(land('l', ['abc'], [0, 2])).toBeNull());
  it('l does not wrap to the next line', () => expect(land('l', ['abc', 'def'], [0, 2])).toBeNull());
  it('5l clamps at the last character', () => expect(land('l', ['abcd'], [0, 1], { count: 9 })).toBe('0,3'));
  it('l on an empty line fails', () => expect(land('l', [''], [0, 0])).toBeNull());
  it('l may reach end-of-line when an operator is pending', () => expect(land('l', ['abc'], [0, 2], { mode: 'operator-pending' })).toBe('0,3'));
  it('h and l are exclusive and charwise', () => {
    expect(run('l', ['abc'], [0, 0])).toMatchObject({ linewise: false, inclusive: false });
  });
});

describe('j k', () => {
  const lines = ['abcdefgh', 'ab', 'abcdefgh'];
  it('j moves down keeping the column', () => expect(land('j', ['abc', 'def'], [0, 1])).toBe('1,1'));
  it('j clamps to a shorter line', () => expect(land('j', lines, [0, 5])).toBe('1,1'));
  it('j restores the column from desiredCol', () => expect(land('j', lines, [1, 1], { patch: { desiredCol: 5 } })).toBe('2,5'));
  it('j with MAX desiredCol lands on the last character', () => {
    expect(land('j', lines, [0, 7], { patch: { desiredCol: Number.MAX_SAFE_INTEGER } })).toBe('1,1');
    expect(land('j', lines, [1, 1], { patch: { desiredCol: Number.MAX_SAFE_INTEGER } })).toBe('2,7');
  });
  it('j keeps desiredCol in the patch', () => expect(run('j', lines, [0, 5], { patch: { desiredCol: 5 } })?.statePatch?.desiredCol).toBe(5));
  it('j fails on the last line', () => expect(land('j', lines, [2, 0])).toBeNull());
  it('3j goes three lines down', () => expect(land('j', ['a', 'b', 'c', 'd'], [0, 0], { count: 3 })).toBe('3,0'));
  it('count larger than the buffer clamps to the last line', () => expect(land('j', ['a', 'b', 'c'], [0, 0], { count: 50 })).toBe('2,0'));
  it('j is linewise', () => expect(run('j', lines, [0, 0])).toMatchObject({ linewise: true, inclusive: false }));
  it('j onto an empty line gives column 0', () => expect(land('j', ['abc', ''], [0, 2])).toBe('1,0'));
  it('k moves up', () => expect(land('k', ['abc', 'def'], [1, 2])).toBe('0,2'));
  it('k fails on the first line', () => expect(land('k', ['abc'], [0, 1])).toBeNull());
  it('k clamps and restores via desiredCol', () => expect(land('k', lines, [2, 5], { patch: { desiredCol: 5 } })).toBe('1,1'));
  it('4k clamps to the first line', () => expect(land('k', ['a', 'b', 'c'], [2, 0], { count: 4 })).toBe('0,0'));
});

describe('0 ^ $', () => {
  it('0 goes to column 0', () => expect(land('0', ['  abc'], [0, 4])).toBe('0,0'));
  it('^ goes to the first non-blank', () => expect(land('^', ['  \tabc'], [0, 5])).toBe('0,3'));
  it('^ on a blank line goes to the last character', () => expect(land('^', ['   '], [0, 0])).toBe('0,2'));
  it('^ on an empty line stays at 0', () => expect(land('^', [''], [0, 0])).toBe('0,0'));
  it('$ goes to the last character and is inclusive', () => {
    expect(land('$', ['abc'], [0, 0])).toBe('0,2');
    expect(run('$', ['abc'], [0, 0])).toMatchObject({ inclusive: true, linewise: false });
  });
  it('$ sets desiredCol to end of line', () => expect(run('$', ['abc'], [0, 0])?.statePatch?.desiredCol).toBe(Number.MAX_SAFE_INTEGER));
  it('$ on an empty line stays at 0', () => expect(land('$', [''], [0, 0])).toBe('0,0'));
  it('2$ goes to the end of the next line', () => expect(land('$', ['ab', 'cdef'], [0, 0], { count: 2 })).toBe('1,3'));
  it('count past the last line clamps to the last line', () => expect(land('$', ['ab', 'cd'], [0, 0], { count: 3 })).toBe('1,1'));
  it('counted $ on the last line fails', () => expect(land('$', ['ab', 'cd'], [1, 0], { count: 2 })).toBeNull());
  it('0 sets desiredCol to 0', () => expect(run('0', ['abc'], [0, 2])?.statePatch?.desiredCol).toBe(0));
});

describe('gg G', () => {
  const lines = ['  one', 'two', '   three', 'four'];
  it('gg goes to the first line first non-blank', () => expect(land('gg', lines, [3, 2])).toBe('0,2'));
  it('G goes to the last line', () => expect(land('G', lines, [0, 0])).toBe('3,0'));
  it('3G goes to line 3', () => expect(land('G', lines, [0, 0], { count: 3 })).toBe('2,3'));
  it('3gg goes to line 3', () => expect(land('gg', lines, [0, 0], { count: 3 })).toBe('2,3'));
  it('count beyond the buffer clamps to the last line', () => expect(land('G', lines, [0, 0], { count: 99 })).toBe('3,0'));
  it('gg with count beyond the buffer clamps', () => expect(land('gg', lines, [0, 0], { count: 99 })).toBe('3,0'));
  it('G and gg are linewise', () => {
    expect(run('G', lines, [0, 0])).toMatchObject({ linewise: true });
    expect(run('gg', lines, [2, 0])).toMatchObject({ linewise: true });
  });
  it('G without count ignores count value', () => expect(land('G', lines, [0, 0], { count: 1, hasCount: false })).toBe('3,0'));
  it('gg on a single line buffer stays', () => expect(land('gg', ['  x'], [0, 2])).toBe('0,2'));
});

describe('w', () => {
  it('moves to the next word', () => expect(land('w', ['foo bar'], [0, 0])).toBe('0,4'));
  it('treats punctuation runs as separate words', () => expect(land('w', ['foo.bar'], [0, 0])).toBe('0,3'));
  it('a punctuation run is one word', () => expect(land('w', ['a ... b'], [0, 2])).toBe('0,6'));
  it('crosses to the next line', () => expect(land('w', ['foo', 'bar'], [0, 0])).toBe('1,0'));
  it('skips leading blanks on the next line', () => expect(land('w', ['foo', '  bar'], [0, 0])).toBe('1,2'));
  it('stops on an empty line', () => expect(land('w', ['foo', '', 'bar'], [0, 0])).toBe('1,0'));
  it('moves off an empty line', () => expect(land('w', ['', 'bar'], [0, 0])).toBe('1,0'));
  it('counts words', () => expect(land('w', ['a b c d'], [0, 0], { count: 3 })).toBe('0,6'));
  it('underscore and digits are keyword characters', () => expect(land('w', ['foo_1 bar'], [0, 0])).toBe('0,6'));
  it('from the last word of the buffer it moves to the last character', () => expect(land('w', ['foo bar'], [0, 4])).toBe('0,6'));
  it('fails on the last character of the buffer', () => expect(land('w', ['foo bar'], [0, 6])).toBeNull());
  it('a huge count ends on the last character', () => expect(land('w', ['a b', 'c d'], [0, 0], { count: 99 })).toBe('1,2'));
  it('with an operator on the last word it reaches end of line', () => {
    expect(land('w', ['foo bar'], [0, 4], { mode: 'operator-pending' })).toBe('0,7');
  });
  it('with an operator, stops at end of line instead of the next line', () => {
    expect(land('w', ['foo bar', 'baz'], [0, 4], { mode: 'operator-pending' })).toBe('0,7');
  });
  it('with an operator, d2w style counts only stop at the end for the last word', () => {
    expect(land('w', ['a b', 'c d'], [0, 2], { count: 2, mode: 'operator-pending' })).toBe('1,2');
  });
  it('is exclusive', () => expect(run('w', ['foo bar'], [0, 0])).toMatchObject({ inclusive: false, linewise: false }));
});

describe('b', () => {
  it('goes to the start of the current word', () => expect(land('b', ['foo bar'], [0, 6])).toBe('0,4'));
  it('goes to the previous word from a word start', () => expect(land('b', ['foo bar'], [0, 4])).toBe('0,0'));
  it('crosses lines', () => expect(land('b', ['foo', 'bar'], [1, 0])).toBe('0,0'));
  it('stops on an empty line', () => expect(land('b', ['foo', '', 'bar'], [2, 0])).toBe('1,0'));
  it('handles punctuation', () => expect(land('b', ['foo.bar'], [0, 4])).toBe('0,3'));
  it('counts words', () => expect(land('b', ['a b c d'], [0, 6], { count: 3 })).toBe('0,0'));
  it('count larger than possible goes to the buffer start', () => expect(land('b', ['a b c'], [0, 4], { count: 99 })).toBe('0,0'));
  it('fails at the buffer start', () => expect(land('b', ['foo'], [0, 0])).toBeNull());
  it('skips trailing blanks of the previous line', () => expect(land('b', ['foo  ', 'bar'], [1, 0])).toBe('0,0'));
});

describe('e', () => {
  it('goes to the end of the word', () => expect(land('e', ['foo bar'], [0, 0])).toBe('0,2'));
  it('from a word end goes to the next word end', () => expect(land('e', ['foo bar'], [0, 2])).toBe('0,6'));
  it('crosses lines', () => expect(land('e', ['foo', 'bar'], [0, 2])).toBe('1,2'));
  it('skips empty lines', () => expect(land('e', ['foo', '', 'bar'], [0, 2])).toBe('2,2'));
  it('stops at punctuation', () => expect(land('e', ['foo.bar'], [0, 0])).toBe('0,2'));
  it('counts words', () => expect(land('e', ['a bb ccc'], [0, 0], { count: 3 })).toBe('0,7'));
  it('fails at the end of the buffer', () => expect(land('e', ['foo'], [0, 2])).toBeNull());
  it('stays valid for an operator on the final character (de)', () => {
    expect(land('e', ['foo'], [0, 2], { mode: 'operator-pending' })).toBe('0,2');
    expect(run('e', ['foo'], [0, 2], { mode: 'operator-pending' })).toMatchObject({ inclusive: true });
  });
  it('a huge count ends on the last character', () => expect(land('e', ['a b c'], [0, 0], { count: 99 })).toBe('0,4'));
  it('is inclusive', () => expect(run('e', ['foo bar'], [0, 0])).toMatchObject({ inclusive: true }));
});

describe('W B E', () => {
  it('W treats punctuation as part of the WORD', () => expect(land('W', ['foo.bar baz'], [0, 0])).toBe('0,8'));
  it('W crosses lines', () => expect(land('W', ['a.b', 'c'], [0, 0])).toBe('1,0'));
  it('W stops on empty lines', () => expect(land('W', ['a.b', '', 'c'], [0, 0])).toBe('1,0'));
  it('B goes back over punctuation', () => expect(land('B', ['foo.bar baz'], [0, 8])).toBe('0,0'));
  it('B from inside a WORD goes to its start', () => expect(land('B', ['x foo.bar'], [0, 7])).toBe('0,2'));
  it('E goes to the end of the WORD', () => expect(land('E', ['foo.bar baz'], [0, 0])).toBe('0,6'));
  it('E is inclusive', () => expect(run('E', ['foo.bar baz'], [0, 0])).toMatchObject({ inclusive: true }));
  it('2W counts WORDs', () => expect(land('W', ['a.b c.d e.f'], [0, 0], { count: 2 })).toBe('0,8'));
});

describe('f F t T ; ,', () => {
  const line = ['a,b,c,d'];
  it('f finds the next char', () => expect(land('f', line, [0, 0], { arg: ',' })).toBe('0,1'));
  it('f is inclusive and records lastFind', () => {
    const result = run('f', line, [0, 0], { arg: ',' });
    expect(result?.inclusive).toBe(true);
    expect(result?.statePatch?.lastFind).toEqual({ command: 'f', char: ',' });
  });
  it('2f finds the second match', () => expect(land('f', line, [0, 0], { arg: ',', count: 2 })).toBe('0,3'));
  it('f fails when the count is too large', () => expect(land('f', line, [0, 0], { arg: ',', count: 5 })).toBeNull());
  it('f fails when the char is missing', () => expect(land('f', line, [0, 0], { arg: 'z' })).toBeNull());
  it('f does not match the current character', () => expect(land('f', line, [0, 1], { arg: ',' })).toBe('0,3'));
  it('f does not cross lines', () => expect(land('f', ['abc', 'xyz'], [0, 0], { arg: 'x' })).toBeNull());
  it('F and T are exclusive, f and t inclusive', () => {
    expect(run('F', line, [0, 6], { arg: ',' })).toMatchObject({ inclusive: false });
    expect(run('T', line, [0, 6], { arg: ',' })).toMatchObject({ inclusive: false });
    expect(run('f', line, [0, 0], { arg: ',' })).toMatchObject({ inclusive: true });
  });
  it('a backward repeat is exclusive', () => {
    const patch = { lastFind: { command: 'f', char: ',' } as const };
    expect(run(',', line, [0, 5], { patch })).toMatchObject({ inclusive: false });
  });
  it('F searches backward', () => expect(land('F', line, [0, 6], { arg: ',' })).toBe('0,5'));
  it('2F finds the second match backward', () => expect(land('F', line, [0, 6], { arg: ',', count: 2 })).toBe('0,3'));
  it('t lands one column before the match', () => expect(land('t', ['abc,d'], [0, 0], { arg: ',' })).toBe('0,2'));
  it('t is inclusive', () => expect(run('t', ['abc,d'], [0, 0], { arg: ',' })).toMatchObject({ inclusive: true }));
  it('t with the match right next to the cursor does not move far', () => expect(land('t', ['a,b'], [0, 0], { arg: ',' })).toBe('0,0'));
  it('T lands one column after the match', () => expect(land('T', ['a,bcd'], [0, 4], { arg: ',' })).toBe('0,2'));
  it('missing argument fails', () => expect(land('f', line, [0, 0])).toBeNull());
  it('; repeats f', () => {
    const patch = { lastFind: { command: 'f', char: ',' } as const };
    expect(land(';', line, [0, 1], { patch })).toBe('0,3');
  });
  it('; with a count repeats further', () => {
    const patch = { lastFind: { command: 'f', char: ',' } as const };
    expect(land(';', line, [0, 1], { patch, count: 2 })).toBe('0,5');
  });
  it('; after t skips the adjacent match', () => {
    const patch = { lastFind: { command: 't', char: ',' } as const };
    expect(land(';', ['a,b,c,d'], [0, 2], { patch })).toBe('0,4');
  });
  it('; after t from before a match jumps to the next one', () => {
    const patch = { lastFind: { command: 't', char: ',' } as const };
    expect(land(';', ['abc,d,e'], [0, 0], { patch })).toBe('0,2');
  });
  it(', reverses f', () => {
    const patch = { lastFind: { command: 'f', char: ',' } as const };
    expect(land(',', line, [0, 3], { patch })).toBe('0,1');
  });
  it(', after t reverses to T and skips the adjacent match', () => {
    const patch = { lastFind: { command: 't', char: ',' } as const };
    expect(land(',', ['a,b,c,d'], [0, 4], { patch })).toBe('0,2');
  });
  it('; and , fail without lastFind', () => {
    expect(land(';', line, [0, 0])).toBeNull();
    expect(land(',', line, [0, 0])).toBeNull();
  });
  it('; does not change lastFind', () => {
    const patch = { lastFind: { command: 'f', char: ',' } as const };
    expect(run(';', line, [0, 1], { patch })?.statePatch?.lastFind).toBeUndefined();
  });
});

describe('%', () => {
  it('jumps from ( to )', () => expect(land('%', ['f(a, b)'], [0, 1])).toBe('0,6'));
  it('jumps from ) to (', () => expect(land('%', ['f(a, b)'], [0, 6])).toBe('0,1'));
  it('searches forward for a bracket on the line', () => expect(land('%', ['f(a, b)'], [0, 0])).toBe('0,6'));
  it('handles nesting', () => expect(land('%', ['((a)(b))'], [0, 0])).toBe('0,7'));
  it('matches across lines', () => expect(land('%', ['{', '  x', '}'], [0, 0])).toBe('2,0'));
  it('matches backward across lines with empty lines', () => expect(land('%', ['{', '', '}'], [2, 0])).toBe('0,0'));
  it('supports square brackets', () => expect(land('%', ['a[1]'], [0, 1])).toBe('0,3'));
  it('ignores other bracket kinds', () => expect(land('%', ['(a[)]'], [0, 0])).toBe('0,3'));
  it('fails with no bracket on the line', () => expect(land('%', ['abc'], [0, 0])).toBeNull());
  it('fails when the bracket after the cursor is unmatched', () => expect(land('%', ['(abc'], [0, 0])).toBeNull());
  it('does not look before the cursor', () => expect(land('%', ['(a) b'], [0, 3])).toBeNull());
  it('is inclusive and charwise', () => expect(run('%', ['(a)'], [0, 0])).toMatchObject({ inclusive: true, linewise: false }));
  it('N% goes to a percentage of the file', () => expect(land('%', ['1', '2', '3', '4'], [0, 0], { count: 50 })).toBe('1,0'));
});

describe('% quotes', () => {
  it('ignores a bracket inside a string when starting outside', () => expect(land('%', ['(")")'], [0, 0])).toBe('0,4'));
  it('matches inside the string when starting inside it', () => expect(land('%', ['("(x)")'], [0, 2])).toBe('0,4'));
  it('ignores escaped quotes', () => expect(land('%', ['(\\")")'], [0, 0])).toBe('0,3'));
  it('ignores quotes on lines with an odd number of them', () => expect(land('%', ['(")'], [0, 0])).toBe('0,2'));
});

describe('{ }', () => {
  const text = ['a', 'b', '', 'c', 'd', '', '', 'e'];
  it('} goes to the next empty line', () => expect(land('}', text, [0, 0])).toBe('2,0'));
  it('} from an empty line goes to the following paragraph end', () => expect(land('}', text, [2, 0])).toBe('5,0'));
  it('} skips consecutive empty lines first', () => expect(land('}', text, [5, 0])).toBe('7,0'));
  it('2} jumps two paragraphs', () => expect(land('}', text, [0, 0], { count: 2 })).toBe('5,0'));
  it('} on the final character stays valid for an operator (d})', () => {
    expect(land('}', ['a', 'bcd'], [1, 2], { mode: 'operator-pending' })).toBe('1,2');
    expect(land('}', ['a', 'bcd'], [1, 2])).toBeNull();
  });
  it('} at the last paragraph goes to the last character', () => expect(land('}', text, [7, 0])).toBeNull());
  it('} on the last paragraph lands on the final character', () => expect(land('}', ['a', '', 'bcd'], [2, 0])).toBe('2,2'));
  it('} to the buffer end is inclusive', () => expect(run('}', ['a', '', 'bcd'], [2, 0])).toMatchObject({ inclusive: true }));
  it('} fails when the count exceeds the paragraphs', () => expect(land('}', text, [0, 0], { count: 9 })).toBeNull());
  it('{ goes to the previous empty line', () => expect(land('{', text, [4, 0])).toBe('2,0'));
  it('{ at the first paragraph goes to line 0', () => expect(land('{', text, [1, 0])).toBe('0,0'));
  it('{ fails at the buffer start', () => expect(land('{', text, [0, 0])).toBeNull());
  it('{ and } are exclusive and charwise', () => expect(run('}', text, [0, 0])).toMatchObject({ inclusive: false, linewise: false }));
  it('whitespace-only lines are not boundaries', () => expect(land('}', ['a', '  ', 'b', '', 'c'], [0, 0])).toBe('3,0'));
});

describe('findPattern', () => {
  const lines = ['foo bar', 'bar baz', 'foo'];
  it('finds the next match on the same line', () => expect(findPattern(['a a a'], { line: 0, col: 0 }, 'a', true)).toEqual({ line: 0, col: 2 }));
  it('finds a match on a later line', () => expect(findPattern(lines, { line: 0, col: 0 }, 'baz', true)).toEqual({ line: 1, col: 4 }));
  it('does not match at the cursor itself', () => expect(findPattern(lines, { line: 0, col: 0 }, 'foo', true)).toEqual({ line: 2, col: 0 }));
  it('wraps around the end of the buffer', () => expect(findPattern(lines, { line: 2, col: 0 }, 'bar', true)).toEqual({ line: 0, col: 4 }));
  it('wraps to the cursor itself if it is the only match', () => expect(findPattern(['x foo y'], { line: 0, col: 2 }, 'foo', true)).toEqual({ line: 0, col: 2 }));
  it('returns null when absent', () => expect(findPattern(lines, { line: 0, col: 0 }, 'zzz', true)).toBeNull());
  it('returns null for an empty pattern', () => expect(findPattern(lines, { line: 0, col: 0 }, '', true)).toBeNull());
  it('searches backward on the same line', () => expect(findPattern(['a a a'], { line: 0, col: 4 }, 'a', false)).toEqual({ line: 0, col: 2 }));
  it('searches backward across lines', () => expect(findPattern(lines, { line: 2, col: 0 }, 'bar', false)).toEqual({ line: 1, col: 0 }));
  it('backward wraps to the end of the buffer', () => expect(findPattern(lines, { line: 0, col: 0 }, 'foo', false)).toEqual({ line: 2, col: 0 }));
  it('backward search does not match at the cursor', () => expect(findPattern(['abab'], { line: 0, col: 2 }, 'ab', false)).toEqual({ line: 0, col: 0 }));
  it('is case sensitive', () => expect(findPattern(['Foo foo'], { line: 0, col: 0 }, 'foo', true)).toEqual({ line: 0, col: 4 }));
  it('whole-word pattern ignores substrings', () => expect(findPattern(['foobar foo'], { line: 0, col: 0 }, '\\<foo\\>', true)).toEqual({ line: 0, col: 7 }));
  it('whole-word backward', () => expect(findPattern(['foo foobar foo'], { line: 0, col: 11 }, '\\<foo\\>', false)).toEqual({ line: 0, col: 0 }));
});

describe('search repetition cycles', () => {
  it('a huge count terminates and lands on the right match', () => {
    const lines = ['a a a'];
    const patch = { lastSearch: { pattern: 'a', forward: true } };
    expect(land('n', lines, [0, 0], { patch, count: 1_000_000_001 })).toBe(land('n', lines, [0, 0], { patch, count: 2 }));
  });
  it('a single match cycles back to itself', () => {
    expect(land('n', ['x foo y'], [0, 2], { patch: { lastSearch: { pattern: 'foo', forward: true } }, count: 999_999_999 })).toBe('0,2');
  });
});

describe('n N', () => {
  const lines = ['foo bar foo', 'baz foo'];
  const search = (forward: boolean) => ({ patch: { lastSearch: { pattern: 'foo', forward } } });
  it('n repeats forward', () => expect(land('n', lines, [0, 0], search(true))).toBe('0,8'));
  it('n goes to the next line', () => expect(land('n', lines, [0, 8], search(true))).toBe('1,4'));
  it('n wraps around', () => expect(land('n', lines, [1, 4], search(true))).toBe('0,0'));
  it('N goes the opposite way', () => expect(land('N', lines, [0, 8], search(true))).toBe('0,0'));
  it('n after a backward search goes backward', () => expect(land('n', lines, [0, 8], search(false))).toBe('0,0'));
  it('N after a backward search goes forward', () => expect(land('N', lines, [0, 0], search(false))).toBe('0,8'));
  it('2n repeats twice', () => expect(land('n', lines, [0, 0], { ...search(true), count: 2 })).toBe('1,4'));
  it('fails without a previous search', () => expect(land('n', lines, [0, 0])).toBeNull());
  it('fails when the pattern disappeared', () => expect(land('n', lines, [0, 0], { patch: { lastSearch: { pattern: 'zzz', forward: true } } })).toBeNull());
  it('is exclusive and charwise', () => expect(run('n', lines, [0, 0], search(true))).toMatchObject({ inclusive: false, linewise: false }));
});

describe('* #', () => {
  const lines = ['foo bar foobar', 'foo'];
  it('* jumps to the next whole-word match', () => expect(land('*', lines, [0, 0])).toBe('1,0'));
  it('* wraps around', () => expect(land('*', lines, [1, 0])).toBe('0,0'));
  it('* works from the middle of a word', () => expect(land('*', lines, [0, 1])).toBe('1,0'));
  it('* picks the next keyword when on a blank', () => expect(land('*', ['  foo', 'foo'], [0, 0])).toBe('1,0'));
  it('* sets lastSearch forward', () => expect(run('*', lines, [0, 0])?.statePatch?.lastSearch).toEqual({ pattern: '\\<foo\\>', forward: true }));
  it('# searches backward and sets lastSearch', () => {
    const result = run('#', lines, [1, 0]);
    expect(`${result?.target.line},${result?.target.col}`).toBe('0,0');
    expect(result?.statePatch?.lastSearch).toEqual({ pattern: '\\<foo\\>', forward: false });
  });
  it('# from the middle of a word starts at the word start', () => expect(land('#', ['foo x foo'], [0, 7])).toBe('0,0'));
  it('2* repeats twice', () => expect(land('*', ['a a a b', 'a'], [0, 0], { count: 2 })).toBe('0,4'));
  it('* on punctuation searches the plain run', () => expect(land('*', ['a ;;', ';;'], [0, 2])).toBe('1,0'));
  it('* on a blank line fails', () => expect(land('*', ['', 'x'], [0, 0])).toBeNull());
  it('* with n continues forward', () => {
    const first = run('*', ['a b a b a'], [0, 0]);
    expect(first?.target).toEqual({ line: 0, col: 4 });
    const next = run('n', ['a b a b a'], [0, 4], { patch: { lastSearch: first?.statePatch?.lastSearch ?? null } });
    expect(next?.target).toEqual({ line: 0, col: 8 });
  });
});

describe('marks', () => {
  const lines = ['  one', 'two three', 'four'];
  it('setMark stores the cursor', () => {
    const state = setMark(stateFor(lines, 1, 4), 'a');
    expect(state.marks['a']).toEqual({ line: 1, col: 4 });
  });
  it('setMark does not mutate the input', () => {
    const state = stateFor(lines, 1, 4);
    setMark(state, 'a');
    expect(state.marks).toEqual({});
  });
  it('setMark overwrites an existing mark', () => {
    const first = setMark(stateFor(lines, 1, 4), 'a');
    const second = setMark({ ...first, cursor: { line: 2, col: 1 } }, 'a');
    expect(second.marks['a']).toEqual({ line: 2, col: 1 });
  });
  it('setMark ignores invalid names', () => expect(setMark(stateFor(lines, 0, 0), '1').marks).toEqual({}));
  it("' goes linewise to the first non-blank", () => {
    expect(land("'", lines, [2, 0], { arg: 'a', patch: { marks: { a: { line: 0, col: 4 } } } })).toBe('0,2');
    expect(run("'", lines, [2, 0], { arg: 'a', patch: { marks: { a: { line: 0, col: 4 } } } })).toMatchObject({ linewise: true });
  });
  it('` goes to the exact position, exclusive', () => {
    expect(land('`', lines, [2, 0], { arg: 'a', patch: { marks: { a: { line: 1, col: 5 } } } })).toBe('1,5');
    expect(run('`', lines, [2, 0], { arg: 'a', patch: { marks: { a: { line: 1, col: 5 } } } })).toMatchObject({ linewise: false, inclusive: false });
  });
  it('an unset mark fails', () => {
    expect(land("'", lines, [0, 0], { arg: 'z' })).toBeNull();
    expect(land('`', lines, [0, 0], { arg: 'z' })).toBeNull();
  });
  it('a missing argument fails', () => expect(land("'", lines, [0, 0])).toBeNull());
  it('` clamps a mark beyond the line end', () => {
    expect(land('`', ['abc'], [0, 0], { arg: 'a', patch: { marks: { a: { line: 0, col: 9 } } } })).toBe('0,2');
  });
  it('a mark below the buffer end clamps to the last line', () => {
    expect(land("'", ['abc', 'de'], [0, 0], { arg: 'a', patch: { marks: { a: { line: 7, col: 0 } } } })).toBe('1,0');
  });
});

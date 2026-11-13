import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.js';
import { parseKeys } from './keys.js';
import type { EngineState, TextEdit } from './types.js';

const engine = createEngine();
const edit = (start: number, removed: number, inserted = ''): TextEdit => ({ start, removed, inserted });
function play(state: EngineState, keys: string) {
  const edits: TextEdit[] = [];
  for (const key of parseKeys(keys)) {
    const before = structuredClone(state);
    const result = engine.step(state, key);
    let text = state.lines.join('\n');
    for (const change of result.edits) {
      expect(change.start).toBeGreaterThanOrEqual(0);
      expect(change.start + change.removed).toBeLessThanOrEqual(text.length);
      text = text.slice(0, change.start) + change.inserted + text.slice(change.start + change.removed);
    }
    expect(text, `edit replay for ${keys}, key ${key}`).toBe(result.state.lines.join('\n'));
    expect(state).toEqual(before);
    edits.push(...result.edits);
    state = result.state;
  }
  return { state, edits };
}

const cases = [
  { keys: 'x', col: 2, expected: [edit(2, 1)], repeated: [edit(2, 1)] },
  { keys: 'X', col: 3, expected: [edit(2, 1)], repeated: [edit(1, 1)] },
  { keys: 'dh', col: 3, expected: [edit(2, 1)], repeated: [edit(1, 1)] },
  { keys: 'db', col: 3, expected: [edit(0, 3)], repeated: [] },
  { keys: 'ao<Esc>', col: 2, expected: [edit(3, 0, 'o')], repeated: [edit(4, 0, 'o')] },
  { keys: 'Ao<Esc>', col: 2, expected: [edit(5, 0, 'o')], repeated: [edit(6, 0, 'o')] },
  { keys: 'p', col: 2, expected: [edit(3, 0, 'o')], repeated: [edit(4, 0, 'o')] },
  { keys: 'dd', col: 2, lines: ['ooo', 'ooo'], expected: [edit(0, 4)], repeated: [edit(0, 3)] },
  { keys: 'J', col: 2, lines: ['ooo', 'ooo'], expected: [edit(3, 1, ' ')], repeated: [] },
  { keys: 'r ', col: 2, expected: [edit(2, 1, ' ')], repeated: [] },
  { keys: '3x', col: 1, expected: [edit(1, 3)], repeated: [edit(1, 1)] },
];

describe('exact edits in indistinguishable tiles', () => {
  it.each(cases)('$keys, undo, redo and dot at col $col', ({ keys, col, lines, expected, repeated }) => {
    const initial = { ...engine.init(lines ?? ['ooooo'], { line: 0, col }),
      registers: { '"': { text: 'o', linewise: false } } };
    const changed = play(initial, keys);
    expect(changed.edits).toEqual(expected);
    expect(changed.state.undoStack.at(-1)?.edits).toEqual(expected);
    let text = initial.lines.join('\n');
    const inverse: TextEdit[] = [];
    for (const change of expected) {
      inverse.unshift(edit(change.start, change.inserted.length, text.slice(change.start, change.start + change.removed)));
      text = text.slice(0, change.start) + change.inserted + text.slice(change.start + change.removed);
    }
    const undone = play(changed.state, 'u');
    expect(undone.edits).toEqual(inverse);
    expect(undone.state.lines).toEqual(initial.lines);
    const redone = play(undone.state, '<C-r>');
    expect(redone.edits).toEqual(expected);
    expect(redone.state.lines).toEqual(changed.state.lines);
    // Undo can restore a different cursor than the original change's final cursor.
    expect(play(changed.state, '.').edits).toEqual(repeated);
  });

  it.each([
    { keys: 'dd', line: 1, expected: [edit(3, 4)] },
    { keys: 'o<Esc>', line: 0, expected: [edit(4, 0, '\n')] },
    { keys: 'o<Esc>', line: 1, expected: [edit(7, 0, '\n')] },
    { keys: 'O<Esc>', line: 0, expected: [edit(0, 0, '\n')] },
    { keys: 'O<Esc>', line: 1, expected: [edit(4, 0, '\n')] },
    { keys: 'p', line: 0, expected: [edit(4, 0, 'ooo\n')] },
    { keys: 'p', line: 1, expected: [edit(7, 0, '\nooo')] },
    { keys: 'P', line: 1, expected: [edit(4, 0, 'ooo\n')] },
    { keys: 'cc<Esc>', line: 1, expected: [edit(4, 3)] },
  ])('linewise $keys at row $line, off column zero', ({ keys, line, expected }) => {
    const initial = { ...engine.init(['ooo', 'ooo'], { line, col: 2 }),
      registers: { '"': { text: 'ooo\n', linewise: true } } };
    const result = play(initial, keys);
    expect(result.edits).toEqual(expected);
    const undone = play(result.state, 'u');
    expect(undone.state.lines).toEqual(initial.lines);
    expect(play(undone.state, '<C-r>').edits).toEqual(expected);
  });

  it('records every insert key including backspace and newline joining', () => {
    const result = play(engine.init(['ooooo'], { line: 0, col: 2 }), 'ao<CR>o<BS><BS><Tab><Esc>');
    expect(result.edits).toEqual([edit(3, 0, 'o'), edit(4, 0, '\n'), edit(5, 0, 'o'),
      edit(5, 1), edit(4, 1), edit(4, 0, '\t')]);
    expect(result.state.undoStack.at(-1)?.edits).toEqual(result.edits);
    expect(play(result.state, 'u').state.lines).toEqual(['ooooo']);
  });
  it.each([
    { keys: 'r😀', expected: [edit(2, 1, '😀')], lines: ['oo😀oo'], cursor: { line: 0, col: 2 } },
    { keys: '2r😀', expected: [edit(2, 2, '😀😀')], lines: ['oo😀😀o'], cursor: { line: 0, col: 4 } },
    { keys: '2r<CR>', expected: [edit(2, 2, '\n')], lines: ['oo', 'o'], cursor: { line: 1, col: 0 } },
    { keys: 'r ', expected: [edit(2, 2, ' ')], lines: ['oo oo'], cursor: { line: 0, col: 2 }, initial: ['oo😀oo'] },
  ])('records unequal UTF-16 replacement lengths for $keys', ({ keys, expected, lines, cursor, initial }) => {
    const start = engine.init(initial ?? ['ooooo'], { line: 0, col: 2 });
    const changed = play(start, keys);
    expect(changed.edits).toEqual(expected);
    expect(changed.state.lines).toEqual(lines);
    expect(changed.state.cursor).toEqual(cursor);
    const undone = play(changed.state, 'u');
    expect(undone.state.lines).toEqual(start.lines);
    expect(undone.edits).toEqual([edit(2, expected[0]!.inserted.length,
      start.lines.join('\n').slice(2, 2 + expected[0]!.removed))]);
    expect(play(undone.state, '<C-r>').edits).toEqual(expected);
  });
  it('reports ordered inverse ranges for counted undo and redo', () => {
    const changed = play(engine.init(['ooooo'], { line: 0, col: 2 }), 'xX');
    const undone = play(changed.state, '2u');
    expect(undone.edits).toEqual([edit(1, 0, 'o'), edit(2, 0, 'o')]);
    expect(play(undone.state, '2<C-r>').edits).toEqual([edit(2, 1), edit(1, 1)]);
  });
  it('joins only newlines and leading spaces across several rows', () => {
    const result = play(engine.init(['ooo', '  ooo', 'ooo']), '3J');
    expect(result.edits).toEqual([edit(3, 3, ' '), edit(7, 1, ' ')]);
    expect(play(result.state, 'u').state.lines).toEqual(['ooo', '  ooo', 'ooo']);
  });
  it('reports no edits for motions, failures, disallowed commands and empty x', () => {
    expect(play(engine.init(['ooooo']), 'l?missing<CR>').edits).toEqual([]);
    expect(play(engine.init(['']), 'x').edits).toEqual([]);
    expect(engine.step(engine.init(['ooooo']), 'x', { allowedCommands: [] }).edits).toEqual([]);
  });
});

interface GoldenCase { lines: string[]; cursor: [number, number]; keys: string }
const goldenDirectory = new URL('../../../tools/golden/cases/', import.meta.url);
describe('every golden key replays its edits', () => {
  for (const file of readdirSync(goldenDirectory).filter((name) => name.endsWith('.json'))) {
    const cases = JSON.parse(readFileSync(new URL(file, goldenDirectory), 'utf8')) as GoldenCase[];
    it.each(cases)(`${file}: $keys`, ({ lines, cursor, keys }) => {
      play(engine.init(lines, { line: cursor[0], col: cursor[1] }), keys);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.js';
import { parseKeys } from './keys.js';
import type { EngineOptions, EngineState } from './types.js';

const engine = createEngine();
const lines = Array.from({ length: 100 }, () => 'abcdefghij');
function run(state: EngineState, keys: string, options?: EngineOptions) {
  let result = engine.step(state, '<Esc>', options);
  for (const key of parseKeys(keys)) result = engine.step(result.state, key, options);
  return result;
}

describe('half-screen scrolling', () => {
  it('initializes scroll to zero and uses the supplied window height', () => {
    const initial = engine.init(lines, { line: 0, col: 6 });
    expect(initial.scroll).toBe(0);
    expect(run(initial, '<C-d>', { windowHeight: 11 }).state.cursor).toEqual({ line: 5, col: 6 });
    expect(initial.cursor.line).toBe(0);
  });
  it('caps counted scroll at window height and remembers it', () => {
    const moved = run(engine.init(lines), '50<C-d><C-d>');
    expect(moved.state.scroll).toBe(28);
    expect(moved.state.cursor.line).toBe(56);
  });
  it.each(['d<C-d>', 'd<C-u>', 'y<C-d>', 'c<C-u>'])('rejects %s without changing text or history', keys => {
    const result = run(engine.init(lines), keys);
    expect(result.error?.code).toBe('unknown-command');
    expect(result.state.mode).toBe('normal');
    expect(result.state.lines).toEqual(lines);
    expect(result.state.undoStack).toEqual([]);
  });
  it.each([['<C-u>', 0], ['<C-d>', 99]] as const)('reports a boundary error for %s', (keys, line) => {
    const result = run(engine.init(lines, { line, col: 6 }), keys);
    expect(result.error?.code).toBe('invalid-range');
    expect(result.state.cursor).toEqual({ line, col: 6 });
  });
  it('retains a count even when already at the boundary', () => {
    const result = run(engine.init(lines), '3<C-u>');
    expect(result.error).not.toBeNull();
    expect(result.state.scroll).toBe(3);
  });
  it('preserves wanted column across a short landing and restores it later', () => {
    const ragged = [...lines]; ragged[14] = 'xx';
    const short = run(engine.init(ragged, { line: 0, col: 6 }), '<C-d>').state;
    expect(short.cursor).toEqual({ line: 14, col: 1 });
    expect(short.desiredCol).toBe(6);
    expect(run(short, '<C-d>').state.cursor).toEqual({ line: 28, col: 6 });
  });
  it('does not change undo, redo, dot recording, registers or modification state', () => {
    const edited = run(engine.init(lines), 'x').state;
    const undone = run(edited, 'u').state;
    const moved = run(undone, '5<C-d><C-u>').state;
    expect(moved).toMatchObject({ undoStack: undone.undoStack, redoStack: undone.redoStack,
      lastChange: undone.lastChange, registers: undone.registers, modified: undone.modified,
      changeSeq: undone.changeSeq, savedSeq: undone.savedSeq });
    expect(run(moved, '<C-r>').state.lines).toEqual(edited.lines);
    expect(run(moved, '.').state.lastChange).toEqual(edited.lastChange);
  });
  it('respects command restrictions', () => {
    expect(run(engine.init(lines), '<C-d>', { allowedCommands: ['j'] }).error?.code).toBe('not-allowed');
  });
});

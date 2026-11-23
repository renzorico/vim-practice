import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.js';
import { parseKeys } from './keys.js';
import type { EngineOptions } from './types.js';
const engine = createEngine();
function play(lines: readonly string[], keys: string, options?: EngineOptions) {
  let state = engine.init(lines);
  const commands = [];
  const errors = [];
  for (const key of parseKeys(keys)) {
    const result = engine.step(state, key, options);
    state = result.state;
    commands.push(...result.commands);
    if (result.error !== null) errors.push(result.error);
  }
  return { state, commands, errors };
}
describe('block and search state guarantees', () => {
  it('keeps the input immutable and records a block register', () => {
    const initial = engine.init(['abc', 'def']);
    const snapshot = JSON.stringify(initial);
    engine.step(initial, '<C-v>');
    expect(JSON.stringify(initial)).toBe(snapshot);
    const { state } = play(['abc', 'def'], '<C-v>jly');
    expect(state.registers['"']).toEqual({ text: 'ab\nde', linewise: false, blockWidth: 2 });
  });
  it.each(['Ixy<Esc>', 'Axy<Esc>', 'cxy<Esc>', 'd', 'rZ'])('undoes %s as one transaction', command => {
    const lines = ['abcdef', 'ghijkl', 'mnopqr'];
    const changed = play(lines, '<C-v>2jl' + command);
    expect(changed.state.undoStack).toHaveLength(1);
    expect(engine.step(changed.state, 'u').state.lines).toEqual(lines);
    expect(changed.errors).toEqual([]);
  });
  it('reports search operator records and repeats the pattern', () => {
    const { state, commands } = play(['a b c b d b'], 'd/b<CR>.');
    expect(state.lines).toEqual(['b d b']);
    expect(commands[0]).toMatchObject({ id: 'd', motion: '/', keys: parseKeys('d/b<CR>') });
  });
  it('failed operator search leaves text, cursor, registers and history untouched', () => {
    const initial = engine.init(['abc']);
    const result = play(initial.lines, 'd/z<CR>');
    expect(result.errors).toMatchObject([{ code: 'pattern-not-found' }]);
    expect(result.state).toEqual(initial);
  });
  it('wraps operator searches as Neovim does with wrapscan (golden: operator search wraps)', () => {
    const { state, errors } = play(['b abc'], '$d/b<CR>');
    expect(state.lines).toEqual(['c']);
    expect(errors).toEqual([]);
  });
});

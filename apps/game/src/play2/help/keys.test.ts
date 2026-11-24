import { describe, expect, it } from 'vitest';
import { createEngine, type EngineState } from '@escape/engine';
import { HELP_KEYS } from './keys.js';
import { stages } from '../content.js';
import { stageCommands } from '../session.js';

function parse(marked: string): { lines: readonly string[]; cursor: { line: number; col: number } } {
  // Greedy prefix permits an opening bracket to be the cursor character: [[].
  const match = /\[([^\n]?)\]/.exec(marked);
  if (!match || match.index === undefined) throw new Error(`No cursor in ${marked}`);
  const prefix = marked.slice(0, match.index);
  const lines = (prefix + (match[1] ?? '') + marked.slice(match.index + match[0].length)).split('\n');
  return { lines, cursor: { line: prefix.split('\n').length - 1, col: prefix.split('\n').at(-1)?.length ?? 0 } };
}
function marked(state: EngineState): string {
  return state.lines.map((line, index) => index === state.cursor.line
    ? `${line.slice(0, state.cursor.col)}[${line[state.cursor.col] ?? ''}]${line.slice(state.cursor.col + 1)}` : line).join('\n');
}
describe('learned key reference', () => {
  it('covers every taught command with a unique, short description', () => {
    const keys = HELP_KEYS.map(entry => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { stage } of stages) for (const key of stageCommands(stage)) expect(keys, stage.id).toContain(key);
    for (const key of [':w', ':e!', ':q']) expect(keys).toContain(key);
    for (const entry of HELP_KEYS) expect(entry.description.length, entry.key).toBeLessThanOrEqual(60);
  });
  for (const entry of HELP_KEYS) it(`checks ${entry.key} against the real engine`, () => {
    const engine = createEngine();
    const start = parse(entry.example.initial ?? entry.example.before);
    let state = engine.init(start.lines, start.cursor);
    for (const key of entry.example.setup) state = engine.step(state, key).state;
    expect(marked(state)).toBe(entry.example.before);
    for (const key of entry.example.keys) {
      const result = engine.step(state, key);
      // :e! is owned by the session; the engine leaves its buffer unchanged.
      if (entry.key === ':e!' && key === '<CR>') expect(result.error?.code).toBe('unknown-command');
      else expect(result.error, `${entry.key}: ${key}`).toBeNull();
      state = result.state;
    }
    expect(marked(state)).toBe(entry.example.after);
  });
});

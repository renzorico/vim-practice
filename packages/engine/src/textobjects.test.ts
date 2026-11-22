import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.js';
import { parseKeys } from './keys.js';
import type { CommandRecord, EngineState } from './types.js';

const engine = createEngine();
function play(lines: readonly string[], keys: string): { state: EngineState; commands: CommandRecord[] } {
  let state = engine.init(lines);
  const commands: CommandRecord[] = [];
  for (const key of parseKeys(keys)) {
    const next = engine.step(state, key);
    state = next.state;
    commands.push(...next.commands);
  }
  return { state, commands };
}
describe('text object command integration', () => {
  it.each(['diw', 'daw', 'ci"', 'ya(', '2daw', 'd2aw'])('records %s with a full id and object motion', keys => {
    const { commands } = play(['"one two" (three)'], keys);
    const last = commands.at(-1);
    expect(last?.id).toBe(keys.replace(/[23]/gu, ''));
    expect(last?.motion).toBe(keys.replace(/[23dcy]/gu, ''));
    expect(last?.count).toBe(keys.includes('2') ? 2 : null);
  });
  it.each(['ci"', 'di(', 'dit'])('reports a missing object for %s without mutating text or registers', keys => {
    const initial = engine.init(['one two']);
    let state = initial;
    let error = null;
    for (const key of parseKeys(keys)) {
      const next = engine.step(state, key);
      state = next.state;
      error = next.error;
    }
    expect(error?.code).toBe('invalid-range');
    expect(state.lines).toBe(initial.lines);
    expect(state.cursor).toEqual(initial.cursor);
    expect(state.registers).toBe(initial.registers);
    expect(state.undoStack).toEqual([]);
  });
  it('repeats changes with inserted text and a text object', () => {
    expect(play(['one two three'], 'ciwx<Esc>w.').state.lines).toEqual(['x x three']);
  });
  it('keeps paragraph yanks linewise and bracket yanks charwise', () => {
    expect(play(['one', '', 'two'], 'yap').state.registers['"']).toEqual({ text: 'one\n\n', linewise: true });
    expect(play(['(one)'], 'yi(').state.registers['"']).toEqual({ text: 'one', linewise: false });
  });
  it('accepts a learned operator/object pair and rejects an unlearned object', () => {
    let state = engine.init(['one two']);
    for (const key of ['d', 'i', 'w']) state = engine.step(state, key, { allowedCommands: ['d', 'iw'] }).state;
    expect(state.lines).toEqual([' two']);
    state = engine.init(['one two']);
    for (const key of ['d', 'i']) state = engine.step(state, key, { allowedCommands: ['d'] }).state;
    expect(engine.step(state, 'w', { allowedCommands: ['d'] }).error?.code).toBe('not-allowed');
  });
});

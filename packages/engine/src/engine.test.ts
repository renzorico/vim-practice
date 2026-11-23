import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.js';
import { parseKeys } from './keys.js';
import type { EngineOptions, EngineState, StepResult } from './types.js';

const engine = createEngine();

function play(lines: readonly string[], keys: string, options?: EngineOptions): { state: EngineState; steps: StepResult[] } {
  let state = engine.init(lines);
  const steps: StepResult[] = [];
  for (const key of parseKeys(keys)) {
    const step = engine.step(state, key, options);
    steps.push(step);
    state = step.state;
  }
  return { state, steps };
}

describe('allowedCommands', () => {
  it('lets ":" open the command line even when only ":q" is allowed', () => {
    const { state, steps } = play(['x'], ':q<CR>', { allowedCommands: [':q'] });
    expect(steps.map((step) => step.error)).toEqual([null, null, null]);
    expect(state.quitRequested).toBe(true);
  });

  it('rejects a completed ex command that is not allowed', () => {
    const { state, steps } = play(['x'], ':wq<CR>', { allowedCommands: [':q'] });
    expect(steps.at(-1)?.error?.code).toBe('not-allowed');
    expect(state.quitRequested).toBe(false);
  });

  it('rejects a disallowed motion without moving the cursor', () => {
    const { state, steps } = play(['one two'], 'w', { allowedCommands: ['h', 'l'] });
    expect(steps[0]?.error?.code).toBe('not-allowed');
    expect(state.cursor).toEqual({ line: 0, col: 0 });
  });

  it('lets "/" open search but checks the completed search', () => {
    const { steps } = play(['one two'], '/two<CR>', { allowedCommands: ['w'] });
    expect(steps[0]?.error).toBeNull();
    expect(steps.at(-1)?.error?.code).toBe('not-allowed');
  });
});


describe('undo parity', () => {
  it.each(['di"', 'dit', 'di(', 'di[', 'dh'])(
    '%s records an empty snapshot without edits, register writes or a new text version', (command) => {
      const text = command === 'di"' ? '""' : command === 'dit' ? '<a></a>'
        : command === 'di(' ? '()' : command === 'di[' ? '[]' : 'abc';
      const before = play(['ab', text], 'xj0').state;
      const original = structuredClone(before);
      const steps = [];
      let state = before;
      for (const key of parseKeys(command)) {
        const step = engine.step(state, key);
        steps.push(step);
        state = step.state;
      }
      expect(before).toEqual(original);
      expect(steps.every(step => step.error === null && step.edits.length === 0)).toBe(true);
      expect(state.lines).toEqual(before.lines);
      expect(state.registers).toEqual(before.registers);
      expect(state.changeSeq).toBe(before.changeSeq);
      expect(state.modified).toBe(before.modified);
      expect(state.undoStack).toHaveLength(before.undoStack.length + 1);
      expect(state.undoStack.at(-1)?.edits).toEqual([]);
      expect(state.lastChange).toEqual(parseKeys(command));
      const undone = engine.step(state, 'u');
      expect(undone.edits).toEqual([]);
      expect(undone.state.lines).toEqual(before.lines);
      expect(undone.state.cursor).toEqual(state.undoStack.at(-1)?.cursor);
    },
  );

  it('missing objects preserve history and the previous dot command', () => {
    const before = play(['abc'], 'x').state;
    let state = before;
    for (const key of parseKeys('di(')) state = engine.step(state, key).state;
    expect(state.undoStack).toEqual(before.undoStack);
    expect(state.lastChange).toEqual(before.lastChange);
    expect(engine.step(state, 'u').state.lines).toEqual(['abc']);
  });
});

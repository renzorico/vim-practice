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

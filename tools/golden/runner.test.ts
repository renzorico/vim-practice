import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../packages/engine/src/state.js';
import type { Engine, Key, Mode } from '../../packages/engine/src/types.js';
import { runGolden, type Case } from './runner.js';

function fakeEngine(seen: Key[] = []): Engine {
  return {
    init: createInitialState,
    step(state, key) {
      seen.push(key);
      return {
        state: key === 'l' ? { ...state, cursor: { ...state.cursor, col: state.cursor.col + 1 } } : state,
        commands: [], error: null, edits: [],
      };
    },
  };
}

const base: Case = { name: 'right', lines: ['abc'], cursor: [0, 0], keys: 'l',
  expect: { lines: ['abc'], cursor: [0, 1], mode: 'n' } };

describe('runGolden', () => {
  it('fails when a key changes text without reporting the matching edits', () => {
    const engine = fakeEngine();
    engine.step = (state) => ({ state: { ...state, lines: ['changed'] }, commands: [], error: null, edits: [] });
    const result = runGolden(engine, [{ ...base, keys: 'x',
      expect: { lines: ['changed'], cursor: [0, 0], mode: 'n' } }])[0];
    expect(result).toMatchObject({ passed: false, differences: ['edits at step 0 (x)'] });
  });

  it('rejects out-of-buffer ranges even if slicing happens to produce the expected text', () => {
    const engine = fakeEngine();
    engine.step = (state) => ({ state, commands: [], error: null,
      edits: [{ start: 4, removed: 0, inserted: '' }] });
    expect(runGolden(engine, [{ ...base, keys: 'x',
      expect: { lines: ['abc'], cursor: [0, 0], mode: 'n' } }])[0])
      .toMatchObject({ passed: false, differences: ['invalid edit at step 0 (x)'] });
  });

  it('replays from independent states and does not mutate cases', () => {
    const cases = [structuredClone(base), structuredClone(base)];
    const before = structuredClone(cases);
    expect(runGolden(fakeEngine(), cases).every((result) => result.passed)).toBe(true);
    expect(cases).toEqual(before);
  });

  it('tokenizes notation before stepping', () => {
    const seen: Key[] = [];
    runGolden(fakeEngine(seen), [{ ...base, keys: '2dw<Esc><lt>' }]);
    expect(seen).toEqual(['2', 'd', 'w', '<Esc>', '<']);
  });

  it.each<[string, Mode]>([
    ['n', 'normal'], ['i', 'insert'], ['v', 'visual'], ['V', 'visual-line'],
    ['\u0016', 'visual-block'], ['c', 'command-line'], ['no', 'operator-pending'],
    ['nov', 'operator-pending'], ['noV', 'operator-pending'], ['no\u0016', 'operator-pending'],
    ['niI', 'normal'], ['niR', 'normal'], ['niV', 'normal'],
    ['R', 'insert'], ['Rv', 'insert'], ['s', 'visual'], ['S', 'visual-line'], ['\u0013', 'visual-block'],
  ])('maps Neovim mode %j', (nvimMode, engineMode) => {
    const engine = fakeEngine();
    engine.init = (lines, cursor) => ({ ...createInitialState(lines, cursor), mode: engineMode });
    expect(runGolden(engine, [{ ...base, expect: { ...base.expect!, mode: nvimMode } }])[0]?.passed).toBe(true);
  });

  it('reports all differing fields with expected and actual snapshots', () => {
    const testCase = { ...base, expect: { lines: ['wrong'], cursor: [1, 2] as const, mode: 'i' } };
    expect(runGolden(fakeEngine(), [testCase])[0]).toMatchObject({
      passed: false, differences: ['lines', 'cursor', 'mode'], expected: testCase.expect,
      actual: { lines: ['abc'], cursor: [0, 1], mode: 'normal' },
    });
  });

  it('fails explicitly when the expectation is absent', () => {
    const { expect: unused, ...withoutExpectation } = base;
    expect(runGolden(fakeEngine(), [withoutExpectation])[0]).toMatchObject({
      passed: false, differences: ['Missing expect; generate the Neovim golden first.'],
    });
  });

  it('does not equate an unsupported Neovim mode with normal mode', () => {
    expect(runGolden(fakeEngine(), [{ ...base, expect: { ...base.expect!, mode: 'unsupported-mode' } }])[0]?.passed).toBe(false);
  });
});

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
        commands: [], error: null,
      };
    },
  };
}

const base: Case = { name: 'right', lines: ['abc'], cursor: [0, 0], keys: 'l',
  expect: { lines: ['abc'], cursor: [0, 1], mode: 'n' } };

describe('runGolden', () => {
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
    expect(runGolden(fakeEngine(), [{ ...base, expect: { ...base.expect!, mode: 'R' } }])[0]?.passed).toBe(false);
  });
});

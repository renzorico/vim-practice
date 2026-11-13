import { parseKeys } from '../../packages/engine/src/keys.js';
import type { Engine, Mode } from '../../packages/engine/src/types.js';

export interface Expectation {
  readonly lines: readonly string[];
  readonly cursor: readonly [number, number];
  readonly mode: string;
}

export interface Case {
  readonly name: string;
  readonly lines: readonly string[];
  readonly cursor: readonly [number, number];
  readonly keys: string;
  readonly expect?: Expectation;
}

export interface Result {
  readonly name: string;
  readonly passed: boolean;
  readonly actual: Expectation;
  readonly expected: Expectation | undefined;
  readonly differences: readonly string[];
}

const MODES: Readonly<Record<string, Mode>> = {
  n: 'normal', i: 'insert', v: 'visual', V: 'visual-line',
  '\u0016': 'visual-block', c: 'command-line', no: 'operator-pending',
  nov: 'operator-pending', noV: 'operator-pending', 'no\u0016': 'operator-pending',
  niI: 'normal', niR: 'normal', niV: 'normal',
  R: 'insert', Rv: 'insert', s: 'visual', S: 'visual-line', '\u0013': 'visual-block',
};

/** Replay each case independently, collecting every mismatch (including missing goldens). */
export function runGolden(engine: Engine, cases: Case[]): Result[] {
  return cases.map((testCase) => {
    let state = engine.init(testCase.lines, { line: testCase.cursor[0], col: testCase.cursor[1] });
    const editDifferences: string[] = [];
    for (const [index, key] of parseKeys(testCase.keys).entries()) {
      let text = state.lines.join('\n');
      const result = engine.step(state, key);
      for (const edit of result.edits) {
        if (edit.start < 0 || edit.removed < 0 || edit.start + edit.removed > text.length) {
          editDifferences.push(`invalid edit at step ${index} (${key})`);
        }
        text = text.slice(0, edit.start) + edit.inserted + text.slice(edit.start + edit.removed);
      }
      if (text !== result.state.lines.join('\n')) editDifferences.push(`edits at step ${index} (${key})`);
      state = result.state;
    }
    const actual: Expectation = {
      lines: [...state.lines], cursor: [state.cursor.line, state.cursor.col], mode: state.mode,
    };
    const expected = testCase.expect;
    const differences: string[] = [...editDifferences];
    if (!expected) {
      differences.push('Missing expect; generate the Neovim golden first.');
    } else {
      if (JSON.stringify(actual.lines) !== JSON.stringify(expected.lines)) differences.push('lines');
      if (actual.cursor[0] !== expected.cursor[0] || actual.cursor[1] !== expected.cursor[1]) differences.push('cursor');
      if (actual.mode !== (MODES[expected.mode] ?? expected.mode)) differences.push('mode');
    }
    return { name: testCase.name, passed: differences.length === 0, actual, expected, differences };
  });
}

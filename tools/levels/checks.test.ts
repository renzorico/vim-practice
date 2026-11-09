import { describe, expect, it } from 'vitest';
import { createEngine } from '../../packages/engine/src/engine.js';
import type { Key } from '../../packages/engine/src/types.js';
import type { LevelRun } from '../../packages/curriculum/src/contracts.js';
import type { Level } from '../../packages/curriculum/src/types.js';
import {
  checkDuplicateIds,
  checkLevels,
  checkRequires,
  checkSolutionKeys,
  checkTeaches,
} from './checks.js';
import { replayLevel, type LevelRunner } from './replay.js';

const BASE_LEVEL: Level = {
  id: 'base',
  region: 'motion-plains',
  type: 'reach',
  title: 'Base',
  intro: 'A fixture level.',
  startLines: ['one two'],
  startCursor: { line: 0, col: 0 },
  goals: [{ type: 'reach', target: { line: 0, col: 4 } }],
  teaches: ['motion.word'],
  requires: [],
  par: 5,
  solution: ['w'],
  hints: ['Press w.'],
};

function makeLevel(overrides: Partial<Level> & Pick<Level, 'id'>): Level {
  return { ...BASE_LEVEL, ...overrides };
}

describe('checkDuplicateIds', () => {
  it('reports every level sharing an id', () => {
    const problems = checkDuplicateIds([makeLevel({ id: 'a' }), makeLevel({ id: 'a' }), makeLevel({ id: 'b' })]);
    expect(problems.map((problem) => problem.levelId)).toEqual(['a', 'a']);
  });

  it('reports nothing when ids are unique', () => {
    expect(checkDuplicateIds([makeLevel({ id: 'a' }), makeLevel({ id: 'b' })])).toEqual([]);
  });
});

describe('checkRequires', () => {
  it('passes when another level teaches the required skill', () => {
    const levels = [
      makeLevel({ id: 'teacher', teaches: ['motion.hjkl'] }),
      makeLevel({ id: 'student', teaches: ['motion.word'], requires: ['motion.hjkl'] }),
    ];
    expect(checkRequires(levels)).toEqual([]);
  });

  it('reports a required skill that no level teaches', () => {
    const problems = checkRequires([makeLevel({ id: 'orphan', requires: ['motion.G'] })]);
    expect(problems).toEqual([{ levelId: 'orphan', message: expect.stringContaining('"motion.G"') }]);
  });

  it('reports a required skill that only the requiring level itself teaches', () => {
    const problems = checkRequires([makeLevel({ id: 'self', teaches: ['motion.word'], requires: ['motion.word'] })]);
    expect(problems.map((problem) => problem.levelId)).toEqual(['self']);
  });
});

describe('checkTeaches', () => {
  it('reports a non-review level that teaches nothing', () => {
    const problems = checkTeaches([makeLevel({ id: 'silent', type: 'transform', teaches: [] })]);
    expect(problems.map((problem) => problem.levelId)).toEqual(['silent']);
  });

  it('allows a review level to teach nothing', () => {
    expect(checkTeaches([makeLevel({ id: 'recap', type: 'review', teaches: [] })])).toEqual([]);
  });
});

describe('checkSolutionKeys', () => {
  it('accepts canonical Vim notation keys', () => {
    const problems = checkSolutionKeys([makeLevel({ id: 'ok', solution: ['j', '<Esc>', '<CR>', '<C-r>', '<BS>', 'é'] })]);
    expect(problems).toEqual([]);
  });

  it.each([
    ['multi-key string', 'dw'],
    ['unknown angle-bracket name', '<foo>'],
    ['non-canonical case', '<esc>'],
    ['empty string', ''],
  ])('reports a %s', (_label, badKey) => {
    const problems = checkSolutionKeys([makeLevel({ id: 'bad', solution: ['j', badKey] })]);
    expect(problems).toEqual([{ levelId: 'bad', message: expect.stringContaining(`"${badKey}"`) }]);
  });
});

describe('checkLevels', () => {
  it('returns no problems for a valid set', () => {
    const levels = [
      makeLevel({ id: 'teacher', teaches: ['motion.hjkl'], solution: ['<Esc>'] }),
      makeLevel({ id: 'student', requires: ['motion.hjkl'] }),
    ];
    expect(checkLevels(levels)).toEqual([]);
  });

  it('combines the problems of every check', () => {
    const levels = [
      makeLevel({ id: 'dup', teaches: [], solution: ['dw'] }),
      makeLevel({ id: 'dup', requires: ['motion.missing'] }),
    ];
    const messages = checkLevels(levels).map((problem) => problem.message);
    expect(messages.some((message) => message.includes('duplicate id'))).toBe(true);
    expect(messages.some((message) => message.includes('motion.missing'))).toBe(true);
    expect(messages.some((message) => message.includes('teaches nothing'))).toBe(true);
    expect(messages.some((message) => message.includes('"dw"'))).toBe(true);
  });
});

describe('replayLevel', () => {
  const emptyState = createEngine().init(['x'], { line: 0, col: 0 });

  /** Fake runner: 'x' counts a keystroke, 'y' wins, 'q' quits. Keys after the end are ignored. */
  function fakeRunnerRecording(keysSeen: Key[]): LevelRunner {
    return {
      startLevel: (level: Level): LevelRun => ({
        level,
        state: emptyState,
        status: 'playing',
        keystrokes: 0,
        commandLog: [],
        goalsMet: level.goals.map(() => false),
        lastError: null,
        stars: 0,
        failureReason: null,
      }),
      stepLevel: (run: LevelRun, key: Key): LevelRun => {
        if (run.status !== 'playing') return run;
        keysSeen.push(key);
        const keystrokes = run.keystrokes + 1;
        if (key === 'y') return { ...run, keystrokes, status: 'won', goalsMet: run.goalsMet.map(() => true) };
        if (key === 'q') return { ...run, keystrokes, status: 'failed', failureReason: 'quit' };
        return { ...run, keystrokes };
      },
    };
  }

  it('wins within par and feeds the solution keys in order', () => {
    const keysSeen: Key[] = [];
    const result = replayLevel(makeLevel({ id: 'a', par: 3, solution: ['x', 'y'] }), fakeRunnerRecording(keysSeen));
    expect(result).toEqual({ won: true, keystrokes: 2, overPar: false, failureReason: null });
    expect(keysSeen).toEqual(['x', 'y']);
  });

  it('wins but reports overPar when keystrokes exceed par', () => {
    const result = replayLevel(makeLevel({ id: 'b', par: 2, solution: ['x', 'x', 'x', 'y'] }), fakeRunnerRecording([]));
    expect(result).toEqual({ won: true, keystrokes: 4, overPar: true, failureReason: null });
  });

  it('fails with extra-keys when the level is won before the solution ends', () => {
    const result = replayLevel(makeLevel({ id: 'c', par: 5, solution: ['y', 'x'] }), fakeRunnerRecording([]));
    expect(result).toEqual({ won: false, keystrokes: 1, overPar: false, failureReason: 'extra-keys' });
  });

  it('regression: a 3-key solution with par 1 is overPar even when it wins on key 1', () => {
    const result = replayLevel(makeLevel({ id: 'f', par: 1, solution: ['y', 'x', 'x'] }), fakeRunnerRecording([]));
    expect(result.overPar).toBe(true);
    expect(result.won).toBe(false);
    expect(result.failureReason).toBe('extra-keys');
  });

  it('wins and is overPar when the solution is longer than par with no extra keys', () => {
    const result = replayLevel(makeLevel({ id: 'g', par: 2, solution: ['x', 'x', 'y'] }), fakeRunnerRecording([]));
    expect(result).toEqual({ won: true, keystrokes: 3, overPar: true, failureReason: null });
  });

  it('reports the runner failure reason when the player quits', () => {
    const result = replayLevel(makeLevel({ id: 'd', par: 5, solution: ['x', 'q'] }), fakeRunnerRecording([]));
    expect(result).toEqual({ won: false, keystrokes: 2, overPar: false, failureReason: 'quit' });
  });

  it('reports unfinished when the solution ends without a win or failure', () => {
    const result = replayLevel(makeLevel({ id: 'e', par: 5, solution: ['x', 'x'] }), fakeRunnerRecording([]));
    expect(result).toEqual({ won: false, keystrokes: 2, overPar: false, failureReason: 'unfinished' });
  });
});

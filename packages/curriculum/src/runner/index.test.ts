import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../engine/src/engine.js';
import type { CommandRecord, EngineState } from '@escape/engine';
import type { LevelRun } from '../contracts.js';
import type { Goal, Level } from '../types.js';
import { checkGoals, startLevel, stepLevel, usedSkills } from './index.js';

const engine = createEngine();

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 'test', region: 'motion-plains', type: 'reach', title: 'Test', intro: 'Move.',
    startLines: ['one two three', 'four five'], startCursor: { line: 0, col: 0 },
    goals: [{ type: 'reach', target: { line: 0, col: 4 } }],
    teaches: [], requires: [], par: 1, solution: ['w'], hints: ['Try w.'], ...overrides,
  };
}

function press(run: LevelRun, keys: readonly string[]): LevelRun {
  return keys.reduce(stepLevel, run);
}

function record(overrides: Partial<CommandRecord> = {}): CommandRecord {
  return { id: 'w', kind: 'motion', keys: ['w'], count: null, register: null, motion: null, ...overrides };
}

function state(overrides: Partial<EngineState> = {}): EngineState {
  return { ...engine.init(['one', 'two']), ...overrides };
}

describe('startLevel', () => {
  it('initializes the engine from the level buffer and cursor', () => {
    const source = level({ startCursor: { line: 1, col: 2 } });
    const run = startLevel(source);
    expect(run.state).toEqual(engine.init(source.startLines, source.startCursor));
    expect(run.level).toBe(source);
  });
  it('starts playing with empty counters, log and feedback', () => {
    expect(startLevel(level())).toMatchObject({
      status: 'playing', keystrokes: 0, commandLog: [], lastError: null, stars: 0, failureReason: null,
    });
  });
  it('computes initially satisfied and unsatisfied goals without finishing', () => {
    const run = startLevel(level({ goals: [
      { type: 'reach', target: { line: 0, col: 0 } },
      { type: 'quit', mustSave: false },
    ] }));
    expect(run.goalsMet).toEqual([true, false]);
    expect(run.status).toBe('playing');
  });
  it('starts independent runs without sharing logs', () => {
    const source = level();
    const first = startLevel(source);
    const second = startLevel(source);
    stepLevel(first, 'w');
    expect(second.keystrokes).toBe(0);
    expect(second.commandLog).toEqual([]);
  });
});

describe('checkGoals', () => {
  it.each([
    [{ line: 0, col: 0 }, true],
    [{ line: 0, col: 1 }, false],
    [{ line: 1, col: 0 }, false],
    [{ line: 1, col: 1 }, false],
  ] as const)('matches both cursor coordinates at %j', (target, expected) => {
    expect(checkGoals([{ type: 'reach', target }], state())).toEqual([expected]);
  });
  it.each([
    [['one', 'two'], true],
    [['one'], false],
    [['one', 'two', ''], false],
    [['two', 'one'], false],
    [['one ', 'two'], false],
    [['One', 'two'], false],
    [['one\ntwo'], false],
  ] as const)('compares exact buffer lines %j', (targetLines, expected) => {
    expect(checkGoals([{ type: 'transform', targetLines }], state())).toEqual([expected]);
  });
  it.each([
    ['k', 'key', true], ['k', 'ke', false], ['k', 'key\n', false], ['a', 'key', false],
  ] as const)('checks register %s against %s', (register, text, expected) => {
    expect(checkGoals([{ type: 'collect', register, text }], state({
      registers: { k: { text: 'key', linewise: true } },
    }))).toEqual([expected]);
  });
  it.each([
    [false, false, false, false], [false, true, false, false],
    [true, false, false, true], [true, true, false, true],
    [false, false, true, false], [false, true, true, false],
    [true, false, true, false], [true, true, true, true],
  ] as const)('quit=%s saved=%s mustSave=%s', (quitRequested, saved, mustSave, expected) => {
    expect(checkGoals([{ type: 'quit', mustSave }], state({ quitRequested, saved }))).toEqual([expected]);
  });
  it('returns results in goal order', () => {
    const goals: Goal[] = [
      { type: 'quit', mustSave: false }, { type: 'transform', targetLines: ['one', 'two'] },
      { type: 'reach', target: { line: 1, col: 0 } },
    ];
    expect(checkGoals(goals, state())).toEqual([false, true, false]);
  });
  it('supports an empty goal list', () => expect(checkGoals([], state())).toEqual([]));
});

describe('usedSkills', () => {
  it.each([
    [':q', 'ex.q'], [':q!', 'ex.q!'], ['i', 'mode.insert'],
    [':wq', 'ex.wq'], [':x', 'ex.wq'], ['ZZ', 'ex.wq'],
    ['h', 'motion.hjkl'], ['j', 'motion.hjkl'], ['k', 'motion.hjkl'], ['l', 'motion.hjkl'],
    ['w', 'motion.word'], ['b', 'motion.word'], ['e', 'motion.word'],
    ['W', 'motion.WORD'], ['B', 'motion.WORD'], ['E', 'motion.WORD'],
    ['0', 'motion.line'], ['^', 'motion.line'], ['$', 'motion.line'],
    ['gg', 'motion.file'], ['G', 'motion.file'],
  ])('maps %s to %s', (id, skill) => {
    expect([...usedSkills([record({ id })])]).toEqual([skill]);
  });
  it('adds count skill for explicit motion counts, including 1', () => {
    expect([...usedSkills([record({ count: 1 })])]).toEqual(['motion.word', 'motion.count']);
  });
  it('does not add count skill for implicit counts', () => {
    expect(usedSkills([record()]).has('motion.count')).toBe(false);
  });
  it('counts operator motion skills without awarding motion.count for operators', () => {
    expect([...usedSkills([record({ id: 'd', kind: 'operator', motion: 'w', count: 2 })])])
      .toEqual(['motion.word']);
  });
  it('ignores motion metadata on non-operator records', () => {
    expect([...usedSkills([record({ id: 'x', kind: 'edit', motion: 'w' })])]).toEqual([]);
  });
  it('ignores unknown commands and null operator motions', () => {
    expect([...usedSkills([record({ id: 'unknown' }), record({ id: 'dd', kind: 'operator' })])]).toEqual([]);
  });
  it('deduplicates skills across multiple commands', () => {
    expect([...usedSkills([record(), record({ id: 'b' }), record()])]).toEqual(['motion.word']);
  });
  it('returns an empty set for no commands', () => expect(usedSkills([]).size).toBe(0));
});

describe('stepLevel', () => {
  it('wins a Prologue-style :q level and records the complete command', () => {
    const run = press(startLevel(level({ goals: [{ type: 'quit', mustSave: false }],
      allowedCommands: [':', ':q'], mustUse: ['ex.q'], par: 3,
    })), [':', 'q', '<CR>']);
    expect(run).toMatchObject({ status: 'won', keystrokes: 3, stars: 3, goalsMet: [true], lastError: null });
    expect(run.commandLog.map((command) => command.id)).toEqual([':q']);
  });
  it.each([
    [4, 1, 3], [4, 4, 3], [4, 5, 2], [4, 6, 2], [4, 7, 1], [3, 5, 2], [3, 6, 1],
  ] as const)('scores par %i with %i keys as %i stars', (par, keys, stars) => {
    const run = press(startLevel(level({ par })), [...Array<string>(keys - 1).fill('<Esc>'), 'w']);
    expect(run.status).toBe('won');
    expect(run.keystrokes).toBe(keys);
    expect(run.stars).toBe(stars);
  });
  it('rejects a disallowed command without movement or skill credit', () => {
    const run = stepLevel(startLevel(level({ allowedCommands: ['l'] })), 'w');
    expect(run.lastError?.code).toBe('not-allowed');
    expect(run.state.cursor).toEqual({ line: 0, col: 0 });
    expect(run.commandLog).toEqual([]);
    expect(run.keystrokes).toBe(1);
    expect(run.status).toBe('playing');
  });
  it('allows an unrestricted command when allowedCommands is omitted', () => {
    expect(stepLevel(startLevel(level()), 'w').status).toBe('won');
  });
  it('treats an empty allowlist as restrictive', () => {
    expect(stepLevel(startLevel(level({ allowedCommands: [] })), 'w').lastError?.code).toBe('not-allowed');
  });
  it('clears previous errors on the next incomplete key', () => {
    const rejected = stepLevel(startLevel(level({ allowedCommands: ['l'] })), 'w');
    const next = stepLevel(rejected, '2');
    expect(next.lastError).toBeNull();
    expect(next.keystrokes).toBe(2);
    expect(next.commandLog).toEqual([]);
  });
  it('counts incomplete commands and appends only completed records', () => {
    const first = stepLevel(startLevel(level({ goals: [{ type: 'reach', target: { line: 1, col: 0 } }] })), 'l');
    const pending = stepLevel(first, '2');
    expect(pending.commandLog).toEqual(first.commandLog);
    expect(pending.keystrokes).toBe(2);
    const next = stepLevel(pending, 'w');
    expect(next.commandLog.map((command) => command.id)).toEqual(['l', 'w']);
    expect(next.commandLog[1]?.count).toBe(2);
    expect(first.keystrokes).toBe(1);
    expect(first.commandLog).toHaveLength(1);
  });
  it('fails immediately when goals are met without a required skill', () => {
    const run = stepLevel(startLevel(level({ mustUse: ['motion.count'] })), 'w');
    expect(run).toMatchObject({ status: 'failed', failureReason: 'must-use', stars: 0, goalsMet: [true] });
  });
  it('checks every required skill', () => {
    const run = stepLevel(startLevel(level({ mustUse: ['motion.word', 'motion.hjkl'] })), 'w');
    expect(run.failureReason).toBe('must-use');
  });
  it('wins with all required skills in the command history', () => {
    const run = press(startLevel(level({ mustUse: ['motion.hjkl', 'motion.word'] })), ['l', 'w']);
    expect(run.status).toBe('won');
    expect(run.failureReason).toBeNull();
  });
  it('does not fail a missing required skill while goals remain unmet', () => {
    expect(stepLevel(startLevel(level({ mustUse: ['motion.count'] })), 'l').status).toBe('playing');
  });
  it('fails on quitting a level without a quit goal', () => {
    const run = press(startLevel(level()), [':', 'q', '<CR>']);
    expect(run).toMatchObject({ status: 'failed', failureReason: 'quit', stars: 0 });
  });
  it('prioritizes unexpected quit over otherwise satisfied goals', () => {
    // Supply a playing run whose cursor goal is satisfied as the quit command completes.
    const beforeQuit = press(startLevel(level()), [':', 'q']);
    const quitting = stepLevel({ ...beforeQuit, level: level({
      goals: [{ type: 'reach', target: { line: 0, col: 0 } }],
    }) }, '<CR>');
    expect(quitting.failureReason).toBe('quit');
  });
  it('returns the same run object after a win', () => {
    const won = stepLevel(startLevel(level()), 'w');
    expect(stepLevel(won, 'j')).toBe(won);
  });
  it('returns the same run object after a failure', () => {
    const failed = stepLevel(startLevel(level({ mustUse: ['motion.count'] })), 'w');
    expect(stepLevel(failed, 'w')).toBe(failed);
  });
  it('requires all goals to be met together and recomputes them after each key', () => {
    const run = startLevel(level({ goals: [
      { type: 'reach', target: { line: 0, col: 4 } },
      { type: 'collect', register: 'k', text: 'one ' },
    ] }));
    const moved = stepLevel(run, 'w');
    expect(moved.goalsMet).toEqual([true, false]);
    expect(moved.status).toBe('playing');
    expect(stepLevel(moved, 'b').goalsMet).toEqual([false, false]);
  });
  it('wins a named-register collect goal through engine yanking', () => {
    const run = press(startLevel(level({ goals: [{ type: 'collect', register: 'k', text: 'one ' }],
      mustUse: ['motion.word'],
    })), ['"', 'k', 'y', 'w']);
    expect(run.status).toBe('won');
    expect(run.commandLog[0]).toMatchObject({ id: 'y', motion: 'w', register: 'k' });
  });
  it('wins a transform through the engine and credits its operator motion', () => {
    const run = press(startLevel(level({ goals: [{ type: 'transform', targetLines: ['two three', 'four five'] }],
      mustUse: ['motion.word'],
    })), ['d', 'w']);
    expect(run.status).toBe('won');
  });
  it('requires saving before winning a save-and-quit level', () => {
    const source = level({ goals: [{ type: 'quit', mustSave: true }], mustUse: ['ex.wq'], par: 4 });
    expect(press(startLevel(source), [':', 'q', '<CR>']).status).toBe('playing');
    const run = press(startLevel(source), [':', 'w', 'q', '<CR>']);
    expect(run).toMatchObject({ status: 'won', stars: 3 });
    expect(run.state.saved).toBe(true);
  });
  it('blocks a completed Ex command through engine options', () => {
    const run = press(startLevel(level({ allowedCommands: [':'],
      goals: [{ type: 'quit', mustSave: false }],
    })), [':', 'q', '<CR>']);
    expect(run.lastError?.code).toBe('not-allowed');
    expect(run.state.quitRequested).toBe(false);
    expect(run.keystrokes).toBe(3);
  });
});

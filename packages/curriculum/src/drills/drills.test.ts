import { describe, expect, it } from 'vitest';
import type { Key } from '@escape/engine';
import type { LevelRun } from '../contracts.js';
import type { Difficulty } from '../phase3.js';
import { stepLevel } from '../runner/index.js';
import { solve } from '../solver/index.js';
import { CORPUS } from './corpus.js';
import { DRILL_SKILLS, drillSkillsForStage } from './skills.js';
import { generateRep, hasGenerator } from './generators.js';
import { repStartState } from './rep.js';
import {
  applySetResult, buildDrillSet, continueDrill, giveUpRep, scoreSet, startDrill, stepDrill,
} from './session.js';
import type { DrillRep, RepResult } from './types.js';

const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3];
const SEEDS = 200;
const SOLVER_SEEDS = 12;
/** Insert-mode text cannot be searched by the solver, and setup reps start from a state it cannot load. */
const SOLVER_SKIPS = new Set(['edit.undo', 'edit.dot', 'mode.insert', 'mode.append', 'mode.edges', 'mode.open']);
const RUN_OF_FOUR_LETTERS = /([A-Za-z])\1{3}/;

function playRep(rep: DrillRep, keys: readonly Key[]): LevelRun {
  let run: LevelRun = { level: rep.level, state: repStartState(rep), status: 'playing', keystrokes: 0, commandLog: [],
    goalsMet: [false], lastError: null, stars: 0, failureReason: null };
  for (const key of keys) run = stepLevel(run, key);
  return run;
}

describe('corpus', () => {
  it('keeps every line within the drill rules', () => {
    for (const { text } of CORPUS) {
      expect(text, text).toMatch(/^[\x20-\x7e]+$/);
      expect(text.length, text).toBeGreaterThanOrEqual(30);
      expect(text.length, text).toBeLessThanOrEqual(46);
      expect(text, text).not.toMatch(RUN_OF_FOUR_LETTERS);
      expect(text, text).not.toMatch(/[#*%~]|\s{2}/);
    }
    expect(new Set(CORPUS.map(line => line.text)).size).toBe(CORPUS.length);
  });
});

describe('drill skills', () => {
  it('has a generator for every skill', () => {
    for (const skill of DRILL_SKILLS) expect(hasGenerator(skill.id), skill.id).toBe(true);
  });
  it('maps stages to the keys they introduce', () => {
    expect(drillSkillsForStage('lowlands').map(skill => skill.id)).toEqual(['motion.word', 'motion.line']);
    expect(drillSkillsForStage('lighthouse')).toEqual([]);
  });
});

describe.each(DRILL_SKILLS.map(skill => skill.id))('generator %s', (skill) => {
  it.each(DIFFICULTIES)('difficulty %i: the par solution wins on its last key, from a buffer of real text', (difficulty) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rep = generateRep(skill, seed, difficulty);
      expect(generateRep(skill, seed, difficulty)).toEqual(rep);
      const start = playRep(rep, []);
      expect(start.goalsMet.every(Boolean), `${rep.level.id} starts solved`).toBe(false);
      const run = playRep(rep, rep.level.solution);
      expect(run.status, `${rep.level.id} ${rep.level.solution.join('')}`).toBe('won');
      expect(run.keystrokes).toBe(rep.level.par);
      for (const text of rep.level.startLines) expect(text).not.toMatch(RUN_OF_FOUR_LETTERS);
    }
  });
});

describe.each(['edit.x', 'edit.dd', 'edit.D'])('%s', (skill) => {
  it.each(DIFFICULTIES)('difficulty %i: the goal removes every ink blot and nothing else', (difficulty) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const goal = generateRep(skill, seed, difficulty).level.goals[0];
      if (goal?.type !== 'transform') throw new Error('expected a transform goal');
      for (const text of goal.targetLines) {
        expect(text, `seed ${seed}`).not.toMatch(/[#*%~]/);
        expect(CORPUS.some(line => line.text === text || line.text === `${text}.`), `seed ${seed}: ${text}`).toBe(true);
      }
    }
  });
});

describe.each(DRILL_SKILLS.map(skill => skill.id).filter(skill => !SOLVER_SKIPS.has(skill)))('par for %s', (skill) => {
  it.each(DIFFICULTIES)('difficulty %i: the solver finds nothing shorter', (difficulty) => {
    for (let seed = 0; seed < SOLVER_SEEDS; seed += 1) {
      const rep = generateRep(skill, seed, difficulty);
      const shorter = solve(rep.level, { maxKeys: rep.level.par - 1 });
      expect(shorter?.keys.join(' ') ?? null, `${rep.level.id}: par ${rep.level.solution.join(' ')}`).toBeNull();
    }
  });
});

describe('buildDrillSet', () => {
  it('builds ten reps that rise in difficulty, deterministically', () => {
    const set = buildDrillSet('motion.hjkl', 3);
    expect(set.reps.map(rep => rep.difficulty)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
    expect(set.reps.every(rep => rep.skill === 'motion.hjkl')).toBe(true);
    expect(buildDrillSet('motion.hjkl', 3)).toEqual(set);
  });
  it('brings back two earlier skills in reps 8-10', () => {
    const set = buildDrillSet('edit.dd', 9);
    expect(set.reps.slice(0, 7).every(rep => rep.skill === 'edit.dd')).toBe(true);
    expect(set.reps.slice(7).filter(rep => rep.skill !== 'edit.dd')).toHaveLength(2);
  });
});

describe('drill session', () => {
  it('scores a par rep clean and moves on', () => {
    const state = startDrill(buildDrillSet('motion.line', 1));
    const after = state.set.reps[0]!.level.solution.reduce(stepDrill, state);
    expect(after.results).toEqual(['clean']);
    expect(after.index).toBe(1);
    expect(after.feedback).toBeNull();
  });
  it('shows the par route after an over-par rep', () => {
    const state = startDrill(buildDrillSet('motion.line', 1));
    const rep = state.set.reps[0]!;
    const detour: Key[] = ['h', 'l', ...rep.level.solution];
    const after = detour.reduce(stepDrill, state);
    expect(after.results).toEqual(['done']);
    expect(after.feedback).toEqual({ result: 'done', keys: detour, par: rep.level.solution });
  });
  it('replays a missed rep, then gives one retry that can only count as done', () => {
    const state = giveUpRep(startDrill(buildDrillSet('motion.line', 1)));
    expect(state.phase).toBe('replay');
    expect(stepDrill(state, 'j')).toBe(state);
    const retry = continueDrill(state);
    expect(retry.retry).toBe(true);
    const after = retry.set.reps[0]!.level.solution.reduce(stepDrill, retry);
    expect(after.results).toEqual(['done']);
  });
  it('ends a missed retry as missed', () => {
    const retry = continueDrill(giveUpRep(startDrill(buildDrillSet('motion.line', 1))));
    expect(giveUpRep(retry).results).toEqual(['missed']);
  });
  it('finishes after ten reps', () => {
    let state = startDrill(buildDrillSet('edit.x', 4));
    for (const rep of state.set.reps) state = rep.level.solution.reduce(stepDrill, state);
    expect(state.phase).toBe('finished');
    expect(scoreSet(state.results)).toEqual({ clean: 10, done: 0, missed: 0, passed: true });
  });
});

describe('scoring and mastery', () => {
  it('passes with 8 completed and 6 clean', () => {
    const results = (clean: number, done: number): RepResult[] =>
      [...Array<RepResult>(clean).fill('clean'), ...Array<RepResult>(done).fill('done'), ...Array<RepResult>(10 - clean - done).fill('missed')];
    expect(scoreSet(results(6, 2)).passed).toBe(true);
    expect(scoreSet(results(5, 5)).passed).toBe(false);
    expect(scoreSet(results(7, 0)).passed).toBe(false);
  });
  it('moves one Leitner box per set', () => {
    const now = '2026-11-26T10:00:00.000Z';
    const first = applySetResult(undefined, 'edit.x', true, now);
    expect(first).toEqual({ skill: 'edit.x', box: 1, lastPracticed: now, successes: 1, failures: 0 });
    expect(applySetResult(first, 'edit.x', false, now).box).toBe(0);
    expect(applySetResult(applySetResult(first, 'edit.x', false, now), 'edit.x', false, now).box).toBe(0);
  });
});

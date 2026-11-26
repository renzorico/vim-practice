import { describe, expect, it } from 'vitest';
import type { Key } from '@escape/engine';
import type { LevelRun } from '../contracts.js';
import type { Difficulty } from '../phase3.js';
import { checkGoals, stepLevel } from '../runner/index.js';
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
const OWN_KEY_SEEDS = 60;
/**
 * Longer pars are typed text (ciw, ci(, ci"): the solver cannot search insert-mode text, and six keys deep over a
 * World 5 allow-list takes more than 4 GB. Their delete reps (3-4 keys) are still checked.
 */
const MAX_SOLVER_PAR = 5;
/** Insert-mode text cannot be searched by the solver, and setup reps start from a state it cannot load. */
const SOLVER_SKIPS = new Set(['edit.undo', 'edit.dot', 'mode.insert', 'mode.append', 'mode.edges', 'mode.open', 'register.named', 'operator.c']);
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
      expect(checkGoals(rep.level.goals, repStartState(rep)).every(Boolean), `${rep.level.id} starts solved`).toBe(false);
      const run = playRep(rep, rep.level.solution);
      expect(run.status, `${rep.level.id} ${rep.level.solution.join('')}`).toBe('won');
      expect(run.keystrokes).toBe(rep.level.par);
      for (const text of rep.level.startLines) expect(text).not.toMatch(RUN_OF_FOUR_LETTERS);
    }
  });
});

describe.each(DRILL_SKILLS)('$id', (skill) => {
  it('drills its own keys: every par uses at least one of them', () => {
    // A counted key ('5j') is drilled by its number, in any direction.
    const uses = (solution: string): boolean => skill.keys.some(key => (/^\d/.test(key) ? /\d/.test(solution) : solution.includes(key)));
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 0; seed < OWN_KEY_SEEDS; seed += 1) {
        const solution = generateRep(skill.id, seed, difficulty).level.solution.join('');
        expect(uses(solution), `${skill.id} ${difficulty} ${seed}: ${solution}`).toBe(true);
      }
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
      if (rep.level.par > MAX_SOLVER_PAR) continue;
      const shorter = solve(rep.level, { maxKeys: rep.level.par - 1 });
      expect(shorter?.keys.join(' ') ?? null, `${rep.level.id}: par ${rep.level.solution.join(' ')}`).toBeNull();
    }
  });
});

describe('World 4 reps that a shorter or wrong route used to beat', () => {
  const target = (rep: DrillRep): readonly string[] => {
    const goal = rep.level.goals[0];
    if (goal?.type !== 'transform') throw new Error('expected a transform goal');
    return goal.targetLines;
  };
  it('a line swap really swaps the cursor line with the one above', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rep = generateRep('edit.lines', seed, 3);
      const row = rep.level.startCursor.line;
      const start = rep.level.startLines;
      expect(target(rep), `seed ${seed}`).toEqual([...start.slice(0, row - 1), start[row], start[row - 1], ...start.slice(row + 1)]);
    }
  });
  it('cw never changes the last word of a line, where C is shorter', () => {
    for (const difficulty of [1, 2] as const) {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const rep = generateRep('operator.c', seed, difficulty);
        const text = target(rep)[1] ?? '';
        const typed = rep.level.solution.slice(rep.level.solution.indexOf('w') + 1).join('');
        expect(text.endsWith(typed), `seed ${seed}: ${text}`).toBe(false);
      }
    }
  });
  it('ink to find is never one w from the line start', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rep = generateRep('operator.d', seed, 3);
      expect(solve(rep.level, { maxKeys: rep.level.par - 1 }), `seed ${seed}`).toBeNull();
    }
  });
  it('y2e copies two whole words', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rep = generateRep('operator.y', seed, 3);
      const copied = (target(rep)[1] ?? '').slice((rep.level.startLines[1] ?? '').length);
      expect(copied, `seed ${seed}`).toMatch(/^ [a-z]{5,} [a-z]{5,}$/);
    }
  });
});

describe('World 5 reps that a shorter route used to beat', () => {
  it('a counted dd never deletes the ink paragraphs in fewer keys than dap', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const rep = generateRep('textobj.paragraph', seed, difficulty);
        for (let count = 2; count <= 9; count += 1) {
          const run = playRep(rep, [String(count), 'd', 'd']);
          expect(run.status === 'won' && 3 < rep.level.par, `seed ${seed}: ${count}dd`).toBe(false);
        }
      }
    }
  });
  it.each(['textobj.word', 'textobj.paren', 'textobj.quote'])('%s: the new text shares no first or last letter with the old, so cw and cb never win', (skill) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rep = generateRep(skill, seed, 2);
      const typed = rep.level.solution.slice(3).join('');
      const start = rep.level.startLines[1] ?? '';
      const goal = rep.level.goals[0];
      if (goal?.type !== 'transform') throw new Error('expected a transform goal');
      const after = goal.targetLines[1] ?? '';
      const at = after.indexOf(typed, Math.max(0, rep.level.startCursor.col - typed.length - 8));
      const old = start.slice(at, at + start.length - after.length + typed.length);
      expect([old[0] === typed[0], old.at(-1) === typed.at(-1)], `seed ${seed}: ${old} -> ${typed}`).toEqual([false, false]);
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

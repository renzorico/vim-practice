import type { Key } from '@escape/engine';
import type { LevelRun } from '../contracts.js';
import { createRng, int } from '../generators/rng.js';
import type { Difficulty } from '../phase3.js';
import { checkGoals, startLevel, stepLevel } from '../runner/index.js';
import { OVER_PAR_FACTOR } from '../session/index.js';
import type { Mastery, SkillId } from '../types.js';
import { generateRep } from './generators.js';
import { repStartState } from './rep.js';
import { earlierSkills } from './skills.js';
import type { ApplySetResultFn, DrillRep, DrillSet, DrillState, RepResult, SetResult } from './types.js';

export const REPS_PER_SET = 10;
const DIFFICULTIES: readonly Difficulty[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
/** Reps 8-10 ("choose"): this many of them come from earlier skills when there are any. */
const INTERLEAVED = 2;
const FIRST_CHOOSE_REP = 7;
const SEED_STRIDE = 101;
export const PASS_COMPLETED = 8;
export const PASS_CLEAN = 6;
const MAX_BOX = 5;

/** Reps 1-7 drill the skill; of reps 8-10, two (at random places) bring back earlier skills at difficulty 2. */
export function buildDrillSet(skill: SkillId, seed: number): DrillSet {
  const pool = earlierSkills(skill).map(entry => entry.id);
  const rng = createRng(seed >>> 0);
  const interleavedAt = new Set<number>();
  while (pool.length > 0 && interleavedAt.size < INTERLEAVED) interleavedAt.add(int(rng, FIRST_CHOOSE_REP, REPS_PER_SET - 1));
  const reps: DrillRep[] = DIFFICULTIES.map((difficulty, index) => {
    const repSeed = seed * SEED_STRIDE + index;
    if (!interleavedAt.has(index)) return generateRep(skill, repSeed, difficulty);
    const older = pool[int(rng, 0, pool.length - 1)] ?? skill;
    return generateRep(older, repSeed, 2);
  });
  return { skill, seed, reps };
}

function loadRep(rep: DrillRep): LevelRun {
  const run = startLevel(rep.level);
  const state = repStartState(rep);
  return { ...run, state, goalsMet: checkGoals(rep.level.goals, state) };
}

function currentRep(state: DrillState): DrillRep {
  const rep = state.set.reps[state.index];
  if (rep === undefined) throw new Error(`Drill has no rep ${state.index}`);
  return rep;
}

export function startDrill(set: DrillSet): DrillState {
  const first = set.reps[0];
  if (first === undefined) throw new Error('Empty drill set');
  return { set, index: 0, run: loadRep(first), keys: [], results: [], retry: false, phase: 'playing', feedback: null };
}

/** Records the rep's result and loads the next rep, or finishes the set. */
function finishRep(state: DrillState, result: RepResult, keys: readonly Key[]): DrillState {
  const rep = currentRep(state);
  const feedback = result === 'clean' ? null : { result, keys, par: rep.level.solution };
  const results = [...state.results, result];
  const next = state.set.reps[state.index + 1];
  if (next === undefined) return { ...state, keys, results, feedback, retry: false, phase: 'finished' };
  return { ...state, index: state.index + 1, run: loadRep(next), keys: [], results, feedback, retry: false, phase: 'playing' };
}

function miss(state: DrillState): DrillState {
  // First miss: show the par solution, then one retry. A missed retry ends the rep as missed.
  if (state.retry) return finishRep(state, 'missed', state.keys);
  return { ...state, phase: 'replay', feedback: { result: 'missed', keys: state.keys, par: currentRep(state).level.solution } };
}

export function stepDrill(state: DrillState, key: Key): DrillState {
  if (state.phase !== 'playing') return state;
  const run = stepLevel(state.run, key);
  const keys = [...state.keys, key];
  const par = currentRep(state).level.par;
  if (run.status === 'won') {
    // A won retry counts as done, never clean: the solution was shown first.
    return finishRep(state, !state.retry && run.keystrokes <= par ? 'clean' : 'done', keys);
  }
  const next = { ...state, run, keys };
  if (run.status === 'failed' || run.keystrokes > par * OVER_PAR_FACTOR) return miss(next);
  return next;
}

export function giveUpRep(state: DrillState): DrillState {
  return state.phase === 'playing' ? miss(state) : state;
}

/** Leaves the replay: the missed rep reloads once for its retry. */
export function continueDrill(state: DrillState): DrillState {
  if (state.phase !== 'replay') return state;
  return { ...state, run: loadRep(currentRep(state)), keys: [], retry: true, phase: 'playing' };
}

export function scoreSet(results: readonly RepResult[]): SetResult {
  const clean = results.filter(result => result === 'clean').length;
  const done = results.filter(result => result === 'done').length;
  const missed = results.filter(result => result === 'missed').length;
  return { clean, done, missed, passed: clean + done >= PASS_COMPLETED && clean >= PASS_CLEAN };
}

/** Leitner: a passed set lifts the skill one box (max 5), a failed one drops it one (min 0). */
export const applySetResult: ApplySetResultFn = (mastery: Mastery | undefined, skill, passed, now) => {
  const box = mastery?.box ?? 0;
  const next = passed ? Math.min(MAX_BOX, box + 1) : Math.max(0, box - 1);
  return {
    skill,
    box: next as Mastery['box'],
    lastPracticed: now,
    successes: (mastery?.successes ?? 0) + (passed ? 1 : 0),
    failures: (mastery?.failures ?? 0) + (passed ? 0 : 1),
  };
};

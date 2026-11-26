/**
 * Drill mode contract (DR-0). FROZEN once merged: builders implement it and never edit this file.
 * Design: docs/briefs/drills/DRILLS.md. Everything here is pure: no DOM, timers or randomness beyond the seed.
 */
import type { EngineState, Key } from '@escape/engine';
import type { LevelRun } from '../contracts.js';
import type { Difficulty } from '../phase3.js';
import type { Level, Mastery, SkillId } from '../types.js';

/** A skill as drill mode sees it: what it is called, which keys it shows, where the game teaches it. */
export interface DrillSkill {
  readonly id: SkillId;
  /** Short name for the Copybook list: "Words: w b e". */
  readonly name: string;
  /** Keycaps the drill trains, in Vim notation: ['w', 'b', 'e']. */
  readonly keys: readonly string[];
  /** Stage id where the game introduces these keys (apps/game introducedAt). */
  readonly stage: string;
  /**
   * Engine allow-list for this skill's reps: the keys the game has taught by the end of `stage`.
   * Counts are prefixes, not commands, so they are always available.
   */
  readonly allowed: readonly string[];
}

/** One rep: a curriculum Level plus keys applied before the player starts (for undo and dot drills). */
export interface DrillRep {
  readonly skill: SkillId;
  readonly difficulty: Difficulty;
  /** `level.par` is the length of `level.solution`; `level.allowedCommands` is the skill's `allowed` list. */
  readonly level: Level;
  /** Applied to a fresh engine before the player's first key; never counted. Empty for most reps. */
  readonly setup: readonly Key[];
}

/** Ten reps: 1-3 isolate (difficulty 1), 4-7 vary (2), 8-10 choose (3, interleaved with older skills). */
export interface DrillSet {
  readonly skill: SkillId;
  readonly seed: number;
  readonly reps: readonly DrillRep[];
}

/** clean: goal met in at most par keys. done: met, over par. missed: over OVER_PAR_FACTOR x par, or gave up. */
export type RepResult = 'clean' | 'done' | 'missed';

export interface SetResult {
  readonly clean: number;
  readonly done: number;
  readonly missed: number;
  /** completed (clean + done) >= 8 and clean >= 6. */
  readonly passed: boolean;
}

/** What the strip under the buffer shows after a rep that was not clean. */
export interface RepFeedback {
  readonly result: RepResult;
  readonly keys: readonly Key[];
  readonly par: readonly Key[];
}

export type DrillPhase = 'playing' | 'replay' | 'finished';

export interface DrillState {
  readonly set: DrillSet;
  /** Index of the current rep, 0-9. */
  readonly index: number;
  readonly run: LevelRun;
  /** Keys the player pressed on the current rep. */
  readonly keys: readonly Key[];
  /** One entry per finished rep. */
  readonly results: readonly RepResult[];
  /** True on the one retry a missed rep gets after its replay. */
  readonly retry: boolean;
  /** 'replay': the par solution is showing; continueDrill reloads the rep for its retry or moves on. */
  readonly phase: DrillPhase;
  /** Feedback on the rep that just ended, if it was not clean. Cleared when the next rep ends clean. */
  readonly feedback: RepFeedback | null;
}

/**
 * Required exports of drills/index.ts:
 *   export const DRILL_SKILLS: readonly DrillSkill[]                       // teaching order
 *   export const drillSkill: (id: SkillId) => DrillSkill | undefined
 *   export const drillSkillsForStage: (stageId: string) => readonly DrillSkill[]
 *   export const generateRep: (skill: SkillId, seed: number, difficulty: Difficulty) => DrillRep
 *   export const buildDrillSet: (skill: SkillId, seed: number) => DrillSet
 *   export const startDrill: (set: DrillSet) => DrillState
 *   export const stepDrill: (state: DrillState, key: Key) => DrillState
 *   export const giveUpRep: (state: DrillState) => DrillState              // same as passing 3x par
 *   export const continueDrill: (state: DrillState) => DrillState          // leaves 'replay'
 *   export const scoreSet: (results: readonly RepResult[]) => SetResult
 *   export const repStartState: (rep: DrillRep) => EngineState             // after setup
 *   export const applySetResult: (mastery: Mastery | undefined, skill: SkillId, passed: boolean, now: string) => Mastery
 */
export type RepStartStateFn = (rep: DrillRep) => EngineState;
export type ApplySetResultFn = (mastery: Mastery | undefined, skill: SkillId, passed: boolean, now: string) => Mastery;

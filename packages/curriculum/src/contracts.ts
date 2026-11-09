/**
 * Phase 2 contracts. FROZEN before fan-out: builders implement these and never edit this file.
 * Each section names the task and the file that must export it.
 */
import type { CommandRecord, EngineError, EngineState, Key } from '@escape/engine';
import type { Goal, Level, Mastery, SkillId } from './types.js';

// ---------------------------------------------------------------------------
// Level runner (P2-A): packages/curriculum/src/runner/index.ts
// ---------------------------------------------------------------------------

export type LevelStatus = 'playing' | 'won' | 'failed';
export type Stars = 0 | 1 | 2 | 3;

export interface LevelRun {
  readonly level: Level;
  readonly state: EngineState;
  readonly status: LevelStatus;
  /** Every key passed to stepLevel while playing, including keys that caused errors. */
  readonly keystrokes: number;
  readonly commandLog: readonly CommandRecord[];
  /** One entry per level.goals, recomputed after every key. */
  readonly goalsMet: readonly boolean[];
  /** Error from the last key (e.g. 'not-allowed', E37), for the HUD. Cleared by the next key. */
  readonly lastError: EngineError | null;
  /** 0 unless won. 3 if keystrokes <= par, 2 if <= ceil(par * 1.5), else 1. */
  readonly stars: Stars;
  /**
   * Why the run failed, for the HUD:
   * - 'quit': the player quit (quitRequested) in a level that has no 'quit' goal.
   * - 'must-use': all goals met, but a skill in level.mustUse never appeared in the command log.
   */
  readonly failureReason: 'quit' | 'must-use' | null;
}

/**
 * Required exports of runner/index.ts:
 *   export const startLevel: (level: Level) => LevelRun
 *   export const stepLevel: (run: LevelRun, key: Key) => LevelRun   // no-op once status !== 'playing'
 *   export const checkGoals: (goals: readonly Goal[], state: EngineState) => boolean[]
 *   export const usedSkills: (log: readonly CommandRecord[]) => ReadonlySet<SkillId>  // via catalog.ts, incl. the count rule
 * stepLevel passes level.allowedCommands to Engine.step. Won = every goal met AND every mustUse skill used.
 */
export type StartLevelFn = (level: Level) => LevelRun;
export type StepLevelFn = (run: LevelRun, key: Key) => LevelRun;
export type CheckGoalsFn = (goals: readonly Goal[], state: EngineState) => boolean[];

// ---------------------------------------------------------------------------
// Progress, mastery, unlocks (P2-B): packages/curriculum/src/skills/index.ts
// ---------------------------------------------------------------------------

export interface LevelResult {
  readonly levelId: string;
  readonly won: boolean;
  readonly stars: Stars;
  readonly keystrokes: number;
  readonly usedSkills: readonly SkillId[];
  /** ISO date-time. Passed in, never read from the clock inside pure functions. */
  readonly finishedAt: string;
}

export interface SaveData {
  readonly version: 1;
  /** Best result per completed (won) level. */
  readonly completed: Readonly<Record<string, { readonly stars: Stars; readonly bestKeystrokes: number }>>;
  readonly mastery: Readonly<Record<SkillId, Mastery>>;
}

export interface StorageAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
}

/**
 * Required exports of skills/index.ts (all pure; "now" is always a parameter):
 *   export const emptySave: () => SaveData
 *   export const recordResult: (save: SaveData, result: LevelResult, levels: readonly Level[]) => SaveData
 *       Updates completed (keep best stars / fewest keystrokes) and mastery: on a win, each skill the level
 *       teaches or the player used moves up one Leitner box (max 5); on a loss, used skills drop one box (min 1 if learned).
 *   export const effectiveBox: (mastery: Mastery, now: string) => Mastery['box']
 *       Decay: a skill overdue for review loses one box per missed interval. Intervals in days: [0, 1, 2, 4, 7, 15].
 *   export const learnedSkills: (save: SaveData, levels: readonly Level[]) => ReadonlySet<SkillId>
 *       Skills taught by any completed level.
 *   export const isUnlocked: (level: Level, save: SaveData, levels: readonly Level[]) => boolean
 *       True when every skill in level.requires is learned. Cumulative: no level-to-level links.
 *   export const reviewQueue: (save: SaveData, now: string, limit: number) => SkillId[]
 *       Learned skills, weakest effective box first, then most overdue.
 *   export const pickReviewLevels: (save: SaveData, levels: readonly Level[], now: string, count: number) => Level[]
 *       Completed levels that best exercise the review queue (used to build review chapters).
 *   export const createMemoryStorage: (initial?: SaveData) => StorageAdapter
 */

// ---------------------------------------------------------------------------
// App store (P2-C builds the UI against a stub; P2-F wires the real one): apps/game
// ---------------------------------------------------------------------------

export type Screen =
  | { readonly kind: 'title' }
  | { readonly kind: 'overworld' }
  | { readonly kind: 'level'; readonly levelId: string }
  | { readonly kind: 'result'; readonly levelId: string };

export interface GameStoreState {
  readonly screen: Screen;
  readonly save: SaveData;
  /** Active level run while screen.kind is 'level' or 'result'. */
  readonly run: LevelRun | null;
  /** The overworld is itself a Vim buffer: one line per portal. */
  readonly overworld: EngineState;
  /** Index into overworld lines -> level id (null for decoration lines). */
  readonly portals: readonly (string | null)[];
}

export interface GameStoreActions {
  /** Every keyboard key goes here, in Vim notation. The store routes it by screen. */
  pressKey(key: Key): void;
  restartLevel(): void;
  exitToOverworld(): void;
}

export type GameStore = GameStoreState & GameStoreActions;

/**
 * Phase 3 contracts. FROZEN before fan-out: builders implement these and never edit this file.
 * Design: docs/GAME-DESIGN.md. Each section names the task and the file that must export it.
 */
import type { EngineState, Key, Position } from '@escape/engine';
import type { LevelRun } from './contracts.js';
import type { Level, RegionId, SkillId } from './types.js';

// ---------------------------------------------------------------------------
// Solver (P3-A): packages/curriculum/src/solver/index.ts
// ---------------------------------------------------------------------------

export interface SolveOptions {
  /** Give up beyond this many keystrokes. Default 14. */
  readonly maxKeys: number;
}

export interface Solution {
  readonly keys: readonly Key[];
}

/**
 * Shortest keystroke solution that makes the runner report 'won', or null if none within maxKeys.
 * Required export: `export const solve: SolveFn`.
 *
 * Search: uniform-cost search where each action is one complete command's keys, cost = its key count.
 * Actions come from `level.allowedCommands` (if absent: the commands of the catalog skills in
 * level.teaches + level.requires, plus ':q' and ':q!'):
 *   - plain motions/commands: their key sequence ('w' -> ['w'], 'gg' -> ['g','g'], 'dd' -> ['d','d']);
 *   - f/F/t/T: one action per distinct character in the buffer;
 *   - ex ids (':q', ':wq'): [':', ...letters, '<CR>'];
 *   - counts 2-9 as a prefix on motions only when 'motion.count' is in teaches or requires.
 * The solver never types insert-mode text: levels that need typed text return null (callers fall back).
 * State identity for deduplication: lines, cursor, mode, pendingKeys, registers, quitRequested, saved.
 * Ties break by fewer actions, then by the action list compared as strings (deterministic).
 */
export type SolveFn = (level: Level, options?: Partial<SolveOptions>) => Solution | null;

// ---------------------------------------------------------------------------
// Room generators (P3-B): packages/curriculum/src/generators/index.ts
// ---------------------------------------------------------------------------

export type Difficulty = 1 | 2 | 3;

/** A generated room before par is computed. */
export type GeneratedRoom = Omit<Level, 'par' | 'solution'> & {
  /** A known-good solution the generator built the room around. Tests replay it to a win. */
  readonly intendedSolution: readonly Key[];
};

export interface RoomGenerator {
  readonly skill: SkillId;
  /** Deterministic: the same seed and difficulty always give the same room. */
  generate(seed: number, difficulty: Difficulty): GeneratedRoom;
}

/**
 * Required exports of generators/index.ts:
 *   export const GENERATORS: Readonly<Record<SkillId, RoomGenerator>>   // one per catalog skill (10)
 *   export const createRng: (seed: number) => () => number               // mulberry32, values in [0, 1)
 *   export const finalizeRoom: (room: GeneratedRoom, solve: SolveFn) => Level
 *       par = length of solve(room) when it is not null and not longer than intendedSolution, else
 *       intendedSolution.length; solution = the shorter of the two (solver wins ties).
 * Every generated room: id `gen-${skillSlug(skill)}-<difficulty>-<seed>` (skillSlug from catalog.ts), teaches [skill], requires = the skill's
 * catalog prerequisites (transitively), allowedCommands that make the skill the efficient path and
 * always include ':q' and ':q!', a plain-words `goalText`, 2-3 hints vague to specific.
 */
export type FinalizeRoomFn = (room: GeneratedRoom, solve: SolveFn) => Level;

// ---------------------------------------------------------------------------
// Lessons (content, P3-F): packages/curriculum/content/lessons.json (one array; never one file per skill:
// skill ids differ only by case, which collides on case-insensitive file systems)
// ---------------------------------------------------------------------------

export interface Lesson {
  readonly skill: SkillId;
  /** What the keycap shows: '$', 'w', ':wq'. */
  readonly keycap: string;
  /** One sentence, present tense: "Jumps to the last character of the line." */
  readonly definition: string;
  /** The Operator's note for this move, in character, max 2 sentences. */
  readonly quote: string;
  /** Before/after demo, animated key by key in the lesson card. */
  readonly example: { readonly lines: readonly string[]; readonly cursor: Position; readonly keys: readonly Key[] };
  /** The related move to remember, e.g. "0 jumps to the start." */
  readonly opposite?: string;
}

// ---------------------------------------------------------------------------
// World map (P3-C): packages/curriculum/src/world/index.ts
// ---------------------------------------------------------------------------

export type EntityKind = 'note' | 'door' | 'key' | 'echo' | 'exit';

export interface Entity {
  readonly id: string;
  readonly kind: EntityKind;
  /** The cell the entity's glyph sits on in WorldMap.lines. */
  readonly at: Position;
  /** note: the skill its lesson teaches. door: the skill its challenge room tests. */
  readonly skill?: SkillId;
  /** key: the region it reveals. */
  readonly unlocks?: RegionId;
}

export interface WorldRegion {
  readonly id: RegionId;
  readonly title: string;
  /** Inclusive row range of this region in WorldMap.lines. */
  readonly rows: { readonly from: number; readonly to: number };
  /** Key entity id that reveals it; null = visible from the start. */
  readonly unlockedBy: string | null;
}

export interface WorldMap {
  readonly lines: readonly string[];
  readonly entities: readonly Entity[];
  readonly regions: readonly WorldRegion[];
  readonly start: Position;
  /** Characters that block movement (e.g. '#'). */
  readonly walls: string;
}

export interface MapProgress {
  readonly learned: ReadonlySet<SkillId>;
  readonly collectedKeys: ReadonlySet<string>;
  readonly clearedDoors: ReadonlySet<string>;
}

export interface MapState {
  readonly map: WorldMap;
  /** The map buffer in the engine; it is never edited. */
  readonly engine: EngineState;
  readonly revealed: ReadonlySet<RegionId>;
  readonly collectedKeys: ReadonlySet<string>;
}

export type MapEvent =
  | { readonly type: 'bump' }
  | { readonly type: 'fog' }
  | { readonly type: 'not-learned'; readonly command: string }
  | { readonly type: 'open-note'; readonly entity: Entity }
  | { readonly type: 'open-door'; readonly entity: Entity }
  | { readonly type: 'door-locked'; readonly entity: Entity; readonly missing: readonly SkillId[] }
  | { readonly type: 'key-collected'; readonly entity: Entity }
  | { readonly type: 'echo'; readonly entity: Entity };

/**
 * Required exports of world/index.ts:
 *   export const startMap: (map: WorldMap, progress: MapProgress) => MapState
 *   export const stepMap: (state: MapState, key: Key, progress: MapProgress) => { state: MapState; events: MapEvent[] }
 *   export const visibleLines: (state: MapState) => string[]   // unrevealed region rows rendered as '░'
 *   export const entityAt: (map: WorldMap, at: Position) => Entity | undefined
 *   export const mapCommands: (learned: ReadonlySet<SkillId>) => string[]   // h j k l + motion commands of learned skills
 * Rules: only map commands are accepted (others: 'not-learned'); a motion ending on a wall or in an unrevealed row is
 * cancelled (cursor unchanged) with 'bump' / 'fog'; <CR> on a note/door/echo emits its event; a door whose skill's
 * prerequisites are not all learned emits 'door-locked'; ending a move on a key collects it and reveals its region.
 */
export type StepMapFn = (state: MapState, key: Key, progress: MapProgress) => { state: MapState; events: MapEvent[] };

// ---------------------------------------------------------------------------
// Room session, the fail flow (P3-D): packages/curriculum/src/session/index.ts
// ---------------------------------------------------------------------------

export type RoomPhase = 'lesson' | 'practice' | 'challenge' | 'solution' | 'won' | 'skipped';

export interface RoomSession {
  readonly skill: SkillId;
  readonly phase: RoomPhase;
  /** Seed of the current challenge room; a new variant uses seed + 1. */
  readonly seed: number;
  /** 0 = the original room, 1+ = variants served after the solution was shown. */
  readonly variant: number;
  /** Failed attempts on the original room (resets never; the solution unlocks at 5). */
  readonly attempts: number;
  /** Failed attempts on variants (skip unlocks at 3). */
  readonly failedVariants: number;
  readonly hintsShown: number;
}

export type RoomEvent =
  | { readonly type: 'lesson-done' }
  | { readonly type: 'practice-done' }
  /** A run ended: won, or failed (quit). */
  | { readonly type: 'run-ended'; readonly run: LevelRun }
  /** The player restarted, or passed 3x par without solving (the UI checks the limit). */
  | { readonly type: 'gave-up' }
  | { readonly type: 'hint' }
  | { readonly type: 'show-solution' }
  | { readonly type: 'solution-done' }
  | { readonly type: 'skip' };

/**
 * Required exports of session/index.ts:
 *   export const SOLUTION_AFTER = 5; export const SKIP_AFTER = 3; export const OVER_PAR_FACTOR = 3;
 *   export const startSession: (skill: SkillId, seed: number, options: { skipLesson: boolean }) => RoomSession
 *   export const transition: (session: RoomSession, event: RoomEvent) => RoomSession   // invalid events: return session unchanged
 *   export const canShowSolution: (session: RoomSession) => boolean   // attempts >= 5 on the original; always true on a variant
 *   export const canSkip: (session: RoomSession) => boolean           // failedVariants >= 3
 *   export const isOverParLimit: (keystrokes: number, par: number) => boolean   // keystrokes > par * 3
 * Flow: lesson -> practice -> challenge. A failed run or 'gave-up' counts one failed attempt (on a variant: one failed
 * variant, and the next variant is served immediately: seed + 1, variant + 1). 'show-solution' -> 'solution';
 * 'solution-done' -> a new variant in 'challenge'. A won run -> 'won'. 'skip' (only when canSkip) -> 'skipped'.
 */
export type TransitionFn = (session: RoomSession, event: RoomEvent) => RoomSession;

export type { EngineState };

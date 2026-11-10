/**
 * Curriculum contract. FROZEN after Phase 0 (same rule as engine/types.ts).
 * Levels are data, not code: Ollama drafts them as JSON, CI validates and replays them.
 */
import type { Key, Position } from '@escape/engine';

/** Stable skill id, e.g. 'motion.w', 'operator.d', 'textobj.iw', 'ex.wq'. */
export type SkillId = string;

export type RegionId = 'prologue' | 'motion-plains' | 'edit-forge' | 'jump-canyon' | 'text-object-temple' | 'search-archive';

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  /** Engine CommandRecord ids that count as using this skill. */
  readonly commands: readonly string[];
  readonly prerequisites: readonly SkillId[];
  readonly region: RegionId;
}

export type Goal =
  /** Reach: put the cursor on a position. */
  | { readonly type: 'reach'; readonly target: Position }
  /** Transform: buffer must equal these lines. */
  | { readonly type: 'transform'; readonly targetLines: readonly string[] }
  /** Hunt: a register must contain the key text (e.g. yank the key into "k). */
  | { readonly type: 'collect'; readonly register: string; readonly text: string }
  /** Quit: engine must report quitRequested, optionally with the buffer saved. */
  | { readonly type: 'quit'; readonly mustSave: boolean };

export type LevelType = 'reach' | 'transform' | 'hunt' | 'golf' | 'boss' | 'review';

export interface Level {
  readonly id: string;
  readonly region: RegionId;
  readonly type: LevelType;
  readonly title: string;
  /** Short in-game story text. Max ~2 sentences. */
  readonly intro: string;
  /** The goal in plain words, shown in the HUD: "Put the cursor on the X at the end of line 2." Phase 3+. */
  readonly goalText?: string;
  readonly startLines: readonly string[];
  readonly startCursor: Position;
  readonly goals: readonly Goal[];
  readonly teaches: readonly SkillId[];
  readonly requires: readonly SkillId[];
  /** Commands the engine accepts in this level. Omit to allow everything unlocked. */
  readonly allowedCommands?: readonly string[];
  /** Skills that must appear in the command log to pass (e.g. "solve with a text object"). */
  readonly mustUse?: readonly SkillId[];
  /** Keystroke par for golf scoring. */
  readonly par: number;
  /** Known-good keystrokes. CI replays them: goals reached and length <= par, or the level fails. */
  readonly solution: readonly Key[];
  readonly hints: readonly string[];
}

/** Per-skill learning state, Leitner-style. Box 0 = new, box 5 = mastered. */
export interface Mastery {
  readonly skill: SkillId;
  readonly box: 0 | 1 | 2 | 3 | 4 | 5;
  readonly lastPracticed: string; // ISO date
  readonly successes: number;
  readonly failures: number;
}

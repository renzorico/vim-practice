/**
 * Internal module contracts. FROZEN for Phase 1, same rule as types.ts.
 *
 * Each Phase 1 builder implements one of these interfaces in its own folder, without seeing
 * the others. engine.ts (task P1-F) wires them together. Cross-module needs go through
 * dependency injection (see ModeDeps), so no module imports another module's code.
 */
import type { EngineError, EngineState, Key, Position, RegisterName } from './types.js';

// ---------------------------------------------------------------------------
// Motions (task P1-B): packages/engine/src/motions/index.ts
// ---------------------------------------------------------------------------

/** Where a motion lands, and how an operator should treat the covered text. */
export interface MotionResult {
  readonly target: Position;
  /** Linewise motions (j, k, gg, G, ', {, }) make operators act on whole lines. */
  readonly linewise: boolean;
  /** Inclusive motions (e, $, f, t, %) include the target character in an operator range. */
  readonly inclusive: boolean;
  /** Extra state changes caused by the motion itself (lastFind, lastSearch, desiredCol). */
  readonly statePatch?: Partial<Pick<EngineState, 'lastFind' | 'lastSearch' | 'desiredCol'>>;
}

/**
 * count is always >= 1 (the engine passes 1 when no count was typed), except for motions where
 * Vim treats "no count" specially (G, gg): for those, hasCount tells them whether a count was typed.
 * arg is the extra character for f/F/t/T/m/'/`, else null.
 * Return null when the motion fails (Vim beeps; the cursor does not move).
 */
export type MotionFn = (state: EngineState, count: number, hasCount: boolean, arg: string | null) => MotionResult | null;

export interface MotionSpec {
  readonly id: string;
  /** True for motions that read one more key: f F t T ' ` */
  readonly needsArg: boolean;
  readonly fn: MotionFn;
}

/**
 * Required exports of motions/index.ts:
 *   export const motions: Readonly<Record<string, MotionSpec>>
 *   export const findPattern: FindPatternFn
 *   export const setMark: (state: EngineState, name: string) => EngineState
 * Motion ids: h j k l w b e W B E 0 ^ $ gg G f F t T ; , % { } n N * # ' `
 */
export type FindPatternFn = (
  lines: readonly string[],
  from: Position,
  pattern: string,
  forward: boolean,
) => Position | null;

// ---------------------------------------------------------------------------
// Operators, edits, registers, undo (task P1-C): packages/engine/src/operators/index.ts
// ---------------------------------------------------------------------------

/** A text range already resolved from a motion or a visual selection. start <= end. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
  readonly linewise: boolean;
  /** If false, the character at `end` is excluded. Ignored when linewise. */
  readonly inclusive: boolean;
}

export interface CommandOutcome {
  readonly state: EngineState;
  readonly error: EngineError | null;
}

/** d, c, y. 'c' leaves the state in insert mode. register null means the unnamed register. */
export type OperatorFn = (state: EngineState, range: Range, register: RegisterName | null) => CommandOutcome;

/** Commands that are not operator + motion: x X r p P D C Y J u <C-r>. */
export type SimpleCommandFn = (state: EngineState, count: number, register: RegisterName | null, arg: string | null) => CommandOutcome;

export interface SimpleCommandSpec {
  readonly id: string;
  /** True for r (reads the replacement character). */
  readonly needsArg: boolean;
  readonly fn: SimpleCommandFn;
}

/**
 * Required exports of operators/index.ts:
 *   export const operators: Readonly<Record<'d' | 'c' | 'y', OperatorFn>>
 *   export const simpleCommands: Readonly<Record<string, SimpleCommandSpec>>
 *   export const pushUndo: (state: EngineState) => EngineState   // snapshot before a change, clears redoStack
 *   export const writeRegister: (state: EngineState, register: RegisterName | null, text: string, linewise: boolean, kind: 'yank' | 'delete') => EngineState
 * writeRegister must follow Vim rules: unnamed always set; yank -> "0; linewise or multi-line delete -> "1 with
 * shift of "1-"9; small delete -> "-; uppercase name appends; "_ discards.
 */

// ---------------------------------------------------------------------------
// Modes, insert, command line, ex (task P1-A): packages/engine/src/modes/index.ts
// ---------------------------------------------------------------------------

/** Functions another module owns, injected by engine.ts. */
export interface ModeDeps {
  readonly findPattern: FindPatternFn;
  readonly pushUndo: (state: EngineState) => EngineState;
}

/**
 * Required exports of modes/index.ts:
 *   export const enterInsert: (state: EngineState, how: 'i' | 'a' | 'I' | 'A' | 'o' | 'O', deps: ModeDeps) => EngineState
 *   export const handleInsertKey: (state: EngineState, key: Key) => EngineState      // <Esc> returns to normal, cursor moves left 1 like Vim
 *   export const enterCommandLine: (state: EngineState, prompt: ':' | '/' | '?') => EngineState
 *   export const handleCommandLineKey: (state: EngineState, key: Key, deps: ModeDeps) => CommandLineOutcome
 *   export const enterVisual: (state: EngineState, kind: 'visual' | 'visual-line') => EngineState
 *   export const exitToNormal: (state: EngineState) => EngineState
 * Ex commands for Phase 1: :q :q! :w :wq :x :{number} (go to line). ZZ is handled by engine.ts via :x.
 * :q on a modified buffer fails with Vim's E37 message and does not quit.
 */
export interface CommandLineOutcome {
  readonly state: EngineState;
  readonly error: EngineError | null;
  /** The completed ex command or search (e.g. ':wq', '/'), or null if still typing. */
  readonly completed: { readonly id: string; readonly kind: 'ex' | 'search' } | null;
}

export type { Key };

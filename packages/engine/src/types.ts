/**
 * Engine contract. FROZEN after Phase 0: changes need an orchestrator review
 * and a BITACORA entry, because every parallel builder depends on these types.
 *
 * The engine is pure: no DOM, no timers, no randomness. Same state + same keys
 * always gives the same result. That is what makes golden tests against
 * Neovim and level replay in CI possible.
 */

export type Mode =
  | 'normal'
  | 'insert'
  | 'visual'
  | 'visual-line'
  | 'visual-block'
  | 'command-line'
  | 'operator-pending';

/** Zero-based line and column. Column counts UTF-16 code units, like the DOM. */
export interface Position {
  readonly line: number;
  readonly col: number;
}

/** Register content keeps whether it was yanked charwise or linewise. */
export interface RegisterValue {
  readonly text: string;
  readonly linewise: boolean;
}

/** Keys of `registers`: '"' unnamed, '0'-'9', 'a'-'z', '-', '/'. */
export type RegisterName = string;

export interface Mark {
  readonly name: string;
  readonly position: Position;
}

export interface EngineState {
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly mode: Mode;
  readonly registers: Readonly<Record<RegisterName, RegisterValue>>;
  readonly marks: Readonly<Record<string, Position>>;
  /** Anchor of the visual selection; null outside visual modes. */
  readonly visualAnchor: Position | null;
  /** Text typed after ':' or '/' while in command-line mode. */
  readonly commandLine: string;
  readonly lastSearch: { readonly pattern: string; readonly forward: boolean } | null;
  /** Remembered column for j/k movement across short lines. */
  readonly desiredCol: number;
  /** Set by :q, :wq, :x, ZZ. The game decides what "quit" means. */
  readonly quitRequested: boolean;
  readonly modified: boolean;
}

/**
 * One key press, in Vim notation: 'j', 'd', '<Esc>', '<CR>', '<C-r>', '<BS>'.
 * Using Vim notation keeps tests readable and maps 1:1 to nvim golden tests.
 */
export type Key = string;

/** Command categories the game uses for skills, hints and constraints. */
export type CommandKind = 'motion' | 'operator' | 'edit' | 'mode' | 'ex' | 'search' | 'register' | 'mark' | 'undo' | 'repeat';

/**
 * A completed command, emitted when the engine finishes parsing one.
 * Example: keys ['2','d','w'] -> { id: 'd', kind: 'operator', count: 2, motion: 'w' }.
 * The game layer reads these to award skills and check level constraints.
 */
export interface CommandRecord {
  /** Canonical command id, e.g. 'w', 'dd', 'ciw', ':wq', '/'. Matches SkillId commands in curriculum. */
  readonly id: string;
  readonly kind: CommandKind;
  readonly keys: readonly Key[];
  readonly count: number | null;
  readonly register: RegisterName | null;
  /** For operators: the motion or text object used ('w', 'iw', 'a('). */
  readonly motion: string | null;
}

export interface EngineError {
  readonly code: 'unknown-command' | 'not-allowed' | 'invalid-range' | 'pattern-not-found' | 'no-previous-search' | 'nothing-to-undo';
  readonly message: string;
}

export interface StepResult {
  readonly state: EngineState;
  /** Commands completed by this key (usually 0 or 1). */
  readonly commands: readonly CommandRecord[];
  readonly error: EngineError | null;
}

export interface EngineOptions {
  /** If set, commands outside this list are rejected with 'not-allowed'. Levels use this to restrict tools. */
  readonly allowedCommands?: readonly string[];
}

/** The single entry point every module plugs into. */
export interface Engine {
  init(lines: readonly string[], cursor?: Position): EngineState;
  step(state: EngineState, key: Key, options?: EngineOptions): StepResult;
}

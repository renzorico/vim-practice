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
  /** Command-line contents INCLUDING the prompt character, e.g. ':wq' or '/foo'. Empty outside command-line mode. */
  readonly commandLine: string;
  readonly lastSearch: { readonly pattern: string; readonly forward: boolean } | null;
  /** Remembered column for j/k movement across short lines. */
  readonly desiredCol: number;
  /** Set by :q, :wq, :x, ZZ. The game decides what "quit" means. */
  readonly quitRequested: boolean;
  /** Always equal to (changeSeq !== savedSeq). Kept as a field for cheap reads by the game. */
  readonly modified: boolean;
  /**
   * Number of the current buffer version. pushUndo sets it to max(changeSeq, savedSeq) + 1, so a new change
   * after undoing past a write can never look saved. undo/redo restore the snapshot's seq.
   */
  readonly changeSeq: number;
  /** changeSeq at the last write (:w, :wq, :x, ZZ). Starts at 0, like changeSeq. */
  readonly savedSeq: number;
  /** Set by :w, :wq, :x, ZZ. Levels with a 'quit' goal and mustSave check this. */
  readonly saved: boolean;
  /** Keys typed so far for a command not yet complete, e.g. ['2', 'd'] while waiting for a motion. */
  readonly pendingKeys: readonly Key[];
  /** Undo history. Each entry is the buffer + cursor before one change. Newest last. */
  readonly undoStack: readonly Snapshot[];
  readonly redoStack: readonly Snapshot[];
  /** Keys of the last completed change (including inserted text and <Esc>), replayed by '.'. */
  readonly lastChange: readonly Key[] | null;
  /** Keys of the change being recorded right now (e.g. during an insert), or null. */
  readonly changeInProgress: readonly Key[] | null;
  /** Last f/F/t/T search, repeated by ';' and ','. */
  readonly lastFind: { readonly command: 'f' | 'F' | 't' | 'T'; readonly char: string } | null;
}

export interface Snapshot {
  readonly lines: readonly string[];
  readonly cursor: Position;
  /** changeSeq of the buffer version this snapshot holds. */
  readonly seq: number;
  /**
   * The exact edits (see TextEdit) of the one change this entry stands for, in order.
   * Undo-stack entry: the edits that turned this snapshot's text into the next version,
   * filled in as the change goes on (an insert session adds one per key); undo reports
   * their inverses, last first. Redo-stack entry: the same edits, which redo reapplies to
   * the text undo returned to, and reports. Lets undo and redo name the exact cells.
   */
  readonly edits: readonly TextEdit[];
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

/**
 * One exact change to the buffer text. Offsets count characters in the text as
 * `lines.join('\n')`, so a line break is one character.
 * Applying it: text = text.slice(0, start) + inserted + text.slice(start + removed).
 */
export interface TextEdit {
  /** Offset in the text as it was just before this edit. */
  readonly start: number;
  /** Number of characters removed at `start`. */
  readonly removed: number;
  /** The characters put in their place (may be empty). */
  readonly inserted: string;
}

export interface StepResult {
  readonly state: EngineState;
  /** Commands completed by this key (usually 0 or 1). */
  readonly commands: readonly CommandRecord[];
  readonly error: EngineError | null;
  /**
   * Every change this key made to the text, in the order made; each edit's offsets refer to
   * the text after the edits before it. Empty when the text did not change.
   * GUARANTEE: applying `edits` in order to the old text gives exactly the new text.
   * Edits are exact: an edit covers only characters really removed or put in (`x` on "aaa"
   * at col 1 is { start: 1, removed: 1, inserted: '' }, never col 0 or 2). A replace (`r`,
   * `R`, `~`) is one edit per replaced run, at its own cells. Usually removed ===
   * inserted.length; not always, as in Neovim (`r` with a surrogate pair inserts 2 UTF-16
   * units for 1; `2r<CR>` removes 2 and inserts one '\n').
   * Undo and redo report the edits that turn the text back, at their real positions.
   */
  readonly edits: readonly TextEdit[];
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

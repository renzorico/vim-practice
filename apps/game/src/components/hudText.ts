import type { Mode } from '@escape/engine';
import type { Goal, LevelRun } from '@escape/curriculum';

/** Pure text helpers for the HUD and result screen. */

const MODE_LABELS: Readonly<Record<Mode, string>> = {
  normal: 'NORMAL',
  insert: 'INSERT',
  visual: 'VISUAL',
  'visual-line': 'V-LINE',
  'visual-block': 'V-BLOCK',
  'command-line': 'COMMAND',
  'operator-pending': 'OP-PENDING',
};

export const modeLabel = (mode: Mode): string => MODE_LABELS[mode];

export function describeGoal(goal: Goal): string {
  switch (goal.type) {
    case 'reach':
      return `Move the cursor to line ${goal.target.line + 1}, column ${goal.target.col + 1}`;
    case 'transform':
      return 'Edit the buffer to match the target text';
    case 'collect':
      return `Get "${goal.text}" into register ${goal.register}`;
    case 'quit':
      return goal.mustSave ? 'Save and quit' : 'Quit';
  }
}

/** Keystroke counter text, e.g. "3 / par 4". */
export const keystrokeText = (keystrokes: number, par: number): string => `${keystrokes} / par ${par}`;

export type ParStatus = 'under' | 'on' | 'over';

export function parStatus(keystrokes: number, par: number): ParStatus {
  if (keystrokes < par) return 'under';
  return keystrokes === par ? 'on' : 'over';
}

/** The hints revealed so far, in order. `revealed` is clamped to the available hints. */
export const visibleHints = (hints: readonly string[], revealed: number): readonly string[] =>
  hints.slice(0, Math.max(0, revealed));

export const hasMoreHints = (hints: readonly string[], revealed: number): boolean => revealed < hints.length;

export function failureMessage(reason: LevelRun['failureReason']): string {
  switch (reason) {
    case 'quit':
      return 'You left Vim before finishing the level.';
    case 'must-use':
      return 'Goals met, but you skipped a required technique.';
    case null:
      return 'The level is not finished.';
  }
}

export const starText = (stars: number): string => '*'.repeat(stars) + '.'.repeat(Math.max(0, 3 - stars));

import type { EngineState, Position } from '../types.js';
import type { MotionResult } from '../modules.js';

/** desiredCol value meaning "end of line", set by `$`. */
export const END_OF_LINE_COL = Number.MAX_SAFE_INTEGER;

const KEYWORD_CHAR = /[\p{L}\p{N}_]/u;

export function isKeywordChar(char: string | undefined): boolean {
  return char !== undefined && KEYWORD_CHAR.test(char);
}

export function isBlankChar(char: string | undefined): boolean {
  return char === ' ' || char === '\t';
}

export function isOperatorPending(state: EngineState): boolean {
  return state.mode === 'operator-pending';
}

/** Last valid normal-mode column of a line (0 for empty lines). */
export function lastCol(line: string): number {
  return Math.max(0, line.length - 1);
}

export function firstNonBlankCol(line: string): number {
  const index = line.search(/[^ \t]/);
  return index === -1 ? lastCol(line) : index;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.line === b.line && a.col === b.col;
}

/** Charwise motion result that also remembers the new column for j/k. */
export function charwise(target: Position, inclusive: boolean, patch?: MotionResult['statePatch']): MotionResult {
  return {
    target,
    linewise: false,
    inclusive,
    statePatch: { desiredCol: target.col, ...patch },
  };
}

export function linewise(target: Position): MotionResult {
  return { target, linewise: true, inclusive: false, statePatch: { desiredCol: target.col } };
}

export function lineAt(state: EngineState, index: number): string {
  return state.lines[index] ?? '';
}

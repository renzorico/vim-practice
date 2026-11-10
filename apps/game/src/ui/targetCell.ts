import { TAB_WIDTH } from '../components/bufferView.js';

/**
 * Display column (after tab expansion) of the cell that shows buffer column `col` on `line`.
 * A tab's block cell is its last one, matching the cursor in bufferView.ts.
 */
export function targetDisplayCol(line: string, col: number): number {
  let displayCol = 0;
  for (let index = 0; index < col && index < line.length; index += 1) {
    displayCol += line[index] === '\t' ? TAB_WIDTH - (displayCol % TAB_WIDTH) : 1;
  }
  if (line[col] === '\t') return displayCol + (TAB_WIDTH - (displayCol % TAB_WIDTH)) - 1;
  return displayCol;
}

/** Position of the first occurrence of `char` in `lines`, or null. */
export function findChar(lines: readonly string[], char: string): { readonly line: number; readonly col: number } | null {
  for (let line = 0; line < lines.length; line += 1) {
    const col = (lines[line] ?? '').indexOf(char);
    if (col >= 0) return { line, col };
  }
  return null;
}

import type { EngineState, Position } from '@escape/engine';

/** Pure view model for the buffer renderer: no DOM, so it can be unit-tested. */

export const TAB_WIDTH = 8;

export type CursorShape = 'block' | 'bar' | null;

export interface Cell {
  readonly text: string;
  readonly selected: boolean;
  readonly cursor: CursorShape;
}

export type BufferView = Pick<EngineState, 'lines' | 'cursor' | 'mode' | 'visualAnchor'>;

const isBefore = (a: Position, b: Position): boolean => a.line < b.line || (a.line === b.line && a.col < b.col);

/** True when the character at (line, col) is inside the active visual selection. */
export function isSelected(view: BufferView, line: number, col: number): boolean {
  const anchor = view.visualAnchor;
  if (anchor === null) return false;
  const { cursor, mode } = view;
  const firstLine = Math.min(anchor.line, cursor.line);
  const lastLine = Math.max(anchor.line, cursor.line);
  if (line < firstLine || line > lastLine) return false;

  if (mode === 'visual-line') return true;
  if (mode === 'visual-block') {
    return col >= Math.min(anchor.col, cursor.col) && col <= Math.max(anchor.col, cursor.col);
  }
  if (mode !== 'visual') return false;

  const start = isBefore(anchor, cursor) ? anchor : cursor;
  const end = isBefore(anchor, cursor) ? cursor : anchor;
  if (line === start.line && col < start.col) return false;
  if (line === end.line && col > end.col) return false;
  return true;
}

/** True when a charwise selection runs past the end of this line, so its line break is selected too. */
export function selectionIncludesLineBreak(view: BufferView, line: number): boolean {
  const anchor = view.visualAnchor;
  if (anchor === null || view.mode !== 'visual') return false;
  const firstLine = Math.min(anchor.line, view.cursor.line);
  const lastLine = Math.max(anchor.line, view.cursor.line);
  return line >= firstLine && line < lastLine;
}

export function cursorShape(mode: EngineState['mode']): CursorShape {
  if (mode === 'insert') return 'bar';
  if (mode === 'command-line') return null;
  return 'block';
}

/** Display width of the character at display column `displayCol` (tabs jump to the next tab stop). */
function charWidth(char: string, displayCol: number): number {
  return char === '\t' ? TAB_WIDTH - (displayCol % TAB_WIDTH) : 1;
}

/** Cells for one buffer line, with tabs expanded to spaces (width 8) and cursor/selection flags set. */
export function buildLineCells(view: BufferView, lineIndex: number): Cell[] {
  const line = view.lines[lineIndex] ?? '';
  const shape = cursorShape(view.mode);
  const hasCursor = view.cursor.line === lineIndex && shape !== null;
  const cells: Cell[] = [];
  let displayCol = 0;

  // Iterate UTF-16 code units so cell columns match the engine's column unit.
  for (let col = 0; col < line.length; col += 1) {
    const char = line[col] ?? '';
    const width = charWidth(char, displayCol);
    const selected = isSelected(view, lineIndex, col);
    const onCursor = hasCursor && view.cursor.col === col;
    for (let part = 0; part < width; part += 1) {
      const isFirst = part === 0;
      const isLast = part === width - 1;
      // Block cursor on a tab sits on its last cell, like Vim; a bar cursor sits before it.
      const cursor: CursorShape = onCursor && (shape === 'bar' ? isFirst : isLast) ? shape : null;
      cells.push({ text: char === '\t' ? ' ' : char, selected, cursor });
    }
    displayCol += width;
  }

  // Past the end of the line (empty line, insert at end, selected line break): a blank cell.
  const cursorPastEnd = hasCursor && view.cursor.col >= line.length;
  const selectedPastEnd = (line.length === 0 && isSelected(view, lineIndex, 0)) || selectionIncludesLineBreak(view, lineIndex);
  if (cursorPastEnd || selectedPastEnd) {
    cells.push({ text: ' ', selected: selectedPastEnd, cursor: cursorPastEnd ? shape : null });
  }
  return cells;
}

/** Width in characters of the line-number gutter. */
export function gutterWidth(lineCount: number): number {
  return Math.max(2, String(lineCount).length);
}

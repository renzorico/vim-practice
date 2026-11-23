import { applyTextEdits, offsetAt } from './edits.js';
import { pushUndo } from './operators/index.js';
import { writeRegister } from './operators/registers.js';
import { END_OF_LINE_COL } from './motions/text.js';
import type { EngineState, Key } from './types.js';

interface BlockBounds {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

function blockBounds(state: EngineState): BlockBounds {
  const anchor = state.visualAnchor ?? state.cursor;
  const column = state.desiredCol === END_OF_LINE_COL ? (state.lines[state.cursor.line]?.length ?? 0) : state.cursor.col;
  return { top: Math.min(anchor.line, state.cursor.line), bottom: Math.max(anchor.line, state.cursor.line),
    left: Math.min(anchor.col, column),
    right: state.desiredCol === END_OF_LINE_COL ? END_OF_LINE_COL : Math.max(anchor.col, column) };
}

/** Block edits use one undo transaction; every row edit names its actual cells. */
export function blockCommand(state: EngineState, command: string, replacement?: Key): EngineState {
  const { top, bottom, left, right } = blockBounds(state);
  const rows = state.lines.slice(top, bottom + 1);
  const width = right === END_OF_LINE_COL ? Math.max(1, ...rows.map(row => row.length - left)) : right - left + 1;
  let next: EngineState = { ...state, mode: 'normal', pendingKeys: [], visualAnchor: null };
  if (['d', 'x', 'c', 'y'].includes(command)) {
    // Neovim stores virtual spaces for empty interior rows, but leaves other short rows empty.
    const text = rows.map((row, index) => row === '' && index > 0 && top + index < bottom
      ? ' '.repeat(width + (right === END_OF_LINE_COL ? 1 : 0))
      : right === END_OF_LINE_COL && row.length > left ? row.slice(left).padEnd(width, ' ')
        : row.slice(left, right === END_OF_LINE_COL ? undefined : right + 1)).join('\n');
    next = writeRegister(next, null, text, false, command === 'y' ? 'yank' : 'delete', width);
  }
  const insert = ['I', 'A', 'c'].includes(command);
  const column = command === 'A' ? (right === END_OF_LINE_COL ? (next.lines[top]?.length ?? 0) : right + 1) : left;
  if (command !== 'y') next = pushUndo({ ...next, cursor: { line: top, col: column } });
  for (let line = bottom; line >= top; line -= 1) {
    const row = next.lines[line] ?? '';
    const end = Math.min(row.length, right === END_OF_LINE_COL ? row.length : right + 1);
    if (['d', 'x', 'c', 'r'].includes(command) && end > left) {
      next = applyTextEdits(next, [{ start: offsetAt(next.lines, { line, col: left }), removed: end - left,
        inserted: command === 'r' ? (replacement === '<CR>' ? '\n' : (replacement === '<Tab>' ? '\t' : replacement ?? '').repeat(end - left)) : '' }]);
    }
  }
  if (insert && column > (next.lines[top]?.length ?? 0)) {
    const length = next.lines[top]?.length ?? 0;
    next = applyTextEdits(next, [{ start: offsetAt(next.lines, { line: top, col: length }), removed: 0, inserted: ' '.repeat(column - length) }]);
  }
  const col = insert ? column : replacement === '<CR>' ? Math.max(0, left - 1) : Math.min(left, Math.max(0, (next.lines[top]?.length ?? 0) - 1));
  return { ...next, cursor: { line: top, col }, desiredCol: insert ? left : col, mode: insert ? 'insert' : 'normal',
    // During block insert the anchor carries the last row and insertion column.
    visualAnchor: insert ? { line: bottom, col: command === 'A' && right === END_OF_LINE_COL ? END_OF_LINE_COL : column } : null,
    changeInProgress: insert ? [...(state.changeInProgress ?? ['<C-v>']), command] : null };
}

export function finishBlockInsert(state: EngineState): EngineState {
  const anchor = state.visualAnchor;
  if (anchor === null) return state;
  const keys = state.changeInProgress ?? [];
  const index = keys.findIndex(key => ['I', 'A', 'c'].includes(key));
  const command = keys[index];
  let text = '';
  for (const key of keys.slice(index + 1)) {
    if (key === '<BS>') text = text.slice(0, -1);
    else if (key === '<Tab>') text += '\t';
    else if (key === '<CR>') return { ...state, visualAnchor: null }; // Vim cancels block replication after a line break.
    else if (Array.from(key).length === 1) text += key;
  }
  let next = state;
  for (let line = state.cursor.line + 1; line <= anchor.line; line += 1) {
    const row = next.lines[line] ?? '';
    const col = anchor.col === END_OF_LINE_COL ? row.length : anchor.col;
    if ((command === 'I' || command === 'c') && row.length < col) continue;
    const padding = ' '.repeat(Math.max(0, col - row.length));
    next = applyTextEdits(next, [{ start: offsetAt(next.lines, { line, col: Math.min(col, row.length) }), removed: 0, inserted: padding + text }]);
  }
  return { ...next, visualAnchor: null };
}

import type { EngineState, Position } from './types.js';

/** Shared starting state. Every module's tests build states from this, so they agree on defaults. */
export function createInitialState(lines: readonly string[], cursor: Position = { line: 0, col: 0 }): EngineState {
  return {
    lines: lines.length > 0 ? lines : [''],
    cursor,
    mode: 'normal',
    registers: {},
    marks: {},
    visualAnchor: null,
    commandLine: '',
    lastSearch: null,
    desiredCol: cursor.col,
    quitRequested: false,
    modified: false,
    changeSeq: 0,
    savedSeq: 0,
    saved: false,
    pendingKeys: [],
    undoStack: [],
    redoStack: [],
    lastChange: null,
    changeInProgress: null,
    lastFind: null,
  };
}

import { applyTextEdits, offsetAt } from '../edits.js';
import type { CommandLineOutcome, ModeDeps } from '../modules.js';
import type { EngineState, Key, Position } from '../types.js';

type InsertCommand = 'i' | 'a' | 'I' | 'A' | 'o' | 'O';
type Prompt = ':' | '/' | '?';

function firstNonBlank(line: string): number {
  const column = line.search(/\S/u);
  return column < 0 ? 0 : column;
}

/** Columns are UTF-16 offsets; moving left still crosses one whole character. */
function previousColumn(line: string, column: number): number {
  const previous = column - 1;
  if (previous > 0 && /[\uDC00-\uDFFF]/u.test(line[previous] ?? '')
    && /[\uD800-\uDBFF]/u.test(line[previous - 1] ?? '')) {
    return previous - 1;
  }
  return Math.max(0, previous);
}

function moveCursor(state: EngineState, cursor: Position): EngineState {
  return { ...state, cursor, desiredCol: cursor.col };
}

export function enterInsert(state: EngineState, how: InsertCommand, deps: ModeDeps): EngineState {
  const { line, col } = state.cursor;
  const text = state.lines[line] ?? '';
  if (how === 'o' || how === 'O') {
    // Opening a line changes the buffer immediately; other insert entries do not.
    const before = deps.pushUndo(state);
    const insertionLine = how === 'o' ? line + 1 : line;
    // Open before the next row; at EOF the newline belongs after the current row.
    return moveCursor({ ...applyTextEdits(before, [{ start: insertionLine < state.lines.length ? offsetAt(state.lines, { line: insertionLine, col: 0 }) : state.lines.join('\n').length, removed: 0, inserted: '\n' }]), mode: 'insert', modified: before.changeSeq !== before.savedSeq }, {
      line: insertionLine, col: 0,
    });
  }
  let column = col;
  if (how === 'a') {
    const character = text.codePointAt(col);
    column = Math.min(text.length, col + (character !== undefined && character > 0xFFFF ? 2 : 1));
  } else if (how === 'I') {
    // Unlike ^, I goes past all whitespace when the line contains only blanks.
    column = /\S/u.test(text) ? firstNonBlank(text) : text.length;
  } else if (how === 'A') {
    column = text.length;
  }
  return moveCursor({ ...state, mode: 'insert' }, { line, col: column });
}

export function exitToNormal(state: EngineState): EngineState {
  return { ...state, mode: 'normal', visualAnchor: null, commandLine: '' };
}

export function handleInsertKey(state: EngineState, key: Key): EngineState {
  const recorded: EngineState = state.changeInProgress === null ? state : {
    ...state, changeInProgress: [...state.changeInProgress, key],
  };
  const { line, col } = state.cursor;
  const text = state.lines[line] ?? '';
  if (key === '<Esc>') {
    return moveCursor(exitToNormal(recorded), { line, col: previousColumn(text, col) });
  }

  let cursor: Position;
  let start = offsetAt(state.lines, state.cursor);
  let removed = 0;
  let inserted = '';
  if (key === '<BS>') {
    if (col > 0) {
      const column = previousColumn(text, col);
      removed = col - column;
      start -= removed;
      cursor = { line, col: column };
    } else if (line > 0) {
      start -= 1;
      removed = 1;
      const previous = state.lines[line - 1] ?? '';
      cursor = { line: line - 1, col: previous.length };
    } else {
      return recorded;
    }
  } else if (key === '<CR>') {
    inserted = '\n';
    cursor = { line: line + 1, col: 0 };
  } else if (/^[^\u0000-\u001F\u007F-\u009F]$/u.test(key)) {
    inserted = key;
    cursor = { line, col: col + key.length };
  } else {
    return recorded;
  }
  // The caller starts the undo transaction before the first actual insert edit.
  return moveCursor({ ...applyTextEdits(recorded, [{ start, removed, inserted }]), modified: recorded.changeSeq !== recorded.savedSeq }, cursor);
}

export function enterVisual(state: EngineState, kind: 'visual' | 'visual-line'): EngineState {
  return { ...state, mode: kind, visualAnchor: { ...state.cursor } };
}

export function enterCommandLine(state: EngineState, prompt: Prompt): EngineState {
  // The contract includes the prompt in commandLine.
  return { ...state, mode: 'command-line', commandLine: prompt };
}

function executeEx(state: EngineState, input: string): CommandLineOutcome {
  const command = input.trim();
  const completed = { id: `:${command}`, kind: 'ex' as const };
  if (command === 'q' && state.modified) {
    return {
      state, completed,
      error: { code: 'not-allowed', message: 'E37: No write since last change (add ! to override)' },
    };
  }
  if (command === 'q' || command === 'q!') {
    return { state: { ...state, quitRequested: true }, completed, error: null };
  }
  if (command === 'w' || command === 'wq' || command === 'x') {
    const write = command !== 'x' || state.modified;
    return {
      state: {
        ...state,
        saved: write || state.saved,
        savedSeq: state.changeSeq,
        modified: false,
        quitRequested: command !== 'w' || state.quitRequested,
      },
      completed, error: null,
    };
  }
  if (/^\d+$/u.test(command) || command === '$' || command === '.' || command === '-1') {
    const address = command === '$' ? state.lines.length - 1
      : command === '.' ? state.cursor.line
        : command === '-1' ? state.cursor.line - 1 : Number(command) - 1;
    const line = Math.max(0, Math.min(state.lines.length - 1, address));
    const text = state.lines[line] ?? '';
    const col = Math.min(state.desiredCol, previousColumn(text, text.length));
    return {
      state: { ...state, cursor: { line, col } },
      completed, error: null,
    };
  }
  if (command === '') return { state, completed, error: null };
  return {
    state, completed,
    error: { code: 'unknown-command', message: `E492: Not an editor command: ${input}` },
  };
}

function executeSearch(state: EngineState, input: string, forward: boolean, deps: ModeDeps): CommandLineOutcome {
  const completed = { id: forward ? '/' : '?', kind: 'search' as const };
  const pattern = input || state.lastSearch?.pattern;
  if (!pattern) {
    return {
      state, completed,
      error: { code: 'no-previous-search', message: 'E35: No previous regular expression' },
    };
  }
  const searched = { ...state, lastSearch: { pattern, forward } };
  const target = deps.findPattern(state.lines, state.cursor, pattern, forward);
  if (target === null) {
    return {
      state: searched, completed,
      error: { code: 'pattern-not-found', message: `E486: Pattern not found: ${pattern}` },
    };
  }
  return { state: moveCursor(searched, target), completed, error: null };
}

export function handleCommandLineKey(state: EngineState, key: Key, deps: ModeDeps): CommandLineOutcome {
  if (key === '<Esc>') return { state: exitToNormal(state), completed: null, error: null };
  if (key === '<BS>') {
    return {
      state: state.commandLine.length <= 1 ? exitToNormal(state) : {
        ...state, commandLine: state.commandLine.slice(0, previousColumn(state.commandLine, state.commandLine.length)),
      },
      completed: null, error: null,
    };
  }
  if (key === '<CR>') {
    const normal = exitToNormal(state);
    const prompt = state.commandLine[0];
    const input = state.commandLine.slice(1);
    return prompt === '/' || prompt === '?'
      ? executeSearch(normal, input, prompt === '/', deps)
      : executeEx(normal, input);
  }
  const next = /^[^\u0000-\u001F\u007F-\u009F]$/u.test(key)
    ? { ...state, commandLine: state.commandLine + key } : state;
  return { state: next, completed: null, error: null };
}

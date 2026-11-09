import { describe, expect, it, vi } from 'vitest';
import type { CommandLineOutcome, ModeDeps } from '../modules.js';
import { createInitialState } from '../state.js';
import type { EngineState, Key, Position } from '../types.js';
import {
  enterCommandLine, enterInsert, enterVisual, exitToNormal,
  handleCommandLineKey, handleInsertKey,
} from './index.js';

function dependencies(target: Position | null = null): ModeDeps {
  return {
    findPattern: vi.fn(() => target),
    pushUndo: vi.fn((state: EngineState): EngineState => ({
      ...state,
      undoStack: [...state.undoStack, { lines: state.lines, cursor: state.cursor }],
      redoStack: [],
    })),
  };
}

function insertState(lines: readonly string[], cursor: Position = { line: 0, col: 0 }): EngineState {
  return { ...createInitialState(lines, cursor), mode: 'insert' };
}

function execute(
  state: EngineState, command: string, deps: ModeDeps = dependencies(),
  prompt: ':' | '/' | '?' = ':',
): CommandLineOutcome {
  let typing = enterCommandLine(state, prompt);
  for (const key of command) typing = handleCommandLineKey(typing, key, deps).state;
  return handleCommandLineKey(typing, '<CR>', deps);
}

describe('enterInsert', () => {
  it.each([
    ['i', 'abcd', 2, 2], ['a', 'abcd', 2, 3], ['a', 'abcd', 3, 4],
    ['a', '', 0, 0], ['i', '', 0, 0], ['I', '  abc', 4, 2],
    ['I', '\t abc', 3, 2], ['I', '   ', 0, 3], ['I', '', 0, 0],
    ['A', 'abc', 0, 3], ['A', '', 0, 0], ['a', '😀a', 0, 2],
  ] as const)('%s on %j at %i enters at %i', (how, text, col, expected) => {
    const state = createInitialState([text], { line: 0, col });
    const deps = dependencies();
    const result = enterInsert(state, how, deps);
    expect(result).toMatchObject({ mode: 'insert', cursor: { line: 0, col: expected }, desiredCol: expected });
    expect(result.lines).toEqual([text]);
    expect(result.modified).toBe(false);
    expect(deps.pushUndo).toHaveBeenCalledTimes(1);
    expect(deps.pushUndo).toHaveBeenCalledWith(state);
    expect(result.undoStack).toEqual([{ lines: [text], cursor: state.cursor }]);
  });

  it.each([
    ['o', 0, ['one', '', 'two'], 1], ['o', 1, ['one', 'two', ''], 2],
    ['O', 0, ['', 'one', 'two'], 0], ['O', 1, ['one', '', 'two'], 1],
  ] as const)('%s opens an empty line at row %i', (how, line, expected, target) => {
    const state = createInitialState(['one', 'two'], { line, col: 1 });
    const deps = dependencies();
    const result = enterInsert(state, how, deps);
    expect(result.lines).toEqual(expected);
    expect(result).toMatchObject({ cursor: { line: target, col: 0 }, desiredCol: 0, mode: 'insert', modified: true });
    expect(deps.pushUndo).toHaveBeenCalledTimes(1);
    expect(deps.pushUndo).toHaveBeenCalledWith(state);
    expect(result.undoStack).toEqual([{ lines: ['one', 'two'], cursor: state.cursor }]);
    expect(state.lines).toEqual(['one', 'two']);
  });

  it('opens a line in an empty buffer and preserves dependency state', () => {
    const state = { ...createInitialState([]), redoStack: [{ lines: ['old'], cursor: { line: 0, col: 0 } }] };
    const result = enterInsert(state, 'o', dependencies());
    expect(result.lines).toEqual(['', '']);
    expect(result.redoStack).toEqual([]);
    expect(state.redoStack).toHaveLength(1);
  });
});

describe('handleInsertKey', () => {
  it.each([
    ['abc', 0, 'x', 'xabc', 1], ['abc', 1, 'x', 'axbc', 2],
    ['abc', 3, '!', 'abc!', 4], ['', 0, ' ', ' ', 1],
    ['ab', 1, 'é', 'aéb', 2], ['ab', 1, '😀', 'a😀b', 3],
    ['', 0, '<', '<', 1],
  ] as const)('inserts %j at column %i using %j', (text, col, key, expected, target) => {
    const state = insertState([text], { line: 0, col });
    const result = handleInsertKey(state, key);
    expect(result.lines).toEqual([expected]);
    expect(result).toMatchObject({ cursor: { line: 0, col: target }, desiredCol: target, mode: 'insert', modified: true });
    expect(state.lines).toEqual([text]);
  });

  it.each([
    ['abc', 1, 'bc', 0], ['abc', 2, 'ac', 1], ['abc', 3, 'ab', 2],
    ['😀a', 2, 'a', 0],
  ] as const)('backspace in %j at %i', (text, col, expected, target) => {
    const result = handleInsertKey(insertState([text], { line: 0, col }), '<BS>');
    expect(result.lines).toEqual([expected]);
    expect(result.cursor).toEqual({ line: 0, col: target });
    expect(result.modified).toBe(true);
  });

  it.each([
    [['abc', 'def'], ['abcdef'], 3], [['', 'abc'], ['abc'], 0],
    [['abc', ''], ['abc'], 3], [['', ''], [''], 0],
  ] as const)('backspace joins %j', (lines, expected, col) => {
    const result = handleInsertKey(insertState(lines, { line: 1, col: 0 }), '<BS>');
    expect(result.lines).toEqual(expected);
    expect(result.cursor).toEqual({ line: 0, col });
    expect(result.modified).toBe(true);
  });

  it('backspace at the buffer start is a no-op', () => {
    const state = insertState(['abc']);
    expect(handleInsertKey(state, '<BS>')).toBe(state);
  });

  it.each([
    ['abc', 0, ['', 'abc']], ['abc', 1, ['a', 'bc']],
    ['abc', 3, ['abc', '']], ['', 0, ['', '']],
  ] as const)('enter splits %j at %i', (text, col, expected) => {
    const result = handleInsertKey(insertState([text], { line: 0, col }), '<CR>');
    expect(result.lines).toEqual(expected);
    expect(result).toMatchObject({ cursor: { line: 1, col: 0 }, desiredCol: 0, modified: true });
  });

  it.each([
    ['abc', 0, 0], ['abc', 1, 0], ['abc', 3, 2], ['', 0, 0], ['😀a', 2, 0],
  ] as const)('escape in %j at %i lands at %i', (text, col, expected) => {
    const result = handleInsertKey(insertState([text], { line: 0, col }), '<Esc>');
    expect(result).toMatchObject({ mode: 'normal', cursor: { line: 0, col: expected }, modified: false });
    expect(result.lines).toEqual([text]);
  });

  it.each(['<Left>', '<C-r>', '\n', '\t', 'ab', ''])('ignores unsupported key %j', (key) => {
    const state = insertState(['abc']);
    expect(handleInsertKey(state, key)).toBe(state);
  });

  it.each(['a', '<BS>', '<CR>', '<Esc>', '<Left>'])('records key %s when recording is active', (key) => {
    const state = { ...insertState(['abc']), changeInProgress: ['i'] };
    const result = handleInsertKey(state, key);
    expect(result.changeInProgress).toEqual(['i', key]);
    expect(state.changeInProgress).toEqual(['i']);
  });

  it('keeps recording null and leaves undo and lastChange to the caller', () => {
    const state = { ...insertState(['abc']), lastChange: ['x'] };
    const result = handleInsertKey(state, 'z');
    expect(result.changeInProgress).toBeNull();
    expect(result.undoStack).toBe(state.undoStack);
    expect(result.lastChange).toBe(state.lastChange);
  });
});

describe('mode transitions and command-line editing', () => {
  it.each(['visual', 'visual-line'] as const)('enters %s at the cursor', (kind) => {
    const state = createInitialState(['abc'], { line: 0, col: 2 });
    expect(enterVisual(state, kind)).toMatchObject({ mode: kind, visualAnchor: state.cursor });
    expect(state.visualAnchor).toBeNull();
  });

  it('exit clears the command line and visual anchor', () => {
    const state: EngineState = { ...createInitialState(['abc']), mode: 'visual', visualAnchor: { line: 0, col: 0 }, commandLine: ':w' };
    expect(exitToNormal(state)).toMatchObject({ mode: 'normal', visualAnchor: null, commandLine: '' });
    expect(state.mode).toBe('visual');
  });

  it.each([':', '/', '?'] as const)('stores prompt %s and replaces old input', (prompt) => {
    const state = { ...createInitialState(['abc']), commandLine: ':old' };
    const next = enterCommandLine(state, prompt);
    expect(next).toMatchObject({ mode: 'command-line', commandLine: prompt });
    expect(next.cursor).toBe(state.cursor);
  });

  it('types characters and backspaces without completing a command', () => {
    const deps = dependencies();
    let state = enterCommandLine(createInitialState(['abc']), ':');
    for (const key of ['a', ' ', '😀']) {
      const result = handleCommandLineKey(state, key, deps);
      expect(result).toMatchObject({ completed: null, error: null });
      state = result.state;
    }
    expect(state.commandLine).toBe(':a 😀');
    const result = handleCommandLineKey(state, '<BS>', deps);
    expect(result.state.commandLine).toBe(':a ');
    expect(result.state.mode).toBe('command-line');
    expect(deps.findPattern).not.toHaveBeenCalled();
  });

  it.each([':', '/', '?'] as const)('backspace on empty %s cancels', (prompt) => {
    const result = handleCommandLineKey(enterCommandLine(createInitialState(['']), prompt), '<BS>', dependencies());
    expect(result).toMatchObject({ state: { mode: 'normal', commandLine: '' }, completed: null, error: null });
  });

  it('escape cancels without executing', () => {
    const state = { ...enterCommandLine(createInitialState(['']), ':'), commandLine: ':q!' };
    const result = handleCommandLineKey(state, '<Esc>', dependencies());
    expect(result).toMatchObject({ state: { mode: 'normal', commandLine: '', quitRequested: false }, completed: null, error: null });
  });

  it.each(['<Left>', '<C-r>', '\n', '\t', 'ab'])('ignores unsupported command-line key %j', (key) => {
    const state = enterCommandLine(createInitialState(['']), ':');
    expect(handleCommandLineKey(state, key, dependencies()).state).toBe(state);
  });
});

describe('ex commands', () => {
  it('q quits an unmodified buffer', () => {
    expect(execute(createInitialState(['abc']), 'q')).toMatchObject({
      state: { quitRequested: true, saved: false, modified: false, mode: 'normal', commandLine: '' },
      completed: { id: ':q', kind: 'ex' }, error: null,
    });
  });

  it('q reports E37 on modified text', () => {
    const state = { ...createInitialState(['abc']), modified: true };
    expect(execute(state, 'q')).toMatchObject({
      state: { quitRequested: false, modified: true, mode: 'normal', commandLine: '' },
      error: { code: 'not-allowed', message: 'E37: No write since last change (add ! to override)' },
    });
    expect(state.quitRequested).toBe(false);
  });

  it('q! quits without saving modified text', () => {
    expect(execute({ ...createInitialState(['abc']), modified: true }, 'q!')).toMatchObject({
      state: { quitRequested: true, saved: false, modified: true }, error: null,
    });
  });

  it.each(['w', 'wq', 'x'] as const)('%s writes modified text', (command) => {
    const state = { ...createInitialState(['abc']), modified: true };
    expect(execute(state, command)).toMatchObject({
      state: { saved: true, modified: false, quitRequested: command !== 'w' },
      completed: { id: `:${command}`, kind: 'ex' }, error: null,
    });
  });

  it.each(['w', 'wq'] as const)('%s writes even when unmodified', (command) => {
    expect(execute(createInitialState(['abc']), command).state.saved).toBe(true);
  });

  it.each([false, true])('x without changes preserves saved=%s', (saved) => {
    expect(execute({ ...createInitialState(['abc']), saved }, 'x')).toMatchObject({
      state: { quitRequested: true, saved, modified: false }, error: null,
    });
  });

  it.each([
    ['1', 0, 2], ['2', 1, 0], ['3', 2, 1], ['0', 0, 2],
    ['99', 3, 0], ['0003', 2, 1], ['9'.repeat(400), 3, 0],
  ])(':%s goes to line %i column %i', (command, line, col) => {
    const state = createInitialState(['  first', '   ', '\tlast', ''], { line: 1, col: 2 });
    const result = execute(state, String(command));
    expect(result.state.cursor).toEqual({ line, col });
    expect(result.state.desiredCol).toBe(col);
    expect(result.error).toBeNull();
  });

  it.each(['bogus', '  bogus  ', 'wibble', '-1'])('reports Vim E492 for %j', (command) => {
    expect(execute(createInitialState(['abc']), command)).toMatchObject({
      state: { quitRequested: false, mode: 'normal', commandLine: '' },
      error: { code: 'unknown-command', message: `E492: Not an editor command: ${command}` },
    });
  });

  it('accepts whitespace around a known command', () => {
    expect(execute(createInitialState(['abc']), '  q!  ')).toMatchObject({ state: { quitRequested: true }, error: null });
  });

  it('empty ex command returns to normal without changing the buffer', () => {
    const state = createInitialState(['abc']);
    expect(execute(state, '')).toMatchObject({ state, completed: { id: ':', kind: 'ex' }, error: null });
  });
});

describe('search commands', () => {
  it.each(['/', '?'] as const)('%s delegates from the cursor and records direction', (prompt) => {
    const state = createInitialState(['abc', 'abc'], { line: 0, col: 1 });
    const target = { line: 1, col: 0 };
    const deps = dependencies(target);
    const result = execute(state, 'abc', deps, prompt);
    expect(deps.findPattern).toHaveBeenCalledTimes(1);
    expect(deps.findPattern).toHaveBeenCalledWith(state.lines, state.cursor, 'abc', prompt === '/');
    expect(result).toMatchObject({
      state: { cursor: target, desiredCol: 0, lastSearch: { pattern: 'abc', forward: prompt === '/' }, mode: 'normal', commandLine: '' },
      completed: { id: prompt, kind: 'search' }, error: null,
    });
  });

  it.each(['/', '?'] as const)('empty %s reuses the pattern with the new direction', (prompt) => {
    const state = { ...createInitialState(['abc']), lastSearch: { pattern: 'abc', forward: prompt === '?' } };
    const deps = dependencies({ line: 0, col: 0 });
    const result = execute(state, '', deps, prompt);
    expect(deps.findPattern).toHaveBeenCalledTimes(1);
    expect(deps.findPattern).toHaveBeenCalledWith(state.lines, state.cursor, 'abc', prompt === '/');
    expect(result.state.lastSearch).toEqual({ pattern: 'abc', forward: prompt === '/' });
  });

  it.each(['/', '?'] as const)('empty %s without history reports E35', (prompt) => {
    const deps = dependencies();
    const result = execute(createInitialState(['abc']), '', deps, prompt);
    expect(result.error).toEqual({ code: 'no-previous-search', message: 'E35: No previous regular expression' });
    expect(deps.findPattern).not.toHaveBeenCalled();
    expect(result.state.lastSearch).toBeNull();
  });

  it.each(['/', '?'] as const)('failed %s preserves the cursor and remembers the pattern', (prompt) => {
    const state = createInitialState(['abc'], { line: 0, col: 1 });
    const result = execute(state, 'missing', dependencies(), prompt);
    expect(result).toMatchObject({
      state: { cursor: state.cursor, lastSearch: { pattern: 'missing', forward: prompt === '/' } },
      error: { code: 'pattern-not-found', message: 'E486: Pattern not found: missing' },
    });
  });

  it('preserves spaces in patterns', () => {
    const deps = dependencies({ line: 0, col: 0 });
    const state = createInitialState([' abc ']);
    execute(state, ' abc ', deps, '/');
    expect(deps.findPattern).toHaveBeenCalledWith(state.lines, state.cursor, ' abc ', true);
  });

  it('escape preserves the previous search', () => {
    const state = { ...createInitialState(['abc']), lastSearch: { pattern: 'old', forward: false } };
    const typing = { ...enterCommandLine(state, '/'), commandLine: '/new' };
    const result = handleCommandLineKey(typing, '<Esc>', dependencies());
    expect(result.state.lastSearch).toBe(state.lastSearch);
  });
});

describe('complete insert sessions', () => {
  it('opens, splits, rejoins and escapes as one undoable change', () => {
    const original = createInitialState(['abc'], { line: 0, col: 1 });
    const deps = dependencies();
    let state = enterInsert({ ...original, changeInProgress: ['o'] }, 'o', deps);
    const keys: readonly Key[] = ['x', '<CR>', 'y', '<BS>', '<BS>', 'z', '<Esc>'];
    for (const key of keys) state = handleInsertKey(state, key);
    expect(state.lines).toEqual(['abc', 'xz']);
    expect(state.cursor).toEqual({ line: 1, col: 1 });
    expect(state.mode).toBe('normal');
    expect(state.changeInProgress).toEqual(['o', ...keys]);
    expect(state.undoStack).toEqual([{ lines: original.lines, cursor: original.cursor }]);
    expect(deps.pushUndo).toHaveBeenCalledTimes(1);
  });

  it('does not mutate frozen input state or nested arrays', () => {
    const state = Object.freeze({
      ...createInitialState(Object.freeze(['abc']), Object.freeze({ line: 0, col: 1 })),
      changeInProgress: Object.freeze(['i']), undoStack: Object.freeze([]), redoStack: Object.freeze([]),
    });
    const inserted = enterInsert(state, 'i', dependencies());
    const edited = handleInsertKey(inserted, 'z');
    expect(edited.lines).toEqual(['azbc']);
    expect(state.lines).toEqual(['abc']);
    expect(state.changeInProgress).toEqual(['i']);
    expect(state.undoStack).toEqual([]);
  });
});

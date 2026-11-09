/**
 * Engine.step: turns one key into a new state by wiring the Phase 1 modules together.
 *
 * Normal-mode keys accumulate in state.pendingKeys until they form a complete command:
 *   ["x] [count] command
 *   ["x] [count] operator [count] (motion | same operator)
 * Each module stays ignorant of the others; this file is the only place that knows them all.
 */
import { enterCommandLine, enterInsert, enterVisual, exitToNormal, handleCommandLineKey, handleInsertKey } from './modes/index.js';
import { findPattern, motions, setMark } from './motions/index.js';
import { operators, pushUndo, simpleCommands } from './operators/index.js';
import { createInitialState } from './state.js';
import type { ModeDeps, MotionResult, Range } from './modules.js';
import type {
  CommandKind, CommandRecord, Engine, EngineError, EngineOptions, EngineState, Key, Position, StepResult,
} from './types.js';

const DEPS: ModeDeps = { findPattern, pushUndo };
const OPERATOR_KEYS = new Set(['d', 'c', 'y']);
const INSERT_KEYS = new Set(['i', 'a', 'I', 'A', 'o', 'O']);
/** Simple commands that change the buffer, so '.' can repeat them. */
const CHANGE_COMMANDS = new Set(['x', 'X', 'r', 'p', 'P', 'D', 'C', 'J']);
const MAX_COUNT = 99_999;

type Parsed =
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'command';
      readonly register: string | null;
      readonly count: number | null;
      readonly id: string;
      readonly arg: string | null;
      readonly operator: string | null;
      readonly operatorCount: number | null;
    };

const INCOMPLETE: Parsed = { kind: 'incomplete' };
const INVALID: Parsed = { kind: 'invalid' };

function readCount(keys: readonly Key[], start: number): { count: number | null; next: number } {
  let index = start;
  let digits = '';
  while (index < keys.length) {
    const key = keys[index] ?? '';
    const isDigit = /^[0-9]$/.test(key) && (digits !== '' || key !== '0');
    if (!isDigit) break;
    digits += key;
    index += 1;
  }
  return { count: digits === '' ? null : Math.min(Number(digits), MAX_COUNT), next: index };
}

/** Parses a motion id (+ arg) starting at `index`. */
function parseMotion(keys: readonly Key[], index: number): { id: string; arg: string | null } | 'incomplete' | 'invalid' {
  const first = keys[index];
  if (first === undefined) return 'incomplete';
  let id = first;
  let next = index + 1;
  if (first === 'g') {
    const second = keys[next];
    if (second === undefined) return 'incomplete';
    id = `g${second}`;
    next += 1;
  }
  const spec = motions[id];
  if (spec === undefined) return 'invalid';
  if (!spec.needsArg) return { id, arg: null };
  const arg = keys[next];
  return arg === undefined ? 'incomplete' : { id, arg };
}

export function parseNormal(keys: readonly Key[]): Parsed {
  let index = 0;
  let register: string | null = null;
  if (keys[0] === '"') {
    const name = keys[1];
    if (name === undefined) return INCOMPLETE;
    register = name;
    index = 2;
  }
  const { count, next } = readCount(keys, index);
  index = next;
  const key = keys[index];
  if (key === undefined) return INCOMPLETE;
  const base = { register, count, arg: null, operator: null, operatorCount: null } as const;

  if (OPERATOR_KEYS.has(key)) {
    const inner = readCount(keys, index + 1);
    const motionKey = keys[inner.next];
    if (motionKey === undefined) return INCOMPLETE;
    if (motionKey === key) return { kind: 'command', ...base, id: `${key}${key}`, operator: key, operatorCount: inner.count };
    const motion = parseMotion(keys, inner.next);
    if (motion === 'incomplete') return INCOMPLETE;
    if (motion === 'invalid') return INVALID;
    return { kind: 'command', ...base, id: motion.id, arg: motion.arg, operator: key, operatorCount: inner.count };
  }
  if (key === 'Z' || key === 'm') {
    const arg = keys[index + 1];
    if (arg === undefined) return INCOMPLETE;
    if (key === 'Z') return arg === 'Z' || arg === 'Q' ? { kind: 'command', ...base, id: `Z${arg}` } : INVALID;
    return { kind: 'command', ...base, id: 'm', arg };
  }
  const simple = simpleCommands[key];
  if (simple !== undefined) {
    if (!simple.needsArg) return { kind: 'command', ...base, id: key };
    const arg = keys[index + 1];
    return arg === undefined ? INCOMPLETE : { kind: 'command', ...base, id: key, arg };
  }
  if (INSERT_KEYS.has(key) || ['v', 'V', ':', '/', '?', '.', '<Esc>'].includes(key)) {
    return { kind: 'command', ...base, id: key };
  }
  const motion = parseMotion(keys, index);
  if (motion === 'incomplete') return INCOMPLETE;
  if (motion === 'invalid') return INVALID;
  return { kind: 'command', ...base, id: motion.id, arg: motion.arg };
}

function comparePositions(a: Position, b: Position): number {
  return a.line === b.line ? a.col - b.col : a.line - b.line;
}

function firstNonBlankCol(line: string): number {
  const match = /\S/.exec(line);
  return match === null ? 0 : match.index;
}

/** Builds an operator Range from a motion, applying Vim's :help exclusive-linewise rule. */
export function rangeFromMotion(state: EngineState, motion: MotionResult): Range {
  const forward = comparePositions(state.cursor, motion.target) <= 0;
  const start = forward ? state.cursor : motion.target;
  const end = forward ? motion.target : state.cursor;
  if (motion.linewise) return { start, end, linewise: true, inclusive: true };
  const exclusiveAtLineStart = !motion.inclusive && end.col === 0 && end.line > start.line;
  if (exclusiveAtLineStart && start.col <= firstNonBlankCol(state.lines[start.line] ?? '')) {
    return { start, end: { line: end.line - 1, col: 0 }, linewise: true, inclusive: true };
  }
  const emptyLine = (state.lines[start.line] ?? '') === '' && comparePositions(start, end) === 0;
  return { start, end, linewise: false, inclusive: emptyLine ? false : motion.inclusive };
}

function linewiseRange(state: EngineState, lineCount: number): Range | null {
  // Like Vim, a count past the end of the buffer covers the remaining lines.
  const lastLine = Math.min(state.cursor.line + lineCount - 1, state.lines.length - 1);
  return { start: { line: state.cursor.line, col: 0 }, end: { line: lastLine, col: 0 }, linewise: true, inclusive: true };
}

function visualRange(state: EngineState): Range {
  const anchor = state.visualAnchor ?? state.cursor;
  const forward = comparePositions(anchor, state.cursor) <= 0;
  const start = forward ? anchor : state.cursor;
  const end = forward ? state.cursor : anchor;
  return { start, end, linewise: state.mode === 'visual-line', inclusive: true };
}

function record(id: string, kind: CommandKind, keys: readonly Key[], count: number | null, register: string | null, motion: string | null): CommandRecord {
  return { id, kind, keys: [...keys], count, register, motion };
}

function result(state: EngineState, commands: readonly CommandRecord[] = [], error: EngineError | null = null): StepResult {
  return { state, commands, error };
}

function notAllowed(id: string): EngineError {
  return { code: 'not-allowed', message: `Command not available yet: ${id}` };
}

function isAllowed(id: string, options: EngineOptions | undefined): boolean {
  return options?.allowedCommands === undefined || options.allowedCommands.includes(id);
}

/** Finishes a change: either records it for '.' now, or starts recording an insert session. */
function finishChange(state: EngineState, keys: readonly Key[]): EngineState {
  return state.mode === 'insert'
    ? { ...state, changeInProgress: [...keys] }
    : { ...state, lastChange: [...keys], changeInProgress: null };
}

function runMotion(state: EngineState, id: string, count: number | null, arg: string | null): MotionResult | null {
  const spec = motions[id];
  return spec === undefined ? null : spec.fn(state, count ?? 1, count !== null, arg);
}

function applyMotionPatch(state: EngineState, motion: MotionResult): EngineState {
  return { ...state, ...motion.statePatch, cursor: motion.target };
}

function runOperator(
  state: EngineState, operator: string, id: string, count: number | null, arg: string | null, register: string | null,
): { state: EngineState; error: EngineError | null } | null {
  const fn = operators[operator as 'd' | 'c' | 'y'];
  let range: Range | null;
  let patched = state;
  if (id === `${operator}${operator}`) {
    range = linewiseRange(state, count ?? 1);
  } else {
    // cw on a non-blank behaves like ce (:help cw).
    const onWord = /\S/.test((state.lines[state.cursor.line] ?? '')[state.cursor.col] ?? '');
    const motionId = operator === 'c' && onWord && (id === 'w' || id === 'W') ? (id === 'w' ? 'e' : 'E') : id;
    const pending: EngineState = { ...state, mode: 'operator-pending' };
    const motion = runMotion(pending, motionId, count, arg);
    if (motion === null) return null;
    range = rangeFromMotion(state, motion);
    patched = { ...state, ...motion.statePatch };
  }
  if (range === null) return null;
  return fn(patched, range, register);
}

function stepNormal(state: EngineState, key: Key, options: EngineOptions | undefined): StepResult {
  const keys = [...state.pendingKeys, key];
  const parsed = parseNormal(keys);
  if (parsed.kind === 'incomplete') {
    const operatorPending = keys.some((k) => OPERATOR_KEYS.has(k));
    return result({ ...state, pendingKeys: keys, mode: operatorPending ? 'operator-pending' : 'normal' });
  }
  const clean: EngineState = { ...state, pendingKeys: [], mode: 'normal' };
  if (parsed.kind === 'invalid') {
    return result(clean, [], { code: 'unknown-command', message: `Unknown command: ${keys.join('')}` });
  }
  const { id, count, arg, register, operator, operatorCount } = parsed;
  const commandId = operator !== null && id !== `${operator}${operator}` ? operator : id;
  // ':' '/' '?' only open the command line; the completed command (':wq', '/') is checked in stepCommandLine.
  const opensCommandLine = id === ':' || id === '/' || id === '?';
  if (id !== '<Esc>' && !opensCommandLine && !isAllowed(commandId, options)) return result(clean, [], notAllowed(commandId));

  if (operator !== null) {
    const total = count === null && operatorCount === null ? null : Math.min((count ?? 1) * (operatorCount ?? 1), MAX_COUNT);
    const outcome = runOperator(clean, operator, id, total, arg, register);
    if (outcome === null) return result(clean);
    const next = operator === 'y' ? outcome.state : finishChange(outcome.state, keys);
    const motion = id === `${operator}${operator}` ? null : id;
    return result(next, [record(commandId, 'operator', keys, total, register, motion)], outcome.error);
  }
  if (id === '<Esc>') return result(clean);
  if (INSERT_KEYS.has(id)) {
    const before = id === 'o' || id === 'O' ? clean : pushUndo(clean);
    const inserted = enterInsert(before, id as 'i' | 'a' | 'I' | 'A' | 'o' | 'O', DEPS);
    return result({ ...inserted, changeInProgress: [...keys] }, [record(id, 'mode', keys, count, register, null)]);
  }
  if (id === 'v' || id === 'V') {
    return result(enterVisual(clean, id === 'v' ? 'visual' : 'visual-line'), [record(id, 'mode', keys, count, null, null)]);
  }
  if (id === ':' || id === '/' || id === '?') return result(enterCommandLine(clean, id));
  if (id === 'ZZ' || id === 'ZQ') return runEx(clean, id === 'ZZ' ? 'x' : 'q!', keys);
  if (id === 'm') {
    return result(setMark(clean, arg ?? ''), [record('m', 'mark', keys, null, null, null)]);
  }
  if (id === '.') return repeatLastChange(clean, keys, options);
  if (id === 'Y') {
    // Neovim default mapping: Y is y$, not yy.
    const outcome = runOperator(clean, 'y', '$', count, null, register);
    return result(outcome?.state ?? clean, [record('Y', 'operator', keys, count, register, '$')], outcome?.error ?? null);
  }
  const simple = simpleCommands[id];
  if (simple !== undefined) {
    const outcome = simple.fn(clean, count ?? 1, register, arg);
    const kind: CommandKind = id === 'u' || id === '<C-r>' ? 'undo' : id === 'Y' ? 'operator' : 'edit';
    const next = CHANGE_COMMANDS.has(id) && outcome.error === null ? finishChange(outcome.state, keys) : outcome.state;
    return result(next, [record(id, kind, keys, count, register, null)], outcome.error);
  }
  const motion = runMotion(clean, id, count, arg);
  if (motion === null) return result(clean);
  const kind: CommandKind = ['/', '?', 'n', 'N', '*', '#'].includes(id) ? 'search' : id === "'" || id === '`' ? 'mark' : 'motion';
  return result(applyMotionPatch(clean, motion), [record(id, kind, keys, count, null, null)]);
}

function runEx(state: EngineState, command: string, keys: readonly Key[]): StepResult {
  let current = enterCommandLine(state, ':');
  for (const char of command) current = handleCommandLineKey(current, char, DEPS).state;
  const outcome = handleCommandLineKey(current, '<CR>', DEPS);
  return result(outcome.state, [record(keys.join(''), 'ex', keys, null, null, null)], outcome.error);
}

function repeatLastChange(state: EngineState, keys: readonly Key[], options: EngineOptions | undefined): StepResult {
  const change = state.lastChange;
  if (change === null) return result(state);
  let current = state;
  let error: EngineError | null = null;
  for (const key of change) {
    const stepped = step(current, key, options);
    current = stepped.state;
    error = stepped.error ?? error;
  }
  return result({ ...current, lastChange: change }, [record('.', 'repeat', keys, null, null, null)], error);
}

/** Keys typed in this insert session, after the command that started it (e.g. "3iab<Esc>" -> ['a','b']). */
function insertedKeys(state: EngineState): { count: number; typed: readonly Key[] } {
  const change = state.changeInProgress ?? [];
  const { count, next } = readCount(change, change[0] === '"' ? 2 : 0);
  const command = change[next];
  if (command === undefined || !INSERT_KEYS.has(command)) return { count: 1, typed: [] };
  return { count: count ?? 1, typed: change.slice(next + 1) };
}

/** modes/ drops control characters, so a literal tab is inserted here. TODO(backlog): move into modes/. */
function insertTab(state: EngineState): EngineState {
  const { line, col } = state.cursor;
  const text = state.lines[line] ?? '';
  const lines = state.lines.map((value, index) => (index === line ? `${text.slice(0, col)}\t${text.slice(col)}` : value));
  const changeInProgress = state.changeInProgress === null ? null : [...state.changeInProgress, '<Tab>'];
  return { ...state, lines, cursor: { line, col: col + 1 }, desiredCol: col + 1, changeInProgress };
}

function stepInsert(state: EngineState, rawKey: Key): StepResult {
  if (rawKey === '<Tab>' || rawKey === '\t') return result(insertTab(state));
  const key = rawKey;
  let current = state;
  if (key === '<Esc>') {
    // A count on i/a/I/A/o/O repeats the typed text: 3iab<Esc> inserts "ababab".
    const { count, typed } = insertedKeys(state);
    for (let repeat = 1; repeat < count; repeat += 1) {
      for (const typedKey of typed) current = handleInsertKey({ ...current, changeInProgress: null }, typedKey);
    }
    current = { ...current, changeInProgress: state.changeInProgress };
  }
  const next = handleInsertKey(current, key);
  if (next.mode !== 'normal') return result(next);
  // Insert session ended: an insert that changed nothing must not leave an undo step behind.
  const snapshot = next.undoStack[next.undoStack.length - 1];
  const unchanged = snapshot !== undefined && snapshot.lines.length === next.lines.length
    && snapshot.lines.every((line, index) => line === next.lines[index]);
  const collapsed: EngineState = unchanged && snapshot !== undefined
    ? { ...next, undoStack: next.undoStack.slice(0, -1), changeSeq: snapshot.seq, modified: snapshot.seq !== next.savedSeq }
    : next;
  return result({ ...collapsed, lastChange: unchanged ? state.lastChange : collapsed.changeInProgress, changeInProgress: null });
}

function stepCommandLine(state: EngineState, key: Key, options: EngineOptions | undefined): StepResult {
  const outcome = handleCommandLineKey(state, key, DEPS);
  if (outcome.completed === null) return result(outcome.state, [], outcome.error);
  if (!isAllowed(outcome.completed.id, options)) return result(exitToNormal(state), [], notAllowed(outcome.completed.id));
  const prompt = state.commandLine.slice(0, 1);
  const commandRecord = record(outcome.completed.id, outcome.completed.kind, [...prompt, ...state.commandLine.slice(1), key], null, null, null);
  return result(outcome.state, [commandRecord], outcome.error);
}

function stepVisual(state: EngineState, key: Key, options: EngineOptions | undefined): StepResult {
  if (key === '<Esc>') return result({ ...exitToNormal(state), pendingKeys: [] });
  const operator = key === 'x' ? 'd' : key;
  if (state.pendingKeys.length === 0 && OPERATOR_KEYS.has(operator)) {
    if (!isAllowed(operator, options)) return result(state, [], notAllowed(operator));
    const range = visualRange(state);
    const base: EngineState = { ...state, mode: 'normal', visualAnchor: null };
    const outcome = operators[operator as 'd' | 'c' | 'y'](base, range, null);
    return result(outcome.state, [record(operator, 'operator', [key], null, null, state.mode)], outcome.error);
  }
  if (key === 'v' || key === 'V') {
    const target = key === 'v' ? 'visual' : 'visual-line';
    return result(state.mode === target ? exitToNormal(state) : { ...state, mode: target });
  }
  // Any other key is a motion that moves the cursor while the anchor stays put.
  const keys = [...state.pendingKeys, key];
  const { count, next } = readCount(keys, 0);
  const motion = parseMotion(keys, next);
  if (motion === 'incomplete') return result({ ...state, pendingKeys: keys });
  if (motion === 'invalid') return result({ ...state, pendingKeys: [] });
  const moved = runMotion({ ...state, pendingKeys: [] }, motion.id, count, motion.arg);
  const nextState = moved === null ? { ...state, pendingKeys: [] } : applyMotionPatch({ ...state, pendingKeys: [] }, moved);
  return result(nextState, moved === null ? [] : [record(motion.id, 'motion', keys, count, null, null)]);
}

export function step(state: EngineState, key: Key, options?: EngineOptions): StepResult {
  switch (state.mode) {
    case 'insert':
      return stepInsert(state, key);
    case 'command-line':
      return stepCommandLine(state, key, options);
    case 'visual':
    case 'visual-line':
    case 'visual-block':
      return stepVisual(state, key, options);
    default:
      return stepNormal(state, key, options);
  }
}

export function createEngine(): Engine {
  return { init: createInitialState, step };
}

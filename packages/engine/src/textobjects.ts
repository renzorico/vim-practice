import type { Range } from './modules.js';
import type { EngineState, Position } from './types.js';
import { offsetAt } from './edits.js';
import { isKeywordChar } from './motions/text.js';

const OBJECTS = new Set([..."wW\"'`()b)[]{}B<>tp"]);
export function isTextObject(id: string): boolean {
  return id.length === 2 && (id[0] === 'i' || id[0] === 'a') && OBJECTS.has(id[1] ?? '');
}

function positionAt(lines: readonly string[], offset: number): Position {
  let rest = offset;
  for (const [line, text] of lines.entries()) {
    if (rest <= text.length) return { line, col: rest };
    rest -= text.length + 1;
  }
  const line = lines.length - 1;
  return { line, col: lines[line]?.length ?? 0 };
}

/** Inclusive ends preserve newlines without the exclusive-motion column-zero rule. */
function region(lines: readonly string[], start: number, end: number): Range {
  return { start: positionAt(lines, start), end: positionAt(lines, end > start ? end - 1 : start),
    inclusive: end > start, linewise: false };
}

function wordRange(state: EngineState, around: boolean, big: boolean, count: number, extend = false): Range | null {
  const text = state.lines.join('\n');
  let start = offsetAt(state.lines, state.cursor);
  if (!text.length) return null;
  const category = (index: number): number => /\s/u.test(text[index] ?? '') ? 0
    : big || isKeywordChar(text[index]) ? 1 : 2;
  const initial = category(start);
  while (!extend && start > 0 && text[start - 1] !== '\n' && category(start - 1) === initial) start -= 1;
  let end = start;
  const run = (): void => {
    const kind = category(end);
    if (kind === 0) {
      while (end < text.length && category(end) === 0) end += 1;
    } else {
      while (end < text.length && category(end) === kind) end += 1;
    }
  };
  const emptyLine = (state.lines[state.cursor.line] ?? '') === '';
  if (emptyLine && !around && count === 1) return region(state.lines, start, start);
  run();
  if (initial === 0 && !around && count === 1) {
    const newline = text.indexOf('\n', start);
    if (newline >= 0) end = Math.min(end, newline);
  }
  if (around && initial === 0 && end < text.length) run();
  for (let repeat = 1; repeat < count; repeat += 1) {
    if (around) {
      if (end < text.length && category(end) === 0) run();
      if (end >= text.length) return null;
      run();
    } else {
      // A line break alone does not use up an iw count, unlike spaces between words.
      if (text[end] === '\n') {
        end += 1;
        while (end < text.length && /[ \t]/u.test(text[end] ?? '')) end += 1;
      }
      if (end < text.length) run();
    }
  }
  if (around && initial !== 0) {
    if (end < text.length && /[ \t]/u.test(text[end] ?? '')) {
      while (end < text.length && /[ \t]/u.test(text[end] ?? '')) end += 1;
    } else {
      while (start > 0 && /[ \t]/u.test(text[start - 1] ?? '')) start -= 1;
    }
  }
  return region(state.lines, start, Math.min(end, text.length));
}

function quoteRange(state: EngineState, quote: string, around: boolean, count: number): Range | null {
  const line = state.lines[state.cursor.line] ?? '';
  const positions: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== quote) continue;
    let backslashes = 0;
    for (let before = index - 1; before >= 0 && line[before] === '\\'; before -= 1) backslashes += 1;
    if (backslashes % 2 === 0) positions.push(index);
  }
  const onDelimiter = positions.indexOf(state.cursor.col);
  let index: number;
  if (onDelimiter >= 0) index = onDelimiter % 2 === 0 ? onDelimiter : onDelimiter - 1;
  else {
    const after = positions.findIndex(position => position > state.cursor.col);
    if (after < 0) return null;
    index = Math.max(0, after - 1);
  }
  const open = positions[index];
  const close = positions[index + 1];
  if (open === undefined || close === undefined) return null;
  let start = around || count > 1 ? open : open + 1;
  let end = around || count > 1 ? close + 1 : close;
  if (around) {
    if (/[ \t]/u.test(line[end] ?? '')) while (/[ \t]/u.test(line[end] ?? '')) end += 1;
    else while (start > 0 && /[ \t]/u.test(line[start - 1] ?? '')) start -= 1;
  }
  const base = offsetAt(state.lines, { line: state.cursor.line, col: 0 });
  return region(state.lines, base + start, base + end);
}

interface Pair { readonly open: number; readonly openEnd: number; readonly close: number; readonly end: number }
function enclosingPair(state: EngineState, object: string, count: number): Pair | null {
  const text = state.lines.join('\n');
  const cursor = offsetAt(state.lines, state.cursor);
  const pairs: Pair[] = [];
  if (object === 't') {
    const stack: { name: string; start: number; end: number }[] = [];
    for (const match of text.matchAll(/<\/?([\w:.-]+)\b[^>]*>/gu)) {
      const tag = match[0];
      const name = (match[1] ?? '').toLowerCase();
      if (tag.endsWith('/>')) continue;
      if (tag.startsWith('</')) {
        let index = stack.length - 1;
        while (index >= 0 && stack[index]?.name !== name) index -= 1;
        const open = stack[index];
        if (open !== undefined) {
          pairs.push({ open: open.start, openEnd: open.end, close: match.index, end: match.index + tag.length });
          stack.splice(index);
        }
      } else stack.push({ name, start: match.index, end: match.index + tag.length });
    }
  } else {
    const delimiters = '()b'.includes(object) ? '()' : '[]'.includes(object) ? '[]'
      : '{}B'.includes(object) ? '{}' : '<>';
    const stack: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      let backslashes = 0;
      for (let before = index - 1; before >= 0 && text[before] === '\\'; before -= 1) backslashes += 1;
      if (backslashes % 2 !== 0) continue;
      if (text[index] === delimiters[0]) stack.push(index);
      if (text[index] === delimiters[1]) {
        const open = stack.pop();
        if (open !== undefined) pairs.push({ open, openEnd: open + 1, close: index, end: index + 1 });
      }
    }
  }
  let enclosing = pairs.filter(pair => pair.open <= cursor && cursor < pair.end);
  if (enclosing.length === 0 && object !== 't') {
    const next = pairs.filter(pair => pair.open > cursor && positionAt(state.lines, pair.open).line === state.cursor.line)
      .sort((a, b) => a.open - b.open)[0];
    if (next !== undefined) enclosing = pairs.filter(pair => pair.open <= next.open && pair.end >= next.end);
  }
  return enclosing
    .sort((a, b) => (a.end - a.open) - (b.end - b.open))[count - 1] ?? null;
}

function paragraphRange(state: EngineState, around: boolean, count: number): Range | null {
  const blank = (line: number): boolean => (state.lines[line] ?? '') === '';
  let start = state.cursor.line;
  const initialBlank = blank(start);
  while (start > 0 && blank(start - 1) === initialBlank) start -= 1;
  let end = start;
  let trailingBlanks = false;
  for (let repeat = 0; repeat < count; repeat += 1) {
    if (end >= state.lines.length) return null;
    const kind = blank(end);
    while (end < state.lines.length && blank(end) === kind) end += 1;
    if (around && kind && end < state.lines.length) {
      while (end < state.lines.length && !blank(end)) end += 1;
      if (repeat + 1 < count) {
        while (end < state.lines.length && blank(end)) end += 1;
      }
    }
    if (around && !kind) {
      trailingBlanks = end < state.lines.length && blank(end);
      while (end < state.lines.length && blank(end)) end += 1;
    }
    if (end >= state.lines.length) {
      if (repeat + 1 < count) return null;
      break;
    }
  }
  if (around && end === state.lines.length && !initialBlank && !trailingBlanks) while (start > 0 && blank(start - 1)) start -= 1;
  return { start: { line: start, col: 0 }, end: { line: end - 1, col: 0 }, linewise: true, inclusive: true };
}

/** Resolve a text object independently of the operator, without changing state. */
export function textObjectRange(state: EngineState, id: string, count: number): Range | null {
  const around = id[0] === 'a';
  const object = id[1] ?? '';
  if (object === 'w' || object === 'W') return wordRange(state, around, object === 'W', count);
  if ('"\'`'.includes(object)) return quoteRange(state, object, around, count);
  if (object === 'p') return paragraphRange(state, around, count);
  const pair = enclosingPair(state, object, count);
  if (pair === null) return null;
  let start = around ? pair.open : pair.openEnd;
  let end = around ? pair.end : pair.close;
  if (!around && object !== 't') {
    const text = state.lines.join('\n');
    // Vim keeps the opening newline, and excludes indentation before a closing delimiter.
    if (text[start] === '\n') start += 1;
    const lineStart = text.lastIndexOf('\n', end - 1) + 1;
    if (lineStart >= start && /^[ \t]*$/u.test(text.slice(lineStart, end))) end = lineStart;
  }
  return region(state.lines, start, end);
}

/** Repeated Visual objects extend the existing selection rather than resetting its anchor. */
export function visualTextObjectRange(state: EngineState, id: string, count: number): Range | null {
  const anchor = state.visualAnchor ?? state.cursor;
  const anchorOffset = offsetAt(state.lines, anchor);
  const cursorOffset = offsetAt(state.lines, state.cursor);
  if (anchorOffset === cursorOffset) {
    if (state.mode === 'visual-line' && id[1] === 'p'
      && (state.lines[state.cursor.line] ?? '') !== ''
      && (state.lines[state.cursor.line + 1] ?? '') === '') return textObjectRange(state, id, count + 1);
    const range = textObjectRange(state, id, count);
    if (range === null) return null;
    if (!range.inclusive && id === 'it' && cursorOffset === offsetAt(state.lines, range.start)) return textObjectRange(state, 'at', count);
    if (!range.inclusive && id[0] === 'i' && '"\'`'.includes(id[1] ?? '')) {
      return quoteRange(state, id[1] ?? '', false, 2);
    }
    if (!range.inclusive && '()b[]{}B<>'.includes(id[1] ?? '')) return null;
    return range;
  }
  const object = id[1] ?? '';
  const text = state.lines.join('\n');
  const forward = cursorOffset > anchorOffset;
  if ('wW'.includes(object)) {
    let offset = Math.max(0, Math.min(text.length - 1, cursorOffset + (forward ? 1 : -1)));
    if (!forward && id[0] === 'a') {
      while (offset > 0 && /\s/u.test(text[offset] ?? '')) offset -= 1;
    }
    const extended = wordRange({ ...state, cursor: positionAt(state.lines, offset) }, id[0] === 'a', object === 'W', count, forward);
    if (extended === null) return null;
    return { ...extended, start: forward ? anchor : extended.start, end: forward ? extended.end : anchor };
  }
  if ('"\'`'.includes(object)) {
    if (id[0] === 'i') return { start: forward ? anchor : state.cursor, end: forward ? state.cursor : anchor, inclusive: true, linewise: false };
    const next = quoteRange({ ...state, cursor: positionAt(state.lines, cursorOffset + (forward ? 1 : -1)) }, object, true, count);
    if (next === null) return null;
    return { ...next, start: forward && anchorOffset < offsetAt(state.lines, next.start) ? anchor : next.start, end: forward ? next.end : anchor };
  }
  if (object === 'p') {
    const next = textObjectRange({ ...state, cursor: { line: Math.min(state.lines.length - 1, state.cursor.line + (forward ? 1 : -1)), col: 0 } }, id, count);
    return next === null ? null : { ...next, start: forward ? anchor : next.start, end: forward ? next.end : anchor };
  }
  const low = Math.min(anchorOffset, cursorOffset);
  const high = Math.max(anchorOffset, cursorOffset);
  for (let depth = count; depth <= text.length; depth += 1) {
    const next = textObjectRange(state, id, depth);
    if (next === null) return null;
    const start = offsetAt(state.lines, next.start);
    const end = offsetAt(state.lines, next.end);
    if (start <= low && end >= high && (start < low || end > high)) return next;
    if (object === 't' && id[0] === 'i') {
      const around = textObjectRange(state, 'at', depth);
      if (around !== null) return around;
    }
  }
  return null;
}

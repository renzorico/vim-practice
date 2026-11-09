import type { EngineState, Position } from '../types.js';
import type { FindPatternFn, MotionResult } from '../modules.js';
import { charwise, isBlankChar, isKeywordChar, lineAt } from './text.js';

const WORD_START = '\\<';
const WORD_END = '\\>';

interface Needle {
  readonly text: string;
  readonly wholeWord: boolean;
}

/** `\<word\>` (what `*` stores, like Vim) means whole-word match; anything else is a plain substring. */
function parsePattern(pattern: string): Needle {
  const isWrapped =
    pattern.length > WORD_START.length + WORD_END.length && pattern.startsWith(WORD_START) && pattern.endsWith(WORD_END);
  return isWrapped
    ? { text: pattern.slice(WORD_START.length, pattern.length - WORD_END.length), wholeWord: true }
    : { text: pattern, wholeWord: false };
}

function isWholeWordAt(line: string, index: number, length: number): boolean {
  return !isKeywordChar(line[index - 1]) && !isKeywordChar(line[index + length]);
}

function matchForward(line: string, needle: Needle, from: number): number {
  let index = line.indexOf(needle.text, from);
  while (index !== -1 && needle.wholeWord && !isWholeWordAt(line, index, needle.text.length)) {
    index = line.indexOf(needle.text, index + 1);
  }
  return index;
}

function matchBackward(line: string, needle: Needle, from: number): number {
  if (from < 0) return -1;
  let index = line.lastIndexOf(needle.text, from);
  while (index !== -1 && needle.wholeWord && !isWholeWordAt(line, index, needle.text.length)) {
    index = index === 0 ? -1 : line.lastIndexOf(needle.text, index - 1);
  }
  return index;
}

/** Plain-substring search with wrapscan. A match at `from` itself is only found after wrapping. */
export const findPattern: FindPatternFn = (lines, from, pattern, forward) => {
  if (pattern.length === 0 || lines.length === 0) return null;
  const needle = parsePattern(pattern);
  const total = lines.length;
  const textOf = (index: number): string => lines[index] ?? '';

  if (forward) {
    const first = matchForward(textOf(from.line), needle, from.col + 1);
    if (first !== -1) return { line: from.line, col: first };
    for (let offset = 1; offset <= total; offset += 1) {
      const lineIndex = (from.line + offset) % total;
      const found = matchForward(textOf(lineIndex), needle, 0);
      if (found !== -1) return { line: lineIndex, col: found };
    }
    return null;
  }

  const first = matchBackward(textOf(from.line), needle, from.col - 1);
  if (first !== -1) return { line: from.line, col: first };
  for (let offset = 1; offset <= total; offset += 1) {
    const lineIndex = (((from.line - offset) % total) + total) % total;
    const text = textOf(lineIndex);
    const found = matchBackward(text, needle, text.length);
    if (found !== -1) return { line: lineIndex, col: found };
  }
  return null;
};

/**
 * Repeats a search `count` times. Wrapping makes results cycle, so a huge count is reduced
 * modulo the cycle length instead of looping.
 */
function repeatSearch(
  lines: readonly string[],
  from: Position,
  count: number,
  pattern: string,
  forward: boolean,
): Position | null {
  const visited: Position[] = [];
  const seenAt = new Map<string, number>();
  let position = from;
  while (visited.length < count) {
    const next = findPattern(lines, position, pattern, forward);
    if (next === null) return null;
    const key = `${next.line}:${next.col}`;
    const cycleStart = seenAt.get(key);
    if (cycleStart !== undefined) {
      const cycleLength = visited.length - cycleStart;
      return visited[cycleStart + ((count - 1 - cycleStart) % cycleLength)] ?? null;
    }
    seenAt.set(key, visited.length);
    visited.push(next);
    position = next;
  }
  return visited[count - 1] ?? null;
}

/** n (sameDirection) and N (reversed): repeat the last search. */
export function repeatLastSearch(state: EngineState, count: number, sameDirection: boolean): MotionResult | null {
  if (state.lastSearch === null) return null;
  const forward = sameDirection ? state.lastSearch.forward : !state.lastSearch.forward;
  const target = repeatSearch(state.lines, state.cursor, count, state.lastSearch.pattern, forward);
  return target === null ? null : charwise(target, false);
}

interface WordUnderCursor {
  readonly text: string;
  readonly start: number;
  readonly isKeyword: boolean;
}

function keywordRunAround(line: string, probe: number): WordUnderCursor {
  let start = probe;
  while (start > 0 && isKeywordChar(line[start - 1])) start -= 1;
  let end = probe;
  while (end < line.length && isKeywordChar(line[end])) end += 1;
  return { text: line.slice(start, end), start, isKeyword: true };
}

function punctuationRunFrom(line: string, col: number): WordUnderCursor | null {
  let start = col;
  while (start < line.length && isBlankChar(line[start])) start += 1;
  if (start >= line.length) return null;
  while (start > 0 && !isBlankChar(line[start - 1]) && !isKeywordChar(line[start - 1])) start -= 1;
  let end = start;
  while (end < line.length && !isBlankChar(line[end]) && !isKeywordChar(line[end])) end += 1;
  return { text: line.slice(start, end), start, isKeyword: false };
}

/** Vim's rule: first keyword at or after the cursor, else the first non-blank run. */
function wordUnderCursor(line: string, col: number): WordUnderCursor | null {
  let probe = col;
  while (probe < line.length && !isKeywordChar(line[probe])) probe += 1;
  return probe < line.length ? keywordRunAround(line, probe) : punctuationRunFrom(line, col);
}

/** `*` (forward) and `#` (backward): search the word under the cursor, whole-word for keywords. */
export function searchWordUnderCursor(state: EngineState, count: number, forward: boolean): MotionResult | null {
  const word = wordUnderCursor(lineAt(state, state.cursor.line), state.cursor.col);
  if (word === null || word.text.length === 0) return null;
  const pattern = word.isKeyword ? `${WORD_START}${word.text}${WORD_END}` : word.text;
  const from = { line: state.cursor.line, col: word.start };
  const target = repeatSearch(state.lines, from, count, pattern, forward);
  return target === null ? null : charwise(target, false, { lastSearch: { pattern, forward } });
}

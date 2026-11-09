import type { Position } from '../types.js';

export function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? '';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** UTF-16 length (1 or 2) of the character starting at `col`; 0 past the end. */
export function charLengthAt(line: string, col: number): number {
  if (col >= line.length) {
    return 0;
  }
  const next = line.charCodeAt(col + 1);
  return isHighSurrogate(line.charCodeAt(col)) && isLowSurrogate(next) ? 2 : 1;
}

/** Column just after `count` characters starting at `col` (clamped to the line end). */
export function advanceChars(line: string, col: number, count: number): number {
  let index = col;
  for (let step = 0; step < count && index < line.length; step += 1) {
    index += charLengthAt(line, index);
  }
  return index;
}

/** Column `count` characters before `col` (clamped to 0); never lands inside a surrogate pair. */
export function retreatChars(line: string, col: number, count: number): number {
  let index = col;
  for (let step = 0; step < count && index > 0; step += 1) {
    index -= isLowSurrogate(line.charCodeAt(index - 1)) && index > 1 && isHighSurrogate(line.charCodeAt(index - 2)) ? 2 : 1;
  }
  return index;
}

/** Start column of the last character of a line (0 for an empty line): the highest normal-mode column. */
export function lastCol(line: string): number {
  return line.length === 0 ? 0 : retreatChars(line, line.length, 1);
}

export function firstNonBlankCol(line: string): number {
  const index = line.search(/[^ \t]/);
  return index === -1 ? lastCol(line) : index;
}

/** Text between two positions (end exclusive), lines joined with "\n". */
export function extractText(lines: readonly string[], start: Position, end: Position): string {
  if (start.line === end.line) {
    return lineAt(lines, start.line).slice(start.col, end.col);
  }
  const parts = [lineAt(lines, start.line).slice(start.col)];
  for (let index = start.line + 1; index < end.line; index += 1) {
    parts.push(lineAt(lines, index));
  }
  parts.push(lineAt(lines, end.line).slice(0, end.col));
  return parts.join('\n');
}

/** Lines with the text between two positions (end exclusive) removed. */
export function removeText(lines: readonly string[], start: Position, end: Position): string[] {
  const before = lineAt(lines, start.line).slice(0, start.col);
  const after = lineAt(lines, end.line).slice(end.col);
  return [...lines.slice(0, start.line), before + after, ...lines.slice(end.line + 1)];
}

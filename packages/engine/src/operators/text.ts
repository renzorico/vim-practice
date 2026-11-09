import type { Position } from '../types.js';

export function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? '';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Highest valid normal-mode column of a line (0 for an empty line). */
export function lastCol(line: string): number {
  return Math.max(0, line.length - 1);
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

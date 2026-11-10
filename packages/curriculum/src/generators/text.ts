import { int, pick, type Rng } from './rng.js';

/** Themed vocabulary: lowercase letters only, so capitals and X/K always stand out. */
export const VOCAB: readonly string[] = [
  'power', 'cable', 'signal', 'sector', 'memory', 'buffer', 'cache', 'node', 'relay', 'core', 'port', 'fuse',
  'clock', 'queue', 'stack', 'pipe', 'grid', 'tape', 'disk', 'byte', 'loop', 'wire', 'lamp', 'heap', 'trace',
  'boot', 'daemon', 'kernel', 'drive', 'timer',
];

/** Words of at most 4 letters, for compound tokens. */
export const SHORT: readonly string[] = VOCAB.filter((word) => word.length <= 4);

/** Words of at most 5 letters, for long single lines. */
export const COMPACT: readonly string[] = VOCAB.filter((word) => word.length <= 5);

export const randomWords = (rng: Rng, count: number, vocab: readonly string[] = VOCAB): string[] =>
  Array.from({ length: count }, () => pick(rng, vocab));

export const wordLine = (rng: Rng, minWords: number, maxWords: number, vocab: readonly string[] = VOCAB): string =>
  randomWords(rng, int(rng, minWords, maxWords), vocab).join(' ');

/** A line of exactly `width` characters: themed words, then dots. */
export function fillRow(rng: Rng, width: number): string {
  let row = '';
  for (;;) {
    const word = pick(rng, COMPACT);
    const next = row === '' ? word : `${row} ${word}`;
    if (next.length > width) break;
    row = next;
  }
  return row.padEnd(width, '.');
}

export function replaceAt(line: string, col: number, glyph: string): string {
  return `${line.slice(0, col)}${glyph}${line.slice(col + 1)}`;
}

/** Joins words per line and reports where each word starts. */
export function layoutWords(words: readonly (readonly string[])[]): { lines: string[]; starts: number[][] } {
  const lines = words.map((row) => row.join(' '));
  const starts = words.map((row) => {
    let col = 0;
    return row.map((word) => {
      const start = col;
      col += word.length + 1;
      return start;
    });
  });
  return { lines, starts };
}

/** Pads `core` with filler lines before and after so the buffer has at least `minLines` lines. */
export function frame(
  rng: Rng, core: readonly string[], minLines: number, filler: () => string,
): { lines: string[]; offset: number } {
  const extra = Math.max(0, minLines - core.length);
  const before = int(rng, 0, extra);
  const make = (count: number): string[] => Array.from({ length: count }, filler);
  return { lines: [...make(before), ...core, ...make(extra - before)], offset: before };
}

/** Start and end of a move of `distance` cells inside 0..size-1, in a random direction. */
export function span(rng: Rng, size: number, distance: number): { from: number; to: number } {
  if (distance > size - 1) throw new Error(`span: distance ${distance} does not fit in ${size}`);
  if (rng() < 0.5) {
    const from = int(rng, 0, size - 1 - distance);
    return { from, to: from + distance };
  }
  const from = int(rng, distance, size - 1);
  return { from, to: from - distance };
}

export const repeatKey = (key: string, times: number): string[] => Array.from({ length: times }, () => key);

export const typedKeys = (text: string): string[] => [...text];

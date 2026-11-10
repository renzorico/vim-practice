import type { Position } from '@escape/engine';
import type { Difficulty, RoomGenerator } from '../phase3.js';
import { makeGenerator, type RoomParts } from './build.js';
import { int, pick, type Rng } from './rng.js';
import { SHORT, VOCAB, frame, layoutWords, randomWords, repeatKey } from './text.js';

/** A hop room: jump between words (w b e) or WORDs (W B E) to reach a capitalised target. */
type HopKind = 'forward' | 'back' | 'end';

interface HopKeys {
  readonly forward: string;
  readonly back: string;
  readonly end: string;
}

interface HopStyle {
  readonly keys: HopKeys;
  readonly noun: string;
  /** Tokens per core line for each difficulty: [min, max]. */
  readonly perLine: Readonly<Record<Difficulty, readonly [number, number]>>;
  readonly makeToken: (rng: Rng) => string;
  readonly makeFiller: (rng: Rng) => string;
  readonly intros: readonly string[];
  readonly titles: readonly string[];
  readonly hints: (kind: HopKind, presses: number) => readonly string[];
}

const KEY_NAMES: Readonly<Record<HopKind, keyof HopKeys>> = { forward: 'forward', back: 'back', end: 'end' };

function chooseKind(rng: Rng, difficulty: Difficulty): HopKind {
  if (difficulty < 3) return 'forward';
  return rng() < 0.5 ? 'back' : 'end';
}

/** Presses needed: w and b walk one token per press; e needs one extra press to finish the first word. */
const pressesFor = (kind: HopKind, from: number, to: number): number =>
  kind === 'end' ? to - from + 1 : Math.abs(to - from);

function goalPosition(kind: HopKind, line: string, row: number, start: number): Position {
  if (kind !== 'end') return { line: row, col: start };
  const word = line.slice(start).split(' ')[0] ?? '';
  return { line: row, col: start + word.length - 1 };
}

function designHop(style: HopStyle, rng: Rng, difficulty: Difficulty): RoomParts {
  const kind = chooseKind(rng, difficulty);
  const coreLines = difficulty === 1 ? 1 : 2;
  const [minTokens, maxTokens] = style.perLine[difficulty];
  const tokens = Array.from({ length: coreLines }, () =>
    Array.from({ length: int(rng, minTokens, maxTokens) }, () => style.makeToken(rng)));
  const flat = tokens.flat();
  const lastIndex = flat.length - 1;
  const minReach = style.keys.forward === 'w' ? 3 : 2;

  let cursorIndex = 0;
  let targetIndex: number;
  if (kind === 'back') {
    cursorIndex = lastIndex;
    targetIndex = int(rng, 0, lastIndex - minReach);
  } else if (difficulty === 1) {
    targetIndex = int(rng, minReach, lastIndex);
  } else if (difficulty === 2) {
    targetIndex = (tokens[0]?.length ?? 0) + int(rng, 0, 2);
  } else {
    targetIndex = int(rng, minReach, lastIndex);
  }

  let counter = 0;
  const marked = tokens.map((row) => row.map((token) => (counter++ === targetIndex ? token.toUpperCase() : token)));
  const core = layoutWords(marked);
  const placed = frame(rng, core.lines, 3, () => style.makeFiller(rng));
  const locate = (index: number): { row: number; start: number } => {
    let remaining = index;
    for (const [row, starts] of core.starts.entries()) {
      const start = starts[remaining];
      if (start !== undefined) return { row: row + placed.offset, start };
      remaining -= starts.length;
    }
    throw new Error(`hop index ${index} out of range`);
  };
  const cursor = locate(cursorIndex);
  const target = locate(targetIndex);
  const targetLine = placed.lines[target.row] ?? '';
  const presses = pressesFor(kind, cursorIndex, targetIndex);
  const keyName = KEY_NAMES[kind];
  const goalWhere = kind === 'end' ? 'last' : 'first';

  return {
    type: 'reach',
    title: pick(rng, style.titles),
    intro: pick(rng, style.intros),
    goalText: `Put the cursor on the ${goalWhere} character of the ${style.noun} written in CAPITALS.`,
    startLines: placed.lines,
    startCursor: { line: cursor.row, col: cursor.start },
    goals: [{ type: 'reach', target: goalPosition(kind, targetLine, target.row, target.start) }],
    hints: style.hints(kind, presses),
    intendedSolution: repeatKey(style.keys[keyName], presses),
  };
}

const wordHints = (kind: HopKind, presses: number): readonly string[] => [
  'Walking with l takes dozens of keys. Jump a whole word at a time.',
  kind === 'back' ? 'b jumps back to the start of the previous word.'
    : kind === 'end' ? 'e jumps to the last letter of a word.' : 'w jumps to the start of the next word.',
  `Press ${kind === 'back' ? 'b' : kind === 'end' ? 'e' : 'w'} ${presses} times.`,
];

const wordStyle: HopStyle = {
  keys: { forward: 'w', back: 'b', end: 'e' },
  noun: 'word',
  perLine: { 1: [6, 8], 2: [5, 6], 3: [5, 6] },
  makeToken: (rng) => pick(rng, VOCAB),
  makeFiller: (rng) => randomWords(rng, int(rng, 4, 7)).join(' '),
  intros: [
    'ECHO drifts past, whispering the same word again and again. Follow it: hop word by word.',
    'The Operator\'s note: "You could press l forty times. Or jump by words and keep your sanity."',
    'A corrupted log line blocks the corridor. Hop to the word that GC marked in capitals.',
  ],
  titles: ['Word hop', 'Hop the log', 'Jump by words'],
  hints: wordHints,
};

/** Tokens like "cable-07.sig": one WORD, but w stops at every piece of punctuation. */
function makeCompoundToken(rng: Rng): string {
  const separators = ['-', '.', '_', ':', '/'];
  const sep = (): string => pick(rng, separators);
  const middle = rng() < 0.5 ? `${int(rng, 10, 99)}${sep()}` : '';
  return `${pick(rng, SHORT)}${sep()}${middle}${pick(rng, SHORT)}`;
}

const compoundFiller = (rng: Rng): string => Array.from({ length: int(rng, 3, 4) }, () => makeCompoundToken(rng)).join(' ');

const WORD_HINTS = (kind: HopKind, presses: number): readonly string[] => [
  'w stops at every dot and dash. A WORD ends only at a space.',
  kind === 'back' ? 'B jumps back to the start of the previous WORD.'
    : kind === 'end' ? 'E jumps to the last character of a WORD.' : 'W jumps to the start of the next WORD.',
  `Press ${kind === 'back' ? 'B' : kind === 'end' ? 'E' : 'W'} ${presses} times.`,
];

const bigWordStyle: HopStyle = {
  keys: { forward: 'W', back: 'B', end: 'E' },
  noun: 'WORD',
  perLine: { 1: [3, 4], 2: [3, 4], 3: [3, 4] },
  makeToken: makeCompoundToken,
  makeFiller: compoundFiller,
  intros: [
    'ECHO mutters a file path and loses it. Paths are full of dots and dashes: hop them whole.',
    'The Operator\'s note: "w trips on every dash. Capital W only stops at spaces."',
    'A tangle of cable-names fills the sector. Jump to the one GC marked in capitals.',
  ],
  titles: ['Long strides', 'Hop the tangle', 'Whole tokens'],
  hints: WORD_HINTS,
};

export const wordGenerator: RoomGenerator = makeGenerator('motion.word', (rng, difficulty) => designHop(wordStyle, rng, difficulty));
export const bigWordGenerator: RoomGenerator = makeGenerator('motion.WORD', (rng, difficulty) => designHop(bigWordStyle, rng, difficulty));

import type { Difficulty, RoomGenerator } from '../phase3.js';
import { makeGenerator, type RoomParts } from './build.js';
import { int, pick, type Rng } from './rng.js';
import { SHORT, VOCAB, frame, layoutWords, randomWords, repeatKey } from './text.js';

/**
 * A hop room: jump between words (w b e) or WORDs (W B E) to reach a capitalised target.
 * 'down' is the difficulty 3 two-step room: j to the next line (earlier skill), then hop along it.
 * Every target is at least 3 tokens away, and never in reach of a vertical shortcut.
 */
type HopKind = 'forward' | 'back' | 'end' | 'down';

const MIN_HOPS = 3;
const MAX_LINE_LENGTH = 58;

interface HopKeys {
  readonly forward: string;
  readonly back: string;
  readonly end: string;
}

interface HopStyle {
  readonly keys: HopKeys;
  readonly noun: string;
  /** Tokens per core line: [min, max]. */
  readonly perLine: readonly [number, number];
  readonly makeToken: (rng: Rng) => string;
  readonly makeFiller: (rng: Rng) => string;
  readonly intros: readonly string[];
  readonly titles: readonly string[];
  readonly hints: (kind: HopKind, presses: number) => readonly string[];
}

const MIN_BUFFER_LINES: Readonly<Record<Difficulty, number>> = { 1: 3, 2: 5, 3: 4 };

function chooseKind(rng: Rng, difficulty: Difficulty): HopKind {
  if (difficulty < 3) return 'forward';
  const roll = rng();
  return roll < 0.34 ? 'back' : roll < 0.67 ? 'end' : 'down';
}

/** A line of tokens that fits the 60-column limit once joined. */
function tokenLine(style: HopStyle, rng: Rng): string[] {
  for (;;) {
    const tokens = Array.from({ length: int(rng, ...style.perLine) }, () => style.makeToken(rng));
    if (tokens.join(' ').length <= MAX_LINE_LENGTH) return tokens;
  }
}

function designHop(style: HopStyle, rng: Rng, difficulty: Difficulty): RoomParts {
  const kind = chooseKind(rng, difficulty);
  const tokens = Array.from({ length: kind === 'down' ? 2 : 1 }, () => tokenLine(style, rng));
  const targetLine = kind === 'down' ? 1 : 0;
  const lineTokens = tokens[targetLine] ?? [];
  const last = lineTokens.length - 1;
  const cursorToken = kind === 'back' ? last : 0;
  const deepest = difficulty === 2 ? Math.max(MIN_HOPS, last - 2) : MIN_HOPS;
  const targetToken = kind === 'back' ? int(rng, 0, last - MIN_HOPS) : int(rng, deepest, last);

  const marked = tokens.map((row, rowIndex) => row.map((token, index) =>
    (rowIndex === targetLine && index === targetToken ? token.toUpperCase() : token)));
  const core = layoutWords(marked);
  const placed = frame(rng, core.lines, MIN_BUFFER_LINES[difficulty], () => style.makeFiller(rng));
  const targetRow = targetLine + placed.offset;
  const targetStart = core.starts[targetLine]?.[targetToken] ?? 0;
  const targetText = placed.lines[targetRow] ?? '';
  const targetWord = targetText.slice(targetStart).split(' ')[0] ?? '';
  const goalCol = kind === 'end' ? targetStart + targetWord.length - 1 : targetStart;

  const { forward, back, end } = style.keys;
  const presses = kind === 'back' ? last - targetToken : kind === 'end' ? targetToken + 1 : targetToken;
  const hopKey = kind === 'back' ? back : kind === 'end' ? end : forward;
  const intendedSolution = [...(kind === 'down' ? ['j'] : []), ...repeatKey(hopKey, presses)];

  return {
    type: 'reach',
    title: pick(rng, style.titles),
    intro: pick(rng, style.intros),
    goalText: `Put the cursor on the ${kind === 'end' ? 'last' : 'first'} character of the ${style.noun} written in CAPITALS.`,
    startLines: placed.lines,
    startCursor: { line: placed.offset, col: core.starts[0]?.[cursorToken] ?? 0 },
    goals: [{ type: 'reach', target: { line: targetRow, col: goalCol } }],
    hints: style.hints(kind, presses),
    intendedSolution,
  };
}

const wordHints = (kind: HopKind, presses: number): readonly string[] => [
  kind === 'down' ? 'The target is on the next line. Go down first, then hop along it.'
    : 'Walking with l takes dozens of keys. Jump a whole word at a time.',
  kind === 'back' ? 'b jumps back to the start of the previous word.'
    : kind === 'end' ? 'e jumps to the last letter of a word.' : 'w jumps to the start of the next word.',
  kind === 'down' ? `Press j, then w ${presses} times.` : `Press ${kind === 'back' ? 'b' : kind === 'end' ? 'e' : 'w'} ${presses} times.`,
];

const wordStyle: HopStyle = {
  keys: { forward: 'w', back: 'b', end: 'e' },
  noun: 'word',
  perLine: [6, 8],
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

const bigWordHints = (kind: HopKind, presses: number): readonly string[] => [
  kind === 'down' ? 'The target is on the next line. Go down first, then hop along it.'
    : 'w stops at every dot and dash. A WORD ends only at a space.',
  kind === 'back' ? 'B jumps back to the start of the previous WORD.'
    : kind === 'end' ? 'E jumps to the last character of a WORD.' : 'W jumps to the start of the next WORD.',
  kind === 'down' ? `Press j, then W ${presses} times.` : `Press ${kind === 'back' ? 'B' : kind === 'end' ? 'E' : 'W'} ${presses} times.`,
];

const bigWordStyle: HopStyle = {
  keys: { forward: 'W', back: 'B', end: 'E' },
  noun: 'WORD',
  perLine: [4, 5],
  makeToken: makeCompoundToken,
  makeFiller: compoundFiller,
  intros: [
    'ECHO mutters a file path and loses it. Paths are full of dots and dashes: hop them whole.',
    'The Operator\'s note: "w trips on every dash. Capital W only stops at spaces."',
    'A tangle of cable-names fills the sector. Jump to the one GC marked in capitals.',
  ],
  titles: ['Long strides', 'Hop the tangle', 'Whole tokens'],
  hints: bigWordHints,
};

export const wordGenerator: RoomGenerator = makeGenerator('motion.word', (rng, difficulty) => designHop(wordStyle, rng, difficulty));
export const bigWordGenerator: RoomGenerator = makeGenerator('motion.WORD', (rng, difficulty) => designHop(bigWordStyle, rng, difficulty));

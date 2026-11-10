import type { Difficulty, RoomGenerator } from '../phase3.js';
import { makeGenerator, type RoomParts } from './build.js';
import { int, pick, type Rng } from './rng.js';
import { COMPACT, fillRow, frame, repeatKey, replaceAt, span, wordLine } from './text.js';

interface GridSize {
  readonly rows: number;
  readonly width: number;
  readonly down: readonly [number, number];
  readonly across: readonly [number, number];
}

const HJKL_SIZE: Readonly<Record<Difficulty, GridSize>> = {
  1: { rows: 3, width: 24, down: [1, 2], across: [4, 8] },
  2: { rows: 5, width: 40, down: [2, 4], across: [12, 22] },
  3: { rows: 7, width: 56, down: [3, 6], across: [28, 44] },
};

const HJKL_INTROS: readonly string[] = [
  'You are a cursor, and right now you only know four moves. The Operator left an X: go and stand on it.',
  'ATLAS shows you a patch of memory. One cell is marked X. Walk there with h, j, k and l.',
  'ECHO hovers over a marked cell and repeats: "...the X... the X...". Reach it.',
];

export const hjklGenerator: RoomGenerator = makeGenerator('motion.hjkl', (rng, difficulty): RoomParts => {
  const size = HJKL_SIZE[difficulty];
  const rowMove = span(rng, size.rows, int(rng, ...size.down));
  const colMove = span(rng, size.width, int(rng, ...size.across));
  const lines = Array.from({ length: size.rows }, () => fillRow(rng, size.width));
  lines[rowMove.to] = replaceAt(lines[rowMove.to] ?? '', colMove.to, 'X');
  const vertical = rowMove.to > rowMove.from ? 'j' : 'k';
  const horizontal = colMove.to > colMove.from ? 'l' : 'h';
  const rowsToMove = Math.abs(rowMove.to - rowMove.from);
  const colsToMove = Math.abs(colMove.to - colMove.from);
  return {
    type: 'reach',
    title: pick(rng, ['Find the X', 'Walk the grid', 'First steps']),
    intro: pick(rng, HJKL_INTROS),
    goalText: 'Put the cursor on the X.',
    startLines: lines,
    startCursor: { line: rowMove.from, col: colMove.from },
    goals: [{ type: 'reach', target: { line: rowMove.to, col: colMove.to } }],
    hints: [
      'Find the X, then work out how many rows and columns away it is.',
      'h moves left, j down, k up, l right. One cell per key.',
      `Press ${vertical} ${rowsToMove} times, then ${horizontal} ${colsToMove} times.`,
    ],
    intendedSolution: [...repeatKey(vertical, rowsToMove), ...repeatKey(horizontal, colsToMove)],
  };
});

// ---------------------------------------------------------------------------
// motion.line: 0 ^ $
// ---------------------------------------------------------------------------

type LineVariant = 'end' | 'start' | 'indent';

/** Words joined until the line is at least `minLength` long (never more than 6 characters past it). */
function sentence(rng: Rng, minLength: number): string {
  let text = wordLine(rng, 1, 1);
  while (text.length < minLength) text = `${text} ${wordLine(rng, 1, 1)}`;
  return text;
}

const LINE_LENGTH: Readonly<Record<Difficulty, number>> = { 1: 38, 2: 38, 3: 44 };

const LINE_INTROS: Readonly<Record<LineVariant, readonly string[]>> = {
  end: [
    'ECHO is stuck at the end of the line, repeating itself. The Operator marked the spot with X: go there fast.',
    'A long log line scrolls off into the dark. The X sits at its far end. You could walk. You should not.',
  ],
  start: [
    'You drifted to the end of the log line. The X marks where it begins. The Operator never walked back by hand.',
    'GC is chewing the line from the right. Get back to the X at its start before it reaches you.',
  ],
  indent: [
    'This line is indented, and the K hides behind the blanks. Jump to the first real character, not column zero.',
    'The Operator indents everything. The K marks the first letter that counts. Land on it.',
  ],
};

const LINE_HINTS: Readonly<Record<LineVariant, readonly string[]>> = {
  end: ['Holding l works, but the line is long. There is one key for "the end".', '$ jumps to the last character of the line.', 'Press $.'],
  start: ['Holding h works, but the line is long. There is one key for "the start".', '0 jumps to the first column of the line.', 'Press 0.'],
  indent: [
    'Column zero is a blank here. You want the first visible character.',
    '^ jumps to the first character that is not a blank. 0 would stop on a space.',
    'Press ^.',
  ],
};

function lineVariant(rng: Rng, difficulty: Difficulty): LineVariant {
  if (difficulty === 2) return 'indent';
  return rng() < 0.5 ? 'end' : 'start';
}

/** Difficulty 3 moves to another line first: j then $ (cursor at start) or k then 0 (cursor at end). */
export const lineGenerator: RoomGenerator = makeGenerator('motion.line', (rng, difficulty): RoomParts => {
  const variant = lineVariant(rng, difficulty);
  const glyph = variant === 'indent' ? 'K' : 'X';
  const indent = ' '.repeat(int(rng, 6, 10));
  const minLength = LINE_LENGTH[difficulty] + (variant === 'indent' ? 0 : int(rng, 0, 6));
  const targetText = variant === 'end' ? `${sentence(rng, minLength)} ${glyph}`
    : variant === 'start' ? `${glyph} ${sentence(rng, minLength)}`
      : `${indent}${glyph} ${sentence(rng, minLength)}`;
  const rowCount = difficulty === 3 ? 4 : 3;
  const crossLines = difficulty === 3 ? int(rng, 1, 2) : 0;
  // The cursor starts at the start of its line when the target is a line end, and at the end of its line otherwise.
  const cursorAtEnd = variant !== 'end';
  const targetRow = cursorAtEnd ? int(rng, 0, rowCount - 1 - crossLines) : int(rng, crossLines, rowCount - 1);
  const cursorRow = cursorAtEnd ? targetRow + crossLines : targetRow - crossLines;
  const lines = Array.from({ length: rowCount }, (_, row) => (row === targetRow ? targetText : sentence(rng, minLength)));
  const cursorCol = cursorAtEnd ? (lines[cursorRow] ?? '').length - 1 : 0;
  const targetCol = variant === 'end' ? targetText.length - 1 : variant === 'start' ? 0 : indent.length;
  const key = variant === 'end' ? '$' : variant === 'start' ? '0' : '^';
  const where = variant === 'end' ? 'at the end of' : variant === 'start' ? 'at the start of' : 'on the first letter of';
  return {
    type: 'reach',
    title: pick(rng, ['End of the line', 'Straight to the edge', 'Line ends']),
    intro: pick(rng, LINE_INTROS[variant]),
    goalText: `Put the cursor on the ${glyph}, ${where} line ${targetRow + 1}.`,
    startLines: lines,
    startCursor: { line: cursorRow, col: cursorCol },
    goals: [{ type: 'reach', target: { line: targetRow, col: targetCol } }],
    hints: crossLines === 0 ? LINE_HINTS[variant] : [
      ...LINE_HINTS[variant].slice(0, 2),
      `Press ${cursorAtEnd ? 'k' : 'j'} ${crossLines} times to change line, then ${key}.`,
    ],
    intendedSolution: [...repeatKey(cursorAtEnd ? 'k' : 'j', crossLines), key],
  };
});

// ---------------------------------------------------------------------------
// motion.file: gg G
// ---------------------------------------------------------------------------

const FILE_LINES: Readonly<Record<Difficulty, readonly [number, number]>> = { 1: [6, 7], 2: [7, 8], 3: [8, 8] };

const MIN_FILE_DISTANCE = 5;

const FILE_INTROS: readonly string[] = [
  'The log is longer than the screen. The Operator marked one end with X. Do not scroll line by line.',
  'GC is erasing the file from the middle outwards. The X waits at the very top or the very bottom.',
  'A file with no end in sight. ECHO says: "...the last line... the first line...". Find the X.',
];

export const fileGenerator: RoomGenerator = makeGenerator('motion.file', (rng, difficulty): RoomParts => {
  const count = int(rng, ...FILE_LINES[difficulty]);
  const toBottom = rng() < 0.5;
  const targetRow = toBottom ? count - 1 : 0;
  const offset = difficulty === 3 ? int(rng, 2, 4) : 0;
  const prefix = offset === 0 ? '' : `${wordLine(rng, 1, 1).slice(0, offset - 1).padEnd(offset - 1, 'a')} `;
  const lines = Array.from({ length: count }, (_, row) =>
    (row === targetRow ? `${prefix}X ${wordLine(rng, 2, 3)}` : wordLine(rng, 2, 3)));
  // The cursor starts at least MIN_FILE_DISTANCE rows from the target, so walking with j or k is clearly slower.
  const cursorRow = difficulty === 1
    ? (toBottom ? 0 : count - 1)
    : toBottom ? int(rng, 0, count - 1 - MIN_FILE_DISTANCE) : int(rng, MIN_FILE_DISTANCE, count - 1);
  const jump = toBottom ? ['G'] : ['g', 'g'];
  return {
    type: 'reach',
    title: pick(rng, ['Top or bottom', 'End of the file', 'The long way round']),
    intro: pick(rng, FILE_INTROS),
    goalText: `Put the cursor on the X in the ${toBottom ? 'last' : 'first'} line of the file.`,
    startLines: lines,
    startCursor: { line: cursorRow, col: 0 },
    goals: [{ type: 'reach', target: { line: targetRow, col: offset } }],
    hints: [
      `The X is in the ${toBottom ? 'last' : 'first'} line. Pressing ${toBottom ? 'j' : 'k'} over and over is slow.`,
      toBottom ? 'G jumps to the last line of the file.' : 'gg jumps to the first line of the file.',
      offset === 0 ? `Press ${jump.join('')}.` : `Press ${jump.join('')}, then l ${offset} times to reach the X.`,
    ],
    intendedSolution: [...jump, ...repeatKey('l', offset)],
  };
});

// ---------------------------------------------------------------------------
// motion.count: 5j, 7w
// ---------------------------------------------------------------------------

const COUNT_INTROS: readonly string[] = [
  'The Operator\'s note: "Why press a key seven times when you can tell Vim the number first?"',
  'The X is many rows away. ECHO counts aloud: "...one... two... three...". You can do better.',
  'GC closes in. No time to repeat keys one by one: put a number in front of the move.',
];

/** Equal-width rows, so a counted j or k keeps the column. Rows are mixed text and dots. */
function countDown(rng: Rng): RoomParts {
  const rows = 8;
  const distance = int(rng, 5, 7);
  const rowMove = span(rng, rows, distance);
  const col = int(rng, 0, 29);
  const lines = Array.from({ length: rows }, () => fillRow(rng, 30));
  lines[rowMove.to] = replaceAt(lines[rowMove.to] ?? '', col, 'X');
  const move = rowMove.to > rowMove.from ? 'j' : 'k';
  return {
    type: 'reach',
    title: pick(rng, ['Count the rows', 'Skip ahead', 'A number first']),
    intro: pick(rng, COUNT_INTROS),
    goalText: `Put the cursor on the X, ${distance} lines ${move === 'j' ? 'down' : 'up'}.`,
    startLines: lines,
    startCursor: { line: rowMove.from, col },
    goals: [{ type: 'reach', target: { line: rowMove.to, col } }],
    hints: [
      `The X is ${distance} lines away. That is a lot of ${move}.`,
      'Type a number before a move to repeat it: 3j goes down three lines.',
      `Press ${distance} then ${move}.`,
    ],
    intendedSolution: [String(distance), move],
  };
}

function countWords(rng: Rng, difficulty: Difficulty): RoomParts {
  const compact = difficulty === 2;
  const rowsOfWords = compact ? 1 : 8;
  const distance = int(rng, compact ? 6 : 3, compact ? 8 : 5);
  const downRows = compact ? 0 : int(rng, 3, 6);
  const words = Array.from({ length: rowsOfWords }, () =>
    Array.from({ length: compact ? distance + int(rng, 1, 2) : 6 }, () => pick(rng, COMPACT)));
  const targetRow = downRows;
  const marked = words.map((row, rowIndex) => row.map((word, index) =>
    (rowIndex === targetRow && index === distance ? word.toUpperCase() : word)));
  const lines = marked.map((row) => row.join(' '));
  const framed = frame(rng, lines, 3, () => wordLine(rng, 4, 6, COMPACT));
  const startsOfTarget = (marked[targetRow] ?? []).slice(0, distance).reduce((col, word) => col + word.length + 1, 0);
  const keys = compact ? [String(distance), 'w'] : [String(downRows), 'j', String(distance), 'w'];
  return {
    type: 'reach',
    title: pick(rng, ['Count the words', 'Hop with a number', 'Counted jumps']),
    intro: pick(rng, COUNT_INTROS),
    goalText: compact
      ? `Put the cursor on the first letter of the word in CAPITALS, ${distance} words ahead.`
      : `Put the cursor on the word in CAPITALS: line ${downRows + 1}, word ${distance + 1}.`,
    startLines: framed.lines,
    startCursor: { line: framed.offset, col: 0 },
    goals: [{ type: 'reach', target: { line: targetRow + framed.offset, col: startsOfTarget } }],
    hints: compact
      ? [`The word is ${distance} words ahead. w ${distance} times is a lot of typing.`, 'A number before a move repeats it: 3w jumps three words.', `Press ${distance} then w.`]
      : ['Two counted moves: first down to the right line, then across to the right word.', `${downRows}j goes down ${downRows} lines. Then count words with w.`, `Press ${downRows} j ${distance} w.`],
    intendedSolution: keys,
  };
}

export const countGenerator: RoomGenerator = makeGenerator('motion.count', (rng, difficulty) =>
  (difficulty === 1 ? countDown(rng) : countWords(rng, difficulty)));

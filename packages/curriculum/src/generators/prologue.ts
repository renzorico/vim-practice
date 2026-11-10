import type { Difficulty, RoomGenerator } from '../phase3.js';
import { makeGenerator, type RoomParts } from './build.js';
import { int, pick, type Rng } from './rng.js';
import { VOCAB, randomWords, typedKeys, wordLine } from './text.js';

const LINE_COUNT: Readonly<Record<Difficulty, number>> = { 1: 3, 2: 5, 3: 7 };

const bufferLines = (rng: Rng, difficulty: Difficulty): string[] =>
  Array.from({ length: LINE_COUNT[difficulty] }, () => wordLine(rng, 2, 3));

const QUIT_KEYS = [':', 'q', '<CR>'];
const FORCE_QUIT_KEYS = [':', 'q', '!', '<CR>'];
const WRITE_QUIT_KEYS = [':', 'w', 'q', '<CR>'];

const QUIT_INTROS: readonly string[] = [
  'A dead terminal blinks at you. The Operator wrote that every exit starts with a colon.',
  'The boot log stops scrolling. Before anything else, learn the door: close this session with :q.',
  'GC is sweeping the lower sectors. Practise the quiet way out: a colon, a q, then Enter.',
];

export const quitGenerator: RoomGenerator = makeGenerator('ex.q', (rng, difficulty): RoomParts => ({
  type: 'reach',
  title: pick(rng, ['First exit', 'The quiet door', 'Close the session']),
  intro: pick(rng, QUIT_INTROS),
  goalText: 'Quit Vim with :q and Enter.',
  startLines: bufferLines(rng, difficulty),
  startCursor: { line: 0, col: 0 },
  goals: [{ type: 'quit', mustSave: false }],
  hints: [
    'Commands that start with a colon are typed on the bottom line.',
    'The colon opens the command line, q means quit. Finish with Enter.',
    'Press : then q then Enter.',
  ],
  intendedSolution: QUIT_KEYS,
}));

const FORCE_INTROS: readonly string[] = [
  'A stray edit left this buffer modified, so :q will refuse to close it. The Operator\'s fix: add a bang, :q!',
  'GC wants this session gone, but your last edit is not worth keeping. Write it, then throw it away with :q!.',
  'Some edits are not worth saving. Make the change, then discard it and leave with :q!.',
];

export const forceQuitGenerator: RoomGenerator = makeGenerator('ex.q!', (rng, difficulty): RoomParts => {
  const { lines, cursor, typed, result } = designInsertion(rng, difficulty);
  return {
    type: 'transform',
    title: pick(rng, ['Leave without saving', 'Discard and go', 'The forced exit']),
    intro: pick(rng, FORCE_INTROS),
    goalText: `Insert "${typed}" at the cursor, then quit without saving using :q!.`,
    startLines: lines,
    startCursor: cursor,
    goals: [{ type: 'transform', targetLines: result }, { type: 'quit', mustSave: false }],
    hints: [
      'Change the text first. Then :q will refuse, because the change is unsaved.',
      ':q! is :q with a bang: quit and throw the unsaved changes away.',
      `Press i, type: ${typed.trimEnd()} and a space, then Escape, then : q ! Enter.`,
    ],
    intendedSolution: ['i', ...typedKeys(typed), '<Esc>', ...FORCE_QUIT_KEYS],
  };
});

interface Insertion {
  readonly lines: readonly string[];
  readonly cursor: { line: number; col: number };
  readonly typed: string;
  readonly result: readonly string[];
}

/** Text typed before the cursor. Difficulty 1 starts at a line start; 2 and 3 start inside a line. */
function designInsertion(rng: Rng, difficulty: Difficulty): Insertion {
  const lines = bufferLines(rng, difficulty);
  const line = int(rng, 0, lines.length - 1);
  const text = lines[line] ?? '';
  const words = text.split(' ');
  const wordIndex = difficulty === 1 ? 0 : int(rng, 1, words.length - 1);
  const col = words.slice(0, wordIndex).join(' ').length + (wordIndex === 0 ? 0 : 1);
  const typed = `${randomWords(rng, difficulty === 3 ? 2 : 1, VOCAB).join(' ')} `;
  const result = lines.map((entry, index) => (index === line ? `${text.slice(0, col)}${typed}${text.slice(col)}` : entry));
  return { lines, cursor: { line, col }, typed, result };
}

const INSERT_INTROS: readonly string[] = [
  'The Operator\'s note: Vim starts in a mode where keys are commands. Press i to start typing.',
  'Your name is missing from the process table. Press i, then type it in, so GC cannot call you unnamed.',
  'A line is half erased. Press i and write the missing text in before the cursor.',
];

export const insertGenerator: RoomGenerator = makeGenerator('mode.insert', (rng, difficulty): RoomParts => {
  const { lines, cursor, typed, result } = designInsertion(rng, difficulty);
  return {
    type: 'transform',
    title: pick(rng, ['Start typing', 'Write it in', 'Insert mode']),
    intro: pick(rng, INSERT_INTROS),
    goalText: `Insert the text "${typed}" at the cursor (line ${cursor.line + 1}).`,
    startLines: lines,
    startCursor: cursor,
    goals: [{ type: 'transform', targetLines: result }],
    hints: [
      'Letters are commands until you enter insert mode.',
      'Press i to insert before the cursor, then type the text.',
      `Press i, then type: ${typed.trimEnd()} followed by a space.`,
    ],
    intendedSolution: ['i', ...typedKeys(typed)],
  };
});

const WRITE_INTROS: readonly string[] = [
  'Quitting does not save you. Saving does. Write the text in, then :wq to save and quit.',
  'The Operator\'s rule for the Exit Port: put your name in the file, then write it out with :wq.',
  'GC deletes anything unsaved. Type the missing text, press Escape, then :wq.',
];

export const writeQuitGenerator: RoomGenerator = makeGenerator('ex.wq', (rng, difficulty): RoomParts => {
  const { lines, cursor, typed, result } = designInsertion(rng, difficulty);
  return {
    type: 'transform',
    title: pick(rng, ['Save and quit', 'Write it out', 'The clean exit']),
    intro: pick(rng, WRITE_INTROS),
    goalText: `Insert "${typed}" at the cursor, then save and quit with :wq.`,
    startLines: lines,
    startCursor: cursor,
    goals: [{ type: 'transform', targetLines: result }, { type: 'quit', mustSave: true }],
    mustUse: ['ex.wq'],
    hints: [
      'Two jobs: change the text first, then leave in a way that keeps the change.',
      'Insert the text with i, press Escape, then :wq writes the file and quits.',
      `Press i, type: ${typed.trimEnd()} and a space, then Escape, then : w q Enter.`,
    ],
    intendedSolution: ['i', ...typedKeys(typed), '<Esc>', ...WRITE_QUIT_KEYS],
  };
});

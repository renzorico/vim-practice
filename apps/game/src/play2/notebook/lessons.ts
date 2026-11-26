import type { Position } from '@escape/engine';
import { stages } from '../content.js';
import { HELP_KEYS, keySequence, type HelpKey } from '../help/keys.js';
import { parseMarked } from './pageModel.js';
import { introducedAt } from '../introducedAt.js';
import { keyLabel } from '../keyLabel.js';

export interface LessonResult {
  readonly rows: readonly string[];
  readonly cursor: Position;
}
export interface Lesson extends HelpKey {
  readonly stageId: string;
  readonly keycaps: readonly string[];
  readonly instruction: string;
  /** Authored buffers use the stage legend; reference examples use letter tiles. */
  readonly terrain: boolean;
  readonly ground: string;
  readonly blots: readonly Position[];
  readonly blotsUntil?: number;
  readonly result: LessonResult;
}
interface AuthoredLesson {
  readonly key: string;
  readonly keycaps: readonly string[];
  readonly description?: string;
  readonly instruction: string;
  readonly rows: readonly string[];
  readonly cursor: Position;
  readonly keys: string;
  readonly result: LessonResult;
  readonly ground: string;
  readonly blots?: readonly Position[];
  readonly blotsUntil?: number;
  /** A lesson on the desk: words on a page, not tiles of a place. */
  readonly letters?: true;
}
const at = (line: number, col: number): Position => ({ line, col });
/** These are little pieces of the actual places, not a second implementation of Vim. */
export const AUTHORED_LESSONS: readonly AuthoredLesson[] = [
  { key: 'h', keycaps: ['h', 'j', 'k', 'l'], description: 'One key press, one step.', instruction: 'Move: left, down, up, right.',
    rows: ['     ', ' ... ', ' ... '], cursor: at(1, 1), keys: 'ljhk',
    result: { rows: ['     ', ' ... ', ' ... '], cursor: at(1, 1) }, ground: ' ' },
  { key: '3l', keycaps: ['3l'], instruction: 'A number repeats the move.',
    rows: ['.......'], cursor: at(0, 1), keys: '3l', result: { rows: ['.......'], cursor: at(0, 4) }, ground: ' ', blots: [at(0, 2)] },
  { key: 'w', keycaps: ['w'], instruction: 'Hop to the next stepping stone, twice.',
    rows: ['o\t\to\t\to'], cursor: at(0, 0), keys: 'ww', result: { rows: ['o\t\to\t\to'], cursor: at(0, 6) }, ground: ' ' },
  { key: 'b', keycaps: ['b'], instruction: 'Hop back one stepping stone.',
    rows: ['o\t\to\t\to'], cursor: at(0, 6), keys: 'b', result: { rows: ['o\t\to\t\to'], cursor: at(0, 3) }, ground: ' ' },
  { key: '$', keycaps: ['$'], instruction: 'Jump to the door at the end of the jetty.',
    rows: ['======L'], cursor: at(0, 0), keys: '$', result: { rows: ['======L'], cursor: at(0, 6) }, ground: ' ' },
  { key: 'x', keycaps: ['x'], instruction: 'x deletes the tile you stand on. 4x deletes four.',
    rows: ['..RRR..'], cursor: at(0, 1), keys: '4x', result: { rows: ['...'], cursor: at(0, 1) }, ground: ' ' },
  { key: 'r', keycaps: ['r'], instruction: 'r writes a tile where you stand. 5r= writes five planks.',
    rows: ['  ~~~~ '], cursor: at(0, 1), keys: '5r=', result: { rows: [' ===== '], cursor: at(0, 5) }, ground: ' ' },
  { key: 'dd', keycaps: ['dd', 'u'], description: 'dd deletes a whole line; u undoes the last change.', instruction: 'Wipe the row of Blots. Undo brings the ledge back.',
    rows: ['.....', '.....', '.....'], cursor: at(1, 0), keys: 'ddu',
    result: { rows: ['.....', '.....', '.....'], cursor: at(1, 0) }, ground: ' ', blots: [at(1, 1), at(1, 3)], blotsUntil: 2 },
  { key: '.', keycaps: ['.'], instruction: 'Delete a row. Repeat to pull the shaft up.',
    rows: ['=====', '=====', ',,,,,'], cursor: at(0, 0), keys: 'dd.',
    result: { rows: [',,,,,'], cursor: at(0, 0) }, ground: ',' },
  { key: 'f', keycaps: ['f'], instruction: 'Jump along the branch to the knot.',
    rows: ['==___=*'], cursor: at(0, 0), keys: 'f*', result: { rows: ['==___=*'], cursor: at(0, 6) }, ground: '=' },
  { key: '}', keycaps: ['{', '}'], description: '{ goes to the previous blank line; } to the next.', instruction: 'Jump to the next clearing, then back.',
    rows: ['', 'mmm', '', 'mmm'], cursor: at(0, 0), keys: '}{',
    result: { rows: ['', 'mmm', '', 'mmm'], cursor: at(0, 0) }, ground: '.' },
  { key: 'gg', keycaps: ['gg', 'G'], description: 'gg goes to the first line; G goes to the last.', instruction: 'Up to the lookout. Down to the forest floor.',
    rows: ['.....', '', '.....'], cursor: at(2, 0), keys: 'ggG',
    result: { rows: ['.....', '', '.....'], cursor: at(2, 0) }, ground: '.' },
  { key: '%', keycaps: ['%'], instruction: 'Jump to the gate’s matching partner.',
    rows: ['(.._..)'], cursor: at(0, 0), keys: '%', result: { rows: ['(.._..)'], cursor: at(0, 6) }, ground: '.' },
  { key: 'd', keycaps: ['d'], instruction: 'Stand past the pile. Delete it back to front.',
    rows: ['..ccc..'], cursor: at(0, 5), keys: 'db', result: { rows: ['....'], cursor: at(0, 2) }, ground: '.' },
  { key: 'y', keycaps: ['y', 'p'], description: 'y copies with a motion; p puts the copy after you.', instruction: 'Copy the oil. Move to the shelf. Put it down.',
    rows: ['ooo', '[]___'], cursor: at(0, 0), keys: 'ywjp',
    result: { rows: ['ooo', '[ooo]___'], cursor: at(1, 3) }, ground: '_' },
  { key: 'o', keycaps: ['o', '<Esc>'], description: 'o opens a row below and lets you type. Esc stops typing.', instruction: 'Add a row under wall: a door.',
    rows: ['wall'], cursor: at(0, 0), keys: 'odoor<Esc>', result: { rows: ['wall', 'door'], cursor: at(1, 3) }, ground: ' ', letters: true },
  { key: 'D', keycaps: ['D'], instruction: 'Cut everything from here to the end of the row.',
    rows: ['paid (no)'], cursor: at(0, 4), keys: 'D', result: { rows: ['paid'], cursor: at(0, 3) }, ground: ' ', letters: true },
  { key: 'c', keycaps: ['c'], description: 'c deletes what the next move covers, then lets you type.', instruction: 'Change one word, then Esc.',
    rows: ['my boat'], cursor: at(0, 0), keys: 'cwour<Esc>', result: { rows: ['our boat'], cursor: at(0, 2) }, ground: ' ', letters: true },
  { key: 'C', keycaps: ['C'], description: 'C changes everything from here to the end of the row.', instruction: 'Sign it yourself, then Esc.',
    rows: ['by no one'], cursor: at(0, 3), keys: 'CTilde<Esc>', result: { rows: ['by Tilde'], cursor: at(0, 7) }, ground: ' ', letters: true },
  { key: 'P', keycaps: ['P'], description: 'P puts what you cut or copied before you; a row goes above.', instruction: 'Cut the last row, put it on top.',
    rows: ['two', 'one'], cursor: at(1, 0), keys: 'ddP', result: { rows: ['one', 'two'], cursor: at(0, 0) }, ground: ' ', letters: true },
  { key: 'yy', keycaps: ['yy'], description: 'yy copies the whole row; p puts the copy below.', instruction: 'One ferry, then another.',
    rows: ['ferry'], cursor: at(0, 0), keys: 'yyp', result: { rows: ['ferry', 'ferry'], cursor: at(1, 0) }, ground: ' ', letters: true },
  { key: 'i"', keycaps: ['i"'], description: 'With d, c or y: what is inside the quotes.', instruction: 'Change the name inside the quotes, then Esc.',
    rows: ['"no one"'], cursor: at(0, 3), keys: 'ci"me<Esc>', result: { rows: ['"me"'], cursor: at(0, 2) }, ground: ' ', letters: true },
  { key: 'V', keycaps: ['V'], description: 'V selects whole rows; moves add more, d deletes them.', instruction: 'Delete both drafts.',
    rows: ['draft', 'draft', 'final'], cursor: at(0, 0), keys: 'Vjd', result: { rows: ['final'], cursor: at(0, 0) }, ground: ' ', letters: true },
  { key: '<C-v>', keycaps: ['<C-v>'], description: 'Ctrl-v starts a block: moves stretch it, d deletes it.', instruction: 'Delete the first column of three rows.',
    rows: ['*ink', '*map', '*key'], cursor: at(0, 0), keys: '<C-v>jjd', result: { rows: ['ink', 'map', 'key'], cursor: at(0, 0) }, ground: ' ', letters: true },
];

/** Canonical page key for lessons which must be taught together. */
export function lessonKey(key: string): string {
  return AUTHORED_LESSONS.find(lesson => lesson.keycaps.includes(key))?.key ?? key;
}
export function lessonKeys(key: string): readonly string[] {
  return AUTHORED_LESSONS.find(lesson => lesson.key === lessonKey(key))?.keycaps ?? [key];
}
function marked(rows: readonly string[], cursor: Position): string {
  return rows.map((row, line) => line === cursor.line
    ? `${row.slice(0, cursor.col)}[${row[cursor.col] ?? ''}]${row.slice(cursor.col + 1)}` : row).join('\n');
}
export function lessonFor(entry: HelpKey): Lesson {
  const key = lessonKey(entry.key);
  const help = HELP_KEYS.find(item => item.key === key) ?? entry;
  const stageId = introducedAt[key] ?? 'margin';
  const stage = stages.find(item => item.stage.id === stageId);
  const authored = AUTHORED_LESSONS.find(item => item.key === key);
  if (authored) return {
    ...help, description: authored.description ?? help.description, stageId, world: stage?.stage.world ?? help.world, keycaps: authored.keycaps, instruction: authored.instruction,
    terrain: !authored.letters, ground: authored.ground, blots: authored.blots ?? [], result: authored.result,
    ...(authored.blotsUntil === undefined ? {} : { blotsUntil: authored.blotsUntil }),
    example: { before: marked(authored.rows, authored.cursor), after: marked(authored.result.rows, authored.result.cursor),
      keys: keySequence(authored.keys), setup: [] },
  };
  return { ...help, stageId, world: stage?.stage.world ?? help.world, keycaps: [key], instruction: `Try ${keyLabel(key)} on these letter tiles.`,
    terrain: false, ground: stage?.legend.tiles.find(tile => tile.kind === 'ground' && tile.walkable)?.char
      ?? stage?.legend.tiles.find(tile => tile.walkable)?.char ?? ' ', blots: [],
    // Reference results are checked against their marked help text in pageModel.test.ts.
    result: { rows: parseMarked(help.example.after).lines, cursor: parseMarked(help.example.after).cursor } };
}
export function notebookLessons(entries: readonly HelpKey[]): readonly Lesson[] {
  return [...new Map(entries.map(entry => { const lesson = lessonFor(entry); return [lesson.key, lesson]; })).values()];
}

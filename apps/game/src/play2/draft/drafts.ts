import type { Position } from '@escape/engine';

/** What a task asks for: a cell to reach with one of the keys it teaches, a command to use, or a part of the text to finish. */
type Goal =
  | { readonly type: 'reach'; readonly line: number; readonly text: string; readonly at?: 'start' | 'end'; readonly occurrence?: number; readonly by: readonly string[] }
  | { readonly type: 'use'; readonly command: string }
  | { readonly type: 'edit'; readonly unfinished: (text: string) => boolean };

export interface DraftTask {
  readonly task: string;
  readonly how: string;
  readonly goal: Goal;
  /** The keys that do it from where the last task ended; the tests follow them. */
  readonly keys: string;
}
/** A written exercise: the keys of one stage, on real text. */
export interface Draft {
  readonly stage: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly cursor: Position;
  /** The text to end with, when the tasks change it. */
  readonly target?: readonly string[];
  readonly tasks: readonly DraftTask[];
}

const start: Position = { line: 0, col: 0 };
const reach = (task: string, how: string, keys: string, line: number, text: string, by: readonly string[],
  more: { readonly at?: 'start' | 'end'; readonly occurrence?: number } = {}): DraftTask =>
  ({ task, how, keys, goal: { type: 'reach', line, text, by, ...more } });
const use = (task: string, how: string, keys: string, command: string): DraftTask => ({ task, how, keys, goal: { type: 'use', command } });
const edit = (task: string, how: string, keys: string, unfinished: (text: string) => boolean): DraftTask =>
  ({ task, how, keys, goal: { type: 'edit', unfinished } });
const has = (part: string | RegExp) => (text: string): boolean => typeof part === 'string' ? text.includes(part) : part.test(text);
const lacks = (part: string | RegExp) => (text: string): boolean => !has(part)(text);

export const DRAFTS: readonly Draft[] = [
  {
    stage: 'margin', title: 'A letter in the margin', cursor: start,
    lines: ['Dear Tilde,', 'the ink is fading. If you read this,', 'walk to the well and look down.', 'Take the brass key with you.',
      'Come before the last row is gone.', 'The Scribe'],
    tasks: [
      reach('Find the well', 'Two rows down: `2j`. Then 12 to the right: `12l`.', '2j12l', 2, 'well', ['j', 'l']),
      reach('Find the key', 'One row down, then 3 to the left: `j`, `3h`.', 'j3h', 3, 'brass', ['j', 'h']),
      reach('Find the name', 'Down to the last row, then left: `2j`, `5h`.', '2j5h', 5, 'Scribe', ['j', 'h']),
    ],
  },
  {
    stage: 'lowlands', title: 'The list of rows', cursor: start,
    lines: ['Row 11 was here: a mill, two goats, a door.', 'Row 12 was here: the road to the lighthouse.', 'Row 13 is here, and so are you.'],
    tasks: [
      reach('The mill', '`w` jumps to the next word. Press it until you stand on mill.', 'wwwwww', 0, 'mill', ['w']),
      reach('End of the row', '`$` jumps to the end of the row.', '$', 0, 'door.', ['$'], { at: 'end' }),
      reach('Start of the next', '`j` goes down, `0` jumps to the start of the row.', 'j0', 1, 'Row', ['0']),
      reach('End of a word', '`j`, then `e` jumps to the end of a word. Stop on the last e of here.', 'jeeee', 2, 'here', ['e'], { at: 'end' }),
      reach('Back one word', '`b` jumps back to the start of a word. Stop on is.', 'bb', 2, 'is', ['b']),
    ],
  },
  {
    stage: 'quarry-road', title: 'A report with three slips', cursor: start,
    lines: ['The gate is opeen.', 'The road is clear of rocts.', 'The river has aaaa bridge.'],
    target: ['The gate is open.', 'The road is clear of rocks.', 'The river has a bridge.'],
    tasks: [
      edit('One e too many', 'In row 1, cursor on an e of opeen. `x` cuts the letter under the cursor.', 'wwwllx', has('opeen')),
      edit('One wrong letter', 'In row 2, cursor on the t of rocts. `r` then `k` writes over it.', 'j0wwwwwlllrk', has('rocts')),
      edit('Three a too many', 'In row 3, cursor on the first a of aaaa. `3x` cuts three letters.', 'j0www3x', has('aaaa')),
    ],
  },
  {
    stage: 'cut', title: 'A blotted wall plan', cursor: start,
    lines: ['Ledge one: stone.', '#### a blot ####', '#### a blot ####', 'Ledge two: stone.', '#### a blot ####', 'Ledge three: stone.'],
    target: ['Ledge one: stone.', 'Ledge two: stone.', 'Ledge three: stone.'],
    tasks: [
      use('Cut a blot row', 'Cursor on a blot row. `dd` cuts the whole row.', 'jdd', 'dd'),
      use('Take it back', '`u` undoes the last change: the row is back.', 'u', 'u'),
      use('Cut it again', '`Ctrl-r` redoes what `u` took back.', '<C-r>', '<C-r>'),
      edit('Cut the other two', '`dd` on each blot row that is left.', 'ddjdd', has('blot')),
    ],
  },
  {
    stage: 'shaft', title: 'Old tools', cursor: start,
    lines: ['old rope', 'old lamp', 'old saw', 'old pick'],
    target: ['rope', 'lamp', 'saw', 'pick'],
    tasks: [
      edit('Cut old once', 'At the start of row 1, `4x` cuts four letters: old and the space.', '4x', has(/^old rope/m)),
      use('Repeat it', '`j`, then `.` does the same change again.', 'j.', '.'),
      edit('And the rest', '`j` and `.` on each row that is left.', 'j.j.', has('old ')),
    ],
  },
  {
    stage: 'canopy', title: 'The path of a letter', cursor: start,
    lines: ['path = home/tilde/letters/last.txt', 'owner: the Scribe; reader: nobody; lamp: out'],
    tasks: [
      reach('To the equals', '`f=` jumps forward to the next = in the row.', 'f=', 0, '=', ['f']),
      reach('To the last slash', '`f/` jumps to a slash; `;` jumps to the next one. Stop on the last.', 'f/;;', 0, '/', [';'], { occurrence: 3 }),
      reach('Back one slash', '`,` does the last jump the other way.', ',', 0, '/', [','], { occurrence: 2 }),
      reach('Just before', 'Start of row 2, then `t;` jumps to just before the first semicolon.', 'j0t;', 1, 'Scribe', ['t'], { at: 'end' }),
    ],
  },
  {
    stage: 'glades', title: 'A letter in four parts', cursor: start,
    lines: ['To whoever finds this:', 'the lamps are out.', '', 'Bring oil and rope.', 'The ferry takes both.', '', 'Do not trust the copies.', 'They have no shadow.', '', 'Yours, the Scribe'],
    tasks: [
      reach('Past the first part', '`}` jumps down to the next empty row.', '}', 2, '', ['}']),
      reach('Past the second', '`}` again.', '}', 5, '', ['}']),
      reach('To the end', '`G` jumps to the last row.', 'G', 9, 'Yours', ['G']),
      reach('Up one part', '`{` jumps up to the empty row above.', '{', 8, '', ['{']),
      reach('To the top', '`gg` jumps to the first row.', 'gg', 0, 'To', ['gg']),
    ],
  },
  {
    stage: 'gates', title: 'A spell with brackets', cursor: start,
    lines: ['open(gate(left), gate(right))', 'if (lower and upper) {', '  shout("on three")', '}'],
    tasks: [
      reach('Outer pair', '`f(` jumps to the first bracket. `%` jumps to its partner, at the end.', 'f(%', 0, '))', ['%'], { at: 'end' }),
      reach('And back', '`%` again: back to the first bracket.', '%', 0, '(', ['%']),
      reach('Inner pair', 'On the bracket after gate, `%` jumps only to the end of left.', 'll3l%', 0, 'left)', ['%'], { at: 'end' }),
      reach('Across rows', '`j`, then `$` to the {. `%` finds its } three rows down.', 'j$%', 3, '}', ['%']),
    ],
  },
  {
    stage: 'jetty', title: 'A notice, said twice', cursor: start,
    lines: ['The ferry ferry leaves at noon.', 'Bring nets nets and rope.', 'No crates on the pier, please, thank you.'],
    target: ['The ferry leaves at noon.', 'Bring nets and rope.', 'No crates on the pier.'],
    tasks: [
      edit('Forward', 'Cursor on the second ferry. `dw` cuts from there to the next word.', 'wwdw', has('ferry ferry')),
      edit('Backward', 'Cursor on the a of and. `db` cuts back to the start of the word before.', 'j0wwwdb', has('nets nets')),
      edit('Up to a mark', 'Cursor on the first comma. `dt.` cuts up to the full stop.', 'j0f,dt.', has('please')),
    ],
  },
  {
    stage: 'warehouse', title: 'A bill to fill in', cursor: start,
    lines: ['Cargo: oil', 'Shelf 1: ', 'Shelf 2: '],
    target: ['Cargo: oil', 'Shelf 1: oil', 'Shelf 2: oil'],
    tasks: [
      use('Copy the word', 'Cursor on the o of oil. `yw` copies the word.', '$byw', 'y'),
      edit('Shelf 1', 'End of row 2: `j`, `$`. `p` puts the copy after the cursor.', 'j$p', lacks('Shelf 1: oil')),
      edit('Shelf 2', 'End of row 3, and `p` again.', 'j$p', lacks('Shelf 2: oil')),
    ],
  },
  {
    stage: 'customs', title: 'Two pockets', cursor: start,
    lines: ['Sender: Ream', 'Cargo: rope', 'Paid by: ', 'Carried: '],
    target: ['Sender: Ream', 'Cargo: rope', 'Paid by: Ream', 'Carried: rope'],
    tasks: [
      use('Ream in pocket a', 'Cursor on Ream. `"ayw` copies it into pocket a.', '$b"ayw', 'y'),
      edit('Rope in pocket b', 'Cursor on rope. `"byw` copies it into pocket b. Then, at the end of Carried, `"bp`.', 'j$b"byw2j$"bp', lacks('Carried: rope')),
      edit('Pay from pocket a', 'At the end of Paid by, `"ap`: pocket a still holds Ream.', 'k$"ap', lacks('Paid by: Ream')),
    ],
  },
  {
    stage: 'stacks', title: 'Dust between the words', cursor: { line: 0, col: 10 },
    lines: ['The quiet quiet room.', 'A dusty book lies here.', 'Read it it aloud.'],
    target: ['The quiet room.', 'A book lies here.', 'Read it aloud.'],
    tasks: [
      edit('Quiet, once', 'Anywhere on the second quiet, `daw` cuts the word and its space.', 'daw', has('quiet quiet')),
      edit('No dust', 'Anywhere on dusty, `daw`.', 'j03ldaw', has('dusty')),
      edit('It, once', 'On one it in row 3, `.` repeats the last change.', 'j0w.', has('it it')),
    ],
  },
  {
    stage: 'reading', title: 'Read between the brackets', cursor: start,
    lines: ['call(now, or later)', 'lamp(lit)(again)', 'vault(door(key))'],
    target: ['call()', 'lamp(lit)', 'vault(door())'],
    tasks: [
      edit('Empty them', 'Anywhere inside the brackets, `di(` cuts what is in them.', 'f(ldi(', has('now')),
      edit('Take them too', 'On again, `da(` cuts the brackets as well.', 'j$hda(', has('again')),
      edit('Only the inner', 'On key, `di(` empties only the brackets around it.', 'j0fkdi(', has('key')),
    ],
  },
  {
    stage: 'archive', title: 'Pages out of order', cursor: start,
    lines: ['Second.', 'It came later.', '', 'First.', 'It came before.', '', 'Third.'],
    target: ['First.', 'It came before.', '', 'Second.', 'It came later.', '', 'Third.'],
    tasks: [
      edit('Cut the paragraph', 'Anywhere in the first paragraph, `dap` cuts it with its empty row.', 'dap', text => text.startsWith('Second.')),
      edit('Put it second', '`}` jumps to the empty row below. `p` puts the paragraph after it.', '}p', lacks(/^First\.\nIt came before\.\n\nSecond\./)),
    ],
  },
  {
    stage: 'notary', title: 'Three more locks', cursor: start,
    lines: ['locks[one, two]', '<seal>shut</seal>', 'vault{gold}'],
    target: ['locks[]', '<seal></seal>', 'vault'],
    tasks: [
      edit('Inside the square', 'Anywhere inside [ ], `di[`.', 'f[ldi[', has('one')),
      edit('Between the tags', 'On shut, `dit` cuts what is between the tags.', 'j0fhdit', has('shut')),
      edit('Curly and all', 'On gold, `da{` cuts the brackets as well.', 'j0fgda{', has('gold')),
    ],
  },
  {
    stage: 'mouth', title: 'Echoes on a page', cursor: start,
    lines: ['An echo, then another echo.', 'The lamp is out. Say lamp and wait.', 'Water, stone, water, and an echo.'],
    tasks: [
      reach('Find lamp', 'Press `/`, type “lamp”, then `Enter`.', '/lamp<CR>', 1, 'lamp', ['/']),
      reach('The next one', '`n` jumps to the next match.', 'n', 1, 'lamp', ['n'], { occurrence: 2 }),
      reach('Search upwards', 'Press `?`, type “echo”, then `Enter`: the nearest one above.', '?echo<CR>', 0, 'echo', ['?'], { occurrence: 2 }),
      reach('The next above', '`n` keeps going the same way: up.', 'n', 0, 'echo', ['n']),
      reach('The other way', '`N` goes back the other way.', 'N', 0, 'echo', ['N'], { occurrence: 2 }),
    ],
  },
  {
    stage: 'gallery', title: 'One word, many places', cursor: start,
    lines: ['ink on the wall, a lamp on the floor', 'a lamp without ink', 'ink, and no more'],
    tasks: [
      reach('The next ink', 'On ink, `*` jumps to the same word further down.', '*', 1, 'ink', ['*']),
      reach('And the next', '`*` again.', '*', 2, 'ink', ['*']),
      reach('Back up', '`#` jumps to the same word further up.', '#', 1, 'ink', ['#']),
    ],
  },
  {
    stage: 'marked', title: 'Leave a mark', cursor: { line: 0, col: 6 },
    lines: ['Leave a mark on this row.', 'Walk down.', 'Walk further down.', 'Come back in two keys.'],
    tasks: [
      use('Mark this place', '`ma` marks the cell you stand on as a.', 'ma', 'm'),
      reach('Walk away', '`G` jumps to the last row.', 'G', 3, 'ack in', ['G']),
      reach('Come back', '`` `a `` jumps back to the very cell of mark a.', '`a', 0, 'a mark', ['`']),
    ],
  },
];

export const draftFor = (stageId: string): Draft | undefined => DRAFTS.find(draft => draft.stage === stageId);

/** The cell a reach task names. */
export function cellOf(draft: Draft, goal: Extract<Goal, { type: 'reach' }>): Position {
  const row = draft.lines[goal.line] ?? '';
  if (goal.text === '') return { line: goal.line, col: 0 };
  let from = -1;
  for (let count = 0; count < (goal.occurrence ?? 1); count += 1) from = row.indexOf(goal.text, from + 1);
  if (from < 0) throw new Error(`${draft.stage}: no ${goal.text} in row ${goal.line + 1}`);
  return { line: goal.line, col: goal.at === 'end' ? from + goal.text.length - 1 : from };
}

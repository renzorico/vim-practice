/** One thing to do in a text stage: what, how, and whether it is still to be done. */
export interface ScriptTask {
  readonly task: string;
  /** Where to stand, then which keys. Text to type is in curly quotes. */
  readonly how: string;
  readonly unfinished: (text: string) => boolean;
}

const lacks = (...wanted: readonly string[]) => (text: string): boolean => wanted.some(part => !text.includes(part));
const has = (part: string | RegExp) => (text: string): boolean => typeof part === 'string' ? text.includes(part) : part.test(text);
const count = (text: string, part: string): number => text.split(part).length - 1;

/**
 * In the order the rows ask for them. Where typing finishes a task, it waits for the new words, so its
 * instructions stay until they are there.
 */
const TASKS: Readonly<Record<string, readonly ScriptTask[]>> = {
  'ledger.book': [
    { task: 'Strike the wall rows', unfinished: has(/^wall *$/m),
      how: 'Go to a row that says wall. Press `dd`: the row is gone. On the other two, `.` does it again.' },
    { task: 'Mark everyone paid', unfinished: has('unpaid'),
      how: 'Cursor on the u of unpaid. Press `2x`: un is gone. Then `j` to the next row and `.` to repeat.' },
    { task: "Fix Bram's name", unfinished: lacks('Bram'), how: 'Cursor on the e of Brem. Press `r`, then `a`.' },
    { task: "Cut Mira's note", unfinished: has('owed'),
      how: "On Mira's row, cursor on the first space after paid. Press `D`: the rest of the row is gone." },
    { task: 'Add a door row', unfinished: text => !/^door$/m.test(text),
      how: 'Go to the last row. Press `o`: a new row opens below it. Type “door”, then press `Esc`.' },
  ],
  'manifest.book': [
    { task: 'Title: an o too many', unfinished: has('Wordwoood'),
      how: 'From the start of row 1, `fo` jumps to an o and `;` to the next. On an o of Wordwoood, press `x`.' },
    { task: 'Add the twins', unfinished: lacks(', Shut, Ope)'),
      how: 'In row 2, `$` jumps to the last character, the ). Press `i`, type “, Shut, Ope”, then press `Esc`.' },
    { task: 'Four coils of rope', unfinished: lacks('4 coils'), how: 'From the start of the rope row, `f2` jumps to the 2. Press `r`, then `4`.' },
    { task: 'Strike the ink', unfinished: has(/^ink/m), how: 'Anywhere on the ink row, press `dd`.' },
    { task: 'Sail on three', unfinished: lacks(', on three.'),
      how: 'On the Sails row, `$` jumps to the full stop. Press `i`, type “, on three”, then press `Esc`.' },
    { task: 'Checked today', unfinished: lacks('Last checked: today.'),
      how: 'From the start of the last row, `f:` jumps to the colon. `l`, then `D` cuts the rest. Press `a`, type “ today.” with a space first, then `Esc`.' },
  ],
  'harbour.book': [
    { task: 'Name the keeper', unfinished: lacks('Keeper: Ream,'),
      how: 'On the Keeper row, cursor on the t of the. `ct,` cuts up to the comma. Type “Ream”, then press `Esc`.' },
    { task: 'The order goes first', unfinished: text => !text.startsWith('Order'),
      how: '`G` jumps to the last row, `dd` cuts it, `gg` jumps to the top, `P` puts it above.' },
    { task: 'Oil before rope', unfinished: text => !/^oil \.[^]*^rope \./m.test(text),
      how: 'On the rope row, `dd` cuts it and `p` puts it below the next one.' },
    { task: 'Mark the crates real', unfinished: text => count(text, 'real') < 3,
      how: 'Cursor on the c of copied. `cw`, type “real”, then `Esc`. On the next copied, `.` does it again.' },
    { task: 'Expect the ferry', unfinished: lacks('Expected: the ferry, today'),
      how: 'On the Expected row, cursor on the n of none. `C` cuts to the end. Type “the ferry, today”, then `Esc`.' },
    { task: 'Expect the rope boat', unfinished: lacks('Expected: the rope boat, today'),
      how: '`yyp` copies that row below. On the f of ferry, `ct,`, type “rope boat”, then `Esc`.' },
    { task: 'Sign it', unfinished: lacks('Signed: Tilde, for Ream'),
      how: 'On the last row, cursor on the n of nobody. `C`, type “Tilde, for Ream”, then `Esc`.' },
  ],
  'contract.book': [
    { task: 'First party', unfinished: text => !/Parties: "the Librarians"/.test(text),
      how: 'From the start of row 3, `ci"` changes what is inside the first quotes. Type “the Librarians”, then `Esc`.' },
    { task: 'Three seals', unfinished: text => count(text, 'Seal: "the Librarians"') < 3,
      how: 'From the start of a Seal row, `ci"`, type “the Librarians”, then `Esc`. On the next row, `.` repeats it.' },
    { task: 'Second party', unfinished: lacks('"the Readers"'),
      how: 'On row 3, `$` jumps to the last quote. `ci"`, type “the Readers”, then `Esc`.' },
    { task: 'Free clause 1', unfinished: lacks('(unless they want to)'),
      how: 'From the start of row 5, `f(` jumps to the outer bracket. `ci(`, type “unless they want to”, then `Esc`.' },
    { task: 'Open the vault', unfinished: lacks('[until the Scribe returns]'),
      how: 'From the start of the next row, `f[` jumps to the bracket. `ci[`, type “until the Scribe returns”, then `Esc`.' },
    { task: 'Strike clause 3', unfinished: has(/Clause 3|a single page/),
      how: 'Anywhere on Clause 3, `dap` cuts all of it and its empty row.' },
    { task: 'Sign it', unfinished: lacks('<name>Tilde</name>'),
      how: 'Cursor on the < of <name>. `cit` changes what is between the tags. Type “Tilde”, then `Esc`.' },
    { task: 'Name the guardian', unfinished: text => /Notes:|Nothing guards/.test(text) || !text.includes('Guardian of the caves: the Minotaur.'),
      how: 'On the Notes row, `cip` changes both rows. Type “Guardian of the caves: the Minotaur.”, then `Esc`.' },
  ],
  'study.book': [
    { task: 'Strike the shelf column', unfinished: has('shelf'),
      how: 'From the start of the ink row, `f|` jumps to the first bar. `Ctrl-v` starts a block, `7j` takes it down, `9l` across, `d` cuts it.' },
    { task: 'Mark every entry found', unfinished: text => count(text, '| found') < 8,
      how: 'Cursor on the l of the first lost. `Ctrl-v`, `7j`, `$`, then `c`, type “found”, and `Esc`.' },
    { task: 'Star every entry', unfinished: text => count(text, '* ') < 8,
      how: 'At the start of the ink row: `Ctrl-v`, `7j`, then `I`, type “* ” (star, space), and `Esc`.' },
    { task: 'Keep the final draft', unfinished: has('draft'),
      how: 'On the first draft row, `V` selects it, `2j` adds the next two, `d` cuts them.' },
  ],
};

export interface TaskView extends ScriptTask { readonly done: boolean }

/** The tasks of a script, each done or not for this text. */
export function tasksFor(scriptId: string, lines: readonly string[]): readonly TaskView[] {
  const text = lines.join('\n');
  return (TASKS[scriptId] ?? []).map(task => ({ ...task, done: !task.unfinished(text) }));
}

import type { Key } from '@escape/engine';
import type { WorldId } from '@escape/world';

export interface HelpKey {
  readonly key: string;
  readonly description: string;
  readonly world: WorldId;
  readonly example: { readonly before: string; readonly after: string; readonly keys: readonly Key[]; readonly setup: readonly Key[]; readonly initial?: string };
}
export const keySequence = (text: string): readonly Key[] => text.match(/<[^>]+>|./g) ?? [];
function entry(world: WorldId, key: string, description: string, before: string, after: string, typed = key, setup = ''): HelpKey {
  const initial: Readonly<Record<string, string>> = { u: '[a]bc', '.': '[a]bcd', ';': '[a]bcb', ',': '[a]bcb', '`': 'a[b]c', "'": 'a[b]c', n: '[a] a a', N: '[a] a a' };
  return { world, key, description, example: { before, after, keys: keySequence(typed), setup: keySequence(setup), ...(initial[key] ? { initial: initial[key] } : {}) } };
}
const margin = entry.bind(null, 'margin');
const low = entry.bind(null, 'lowlands');
const quarry = entry.bind(null, 'quarry');
const wood = entry.bind(null, 'wordwood');
const port = entry.bind(null, 'copper-port');
const library = entry.bind(null, 'library');
const echo = entry.bind(null, 'echo-caves');
export const HELP_KEYS: readonly HelpKey[] = [
  margin('h', 'Move one character left.', 'a[b]c', '[a]bc'),
  margin('j', 'Move one line down.', '[a]b\ncd', 'ab\n[c]d'),
  margin('k', 'Move one line up.', 'ab\n[c]d', '[a]b\ncd'),
  margin('l', 'Move one character right.', '[a]bc', 'a[b]c'),
  margin('3l', 'A number repeats a move in one turn.', '[a]bcd', 'abc[d]'),
  low('w', 'Jump to the start of the next word.', '[o]ne two', 'one [t]wo'),
  low('b', 'Jump back to the start of a word.', 'one [t]wo', '[o]ne two'),
  low('e', 'Jump to the end of a word.', '[o]ne two', 'on[e] two'),
  low('0', 'Move to the first character of the line.', 'ab[c]', '[a]bc'),
  low('$', 'Move to the last character of the line.', '[a]bc', 'ab[c]'),
  entry('last-page', ':w', 'Save the file; in the field, set a checkpoint.', '[a]bc', '[a]bc', ':w<CR>'),
  quarry('x', 'Delete the character under you.', 'a[b]c', 'a[c]'),
  quarry('r', 'Replace one character with the next key you type.', 'a[b]c', 'a[=]c', 'r='),
  quarry('dd', 'Delete the whole line.', '[a]b\ncd', '[c]d'),
  quarry('u', 'Undo the last change to the text.', '[b]c', '[a]bc', 'u', 'x'),
  quarry('<C-r>', 'Redo a change you undid. Hold Ctrl and press r.', '[a]bc', '[b]c', '<C-r>', 'xu'),
  quarry('.', 'Repeat your last change here.', '[b]cd', '[c]d', '.', 'x'),
  quarry(':e!', 'Reload; in the game, return to your checkpoint.', '[a]bc', '[a]bc', ':e!<CR>'),
  quarry('o', 'Open a new line below and start typing.', '[a]bc', 'abc\n[x]', 'ox<Esc>'),
  quarry('D', 'Delete from here to the end of the line.', 'a[b]c', '[a]'),
  quarry('i', 'Type new text before the cursor.', 'a[b]c', 'a[x]bc', 'ix<Esc>'),
  quarry('a', 'Type new text after the cursor.', 'a[b]c', 'ab[x]c', 'ax<Esc>'),
  quarry('A', 'Type new text at the end of the line.', '[a]bc', 'abc[x]', 'Ax<Esc>'),
  quarry('I', 'Type before the first non-space character.', '  a[b]c', '  [x]abc', 'Ix<Esc>'),
  quarry('<Esc>', 'Stop typing or cancel an unfinished command.', '[a]bc', '[a]bc', 'i<Esc>'),
  quarry(':q', 'Close an unchanged script without solving it.', '[a]bc', '[a]bc', ':q<CR>'),
  wood('f', 'Jump onto the next character you name.', '[a]bca', 'abc[a]', 'fa'),
  wood('t', 'Stop just before the next character you name.', '[a]bca', 'ab[c]a', 'ta'),
  wood(';', 'Repeat your last f or t jump forward.', 'a[b]cb', 'abc[b]', ';', 'fb'),
  wood(',', 'Repeat your last f or t jump backward.', 'abc[b]', 'a[b]cb', ',', 'fb;'),
  wood('{', 'Jump to the previous blank line.', 'a\n\nb\n[c]', 'a\n[]\nb\nc'),
  wood('}', 'Jump to the next blank line.', '[a]\n\nb', 'a\n[]\nb'),
  wood('gg', 'Jump to the first line.', 'a\n[b]', '[a]\nb'),
  wood('G', 'Jump to the last line.', '[a]\nb', 'a\n[b]'),
  wood('%', 'Jump between matching brackets.', '[(]ab)', '(ab[)]'),
  wood('<C-d>', 'Move down half a screen. Hold Ctrl and press d.', '[a]\nb\nc', 'a\nb\n[c]'),
  wood('<C-u>', 'Move up half a screen. Hold Ctrl and press u.', 'a\nb\n[c]', '[a]\nb\nc'),
  port('d', 'Delete the text covered by the next move.', '[o]ne two', '[t]wo', 'dw'),
  port('y', 'Copy the text covered by the next move.', '[o]ne two', '[o]ne two', 'yw'),
  port('p', 'Put copied or deleted text after the cursor.', '[a]bc', 'a[a]bc', 'p', 'yl'),
  port('"', 'Choose a named place to keep copied text.', '[a]bc', '[a]bc', '"ayl'),
  port('c', 'Delete with a move, then type its replacement.', '[o]ne two', '[x] two', 'cwx<Esc>'),
  port('C', 'Replace from here to the end of the line.', 'a[b]c', 'a[x]', 'Cx<Esc>'),
  port('P', 'Put copied or deleted text before the cursor.', '[a]bc', '[a]abc', 'P', 'yl'),
  port('yy', 'Copy the whole line.', '[a]bc', '[a]bc'),
  ...(['iw', 'aw', 'i(', 'a(', 'ib', 'ab', 'ip', 'ap', 'i[', 'a[', 'i{', 'a{', 'iB', 'aB', 'it', 'at', 'i"', 'a"', "i'", "a'"] as const).map(key => {
    const around = key.startsWith('a');
    const shape = key.slice(1);
    const noun = shape === 'w' ? 'word' : shape === 'p' ? 'paragraph' : shape === 't' ? 'tag pair'
      : shape === '"' ? 'double quotes' : shape === "'" ? 'single quotes' : shape === '[' ? 'square brackets'
        : ['{', 'B'].includes(shape) ? 'braces' : 'parentheses';
    const before = shape === 'w' ? '[o]ne two' : shape === 'p' ? '[a]bc\n\nend' : shape === 't' ? '<b>[a]bc</b>'
      : shape === '"' ? '"[a]bc"' : shape === "'" ? "'[a]bc'" : shape === '[' ? '[[a]bc]'
        : ['{', 'B'].includes(shape) ? '{[a]bc}' : '([a]bc)';
    const after = shape === 'w' ? (around ? '[t]wo' : '[ ]two') : shape === 'p' ? (around ? '[e]nd' : '[]\nend')
      : around ? '[]' : shape === 't' ? '<b>[<]/b>' : shape === '"' ? '"["]' : shape === "'" ? "'[']"
        : shape === '[' ? '[[]]' : ['{', 'B'].includes(shape) ? '{[}]' : '([)]';
    return library(key, `With d, c or y: ${around ? 'include' : 'inside'} the ${noun}.`, before, after, `d${key}`);
  }),
  echo('/', 'Find the next matching text.', '[o]ne two', 'one [t]wo', '/two<CR>'),
  echo('?', 'Find matching text behind you.', 'one [t]wo', '[o]ne two', '?one<CR>'),
  echo('n', 'Repeat the last text search in its direction.', 'a [a] a', 'a a [a]', 'n', '/a<CR>'),
  echo('N', 'Repeat the last text search the other way.', 'a [a] a', '[a] a a', 'N', '/a<CR>'),
  echo('*', 'Find the next copy of the word under you.', '[o]ne one', 'one [o]ne'),
  echo('#', 'Find the previous copy of the word under you.', 'one [o]ne', '[o]ne one'),
  echo('m', 'Mark this position with a letter.', 'a[b]c', 'a[b]c', 'ma'),
  echo('`', 'Return to the exact position of a named mark.', 'ab[c]', 'a[b]c', '`a', 'mal'),
  echo("'", 'Return to the first text on a marked line.', 'ab[c]', '[a]bc', "'a", 'mal'),
  echo('v', 'Start selecting characters; move to extend.', '[a]bc', 'a[b]c', 'vl'),
  echo('V', 'Start selecting whole lines.', '[a]bc', '[a]bc'),
  echo('<C-v>', 'Start selecting a rectangle. Hold Ctrl and press v.', '[a]bc', '[a]bc'),
];

/** Footer examples name arguments; the reference groups them under their command. */
export function referenceKey(key: string): string {
  if (key.startsWith('Ctrl-')) return `<C-${key.slice(5)}>`;
  if (HELP_KEYS.some(entry => entry.key === key)) return key;
  if (/^\d+[a-z]/.test(key)) return key === '3l' ? key : key.replace(/^\d+/, '').slice(0, 1);
  if (key.startsWith('"')) return '"';
  if (key.startsWith('`') || key.startsWith("'")) return key[0] ?? key;
  if (key.startsWith('m')) return 'm';
  if (key.startsWith('$c')) return 'c';
  if (/^[dcy]/.test(key)) return key.slice(1).replace(/^\d+/, '').startsWith('a') || key.slice(1).startsWith('i') ? key.slice(1).replace(/^\d+/, '') : key[0] ?? key;
  return key[0] ?? key;
}

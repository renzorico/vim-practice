const NAMED: Readonly<Record<string, string>> = { '<Esc>': 'Esc', '<CR>': 'Enter', '<BS>': 'Backspace', '<Tab>': 'Tab' };

/** What is printed on the key: Vim's `<C-v>` and `<CR>` are notation, not something a newcomer can find on a keyboard. */
export function keyLabel(key: string): string {
  return key.replace(/<[^<>]+>/g, part => NAMED[part] ?? part.replace(/^<C-(.)>$/, 'Ctrl-$1'));
}

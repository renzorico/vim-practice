import type { Script } from '@escape/world';

/** Keys typed in a script before it offers a hint. */
export const FIRST_HINT_KEYS = 60;

type Unfinished = (text: string) => boolean;
const lacks = (...wanted: readonly string[]): Unfinished => text => wanted.some(part => !text.includes(part));
const count = (text: string, part: string): number => text.split(part).length - 1;

/**
 * One entry per hint, in the script's order: true while the part of the text that hint is about is unfinished.
 * Where typing finishes the part, it waits for the new words, so the hint stays until they are there.
 */
export const UNFINISHED: Readonly<Record<string, readonly Unfinished[]>> = {
  'ledger.book': [
    text => /^wall$/m.test(text), text => text.includes('unpaid'), lacks('Bram'),
    text => text.includes('owed'), text => !/^door$/m.test(text),
  ],
  'manifest.book': [
    text => text.includes('Wordwoood'), lacks(', Shut, Ope)'), lacks('4 coils'), lacks('Last checked: today.'), lacks(', on three.'),
  ],
  'harbour.book': [
    lacks('Keeper: Ream,'), text => !text.startsWith('Order'), text => !/^oil \.[^]*^rope \./m.test(text),
    text => count(text, 'real') < 3, lacks('the ferry, today', 'the rope boat, today', 'Tilde, for Ream'),
  ],
  'contract.book': [
    text => count(text, '"the Librarians"') < 4 || !text.includes('"the Readers"'),
    lacks('(unless they want to)', '[until the Scribe returns]'),
    text => /Clause 3|a single page|Notes:|Nothing guards/.test(text) || !text.includes('the Minotaur.'), lacks('<name>Tilde</name>'),
  ],
  'study.book': [
    text => text.includes('shelf'), text => count(text, '| found') < 8, text => count(text, '* ') < 8 || text.includes('draft'),
  ],
};

/** The first hint whose part of the text is still unfinished; none before the player has tried for a while. */
export function scriptHint(script: Script, lines: readonly string[], keys: number): string | undefined {
  if (keys < FIRST_HINT_KEYS) return undefined;
  const text = lines.join('\n');
  return script.hints.find((_, index) => UNFINISHED[script.id]?.[index]?.(text) ?? false);
}

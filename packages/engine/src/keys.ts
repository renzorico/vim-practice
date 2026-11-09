import type { Key } from './types.js';

const SPECIAL_KEYS: Readonly<Record<string, Key>> = {
  esc: '<Esc>', cr: '<CR>', bs: '<BS>', tab: '<Tab>',
  'c-r': '<C-r>', 'c-d': '<C-d>', 'c-u': '<C-u>', 'c-v': '<C-v>',
  lt: '<',
};

/** Tokenize supported Vim notation; unknown angle-bracket text stays literal. */
export function parseKeys(input: string): Key[] {
  const keys: Key[] = [];
  for (let offset = 0; offset < input.length;) {
    const notation = input.slice(offset).match(/^<([^<>]+)>/);
    const name = notation?.[1]?.toLowerCase();
    const special = name !== undefined && Object.hasOwn(SPECIAL_KEYS, name) ? SPECIAL_KEYS[name] : undefined;
    if (notation && special !== undefined) {
      keys.push(special);
      offset += notation[0].length;
    } else {
      const character = String.fromCodePoint(input.codePointAt(offset)!);
      keys.push(character);
      offset += character.length;
    }
  }
  return keys;
}

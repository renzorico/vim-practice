import { describe, expect, it } from 'vitest';
import { parseKeys } from './keys.js';

describe('parseKeys', () => {
  it.each([
    ['', []],
    ['2dw', ['2', 'd', 'w']],
    ['ciwfoo<Esc>', ['c', 'i', 'w', 'f', 'o', 'o', '<Esc>']],
    ['<Esc><CR><BS><Tab><C-r><C-d><C-u><C-v><lt>',
      ['<Esc>', '<CR>', '<BS>', '<Tab>', '<C-r>', '<C-d>', '<C-u>', '<C-v>', '<']],
    ['<esc><c-R><LT>', ['<Esc>', '<C-r>', '<']],
    ['<unknown>', Array.from('<unknown>')],
    ['<constructor>', Array.from('<constructor>')],
    ['<__proto__>', Array.from('<__proto__>')],
    ['a<broken', Array.from('a<broken')],
    ['<lt>Esc>', Array.from('<Esc>')],
    ['é😀', ['é', '😀']],
    [' \n\t', [' ', '\n', '\t']],
  ])('tokenizes %j', (input, expected) => {
    expect(parseKeys(input)).toEqual(expected);
  });
});

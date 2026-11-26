import { expect, it } from 'vitest';
import { keyLabel } from './keyLabel.js';

it('names special keys as they are printed, alone or inside a sequence, and leaves the rest', () => {
  expect(['<Esc>', '<CR>', '<C-v>', '<C-r>', 'dd', '5r=', '<'].map(keyLabel)).toEqual(['Esc', 'Enter', 'Ctrl-v', 'Ctrl-r', 'dd', '5r=', '<']);
  expect(keyLabel('/x<CR>')).toBe('/xEnter');
  expect(keyLabel('<unknown>')).toBe('<unknown>');
});

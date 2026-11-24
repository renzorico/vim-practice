import { expect, it } from 'vitest';
import { routeHelpCommand } from './command.js';
it('holds help prefixes, supports corrections, and releases non-help input', () => {
  expect(routeHelpCommand(null, ':')).toEqual({ pending: ':', open: false, forward: [] });
  expect(routeHelpCommand(':he', '<BS>').pending).toBe(':h');
  expect(routeHelpCommand(':', '<BS>').pending).toBeNull();
  expect(routeHelpCommand(':h', '<Esc>').forward).toEqual([]);
  expect(routeHelpCommand(':h', '<CR>').open).toBe(true);
  expect(routeHelpCommand(':help', '<CR>').open).toBe(true);
  expect(routeHelpCommand(':he', '<CR>').forward).toEqual([':', 'h', 'e', '<CR>']);
  expect(routeHelpCommand(':', 'e').forward).toEqual([':', 'e']);
});

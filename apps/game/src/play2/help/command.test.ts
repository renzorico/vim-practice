import { expect, it } from 'vitest';
import { routeHelpCommand } from './command.js';
it('holds help prefixes, supports corrections, and releases non-help input', () => {
  expect(routeHelpCommand(null, ':')).toEqual({ pending: ':', open: null, forward: [] });
  expect(routeHelpCommand(':he', '<BS>').pending).toBe(':h');
  expect(routeHelpCommand(':', '<BS>').pending).toBeNull();
  expect(routeHelpCommand(':h', '<Esc>').forward).toEqual([]);
  expect(routeHelpCommand(':h', '<CR>').open).toBe('help');
  expect(routeHelpCommand(':help', '<CR>').open).toBe('help');
  expect(routeHelpCommand(':he', '<CR>').forward).toEqual([':', 'h', 'e', '<CR>']);
  expect(routeHelpCommand(':', 'e').forward).toEqual([':', 'e']);
});
it('routes :hint, and keeps its prefixes apart from :help', () => {
  let pending: string | null = null;
  for (const key of [':', 'h', 'i', 'n', 't']) pending = routeHelpCommand(pending, key).pending;
  expect(pending).toBe(':hint');
  expect(routeHelpCommand(pending, '<CR>')).toEqual({ pending: null, open: 'hint', forward: [] });
  expect(routeHelpCommand(':hi', '<CR>').forward).toEqual([':', 'h', 'i', '<CR>']);
  expect(routeHelpCommand(':hi', 'x').forward).toEqual([':', 'h', 'i', 'x']);
});

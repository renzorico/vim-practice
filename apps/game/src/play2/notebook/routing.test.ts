import { expect, it } from 'vitest';
import { HELP_KEYS } from '../help/keys.js';
import { openPage, pressKey } from './pageModel.js';
import { routeKey } from './routing.js';
it('accepts punctuation that the layout types with Option or AltGr, and leaves Tab and focused buttons alone', () => {
  const entry = HELP_KEYS.find(item => item.example.keys[0] === '{')!;
  const page = openPage(entry, true);
  expect(routeKey({ ...event('{'), altKey: true, mac: true }, page, true).action).toEqual({ type: 'demo', key: '{' });
  expect(routeKey({ ...event('{'), altKey: true, ctrlKey: true, altGraph: true }, page, true).action).toEqual({ type: 'demo', key: '{' });
  expect(routeKey(event('Tab'), page, true)).toEqual({ stop: true, preventDefault: false, action: { type: 'none' } });
  expect(routeKey({ ...event('Enter'), onButton: true }, page, true)).toEqual({ stop: true, preventDefault: false, action: { type: 'none' } });
  expect(routeKey({ ...event(' '), onButton: true, repeat: true }, page, true).preventDefault).toBe(true);
});
const event = (key: string) => ({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false });
it('guards navigation, blocks held keys, and preserves browser shortcuts', () => {
  const page = openPage(HELP_KEYS[0]!, true);
  expect(routeKey(event('Enter'), page, false).action.type).toBe('none');
  expect(routeKey(event('Enter'), page, true).action.type).toBe('continue');
  expect(routeKey({ ...event('Enter'), repeat: true }, page, true).action.type).toBe('none');
  for (const name of ['F1', 'F5', 'F12']) expect(routeKey(event(name), page, true).stop).toBe(false);
  expect(routeKey({ ...event('r'), metaKey: true }, page, true).stop).toBe(false);
});
it('keeps Enter on the page while the example is in Insert mode', () => {
  const entry = HELP_KEYS.find(item => item.example.keys.at(-1) === '<Esc>' && !item.example.keys.includes('<CR>'))!;
  const page = pressKey(openPage(entry, true), entry.example.keys[0]!);
  expect(page.engine.mode).toBe('insert');
  expect(routeKey(event('Enter'), page, true).action.type).toBe('demo');
});
for (const special of ['<CR>', '<Esc>']) it(`gives ${special} to examples from their first key until done, and skips before it`, () => {
  const entry = HELP_KEYS.find(item => item.example.keys.length > 1 && item.example.keys.at(-1) === special)!;
  let page = openPage(entry, true);
  expect(routeKey(event(special === '<CR>' ? 'Enter' : 'Escape'), page, true).action.type).toBe(special === '<CR>' ? 'continue' : 'skip');
  page = pressKey(page, entry.example.keys[0]!);
  expect(routeKey(event(special === '<CR>' ? 'Enter' : 'Escape'), page, true).action.type).toBe('demo');
  for (const key of entry.example.keys.slice(1)) page = pressKey(page, key);
  expect(routeKey(event(special === '<CR>' ? 'Enter' : 'Escape'), page, true).action.type).toBe(special === '<CR>' ? 'continue' : 'skip');
});

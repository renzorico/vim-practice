import { expect, it } from 'vitest';
import { HELP_KEYS } from '../help/keys.js';
import { openPage, pressKey } from './pageModel.js';
import { routeKey } from './routing.js';
const event = (key: string) => ({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false });
it('guards navigation, blocks held keys, and preserves browser shortcuts', () => {
  const page = openPage(HELP_KEYS[0]!, true);
  expect(routeKey(event('Enter'), page, false).action.type).toBe('none');
  expect(routeKey(event('Enter'), page, true).action.type).toBe('continue');
  expect(routeKey({ ...event('Enter'), repeat: true }, page, true).action.type).toBe('none');
  for (const name of ['F1', 'F5', 'F12']) expect(routeKey(event(name), page, true).stop).toBe(false);
  expect(routeKey({ ...event('r'), metaKey: true }, page, true).stop).toBe(false);
});
for (const special of ['<CR>', '<Esc>']) it(`gives ${special} to examples until done`, () => {
  const entry = HELP_KEYS.find(item => item.example.keys.includes(special))!;
  let page = openPage(entry, true);
  expect(routeKey(event(special === '<CR>' ? 'Enter' : 'Escape'), page, true).action.type).toBe('demo');
  for (const key of entry.example.keys) page = pressKey(page, key);
  expect(routeKey(event(special === '<CR>' ? 'Enter' : 'Escape'), page, true).action.type).toBe(special === '<CR>' ? 'continue' : 'skip');
});

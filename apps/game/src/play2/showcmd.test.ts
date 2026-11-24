import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { pendingPrompt, rangePreview } from './showcmd.js';
const engine = createEngine();
const pending = (keys: string) => [...keys].reduce((state, key) => engine.step(state, key).state, engine.init(['abcdef']));
it.each([
  ['r', 'type the character to write'], ['5r', 'type the character to write'],
  ['f', 'type the character to find'], ['t', 'type the character to find'],
  ['F', 'type the character to find'], ['T', 'type the character to find'],
  ['5', 'count: now a command'], ['m', 'type a letter'], ['`', 'type a letter'], ["'", 'type a letter'],
  ['7r', 'not enough room: count too big'],
])('explains %s', (keys, prompt) => expect(pendingPrompt(pending(keys), ['w', '$', 'j'])).toBe(prompt));
it.each(['d', 'c', 'y'])('only suggests allowed motions after %s', key => {
  expect(pendingPrompt(pending(key), ['w', '$'])).toBe('now a motion: w, $');
});
it('previews only a replace, clips invalid ranges, and never changes the engine', () => {
  expect(rangePreview(pending('5'))).toBeNull();
  expect(rangePreview(pending('r'))?.cells).toEqual([{ line: 0, col: 0 }]);
  const state = pending('7r');
  const before = structuredClone(state);
  expect(rangePreview(state)).toMatchObject({ invalid: true, cells: Array.from({ length: 6 }, (_, col) => ({ line: 0, col })) });
  expect(state).toEqual(before);
  expect(pendingPrompt(engine.init(['abc']), [])).toBeNull();
});
it.each([['"', 'type a register letter'], ['"f', 'now y, d or p'], ['"m', 'now y, d or p'], ['di', 'type an object: w, (, ", p...'], ['ca', 'type an object: w, (, ", p...']])('explains %s without mistaking it for a find or a mark', (keys, prompt) => {
  expect(pendingPrompt(pending(keys), ['w'])).toBe(prompt);
});
it('never lists an empty set of motions', () => expect(pendingPrompt(pending('d'), ['}'])).toBe('now a motion'));

import { expect, it } from 'vitest';
import type { Script } from '@escape/world';
import { solvedAt } from './solvedAt.js';

const script: Script = {
  id: 'test', title: 'Test', goalText: 'Reach the end.', startLines: ['ab cd'], startCursor: { line: 0, col: 0 },
  goals: [{ type: 'reach', target: { line: 0, col: 3 } }], par: 1, solution: ['w'], hints: [], effects: [],
};
it('counts keys to the first solved rest state', () => {
  expect(solvedAt(script, ['l', 'l', 'l'], ['l', 'w'])).toBe(3);
  expect(solvedAt(script, ['w'], ['l', 'w'])).toBe(1);
});
it('needs every mustUse skill, and rejects keys the stage does not allow', () => {
  const word = { ...script, mustUse: ['motion.word'] };
  expect(solvedAt(word, ['l', 'l', 'l'], ['l', 'w'])).toBeNull();
  expect(solvedAt(word, ['w'], ['l', 'w'])).toBe(1);
  expect(solvedAt(script, ['w'], ['l'])).toBeNull();
});

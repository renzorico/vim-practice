import { expect, it } from 'vitest';
import { content, stages } from '../content.js';
import { outcomeOf } from './useHints.js';
import { isStuck, nextShown, hintsFor, startEffort, STUCK_BUMPS, STUCK_TURNS, updateEffort } from './hints.js';

it('gives only the hints for the current objective, or all when none names its keys', () => {
  const hints = ['On the gravel, press `4x`.', 'On the bank, press `5r=`.', 'Look around.'];
  expect(hintsFor(hints, 'Cross the river.', ['5', 'r', '='])).toEqual([hints[1]]);
  expect(hintsFor(hints, 'Clear the rubble: `4x`.', [])).toEqual([hints[0]]);
  expect(hintsFor(hints, 'Walk.', [])).toEqual(hints);
});
it('offers a hint after many turns on one objective or bumps in a row, and starts over on progress', () => {
  let effort = startEffort('a', 3);
  expect(isStuck(effort, 3 + STUCK_TURNS - 1)).toBe(false);
  expect(isStuck(effort, 3 + STUCK_TURNS)).toBe(true);
  for (let bump = 0; bump < STUCK_BUMPS; bump++) effort = updateEffort(effort, 'a', 4, 'bump');
  expect(isStuck(effort, 4)).toBe(true);
  expect(isStuck(updateEffort(effort, 'a', 4, 'nothing'), 4)).toBe(true);
  expect(isStuck(updateEffort(effort, 'a', 5, 'turn'), 5)).toBe(false);
  expect(isStuck(updateEffort(effort, 'b', 5, 'nothing'), 5)).toBe(false);
  expect(updateEffort(startEffort('a', 9), 'a', 0, 'nothing').sinceTurn).toBe(0);
  expect(isStuck(updateEffort(effort, 'a', 4, 'restart'), 4)).toBe(false);
});
it('reads one key press from its events', () => {
  expect(outcomeOf([])).toBe('nothing');
  expect(outcomeOf([{ type: 'turn-ended', turn: 1 }])).toBe('turn');
  expect(outcomeOf([{ type: 'bump', reason: 'edge', at: { line: 0, col: 0 } }])).toBe('bump');
});
it('steps through the hints, then puts them away', () => {
  expect([0, 1, 2].map(shown => nextShown(shown, 2))).toEqual([1, 2, 0]);
  expect(nextShown(0, 0)).toBe(0);
});
it('every stage has at least one hint to give', () => {
  expect(content.worlds.length).toBeGreaterThan(5);
  for (const { stage } of stages) expect([...stage.hints, ...stage.scripts.flatMap(script => script.hints)].length, stage.id).toBeGreaterThan(0);
});

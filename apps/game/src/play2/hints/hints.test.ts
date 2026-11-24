import { expect, it } from 'vitest';
import { content, stages } from '../content.js';
import { isStuck, nextShown, orderHints, startEffort, STUCK_BUMPS, STUCK_TURNS, updateEffort } from './hints.js';

it('puts the hint for the current objective first', () => {
  const quarry = stages.find(item => item.stage.id === 'quarry-road')?.stage;
  expect(quarry).toBeDefined();
  const hints = quarry?.hints ?? [];
  expect(orderHints(hints, 'Cross the river.', ['5', 'r', '='])[0]).toContain('`5r=`');
  expect(orderHints(hints, 'Clear the rubble: `4x`.', [])[0]).toContain('`4x`');
  expect(orderHints(hints, 'Walk.', [])).toEqual(hints);
  expect(orderHints(hints, '', ['5', 'r', '='])).toHaveLength(hints.length);
});
it('offers a hint after many turns on one objective or bumps in a row, and starts over on progress', () => {
  let effort = startEffort('a', 3);
  expect(isStuck(effort, 3 + STUCK_TURNS - 1)).toBe(false);
  expect(isStuck(effort, 3 + STUCK_TURNS)).toBe(true);
  for (let bump = 0; bump < STUCK_BUMPS; bump++) effort = updateEffort(effort, 'a', 4, true, false);
  expect(isStuck(effort, 4)).toBe(true);
  expect(isStuck(updateEffort(effort, 'a', 5, false, true), 5)).toBe(false);
  expect(isStuck(updateEffort(effort, 'b', 5, false, false), 5)).toBe(false);
  expect(updateEffort(startEffort('a', 9), 'a', 0, false, false).sinceTurn).toBe(0); // restarted
});
it('steps through the hints, then puts them away', () => {
  expect([0, 1, 2].map(shown => nextShown(shown, 2))).toEqual([1, 2, 0]);
  expect(nextShown(0, 0)).toBe(0);
});
it('every stage has at least one hint to give', () => {
  expect(content.worlds.length).toBeGreaterThan(5);
  for (const { stage } of stages) expect([...stage.hints, ...stage.scripts.flatMap(script => script.hints)].length, stage.id).toBeGreaterThan(0);
});

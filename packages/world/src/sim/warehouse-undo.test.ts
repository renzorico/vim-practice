import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { parseLegend, parseStage } from '../schema.js';
import { createWorldSim } from './index.js';
import type { WorldState } from '../types.js';
import warehouseJson from '../../content/warehouse/warehouse.json';
import legendJson from '../../content/warehouse/warehouse.legend.json';

const stage = parseStage(warehouseJson);
const legend = parseLegend(legendJson);
const sim = createWorldSim(createEngine());
const options = { learnedCommands: ['y', 'p', 'u', '<C-r>', 'x', 'h', 'f'], flags: {} };
function run(state: WorldState, input: string) {
  let next = { state, events: [] as ReturnType<typeof sim.step>['events'] };
  for (const key of parseKeys(input)) next = sim.step(next.state, key, stage, legend, options);
  return next;
}
it('undo/redo remove and restore pasted fixed tiles, spending turns and remapping anchors/entities', () => {
  const initial = sim.init({ ...stage, start: { line: 1, col: 2 } }, legend, options);
  const pasted = run(initial, 'yt[p');
  expect(pasted.state.engine.registers['"']?.text).toBe('oooo]___');
  expect(pasted.state.engine.lines[1]).toBe('#[ooooo]___ooo]___[]#');
  expect(pasted.state.entities.find(entity => entity.id === 'shelf-top')?.at.col).toBe(18);
  expect(pasted.state.turn).toBe(2);
  const undone = run(pasted.state, 'u');
  expect(undone.events.some(event => event.type === 'bump')).toBe(false);
  expect(undone.state.engine.lines).toEqual(initial.engine.lines);
  expect(undone.state.entities).toEqual(initial.entities);
  expect(undone.state.turn).toBe(3);
  const redone = run(undone.state, '<C-r>');
  expect(redone.state.engine.lines).toEqual(pasted.state.engine.lines);
  expect(redone.state.entities).toEqual(pasted.state.entities);
  expect(redone.state.turn).toBe(4);
  const blocked = run(redone.state, 'x');
  expect(blocked.events).toEqual([{ type: 'bump', reason: 'fixed', at: redone.state.engine.cursor }]);
  expect(blocked.state.turn).toBe(4);
});
it('undo remains subject to landing validation', () => {
  // yt[ was made while standing on the nonwalkable rack lip; legal p moves off
  // it. Undo returns there and must bump wall, preserving the paste/history.
  const initial = sim.init({ ...stage, start: { line: 1, col: 6 } }, legend, options);
  const yanked = run(initial, 'yt[');
  // A yank itself cannot land on the lip. Seed its register from the pure engine
  // so this fixture isolates the undo landing rule rather than a legal route.
  const engine = createEngine();
  let field = engine.init(stage.map, { line: 1, col: 6 });
  for (const key of parseKeys('yt[')) field = engine.step(field, key).state;
  const pasted = run({ ...yanked.state, engine: field }, 'p');
  const undone = run(pasted.state, 'u');
  expect(undone.events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 1, col: 6 } });
  expect(undone.state.engine.lines).toEqual(pasted.state.engine.lines);
});

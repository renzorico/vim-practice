import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { warehouse, warehouseLegend } from '../play2/content.js';
import { WAREHOUSE_COMMANDS } from '../play2/session.js';
import { warehouseTransfer } from './warehouseTransfer.js';
const sim = createWorldSim(createEngine());
const options = { learnedCommands: WAREHOUSE_COMMANDS, flags: {} };
it.each(['yw', 'y4l'])('uses the real %s range for four glinting jars without changing terrain', input => {
  const initial = sim.init({ ...warehouse, start: { line: 1, col: 2 } }, warehouseLegend, options);
  let result = { state: initial, events: [] as ReturnType<typeof sim.step>['events'] };
  for (const key of parseKeys(input)) result = sim.step(result.state, key, warehouse, warehouseLegend, options);
  const transfer = warehouseTransfer(initial, result.state, result.events);
  expect(transfer?.type).toBe('yank');
  expect(transfer?.cells.map(cell => [cell.at.col, cell.char])).toEqual([[2, 'o'], [3, 'o'], [4, 'o'], [5, 'o']]);
  expect(result.state.engine.lines).toEqual(initial.engine.lines);
});
it('reports exact put cells and never animates a rejected put', () => {
  let before = sim.init({ ...warehouse, start: { line: 1, col: 2 } }, warehouseLegend, options);
  for (const key of parseKeys('ywf[')) before = sim.step(before, key, warehouse, warehouseLegend, options).state;
  const put = sim.step(before, 'p', warehouse, warehouseLegend, options);
  expect(warehouseTransfer(before, put.state, put.events)).toMatchObject({ type: 'put', line: 1, col: 11, length: 4 });
  const bad = { ...before, engine: { ...before.engine, registers: { '"': { text: 'oooo]', linewise: false } } } };
  const rejected = sim.step(bad, 'p', warehouse, warehouseLegend, options);
  expect(warehouseTransfer(bad, rejected.state, rejected.events)).toBeNull();
});

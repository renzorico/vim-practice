import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import type { Stage } from '../types.js';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { createWorldSim } from './index.js';

const sim = createWorldSim(createEngine());
const stage: Stage = { ...FIXTURE_STAGE, map: ['oooo', 'oooo', 'oooo', 'oooo'],
  start: { line: 2, col: 2 }, triggers: [], scripts: [], clear: [{ type: 'flag', flag: 'done' }],
  entities: [
    { id: 'mason', kind: 'keeper', sprite: 'mason', at: { line: 1, col: 0 },
      behaviour: { type: 'build', rows: ['oooo', '    '] }, every: 2, damage: 0, solid: true },
    { id: 'below', kind: 'prop', sprite: 'stone', at: { line: 3, col: 3 },
      behaviour: { type: 'still' }, every: 1, damage: 0, solid: false },
  ] };
const options = { learnedCommands: ['0', 'u', '<C-r>'], flags: {} };
const step = (state: ReturnType<typeof sim.init>, key = '0') => sim.step(state, key, stage, FIXTURE_LEGEND, options);

it('builds on every Nth turn, carrying the builder, lower entities and player with exact text', () => {
  const initial = sim.init(stage, FIXTURE_LEGEND, options);
  const first = step(initial);
  expect(first.state.engine.lines).toEqual(stage.map);
  const built = step(first.state);
  expect(built.state.engine.lines).toEqual(['oooo', 'oooo', 'oooo', 'oooo', 'oooo']);
  expect(built.state.entities.map(entity => [entity.id, entity.at, entity.pathIndex])).toEqual([
    ['mason', { line: 2, col: 0 }, 1], ['below', { line: 4, col: 3 }, 0],
  ]);
  expect(built.state.engine.cursor).toEqual({ line: 3, col: 0 });
  expect(built.state.engine.undoStack.at(-1)?.edits).toEqual([{ start: 5, removed: 0, inserted: 'oooo\n' }]);
  expect(built.events).toContainEqual({ type: 'rows-changed', fromLine: 1, toLine: 1, lineDelta: 1, by: 'entity' });
  expect(initial.engine.lines).toEqual(stage.map);
});

it('stops after the last row without wrapping or adding undo entries', () => {
  let state = sim.init(stage, FIXTURE_LEGEND, options);
  for (let turn = 0; turn < 8; turn += 1) state = step(state).state;
  expect(state.engine.lines).toEqual(['oooo', 'oooo', '    ', 'oooo', 'oooo', 'oooo']);
  expect(state.entities[0]?.pathIndex).toBe(2);
  expect(state.engine.undoStack).toHaveLength(2);
});

it('undo remaps surviving entities and does not rewind the build index; restore does', () => {
  const initial = sim.init(stage, FIXTURE_LEGEND, options);
  const built = step(step(initial).state).state;
  const undone = step(built, 'u').state; // turn 3: no new build
  expect(undone.engine.lines).toEqual(stage.map);
  expect(undone.entities[0]).toMatchObject({ at: { line: 1, col: 0 }, pathIndex: 1 });
  const redone = step(undone, '<C-r>').state; // turn 4: redo then build the second row
  expect(redone.engine.lines).toEqual(['oooo', 'oooo', '    ', 'oooo', 'oooo', 'oooo']);
  expect(redone.entities[0]).toMatchObject({ at: { line: 3, col: 0 }, pathIndex: 2 });
  const restored = sim.restore(redone).state;
  expect(restored.engine.lines).toEqual(stage.map);
  expect(restored.entities).toEqual(initial.entities);
  expect(restored.turn).toBe(0);
});

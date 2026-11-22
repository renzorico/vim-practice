import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import type { Stage } from '../types.js';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { StageSchema } from '../schema.js';
import { createWorldSim } from './index.js';
const sim = createWorldSim(createEngine());
const stage: Stage = { ...FIXTURE_STAGE, map: ['oooooo', 'oooooo'], start: { line: 0, col: 3 },
  entities: [{ id: 'clerk', kind: 'keeper', sprite: 'clerk', at: { line: 0, col: 0 },
    behaviour: { type: 'put', text: 'o' }, every: 2, damage: 0, solid: true },
  { id: 'right', kind: 'prop', sprite: 'stone', at: { line: 0, col: 4 },
    behaviour: { type: 'still' }, every: 1, damage: 0, solid: false }],
  triggers: [], scripts: [], clear: [{ type: 'flag', flag: 'done' }] };
const options = { learnedCommands: ['l', 'u'], flags: {} };
it('puts after its own cell every two turns, remaps player and entities, and undoes the exact insertion', () => {
  const initial = sim.init(stage, FIXTURE_LEGEND, options);
  const first = sim.step(initial, 'l', stage, FIXTURE_LEGEND, options);
  expect(first.state.engine.lines).toEqual(stage.map);
  const put = sim.step(first.state, 'l', stage, FIXTURE_LEGEND, options);
  expect(put.state.engine.lines).toEqual(['ooooooo', 'oooooo']);
  expect(put.state.entities.map(e => e.at)).toEqual([{ line: 0, col: 0 }, { line: 0, col: 5 }]);
  expect(put.state.engine.cursor).toEqual({ line: 0, col: 6 });
  expect(put.events).toContainEqual({ type: 'rows-changed', fromLine: 0, toLine: 0, lineDelta: 0, by: 'entity' });
  expect(put.state.engine.undoStack.at(-1)?.edits).toEqual([{ start: 1, removed: 0, inserted: 'o' }]);
  const undone = sim.step(put.state, 'u', stage, FIXTURE_LEGEND, options);
  expect(undone.state.engine.lines).toEqual(stage.map);
  expect(undone.state.entities.map(e => e.at)).toEqual(initial.entities.map(e => e.at));
  expect(initial.engine.lines).toEqual(stage.map);
});
it('hit emits effect damage; a lethal batch cannot replace the stage-start checkpoint', () => {
  const initial = sim.init(stage, FIXTURE_LEGEND, options);
  const hit = sim.apply(initial, [{ type: 'hit', hearts: 1 }], stage, FIXTURE_LEGEND);
  expect(hit.state.hearts).toBe(2);
  expect(hit.events).toContainEqual({ type: 'player-hit', by: 'effect', hearts: 2 });
  const dead = sim.apply(initial, [{ type: 'set-rows', fromLine: 1, lines: ['ooo'] }, { type: 'hit', hearts: 3 }], stage, FIXTURE_LEGEND);
  expect(dead.state.status).toBe('dead');
  expect(dead.events).toContainEqual({ type: 'player-died' });
  expect(dead.events.some(e => e.type === 'checkpoint-saved')).toBe(false);
  const restored = sim.restore(dead.state).state;
  expect(restored.engine.lines).toEqual(stage.map);
  expect(restored.hearts).toBe(3);
  expect(restored.turn).toBe(0);
});
it('hit after cleared changes nothing', () => {
  const cleared = sim.apply(sim.init(stage, FIXTURE_LEGEND, options), [{ type: 'set-flag', flag: 'done', value: true }], stage, FIXTURE_LEGEND).state;
  const hit = sim.apply(cleared, [{ type: 'hit', hearts: 3 }], stage, FIXTURE_LEGEND);
  expect(hit.state.hearts).toBe(3);
  expect(hit.state.status).toBe('cleared');
  expect(hit.state).toBe(cleared);
  expect(hit.events).toEqual([]);
});
it('world schema accepts put/hit and reject empty/multiline puts and nonpositive/fractional hits', () => {
  expect(StageSchema.safeParse(stage).success).toBe(true);
  for (const text of ['', 'f\nf']) {
    expect(StageSchema.safeParse({ ...stage, entities: stage.entities.map(e => ({ ...e, behaviour: { type: 'put', text } })) }).success).toBe(false);
  }
  expect(StageSchema.safeParse({ ...stage, scripts: [{ ...FIXTURE_STAGE.scripts[0], effects: [{ type: 'hit', hearts: 3 }] }] }).success).toBe(true);
  for (const hearts of [0, -1, 1.5]) {
    const scripts = [{ ...FIXTURE_STAGE.scripts[0], effects: [{ type: 'hit', hearts }] }];
    expect(StageSchema.safeParse({ ...stage, scripts }).success).toBe(false);
  }
});

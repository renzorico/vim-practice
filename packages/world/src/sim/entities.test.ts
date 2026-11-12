import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { createWorldSim } from './index.js';
import type { EntityKind } from '../types.js';
for (const kind of ['blot', 'keeper'] as const satisfies readonly EntityKind[]) {
  it(`${kind}: contact bursts only Blots, once, after the hit`, () => {
    const sim = createWorldSim(createEngine());
    const stage = { ...FIXTURE_STAGE, start: { line: 2, col: 0 }, entities: [{
      id: 'enemy', kind, sprite: 'blot', at: { line: 2, col: 0 },
      behaviour: { type: 'still' as const }, every: 5, damage: 1, solid: false,
    }] };
    const options = { learnedCommands: ['0'], flags: {} };
    const initial = sim.init(stage, FIXTURE_LEGEND, options);
    const hit = sim.step(initial, '0', stage, FIXTURE_LEGEND, options);
    expect(hit.state.hearts).toBe(2);
    expect(hit.state.entities).toHaveLength(kind === 'blot' ? 0 : 1);
    if (kind === 'blot') {
      expect(hit.events.filter(event => event.type === 'player-hit' || event.type === 'entity-removed')).toEqual([
        { type: 'player-hit', by: 'enemy', hearts: 2 },
        { type: 'entity-removed', entity: 'enemy', cause: 'hit' },
      ]);
    }
    const again = sim.step(hit.state, '0', stage, FIXTURE_LEGEND, options);
    expect(again.state.hearts).toBe(kind === 'blot' ? 2 : 1);
    expect(initial.entities).toHaveLength(1);
  });
}

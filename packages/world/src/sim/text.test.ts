import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { FIXTURE_LEGEND as legend, FIXTURE_STAGE } from '../fixtures.js';
import type { Stage, WorldOptions, WorldState, WorldStepResult } from '../types.js';
import { createWorldSim, playKeys } from './index.js';

const sim = createWorldSim(createEngine());
const options: WorldOptions = { learnedCommands: ['y', 'l', 'p', 'u', 'x', 'dd', 'i', '<Esc>', 'j', '0', '$'], flags: {} };
function room(overrides: Partial<Stage> = {}): Stage {
  return { ...FIXTURE_STAGE, world: 'copper-port', map: ['oS'], start: { line: 0, col: 0 },
    entities: [{ id: 'shelf', kind: 'prop', sprite: 'shelf', at: { line: 0, col: 1 },
      behaviour: { type: 'still' }, every: 1, damage: 0, solid: false }],
    triggers: [{ id: 'stocked', on: 'text', anchor: 'shelf', text: 'o', once: true }],
    scripts: [], clear: [{ type: 'flag', flag: 'never' }], ...overrides };
}
function advance(state: WorldState, keys: string, stage: Stage) {
  const events = [];
  for (const key of parseKeys(keys)) {
    const result = sim.step(state, key, stage, legend, options);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
const fired = (result: WorldStepResult) => result.events.filter(event => event.type === 'trigger-fired');

describe('turn-end text triggers', () => {
  it('fires after put, once; undo breaks the match without rewinding the trigger', () => {
    const stage = room();
    const result = playKeys(sim, stage, legend, options, parseKeys('yllp'));
    expect(result.state.engine.lines).toEqual(['oSo']);
    expect(fired(result)).toEqual([{ type: 'trigger-fired', trigger: 'stocked' }]);
    const undone = advance(result.state, 'u', stage);
    expect(undone.state.engine.lines).toEqual(['oS']);
    expect(undone.state.firedTriggers).toEqual(['stocked']);
    expect(fired(undone)).toEqual([]);
    expect(fired(advance(undone.state, 'p', stage))).toEqual([]);
  });
  it.each(['o', 'ooT', 'oooT'])('does not match a short or different row suffix %s', suffix => {
    const stage = room({ map: [`oS${suffix}`], triggers: [{ id: 'stocked', on: 'text', anchor: 'shelf', text: 'oooo', once: false }] });
    expect(fired(playKeys(sim, stage, legend, options, ['l']))).toEqual([]);
  });
  it('matches exactly the requested window even when more text follows it', () => {
    const stage = room({ map: ['oSoo'] });
    expect(fired(playKeys(sim, stage, legend, options, ['l']))).toHaveLength(1);
  });
  it('follows the anchor through insertion, deletion before it, and deletion of rows above', () => {
    const stage = room({ map: ['oo', 'ooSo'], entities: [{ ...room().entities[0]!, at: { line: 1, col: 2 } }],
      triggers: [{ id: 'stocked', on: 'text', anchor: 'shelf', text: 'o', once: false }] });
    let state = sim.init(stage, legend, options);
    for (const [keys, at] of [['dd', { line: 0, col: 2 }], ['io<Esc>', { line: 0, col: 3 }], ['x', { line: 0, col: 2 }]] as const) {
      const result = advance(state, keys, stage);
      expect(result.state.entities[0]?.at).toEqual(at);
      expect(fired(result)).toHaveLength(1);
      state = result.state;
    }
  });
  it('never fires for a removed anchor, even after undo', () => {
    const stage = room({ map: ['ooo'], entities: [{ ...room().entities[0]!, at: { line: 0, col: 0 } }] });
    const result = playKeys(sim, stage, legend, options, parseKeys('xu'));
    expect(result.state.entities).toEqual([]);
    expect(fired(result)).toEqual([]);
  });
  it('does not fire mid-command or on a bump', () => {
    const stage = room({ map: ['oSo'] });
    const pending = playKeys(sim, stage, legend, options, ['i', 'o']);
    expect(fired(pending)).toEqual([]);
    expect(fired(advance(pending.state, '<Esc>', stage))).toHaveLength(1);
    // Start directly on the fixed anchor: x is cancelled and never checks triggers.
    expect(fired(playKeys(sim, { ...stage, start: { line: 0, col: 1 } }, legend, options, ['x']))).toEqual([]);
  });
  it('shares enter ordering, flag guards, and script opening', () => {
    const stage = room({ map: ['oSo'], triggers: [
      { id: 'enter', on: 'enter', area: { from: { line: 0, col: 1 }, to: { line: 0, col: 1 } }, once: false },
      { id: 'blocked', on: 'text', anchor: 'shelf', text: 'o', once: false, onlyIf: 'ready' },
      { id: 'stocked', on: 'text', anchor: 'shelf', text: 'o', once: false, unless: 'blocked', opensScript: 'sign' },
    ], scripts: [{ ...FIXTURE_STAGE.scripts[0]!, id: 'sign' }] });
    const result = playKeys(sim, stage, legend, options, ['l']);
    expect(fired(result).map(event => event.trigger)).toEqual(['enter', 'stocked']);
    expect(result.state.script?.id).toBe('sign');
    expect(fired(playKeys(sim, stage, legend, { ...options, flags: { ready: true, blocked: true } }, ['l']))
      .map(event => event.trigger)).toEqual(['enter', 'blocked']);
  });
});

import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { createWorldSim, playKeys } from '../sim/index.js';
import type { EntitySpawn, Legend, Stage, WorldSim } from '../types.js';
import { solveStage } from './index.js';

const legend: Legend = { ...FIXTURE_LEGEND, tiles: [...FIXTURE_LEGEND.tiles,
  ...['x', '(', ')'].map(char => ({ char, kind: 'object' as const, sprite: 'cargo', walkable: true, fixed: false, label: 'cargo' }))] };
const baseSim = createWorldSim(createEngine());
const sim: WorldSim = { ...baseSim, step(state, key, stage, tiles, options) {
  const result = baseSim.step(state, key, stage, tiles, options);
  if (!result.events.some(event => event.type === 'trigger-fired' && event.trigger === 'copied')) return result;
  const applied = baseSim.apply(result.state, [{ type: 'set-flag', flag: 'copied', value: true }], stage, tiles);
  return { state: applied.state, events: [...result.events, ...applied.events] };
} };
function entity(id: string, line: number, col: number, kind: EntitySpawn['kind'] = 'blot'): EntitySpawn {
  return { id, kind, sprite: id, at: { line, col }, behaviour: { type: 'still' }, every: 1, damage: 0, solid: false };
}
function room(overrides: Partial<Stage>): Stage {
  return { ...FIXTURE_STAGE, world: 'library', start: { line: 0, col: 1 }, scripts: [], triggers: [], entities: [],
    clear: [{ type: 'no-entities', kind: 'blot' }], ...overrides };
}
const examples = [
  { name: 'diw clears junk between boards', stage: room({ map: [' xxx S'], entities: [entity('junk', 0, 2)] }),
    commands: ['d', 'iw'], keys: 'diw', turns: 1 },
  { name: 'da( removes a whole bracketed pile', stage: room({ map: ['(xxx) S'], entities: [entity('left', 0, 0), entity('right', 0, 4)] }),
    commands: ['d', 'a('], keys: 'da(', turns: 1 },
  { name: 'dap removes a block of rows', stage: room({ map: ['xxx', 'xxx', '', ' S'],
    entities: [entity('top', 0, 1), entity('bottom', 1, 1)] }), commands: ['d', 'ap'], keys: 'dap', turns: 1 },
  { name: 'yi( copies contents to an anchor', stage: room({ map: ['(xxx)S'], start: { line: 0, col: 0 },
    entities: [entity('anchor', 0, 5, 'prop')], triggers: [{ id: 'copied', on: 'text', anchor: 'anchor', text: 'xxx', once: true }],
    clear: [{ type: 'flag', flag: 'copied' }] }), commands: ['y', 'i(', '$', 'p'], keys: 'yi($p', turns: 3 },
];
describe('Library text object stage proofs', () => {
  it.each(examples)('$name', example => {
    const options = { learnedCommands: example.commands, flags: {} };
    const solution = solveStage(sim, example.stage, legend, options, { maxTurns: example.turns, maxExpanded: 1000 });
    expect(solution?.keys).toEqual(parseKeys(example.keys));
    expect(solution?.turns).toBe(example.turns);
    expect(playKeys(sim, example.stage, legend, options, solution?.keys ?? []).state.status).toBe('cleared');
  });
  it('keeps text objects out of earlier worlds', () => {
    const example = examples[0];
    expect(example).toBeDefined();
    if (example === undefined) return;
    expect(solveStage(sim, { ...example.stage, world: 'copper-port' }, legend,
      { learnedCommands: example.commands, flags: {} }, { maxTurns: 1 })).toBeNull();
  });
});

it('bounds learned text object actions to counts 1–3 and skips c', () => {
  const seen = new Set<string>();
  const observed: WorldSim = { ...sim, step(state, key, stage, tiles, options) {
    const result = sim.step(state, key, stage, tiles, options);
    for (const event of result.events) if (event.type === 'command') seen.add(event.command.keys.join(''));
    return result;
  } };
  const stage = room({ map: ['x x x x S'], start: { line: 0, col: 0 }, clear: [{ type: 'flag', flag: 'never' }] });
  solveStage(observed, stage, legend, { learnedCommands: ['d', 'y', 'c', 'aw'], flags: {} }, { maxExpanded: 1 });
  for (const operator of ['d', 'y']) {
    expect(seen.has(operator + 'aw')).toBe(true);
    expect(seen.has(operator + '2aw')).toBe(true);
    expect(seen.has(operator + '3aw')).toBe(true);
    expect(seen.has(operator + '4aw')).toBe(false);
  }
  expect([...seen].some(keys => keys.startsWith('c'))).toBe(false);
});

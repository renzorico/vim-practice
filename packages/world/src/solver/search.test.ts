import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { createWorldSim, playKeys } from '../sim/index.js';
import type { Stage, WorldSim } from '../types.js';
import { solveStage } from './index.js';

const legend = { ...FIXTURE_LEGEND, tiles: [...FIXTURE_LEGEND.tiles,
  { char: 'x', kind: 'object' as const, sprite: 'target', walkable: true, fixed: false, label: 'target' }] };
const base = createWorldSim(createEngine());
const sim: WorldSim = { ...base, step(state, key, stage, tiles, options) {
  const result = base.step(state, key, stage, tiles, options);
  if (!result.events.some(event => event.type === 'trigger-fired' && event.trigger === 'errand')) return result;
  const applied = base.apply(result.state, [{ type: 'set-flag', flag: 'errand', value: true }], stage, tiles);
  return { state: applied.state, events: [...result.events, ...applied.events] };
} };
function area(line: number, col: number) { return { from: { line, col }, to: { line, col } }; }
function room(overrides: Partial<Stage>): Stage {
  return { ...FIXTURE_STAGE, world: 'echo-caves', map: [' o', '~~~', '  x'], start: { line: 0, col: 0 },
    scripts: [], entities: [], triggers: [], clear: [{ type: 'reach', area: area(2, 2) }], ...overrides };
}
const examples = [
  { name: 'search jumps across rows', stage: room({}), commands: ['/', 'f'], keys: '/x<CR>', turns: 1 },
  { name: 'n repeats to the second match', stage: room({ map: [' o', ' x', ' x'], clear: [{ type: 'reach', area: area(2, 1) }] }),
    commands: ['/', 'n'], keys: '/x<CR>n', turns: 2 },
  { name: 'a mark returns after an errand', stage: room({ map: [' o x'], start: { line: 0, col: 1 },
    triggers: [{ id: 'errand', on: 'enter', area: area(0, 3), once: true }],
    clear: [{ type: 'flag', flag: 'errand' }, { type: 'reach', area: area(0, 1) }] }),
    commands: ['m', '`', 'l'], keys: 'ma2l`a', turns: 3 },
  { name: 'star finds the next word copy', stage: room({ map: ['x o', '~~~', ' x'], start: { line: 0, col: 0 },
    clear: [{ type: 'reach', area: area(2, 1) }] }), commands: ['*'], keys: '*', turns: 1 },
];
describe('Echo Caves search and mark proofs', () => {
  it.each(examples)('$name', example => {
    const options = { learnedCommands: example.commands, flags: {} };
    const solution = solveStage(sim, example.stage, legend, options, { maxTurns: example.turns, maxExpanded: 2000 });
    expect(solution?.keys).toEqual(parseKeys(example.keys));
    expect(solution?.turns).toBe(example.turns);
    expect(playKeys(sim, example.stage, legend, options, solution?.keys ?? []).state.status).toBe('cleared');
  });
  it('keeps search actions out of earlier worlds', () => {
    expect(solveStage(sim, room({ world: 'library' }), legend, { learnedCommands: ['/', 'm', '`'], flags: {} }, { maxExpanded: 50 })).toBeNull();
  });
});

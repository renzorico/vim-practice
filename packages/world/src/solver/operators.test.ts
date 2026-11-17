import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import { createWorldSim, playKeys } from '../sim/index.js';
import type { EntitySpawn, Legend, Stage, WorldSim } from '../types.js';
import { solveStage } from './index.js';

const legend: Legend = { ...FIXTURE_LEGEND, tiles: [...FIXTURE_LEGEND.tiles,
  ...['i', 'l', 'x'].map(char => ({ char, kind: 'object' as const, sprite: 'cargo', walkable: true, fixed: char === 'i', label: 'cargo' }))] };
const baseSim = createWorldSim(createEngine());
// Tiny story adapter: text triggers set the clear flag through the public effect API.
const sim: WorldSim = { ...baseSim, step(state, key, stage, tiles, options) {
  const result = baseSim.step(state, key, stage, tiles, options);
  if (!result.events.some(event => event.type === 'trigger-fired' && event.trigger === 'stocked')) return result;
  const applied = baseSim.apply(result.state, [{ type: 'set-flag', flag: 'stocked', value: true }], stage, tiles);
  return { state: applied.state, events: [...result.events, ...applied.events] };
} };
function entity(id: string, col: number, kind: EntitySpawn['kind'] = 'prop'): EntitySpawn {
  return { id, kind, sprite: id, at: { line: 0, col }, behaviour: { type: 'still' }, every: 1, damage: 0, solid: false };
}
function room(overrides: Partial<Stage>): Stage {
  return { ...FIXTURE_STAGE, world: 'copper-port', start: { line: 0, col: 0 }, scripts: [], triggers: [], entities: [], ...overrides };
}
const shelf = { id: 'stocked', on: 'text', anchor: 'shelf', text: 'oilx', once: true } as const;
const examples = [
  { name: 'dw clears a pile of junk', stage: room({ map: ['oooooooooooo S'],
    entities: [entity('junk', 11, 'blot')], clear: [{ type: 'no-entities', kind: 'blot' }] }),
    commands: ['d', 'w', 'x'], keys: 'dw', turns: 1 },
  { name: 'y4l and p stock an anchored shelf', stage: room({ map: ['oilxS'],
    entities: [entity('shelf', 4)], triggers: [shelf], clear: [{ type: 'flag', flag: 'stocked' }] }),
    commands: ['y', 'l', 'p'], keys: 'y4l4lp', turns: 3 },
  { name: 'register zero survives a delete', stage: room({ map: ['ixS'],
    entities: [entity('junk', 1, 'blot'), entity('shelf', 2)], triggers: [{ ...shelf, text: 'i' }],
    clear: [{ type: 'no-entities', kind: 'blot' }, { type: 'flag', flag: 'stocked' }] }),
    commands: ['y', 'l', 'd', 'p', '"'], keys: 'ylldl"0p', turns: 4 },
  { name: 'yy and p duplicate a row', stage: room({ map: [' o', 'S'],
    clear: [{ type: 'reach', area: { from: { line: 1, col: 1 }, to: { line: 1, col: 1 } } }] }),
    commands: ['yy', 'p'], keys: 'yyp', turns: 2 },
];

describe('operator and register stage proofs', () => {
  it.each(examples)('$name', example => {
    const settings = { learnedCommands: example.commands, flags: {} };
    const solution = solveStage(sim, example.stage, legend, settings, { maxTurns: example.turns, maxExpanded: 10000 });
    console.info('E1 tiny', example.name, JSON.stringify(solution));
    expect(solution?.keys).toEqual(parseKeys(example.keys));
    expect(solution?.turns).toBe(example.turns);
    expect(playKeys(sim, example.stage, legend, settings, solution?.keys ?? []).state.status).toBe('cleared');
  });
});

function rootCommands(commands: readonly string[], map = ['oo oo', 'oo oo', 'oo oo']) {
  const seen = new Set<string>();
  const observed: WorldSim = { ...sim,
    init(stage, tiles, settings) {
      const state = sim.init(stage, tiles, settings);
      return { ...state, engine: { ...state.engine, registers: {
        '"': { text: 'o', linewise: false }, '0': { text: 'oo', linewise: false },
        a: { text: 'o', linewise: false }, b: { text: 'oo', linewise: false },
      } } };
    },
    step(state, key, stage, tiles, settings) {
      const result = sim.step(state, key, stage, tiles, settings);
      result.events.forEach(event => {
        if (event.type === 'command') seen.add(event.command.keys.join(''));
      });
      return result;
    },
  };
  solveStage(observed, room({ map, clear: [{ type: 'flag', flag: 'never' }] }), legend,
    { learnedCommands: commands, flags: {} }, { maxTurns: 0, maxExpanded: 1 });
  return seen;
}

it('generates counted operators, row-local find arguments, line yanks, puts and bounded registers', () => {
  const seen = rootCommands(['d', 'y', 'yy', 'dd', 'p', 'P', 'l', 'w', 'f', 't', '"', 'c']);
  for (const command of ['d3l', 'y3l', 'df ', 'dt ', 'yf ', 'yt ', 'yy', '2yy', '2dd', 'p', '5p', 'P', '5P',
    '"adw', '"byl', '"0p', '"aP', '"byy', '"0dd']) expect(seen.has(command), command).toBe(true);
  expect([...seen].some(command => command.includes('c'))).toBe(false);
  expect([...seen].some(command => command.startsWith('"c'))).toBe(false);
  const restricted = rootCommands(['d', 'l']);
  expect([...restricted].some(command => command.startsWith('y') || command.startsWith('"') || command.includes('w'))).toBe(false);
});

it('keeps trying larger operator counts after a rejected landing', () => {
  expect(rootCommands(['d', 'l'], ['oTToS']).has('d3l')).toBe(true);
});

it('requires a learned and allowed register prefix', () => {
  const stage = examples[2]!.stage;
  const commands = examples[2]!.commands;
  expect(solveStage(sim, { ...stage, allowedCommands: commands.filter(command => command !== '"') }, legend,
    { learnedCommands: commands, flags: {} }, { maxTurns: 4, maxExpanded: 10000 })).toBeNull();
});

it('tries put counts beyond the row length, and a plain put on an empty row', () => {
  expect(rootCommands(['y', 'l', 'p'], ['oooo', 'oooo', 'oooo', 'oooo', 'oooo', 'oooo', 'oooo', 'oooooooo']).has('8p')).toBe(true);
  expect(rootCommands(['p'], ['']).has('p')).toBe(true);
});

it('never pairs an operator with a scroll (not a Vim motion)', () => {
  const seen = rootCommands(['d', 'y', '<C-d>', '<C-u>']);
  expect([...seen].some(command => command.includes('<C-d>') && /^"?.?[dy]/.test(command))).toBe(false);
});

import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';
import type { Legend, Stage, WorldOptions } from '../types.js';
import { createWorldSim, playKeys } from './index.js';
import { blocked, nearestFreeCell } from './movement.js';

const sim = createWorldSim(createEngine());
const clearing = { char: ' ', kind: 'ground', walkable: true, fixed: false, sprite: 'grass', label: 'clearing' } as const;
const legend: Legend = { ...FIXTURE_LEGEND, emptyRow: clearing };
const options: WorldOptions = { learnedCommands: ['j', 'k', '}', '{', 'dd', '<C-d>', '<C-u>'], flags: {} };
function stage(overrides: Partial<Stage> = {}): Stage {
  return { ...FIXTURE_STAGE, map: ['ooooooo', '', 'ooooooo'], start: { line: 0, col: 5 },
    entities: [], triggers: [], scripts: [], clear: [{ type: 'flag', flag: 'done' }], ...overrides };
}
function run(keys: string, room = stage(), tiles = legend) {
  return playKeys(sim, room, tiles, options, parseKeys(keys));
}

describe('empty-row cells', () => {
  it('lets paragraph jumps land on a clearing and resets the wanted column', () => {
    const landed = run('}').state.engine;
    expect(landed.cursor).toEqual({ line: 1, col: 0 });
    expect(landed.desiredCol).toBe(0);
    expect(run('}j').state.engine.cursor).toEqual({ line: 2, col: 0 });
  });
  it('bumps without an empty-row tile', () => {
    const result = run('}', stage(), FIXTURE_LEGEND);
    expect(result.events).toContainEqual({ type: 'bump', reason: 'edge', at: { line: 1, col: 0 } });
    expect(result.state.engine.cursor).toEqual(stage().start);
  });
  it('walks through an empty row, keeping the old wanted column', () => {
    const landed = run('j').state.engine;
    expect(landed.cursor).toEqual({ line: 1, col: 0 });
    expect(landed.desiredCol).toBe(5);
    expect(run('jj').state.engine.cursor).toEqual({ line: 2, col: 5 });
    expect(run('2j').state.engine.cursor).toEqual({ line: 2, col: 5 });
  });
  it('has exactly one cell and can relocate onto it', () => {
    expect(blocked([''], { line: 0, col: 0 }, [], legend)).toBeNull();
    expect(blocked([''], { line: 0, col: 1 }, [], legend)).toBe('edge');
    expect(nearestFreeCell([''], { line: 9, col: 3 }, [], legend)).toEqual({ line: 0, col: 0 });
    expect(nearestFreeCell([''], { line: 0, col: 0 }, [], FIXTURE_LEGEND)).toBeNull();
  });
  it('lets a Blot chase onto a clearing', () => {
    const def = FIXTURE_STAGE.entities[0];
    if (def === undefined) throw new Error('Missing Blot fixture');
    const room = stage({ start: { line: 0, col: 0 }, entities: [{ ...def, at: { line: 2, col: 0 }, every: 1, damage: 0 }] });
    expect(run('}', room).state.entities[0]?.at).toEqual({ line: 1, col: 0 });
  });
  it('deletes an empty row and remaps entities below it', () => {
    const def = FIXTURE_STAGE.entities[0];
    if (def === undefined) throw new Error('Missing entity fixture');
    const room = stage({ start: { line: 1, col: 0 }, entities: [
      { ...def, id: 'on', at: { line: 1, col: 0 }, behaviour: { type: 'still' }, damage: 0 },
      { ...def, id: 'below', at: { line: 2, col: 2 }, behaviour: { type: 'still' }, damage: 0 },
    ] });
    const result = run('dd', room);
    expect(result.state.engine.lines).toEqual(['ooooooo', 'ooooooo']);
    expect(result.state.entities.map(entity => [entity.id, entity.at])).toEqual([['below', { line: 1, col: 2 }]]);
  });
  it('preserves entities on surviving empty rows when earlier rows are removed', () => {
    const def = FIXTURE_STAGE.entities[0];
    if (def === undefined) throw new Error('Missing entity fixture');
    const room = stage({ start: { line: 0, col: 0 }, entities: [
      { ...def, at: { line: 1, col: 0 }, behaviour: { type: 'still' }, damage: 0 },
    ] });
    expect(run('dd', room).state.entities[0]?.at).toEqual({ line: 0, col: 0 });
  });
  it('uses empty-row damage and walkability', () => {
    expect(run('}', stage(), { ...legend, emptyRow: { ...clearing, damage: 1 } }).state.hearts).toBe(stage().hearts - 1);
    expect(run('}', stage(), { ...legend, emptyRow: { ...clearing, walkable: false } }).events)
      .toContainEqual({ type: 'bump', reason: 'wall', at: { line: 1, col: 0 } });
  });

});

describe('field half-screen jumps', () => {
  it('uses Stage.windowHeight and only tests the landing cell', () => {
    const room = stage({ map: ['ooooooo', 'TTTTTTT', 'TTTTTTT', 'TTTTTTT', 'TTTTTTT', 'ooooooo'], windowHeight: 10 });
    const result = run('<C-d>', room);
    expect(result.state.engine.cursor).toEqual({ line: 5, col: 5 });
    expect(result.events).toContainEqual({ type: 'player-moved', from: room.start, to: { line: 5, col: 5 }, style: 'jump' });
    expect(run('<C-d><C-u>', room).state.engine.cursor).toEqual(room.start);
  });
  it('rejects a blocked scroll landing without spending a turn', () => {
    const room = stage({ map: ['ooooooo', 'TTTTTTT'], windowHeight: 2 });
    const result = run('<C-d>', room);
    expect(result.state.turn).toBe(0);
    expect(result.events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 1, col: 5 } });
  });
  it('reports a scroll boundary error without spending a turn', () => {
    const result = run('<C-u>');
    expect(result.state.turn).toBe(0);
    expect(result.events).toContainEqual({ type: 'bump', reason: 'edge', at: stage().start });
    expect(result.events).toContainEqual({ type: 'engine-error', error: { code: 'invalid-range', message: 'Cannot scroll further.' } });
  });
});

it.each(['player', 'set-rows'])('keeps an empty-row entity at column zero after %s insertion', source => {
  const def = FIXTURE_STAGE.entities[0];
  if (def === undefined) throw new Error('Missing entity fixture');
  const room = stage({ start: { line: 1, col: 0 }, entities: [
    { ...def, at: { line: 1, col: 0 }, behaviour: { type: 'still' }, damage: 0, solid: false },
  ] });
  const settings = { ...options, learnedCommands: [...options.learnedCommands, 'i'] };
  const result = source === 'player'
    ? playKeys(sim, room, legend, settings, parseKeys('ioo<Esc>'))
    : sim.apply(sim.init(room, legend, settings), [{ type: 'set-rows', fromLine: 1, lines: ['oo'] }], room, legend);
  expect(result.state.engine.lines).toEqual(['ooooooo', 'oo', 'ooooooo']);
  expect(result.state.entities[0]?.at).toEqual({ line: 1, col: 0 });
  expect(result.events.some(event => event.type === 'entity-removed')).toBe(false);
});

it.each(['dd', 'io<Esc>'])('bumps fixed when %s changes a fixed clearing', keys => {
  const room = stage({ start: { line: 1, col: 0 } });
  const tiles = { ...legend, emptyRow: { ...clearing, fixed: true } };
  const settings = { ...options, learnedCommands: [...options.learnedCommands, 'i'] };
  const initial = sim.init(room, tiles, settings);
  const result = playKeys(sim, room, tiles, settings, parseKeys(keys));
  expect(result.events).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
  expect(result.state.engine).toEqual(initial.engine);
  expect(result.state.turn).toBe(0);
});

it('a failed counted scroll changes nothing: scroll is restored on engine errors and blocked landings', () => {
  const room = stage({ map: Array.from({ length: 10 }, () => 'ooooooo'), start: { line: 9, col: 0 } });
  const error = run('5<C-d>', room);
  expect(error.state.engine.scroll).toBe(0);
  expect(error.state.engine.pendingKeys).toEqual([]);
  expect(error.state.turn).toBe(0);
  expect(run('5<C-d><C-u>', room).state.engine.cursor.line).toBe(0);
  const blockedRoom = stage({ map: ['ooooooo', 'TTTTTTT'], windowHeight: 2 });
  const bump = run('1<C-d>', blockedRoom);
  expect(bump.events).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  expect(bump.state.engine).toEqual(sim.init(blockedRoom, legend, options).engine);
});

import { describe, expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, FIXTURE_LEGEND, FIXTURE_STAGE, playKeys } from '@escape/world';
import type { Stage, WorldOptions, WorldSim, WorldState } from '../types.js';
import { finalizeStage, solveStage, stageReplayIssue } from './index.js';

const sim = createWorldSim(createEngine());
const legend = FIXTURE_LEGEND;
const options: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'f', 't', ':w'], flags: {} };
const area = (line: number, col: number) => ({ from: { line, col }, to: { line, col } });
function stage(overrides: Partial<Stage> = {}): Stage {
  return { ...FIXTURE_STAGE, map: ['    D'], start: { line: 0, col: 0 }, entities: [], triggers: [], scripts: [],
    clear: [{ type: 'reach', area: area(0, 4) }], ...overrides };
}
function solve(room: Stage, settings: WorldOptions = options) {
  return solveStage(sim, room, legend, settings);
}
function replay(room: Stage, settings: WorldOptions = options) {
  const solution = solve(room, settings);
  expect(solution).not.toBeNull();
  if (solution === null) throw new Error('Expected a solution');
  return playKeys(sim, room, legend, settings, solution.keys).state;
}

/** Exhaustive tiny-room oracle: enumerate all supplied commands/counts, without saturation. */
function bruteForce(room: Stage, settings: WorldOptions, maxTurns: number) {
  const dimension = Math.max(room.map.length, ...room.map.map((row) => row.length));
  const actions = settings.learnedCommands.flatMap((command) => [
    [command],
    ...(['0', '$'].includes(command) ? [] : Array.from({ length: dimension - 1 },
      (_, index) => [...String(index + 2), command])),
  ]);
  let layer: { state: WorldState; keys: string[] }[] = [{ state: sim.init(room, legend, settings), keys: [] }];
  for (let turn = 0; turn <= maxTurns; turn += 1) {
    const winners = layer.filter(({ state }) => state.status === 'cleared')
      .sort((left, right) => left.keys.length - right.keys.length);
    const winner = winners[0];
    if (winner !== undefined) return { turns: winner.state.turn, keyCount: winner.keys.length };
    const next = new Map<string, { state: WorldState; keys: string[] }>();
    for (const node of layer) {
      for (const action of actions) {
        let state = node.state;
        let rejected = false;
        for (const key of action) {
          const result = sim.step(state, key, room, legend, settings);
          state = result.state;
          if (result.events.some((event) => event.type === 'bump' || event.type === 'engine-error')) rejected = true;
        }
        if (rejected || state.status === 'dead' || state.turn !== turn + 1) continue;
        const keys = [...node.keys, ...action];
        const id = JSON.stringify(state);
        const previous = next.get(id);
        if (previous === undefined || keys.length < previous.keys.length) next.set(id, { state, keys });
      }
    }
    layer = [...next.values()];
  }
  return null;
}

function countingSim() {
  let steps = 0;
  const counted: WorldSim = new Proxy(sim, {
    get(target, property, receiver): unknown {
      if (property === 'step') return (...args: Parameters<WorldSim['step']>) => {
        steps += 1;
        return target.step(...args);
      };
      return Reflect.get(target, property, receiver);
    },
  });
  return { sim: counted, steps: () => steps };
}

function largeRoom(): Stage {
  return stage({ map: Array.from({ length: 12 }, () => ' '.repeat(39) + 'o'),
    clear: [{ type: 'reach', area: area(11, 39) }],
    entities: [
      { id: 'chaser', kind: 'blot', sprite: 'blot', at: { line: 6, col: 20 },
        behaviour: { type: 'chase' }, every: 2, damage: 1, solid: false },
      { id: 'patroller', kind: 'blot', sprite: 'blot', at: { line: 9, col: 20 },
        behaviour: { type: 'patrol', path: [{ line: 9, col: 21 }, { line: 9, col: 20 }] },
        every: 1, damage: 1, solid: false },
    ] });
}

describe('stage solver', () => {
  it('solves the fixture within five turns and a bounded frontier', () => {
    const solution = solve(FIXTURE_STAGE);
    expect(solution).not.toBeNull();
    expect(solution?.turns).toBeLessThanOrEqual(5);
    expect(solution?.expanded).toBeLessThan(12000);
    if (solution === null) return;
    const result = playKeys(sim, FIXTURE_STAGE, legend, options, solution.keys);
    expect(result.state.status).toBe('cleared');
    expect(result.state.hearts).toBeGreaterThan(0);
    expect(result.state.turn).toBe(solution.turns);
  });
  it('solves the fixture through the sign with only walking and row-end motions', () => {
    const walking: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', '$'], flags: {} };
    const solution = solve(FIXTURE_STAGE, walking);
    expect(solution?.turns).toBeLessThanOrEqual(5);
    expect(solution?.expanded).toBeLessThan(12000);
    if (solution === null) throw new Error('Expected fixture solution');
    const result = playKeys(sim, FIXTURE_STAGE, legend, walking, solution.keys);
    expect(result.state.status).toBe('cleared');
    expect(result.state.solvedScripts['river-spell']).toEqual(['The bridge is broken.']);
    expect(result.state.hearts).toBeGreaterThan(0);
    expect(solution.keys).not.toContain(':');
  });
  it('returns null for a walled-off door', () => {
    expect(solve(stage({ map: [' ~ D'], clear: [{ type: 'reach', area: area(0, 3) }], allowedCommands: ['l'] }))).toBeNull();
  });
  it('never chooses a lethal route', () => {
    expect(solve(stage({ map: ['    ^'], hearts: 1 }))).toBeNull();
  });
  it('finds a live alternative around damage', () => {
    expect(replay(stage({ map: [' ^  D'], hearts: 1 })).hearts).toBe(1);
  });
  it('prefers fewer turns over fewer keys', () => {
    const solution = solve(stage({ map: ['          D '], clear: [{ type: 'reach', area: area(0, 10) }], allowedCommands: ['l', '$', 'h'] }));
    // $h is two keys and two turns; 10l is three keys and one turn.
    expect(solution?.keys).toEqual(['1', '0', 'l']);
    expect(solution?.turns).toBe(1);
  });
  it('breaks turn ties by key count', () => {
    expect(solve(stage())?.keys).toEqual(['$']);
  });
  it('is deterministic', () => {
    expect(solve(stage())).toEqual(solve(stage()));
  });
  it('respects stage command restrictions', () => {
    expect(solve(stage({ allowedCommands: ['h'] }))).toBeNull();
  });
  it('respects learned command restrictions', () => {
    expect(solve(stage(), { learnedCommands: ['h'], flags: {} })).toBeNull();
  });
  it('intersects both restrictions', () => {
    expect(solve(stage({ allowedCommands: ['$'] }), { learnedCommands: ['l'], flags: {} })).toBeNull();
  });
  it('expands multi-digit counts as individual keys', () => {
    const solution = solve(stage({ map: ['            D'], clear: [{ type: 'reach', area: area(0, 12) }], allowedCommands: ['l'] }));
    expect(solution?.keys).toEqual(['1', '2', 'l']);
    expect(solution?.turns).toBe(1);
  });
  it.each(['f', 't', 'F', 'T'])('expands %s character arguments', (command) => {
    const backwards = command === 'F' || command === 'T';
    const till = command === 't' || command === 'T';
    const map = backwards ? 'o   D' : 'D   o';
    const target = backwards ? (till ? 1 : 0) : (till ? 3 : 4);
    const room = stage({ map: [map], start: { line: 0, col: backwards ? 4 : 0 },
      clear: [{ type: 'reach', area: area(0, target) }], allowedCommands: [command] });
    expect(solve(room, { learnedCommands: [command], flags: {} })?.turns).toBe(1);
  });
  it('allows turns equal to the limit', () => {
    expect(solveStage(sim, stage(), legend, options, { maxTurns: 1 })?.turns).toBe(1);
  });
  it('returns null above the turn limit', () => {
    expect(solveStage(sim, stage(), legend, options, { maxTurns: 0 })).toBeNull();
  });
  it('returns null when expansion budget is exhausted', () => {
    expect(solveStage(sim, stage(), legend, options, { maxExpanded: 0 })).toBeNull();
  });
  it.each([-1, NaN, Infinity])('rejects invalid turn limit %s', (maxTurns) => {
    expect(solveStage(sim, stage(), legend, options, { maxTurns })).toBeNull();
  });
  it.each([-1, NaN, Infinity])('rejects invalid expansion limit %s', (maxExpanded) => {
    expect(solveStage(sim, stage(), legend, options, { maxExpanded })).toBeNull();
  });
  it('does not generate field edits', () => {
    expect(solve(stage({ map: [' ~ D'], allowedCommands: ['x', 'd', 'i', 'p', 'r', 'u'] }))).toBeNull();
  });
  it('solves an auto script without field turns or a closing command', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Fixture script missing');
    const room = stage({ type: 'text', autoScript: script.id, scripts: [{ ...script, effects: [] }],
      clear: [{ type: 'script-solved', script: script.id }] });
    const solution = solveStage(sim, room, legend, options, { maxTurns: 0 });
    expect(solution?.turns).toBe(0);
    expect(solution?.keys).toEqual(script.solution);
  });
  it('rejects a script with an unsuccessful supplied solution', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Fixture script missing');
    expect(solve(stage({ autoScript: script.id, scripts: [{ ...script, solution: ['h'] }] }))).toBeNull();
  });
  it('writes a save when required after script effects', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Fixture script missing');
    const room = stage({ autoScript: script.id, scripts: [{ ...script, effects: [{ type: 'set-rows', fromLine: 0, lines: [' o  D'] }] }],
      clear: [{ type: 'script-solved', script: script.id }, { type: 'saved' }], allowedCommands: [':w'] });
    expect(replay(room).engine.saved).toBe(true);
    expect(solve(room)?.turns).toBe(1);
  });
  it('uses initial flags in clear conditions', () => {
    const room = stage({ clear: [{ type: 'flag', flag: 'ready' }] });
    expect(solve(room)).toBeNull();
    expect(replay(room, { ...options, flags: { ready: true } }).status).toBe('cleared');
  });
  it('supports counted G to the first line', () => {
    const room = stage({ map: ['D', ' ', ' '], start: { line: 2, col: 0 },
      clear: [{ type: 'reach', area: area(0, 0) }], allowedCommands: ['G'] });
    expect(solve(room, { learnedCommands: ['G'], flags: {} })?.keys).toEqual(['1', 'G']);
  });
  it('does not use Enter as a field motion outside interaction reach', () => {
    const room = stage({ map: [' ', 'D'], clear: [{ type: 'reach', area: area(1, 0) }] });
    expect(solve(room, { learnedCommands: ['<CR>'], flags: {} })).toBeNull();
  });
  it('retains enemy cadence when deduplicating a stationary wait', () => {
    const room = stage({ map: ['  D', '   '], allowedCommands: ['$', '0'], hearts: 1,
      entities: [{ id: 'guard', kind: 'prop', sprite: 'guard', at: { line: 0, col: 2 },
        behaviour: { type: 'patrol', path: [{ line: 1, col: 2 }, { line: 0, col: 2 }] },
        every: 2, damage: 0, solid: true }], clear: [{ type: 'reach', area: area(0, 2) }] });
    expect(replay(room).turn).toBe(3);
  });
  it('supports find commands alongside vertical movement', () => {
    const room = stage({ map: ['o o  ', '    o'], start: { line: 0, col: 0 },
      allowedCommands: ['f', ';', 'j'], clear: [{ type: 'reach', area: area(1, 4) }] });
    expect(replay(room).status).toBe('cleared');
  });
  it('honours an interaction flag gate', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Fixture script missing');
    const room = stage({ scripts: [{ ...script, effects: [] }], allowedCommands: [],
      triggers: [{ id: 'read', on: 'interact', once: true, onlyIf: 'readable',
        target: { type: 'area', area: area(0, 0) }, opensScript: script.id }],
      clear: [{ type: 'script-solved', script: script.id }] });
    expect(solve(room)).toBeNull();
    expect(solve(room, { ...options, flags: { readable: true } })?.turns).toBe(0);
  });
  it('keeps the cheaper duplicate even when generated later', () => {
    const room = stage({ map: ['  o'], clear: [{ type: 'reach', area: area(0, 2) }] });
    expect(solve(room, { learnedCommands: ['l', 'w'], flags: {} })?.keys).toEqual(['w']);
  });
  it.each(['f', 'F', 't', 'T'])('restricts %s targets to the current row after moving vertically', (command) => {
    const rows = new Set<number>();
    const inspecting: WorldSim = { ...sim, step(state, key, room, tiles, settings) {
      if (state.engine.pendingKeys.at(-1) === command) {
        expect(state.engine.lines[state.engine.cursor.line]).toContain(key);
        rows.add(state.engine.cursor.line);
      }
      return sim.step(state, key, room, tiles, settings);
    } };
    const room = stage({ map: ['o   ', ' D  '], clear: [{ type: 'flag', flag: 'unobtainable' }] });
    expect(solveStage(inspecting, room, legend, { learnedCommands: ['j', 'k', command], flags: {} },
      { maxExpanded: 10, maxTurns: 2 })).toBeNull();
    expect([...rows].sort()).toEqual([0, 1]);
  });
  it('opens and solves an enter-trigger script on the route', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Fixture script missing');
    const room = stage({ scripts: [{ ...script, effects: [] }], allowedCommands: ['l'],
      triggers: [{ id: 'read', on: 'enter', area: area(0, 2), once: true, opensScript: script.id }],
      clear: [{ type: 'reach', area: area(0, 4) }, { type: 'script-solved', script: script.id }] });
    const solution = solve(room);
    if (solution === null) throw new Error('Expected enter-script solution');
    const result = playKeys(sim, room, legend, options, solution.keys);
    expect(result.state.status).toBe('cleared');
    expect(result.events.some((event) => event.type === 'script-solved')).toBe(true);
    expect(solution.turns).toBe(2);
  });
  it('takes a longer route when only one heart remains', () => {
    const settings: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l'], flags: {} };
    const room = stage({ map: ['^ D', '  ~', '   '], start: { line: 1, col: 0 }, hearts: 1,
      clear: [{ type: 'reach', area: area(0, 2) }] });
    const solution = solve(room, settings);
    expect(solution?.turns).toBe(3);
    expect(solve({ ...room, hearts: 2 }, settings)?.turns).toBe(2);
    expect({ turns: solution?.turns, keyCount: solution?.keys.length }).toEqual(bruteForce(room, settings, 3));
    expect(replay(room, settings).hearts).toBe(1);
  });
  it.each(['chase', 'patrol'] as const)('matches brute force when %s timing controls the route', (type) => {
    const settings: WorldOptions = { learnedCommands: ['0', '$'], flags: {} };
    const room = stage({ map: ['  D', '   '], hearts: 1,
      clear: [{ type: 'reach', area: area(0, 2) }],
      entities: [{ id: 'guard', kind: 'blot', sprite: 'blot', at: { line: 0, col: 2 },
        behaviour: type === 'chase' ? { type } : { type, path: [{ line: 1, col: 2 }, { line: 0, col: 2 }] },
        every: 2, damage: 0, solid: true }] });
    const solution = solve(room, settings);
    expect(solution?.turns).toBe(3);
    expect({ turns: solution?.turns, keyCount: solution?.keys.length }).toEqual(bruteForce(room, settings, 4));
    expect(solve({ ...room, entities: room.entities.map((entity) => ({ ...entity, every: 1 })) }, settings)?.turns).toBe(2);
  });
  it('bounds simulation work per expansion on a 12x40 map', () => {
    const counted = countingSim();
    const settings: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'f'], flags: {} };
    const solution = solveStage(counted.sim, largeRoom(), legend, settings, { maxExpanded: 100, maxTurns: 2 });
    expect(solution).not.toBeNull();
    if (solution === null) throw new Error('Expected large-room solution');
    // <=40 horizontal/find destinations, <=12 vertical/word destinations, plus one
    // saturation probe per sequence and shared digit prefixes: 650 calls leaves headroom.
    expect(counted.steps() / solution.expanded).toBeLessThan(650);
  });
  it('bounds work on an unsolvable 12x40 variant', () => {
    const counted = countingSim();
    const settings: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'f'], flags: {} };
    const room = largeRoom();
    const unsolvable = { ...room, clear: [...room.clear, { type: 'flag' as const, flag: 'unobtainable' }] };
    expect(solveStage(counted.sim, unsolvable, legend, settings, { maxExpanded: 40, maxTurns: 2 })).toBeNull();
    expect(counted.steps()).toBeLessThan(40 * 650);
  });
  it('keeps input stage and options immutable', () => {
    const room = stage();
    const before = JSON.stringify([room, options]);
    solve(room);
    expect(JSON.stringify([room, options])).toBe(before);
  });
});

describe('finalization and replay gate', () => {
  it('fills par and keys without changing the original', () => {
    const room = stage();
    const finalized = finalizeStage(room, { keys: ['$'], turns: 1, expanded: 4 });
    expect(finalized.parTurns).toBe(1);
    expect(finalized.solution).toEqual(['$']);
    expect(room.parTurns).toBe(0);
    expect(room.solution).toEqual([]);
  });
  it('accepts a valid solution', () => {
    expect(stageReplayIssue(sim, stage({ solution: ['$'], parTurns: 1 }), legend, options)).toBeNull();
  });
  it('reports an incomplete solution', () => {
    expect(stageReplayIssue(sim, stage(), legend, options)).toMatch(/does not clear/);
  });
  it('reports death before clear or par problems', () => {
    expect(stageReplayIssue(sim, stage({ map: ['    ^'], hearts: 1, solution: ['$'] }), legend, options)).toMatch(/dead/);
  });
  it('reports turns above par', () => {
    expect(stageReplayIssue(sim, stage({ solution: ['$'], parTurns: 0 }), legend, options)).toMatch(/more than parTurns/);
  });
  it('accepts a solution under par', () => {
    expect(stageReplayIssue(sim, stage({ solution: ['$'], parTurns: 2 }), legend, options)).toBeNull();
  });
});

describe('field edit search', () => {
  it('continues past rejected x landings to find the best 3x route', () => {
    const room = stage({ map: [' TToD'], clear: [{ type: 'reach', area: area(0, 1) }], allowedCommands: ['x', 'l'] });
    const settings = { learnedCommands: ['x', 'l'], flags: {} };
    const solution = solve(room, settings);
    expect(solution?.keys).toEqual(['3', 'x', 'l']);
    expect(solution?.turns).toBe(2);
    if (!solution) throw new Error('Missing edit solution');
    expect(stageReplayIssue(sim, finalizeStage(room, solution), legend, settings)).toBeNull();
  });
  it('finds the best 4r= bridge', () => {
    const tiles = { ...legend, fallback: { ...legend.fallback, walkable: true, fixed: true }, tiles: [
      { char: '=', kind: 'barrier' as const, sprite: 'plank', walkable: true, fixed: false, label: 'plank' },
      { char: '~', kind: 'barrier' as const, sprite: 'water', walkable: false, fixed: false, label: 'water' },
      { char: '#', kind: 'barrier' as const, sprite: 'wall', walkable: false, fixed: true, label: 'wall' },
    ] };
    const room = stage({ map: ['=~~~#', '####D', '####D'],
      clear: [{ type: 'reach', area: area(2, 4) }], allowedCommands: ['r', 'l', 'j'] });
    // The final stone is reached only by moving down after laying planks.
    const bridged = { ...room, map: ['=~~~D', '####D', '####D'] };
    const settings = { learnedCommands: ['r', 'l', 'j'], flags: {} };
    const best = solveStage(sim, bridged, tiles, settings, { maxTurns: 3 });
    expect(best?.keys).toEqual(['4', 'r', '=', 'l', '2', 'j']);
    expect(best?.turns).toBe(3);
    if (!best) throw new Error('Missing bridge solution');
    expect(stageReplayIssue(sim, finalizeStage(bridged, best), tiles, settings)).toBeNull();
  });
});

it('keeps replacement counts across unchanged runs and only tries walkable tiles', () => {
  const tiles = { ...legend, fallback: { ...legend.fallback, walkable: true, fixed: true },
    tiles: [...legend.tiles.filter(tile => tile.char === '~'),
    { char: '=', kind: 'barrier' as const, sprite: 'plank', walkable: true, fixed: false, label: 'plank' },
  ] };
  const inspecting: WorldSim = { ...sim, step(state, key, room, tiles, settings) {
    if (state.engine.pendingKeys.at(-1) === 'r') {
      expect(tiles.tiles.some(tile => tile.char === key && tile.walkable)).toBe(true);
    }
    return sim.step(state, key, room, tiles, settings);
  } };
  const room = stage({ map: ['===~D'], clear: [{ type: 'reach', area: area(0, 4) }], allowedCommands: ['r', 'l'] });
  const solution = solveStage(inspecting, room, tiles, { learnedCommands: ['r', 'l'], flags: {} }, { maxTurns: 2 });
  expect(solution?.keys).toEqual(['4', 'r', '=', 'l']);
  expect(solution?.turns).toBe(2);
});

it('requires dd then u to remove the guard and restore the only route', () => {
  const settings = { learnedCommands: ['dd', 'u', 'l'], flags: {} };
  const room = stage({ map: ['   ', ' ~~'], start: { line: 0, col: 0 }, hearts: 1,
    entities: [{ id: 'guard', kind: 'blot', sprite: 'blot', at: { line: 0, col: 1 },
      behaviour: { type: 'still' }, every: 1, damage: 1, solid: true }],
    clear: [{ type: 'reach', area: area(0, 2) }, { type: 'no-entities', kind: 'blot' }] });
  const solution = solveStage(sim, room, legend, settings, { maxTurns: 4, maxExpanded: 100 });
  expect(solution?.keys).toEqual(['d', 'd', 'u', '2', 'l']);
  expect(solution?.turns).toBe(3);
  if (!solution) throw new Error('Missing undo solution');
  expect(stageReplayIssue(sim, finalizeStage(room, solution), legend, settings)).toBeNull();
  expect(solveStage(sim, room, legend, { ...settings, learnedCommands: ['dd', 'l'] }, { maxTurns: 4 })).toBeNull();
});

it('searches redo using the engine undo history', () => {
  const settings = { learnedCommands: ['<C-r>'], flags: {} };
  const room = stage({ map: ['   '],
    entities: [{ id: 'guard', kind: 'blot', sprite: 'blot', at: { line: 0, col: 0 },
      behaviour: { type: 'still' }, every: 1, damage: 0, solid: false }],
    clear: [{ type: 'no-entities', kind: 'blot' }] });
  const restoring: WorldSim = { ...sim, init(stage, legend, options) {
    const initial = sim.init(stage, legend, options);
    const engine = createEngine();
    const changed = engine.step(initial.engine, 'x').state;
    return { ...initial, engine: engine.step(changed, 'u').state };
  } };
  const solution = solveStage(restoring, room, legend, settings);
  expect(solution?.keys).toEqual(['<C-r>']);
  if (!solution) throw new Error('Missing redo solution');
  expect(stageReplayIssue(restoring, finalizeStage(room, solution), legend, settings)).toBeNull();
});

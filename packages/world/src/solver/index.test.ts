import { describe, expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, FIXTURE_LEGEND, FIXTURE_STAGE, playKeys } from '@escape/world';
import type { Stage, WorldOptions } from '../types.js';
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

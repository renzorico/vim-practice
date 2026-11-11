import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import type { Key } from '@escape/engine';
import { FIXTURE_LEGEND as legend, FIXTURE_STAGE } from '../fixtures.js';
import type { EntitySpawn, Stage, WorldOptions, WorldState } from '../types.js';
import { createWorldSim, playKeys } from './index.js';

const engine = createEngine();
const sim = createWorldSim(engine);
const options: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'gg', 'G', 'f', 't', 'd', 'dd', 'y', 'yy', 'x', 'r', 'p', 'J', 'i', 'a', 'o', 'v', 'V', 'u', '<C-r>', ':w', ':wq', ':q', ':q!', ':x', 'ZZ'], flags: {} };
function stage(overrides: Partial<Stage> = {}): Stage { return { ...FIXTURE_STAGE, ...overrides }; }
function run(keys: string | readonly Key[], value = FIXTURE_STAGE) {
  return playKeys(sim, value, legend, options, typeof keys === 'string' ? parseKeys(keys) : keys);
}
function keysFrom(state: WorldState, keys: string, value = FIXTURE_STAGE) {
  const events = [];
  for (const key of parseKeys(keys)) {
    const result = sim.step(state, key, value, legend, options);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
function blot(at = { line: 2, col: 2 }, overrides: Partial<EntitySpawn> = {}): EntitySpawn {
  const def = FIXTURE_STAGE.entities[0];
  if (def === undefined) throw new Error('Missing fixture Blot');
  return { ...def, at, ...overrides };
}
const flat = (overrides: Partial<Stage> = {}) => stage({ map: Array.from({ length: 7 }, () => '                '),
  start: { line: 0, col: 0 }, entities: [], ...overrides });

describe('turns and rollback', () => {
  it.each([['5j', 1], ['jjjjj', 5], ['dw', 1], ['ihello<Esc>', 1], [':w<CR>', 1], ['vjd', 3], ['d', 0], ['<Esc>', 0]])('%s spends %i turns', (keys, turns) => {
    const value = flat({ map: Array.from({ length: 7 }, () => 'ooo ooo         ') });
    expect(run(keys, value).state.turn).toBe(turns);
  });
  it('keeps visual Escape mode change without a turn', () => {
    const result = run('v<Esc>', flat());
    expect(result.state.turn).toBe(1);
    expect(result.state.engine.mode).toBe('normal');
  });
  it('keeps visual mode toggles without a turn', () => {
    const result = run('vV', flat());
    expect(result.state.turn).toBe(1);
    expect(result.state.engine.mode).toBe('visual-line');
  });
  it('restores the original pending state after an engine error', () => {
    const result = run('d?', flat());
    expect(result.state.engine).toEqual(engine.init(flat().map, flat().start));
    expect(result.state.pending).toBeNull();
    expect(result.events.some((event) => event.type === 'engine-error')).toBe(true);
  });
  it('stores the pre-command state while typing a count', () => {
    const result = run('5', flat());
    expect(result.state.pending?.engine.pendingKeys).toEqual([]);
    expect(result.state.engine.pendingKeys).toEqual(['5']);
  });
  it('emits provisional insert rows without advancing enemies', () => {
    const result = run('io');
    expect(result.state.turn).toBe(0);
    expect(result.events.some((event) => event.type === 'rows-changed')).toBe(true);
    expect(result.state.entities).toEqual(sim.init(FIXTURE_STAGE, legend, options).entities.map((entity) => ({ ...entity, at: { ...entity.at, col: entity.at.col } })));
  });
  it('rolls back fixed edits including undo history and registers', () => {
    const value = stage({ start: { line: 2, col: 7 } });
    const result = run('dd', value);
    expect(result.state.engine).toEqual(sim.init(value, legend, options).engine);
    expect(result.state.turn).toBe(0);
    expect(result.events).toContainEqual({ type: 'bump', reason: 'fixed', at: result.state.engine.cursor });
  });
  it('intersects learned and stage commands', () => {
    const value = stage({ allowedCommands: ['h'] });
    expect(run('l', value).events.some((event) => event.type === 'engine-error')).toBe(true);
  });
});

describe('movement on the fixture', () => {
  it('bumps into a tree and rolls back a counted walk', () => {
    const result = run('3l', stage({ start: { line: 0, col: 0 } }));
    expect(result.state.engine.cursor).toEqual({ line: 0, col: 0 });
    expect(result.events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 0, col: 2 } });
  });
  it.each(['h', 'k'])('bumps at the buffer edge for %s', (key) => {
    const result = run(key, stage({ start: { line: 0, col: 0 } }));
    expect(result.state.turn).toBe(0);
    expect(result.events.some((event) => event.type === 'bump' && event.reason === 'edge')).toBe(true);
  });
  it('checks only a jump landing across water', () => {
    const result = run('gg');
    expect(result.state.engine.cursor.line).toBe(0);
    expect(result.state.turn).toBe(1);
  });
  it('rejects a jump landing on water', () => {
    const result = run('k');
    expect(result.state.turn).toBe(0);
    expect(result.state.engine.cursor).toEqual(FIXTURE_STAGE.start);
  });
  it('blocks solid entities', () => {
    const result = run('l', stage({ start: { line: 3, col: 3 } }));
    expect(result.events.some((event) => event.type === 'bump' && event.reason === 'solid-entity')).toBe(true);
  });
  it('uses engine column clamping on ragged rows', () => {
    const result = run('j', flat({ map: ['     ', '  '], start: { line: 0, col: 4 } }));
    expect(result.state.engine.cursor).toEqual({ line: 1, col: 1 });
    expect(result.state.turn).toBe(1);
  });
  it('checks the clamped cell on intermediate ragged rows', () => {
    const result = run('2j', flat({ map: ['     ', ' T', '     '], start: { line: 0, col: 4 } }));
    expect(result.state.turn).toBe(0);
  });
  it('marks walks and jumps for animation', () => {
    expect(run('l').events.some((event) => event.type === 'player-moved' && event.style === 'walk')).toBe(true);
    expect(run('w').events.some((event) => event.type === 'player-moved' && event.style === 'jump')).toBe(true);
  });
});

describe('buffer edits and undo', () => {
  it.each(['x', 'dd', 'yyp', 'J', 'i<CR><Esc>'])('undo restores buffer after %s', (keys) => {
    const map = [...FIXTURE_STAGE.map];
    map[3] = 'ooo      T      ';
    const value = stage({ map, start: { line: keys === 'J' ? 2 : 3, col: 1 }, entities: [] });
    const edited = run(keys, value);
    expect(edited.state.engine.lines).not.toEqual(value.map);
    const undone = keysFrom(edited.state, 'u', value);
    expect(undone.state.engine.lines).toEqual(value.map);
    expect(undone.state.turn).toBe(edited.state.turn + 1);
  });
  it('redo reapplies a player edit', () => {
    const value = stage({ start: { line: 3, col: 1 }, entities: [] });
    expect(run('xu<C-r>', value).state.engine.lines).toEqual(run('x', value).state.engine.lines);
  });
  it('removes an entity on a deleted tile and never resurrects it on undo', () => {
    const value = stage({ start: { line: 3, col: 1 }, entities: [blot({ line: 3, col: 7 }, { behaviour: { type: 'still' }, damage: 0 })] });
    const result = run('2xu', value);
    expect(result.state.entities).toHaveLength(0);
  });
  it('shifts entities to the right of an insertion', () => {
    const value = stage({ entities: [blot({ line: 2, col: 3 }, { behaviour: { type: 'still' }, damage: 0 })] });
    expect(run('io<Esc>', value).state.entities[0]?.at).toEqual({ line: 2, col: 4 });
  });
  it('blocks replacing a fixed tile', () => {
    const value = stage({ start: { line: 2, col: 7 } });
    const result = run('ro', value);
    expect(result.state.turn).toBe(0);
    expect(result.state.engine.lines).toEqual(value.map);
  });
  it('allows a fixed tile to shift', () => {
    const value = stage({ entities: [] });
    expect(run('io<Esc>', value).state.engine.lines[2]?.[8]).toBe('S');
  });
  it('world effects enter the undo stack with truthful modified state', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const applied = sim.apply(initial, [{ type: 'set-rows', fromLine: 1, lines: ['~~~~~~~oo~~~~~~~'] }], FIXTURE_STAGE, legend);
    expect(applied.state.engine.changeSeq).toBe(1);
    expect(applied.state.engine.modified).toBe(true);
    expect(applied.state.engine.undoStack.at(-1)?.seq).toBe(0);
    const undone = keysFrom(applied.state, 'u');
    expect(undone.state.engine.lines).toEqual(FIXTURE_STAGE.map);
    expect(undone.state.engine.modified).toBe(false);
  });
  it('new effects after undoing past a write use a fresh version', () => {
    const value = stage({ entities: [] });
    const saved = run('io<Esc>:w<CR>u', value).state;
    const result = sim.apply(saved, [{ type: 'delete-row', line: 3 }], value, legend);
    expect(result.state.engine.changeSeq).toBeGreaterThan(saved.engine.savedSeq);
    expect(result.state.engine.modified).toBe(true);
  });
});

describe('entity actions and damage', () => {
  it('the fixture Blot acts on even turns only', () => {
    const one = run('l');
    expect(one.state.entities[0]?.at).toEqual({ line: 3, col: 14 });
    expect(keysFrom(one.state, 'l').state.entities[0]?.at).toEqual({ line: 2, col: 14 });
  });
  it('chase prefers the vertical axis', () => {
    const value = flat({ entities: [blot({ line: 2, col: 2 }, { every: 1 })] });
    expect(run('l', value).state.entities[0]?.at).toEqual({ line: 1, col: 2 });
  });
  it('chase tries horizontal when vertical is blocked', () => {
    const value = flat({ map: ['                ', '  T             ', '                '], entities: [blot({ line: 2, col: 2 }, { every: 1 })] });
    expect(run('l', value).state.entities[0]?.at).toEqual({ line: 2, col: 1 });
  });
  it('adjacent Blot damages on a turn when it does not act', () => {
    const value = stage({ entities: [blot({ line: 2, col: 2 })] });
    expect(run('l', value).state.hearts).toBe(2);
  });
  it('standing on thorns damages each turn', () => {
    const value = stage({ start: { line: 0, col: 10 }, entities: [] });
    expect(run('lv', value).state.hearts).toBe(1);
  });
  it('death freezes step and apply', () => {
    const value = stage({ start: { line: 0, col: 10 }, hearts: 1, entities: [] });
    const dead = run('l', value).state;
    expect(dead.status).toBe('dead');
    expect(sim.step(dead, 'h', value, legend, options)).toEqual({ state: dead, events: [] });
    expect(sim.apply(dead, [{ type: 'heal', hearts: 3 }], value, legend)).toEqual({ state: dead, events: [] });
  });
  it('follow stops adjacent and never deals damage', () => {
    const value = flat({ entities: [blot({ line: 0, col: 2 }, { behaviour: { type: 'follow' }, every: 1 })] });
    const result = run('lv', value);
    expect(result.state.entities[0]?.at).toEqual({ line: 0, col: 2 });
    expect(result.state.hearts).toBe(3);
  });
  it('patrol waits when blocked and advances after a valid waypoint', () => {
    const path = [{ line: 0, col: 3 }, { line: 0, col: 4 }];
    const value = flat({ entities: [blot({ line: 1, col: 3 }, { every: 1, behaviour: { type: 'patrol', path }, damage: 0 })] });
    expect(run('l', value).state.entities[0]?.pathIndex).toBe(1);
    expect(run('ll', value).state.entities[0]?.at).toEqual(path[1]);
  });
  it('unwrite deletes rows with undo snapshots', () => {
    const value = flat({ entities: [blot({ line: 2, col: 0 }, { every: 2, behaviour: { type: 'unwrite', path: [{ line: 5, col: 0 }] }, damage: 0 })] });
    const result = run('ll', value);
    expect(result.state.engine.lines).toHaveLength(6);
    expect(keysFrom(result.state, 'u', value).state.engine.lines).toHaveLength(7);
  });
  it('filters conditional stage spawns', () => {
    const value = stage({ entities: [blot(undefined, { spawnIf: 'ready' }), blot(undefined, { id: 'other', spawnUnless: 'ready' })] });
    expect(sim.init(value, legend, options).entities.map((entity) => entity.id)).toEqual(['other']);
  });
  it('runtime spawns survive and act on later turns', () => {
    const value = flat();
    const applied = sim.apply(sim.init(value, legend, options), [{ type: 'spawn', entity: blot({ line: 2, col: 3 }, { every: 1 }) }], value, legend);
    expect(keysFrom(applied.state, 'l', value).state.entities[0]?.at).toEqual({ line: 1, col: 3 });
  });
});

describe('saves, triggers, scripts and ending', () => {
  it('saves after enemies act', () => {
    const result = run('l:w<CR>');
    expect(result.state.checkpoint.turn).toBe(2);
    expect(result.state.checkpoint.entities).toEqual(result.state.entities);
    expect(result.state.checkpoint.entities[0]?.at).toEqual({ line: 2, col: 14 });
  });
  it('a lethal save stores no checkpoint', () => {
    const value = stage({ start: { line: 0, col: 11 }, hearts: 1, entities: [] });
    const result = run(':w<CR>', value);
    expect(result.state.status).toBe('dead');
    expect(result.state.checkpoint.turn).toBe(0);
    expect(result.events.some((event) => event.type === 'checkpoint-saved')).toBe(false);
  });
  it('restore keeps flags, solved scripts and fired triggers', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const state = { ...initial, flags: { story: true }, solvedScripts: { spell: ['done'] }, firedTriggers: ['once'], hearts: 0 };
    const restored = sim.restore(state).state;
    expect(restored.flags).toEqual(state.flags);
    expect(restored.solvedScripts).toEqual(state.solvedScripts);
    expect(restored.firedTriggers).toEqual(state.firedTriggers);
    expect(restored.hearts).toBe(3);
  });
  it('flag-only batches do not save', () => {
    const result = sim.apply(sim.init(FIXTURE_STAGE, legend, options), [{ type: 'set-flag', flag: 'ready', value: true }], FIXTURE_STAGE, legend);
    expect(result.events).toEqual([{ type: 'flag-set', flag: 'ready', value: true }]);
  });
  it('opens the sign only from an adjacent cell', () => {
    expect(run('<CR>').state.script).toBeNull();
    const value = stage({ start: { line: 2, col: 4 } });
    const result = run('<CR>', value);
    expect(result.state.script?.id).toBe('river-spell');
    expect(result.state.turn).toBe(0);
  });
  it('solves the fixture script as one effect batch and stores a checkpoint', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    const result = run('<CR>fnie<Esc>', value);
    expect(result.state.solvedScripts['river-spell']).toEqual(['The bridge is broken.']);
    expect(result.state.engine.lines[1]).toBe('~~~~~~~oo~~~~~~~');
    expect(result.state.flags['fixture.bridge-mended']).toBe(true);
    expect(result.events.filter((event) => event.type === 'checkpoint-saved')).toHaveLength(1);
    expect(result.events).toContainEqual({ type: 'flag-set', flag: 'fixture.bridge-mended', value: true });
    expect(result.state.turn).toBe(0);
  });
  it('does not solve before an insert command finishes', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    expect(run('<CR>fnie', value).state.solvedScripts).toEqual({});
  });
  it('reopens a solved script read-only with its solved text', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    const solved = run('<CR>fnie<Esc>:q!<CR><CR>x', value);
    expect(solved.state.script?.engine.lines).toEqual(['The bridge is broken.']);
    expect(solved.state.script?.engine.modified).toBe(false);
    expect(solved.events.filter((event) => event.type === 'script-solved')).toHaveLength(1);
  });
  it('requires mustUse skills in the command log', () => {
    const script = FIXTURE_STAGE.scripts[0];
    if (script === undefined) throw new Error('Missing fixture spell');
    const value = stage({ start: { line: 2, col: 4 }, scripts: [{ ...script, mustUse: ['operator.d'] }] });
    expect(run('<CR>fnie<Esc>', value).state.solvedScripts).toEqual({});
  });
  it('rejects :q while the script is modified', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    const result = run('<CR>io<Esc>:q<CR>', value);
    expect(result.state.script).not.toBeNull();
    expect(result.events.some((event) => event.type === 'engine-error')).toBe(true);
  });
  it('opens an auto script at init and unsolved quit requests stage exit', () => {
    const value = stage({ autoScript: 'river-spell', type: 'text' });
    const result = run(':q<CR>', value);
    expect(result.state.script).toBeNull();
    expect(result.state.engine.quitRequested).toBe(true);
  });
  it('fires an enter trigger once and retains it on restore', () => {
    const result = run('7l');
    expect(result.state.firedTriggers).toContain('at-save-stone');
    const restored = sim.restore(result.state).state;
    expect(keysFrom(restored, '7l').events.filter((event) => event.type === 'trigger-fired')).toHaveLength(0);
  });
  it('stage-cleared fires once; apply still works afterwards', () => {
    const value = stage({ clear: [{ type: 'flag', flag: 'done' }] });
    const initial = sim.init(value, legend, options);
    const cleared = sim.apply(initial, [{ type: 'set-flag', flag: 'done', value: true }], value, legend);
    expect(cleared.state.status).toBe('cleared');
    expect(sim.step(cleared.state, 'l', value, legend, options).events).toEqual([]);
    const rewarded = sim.apply(cleared.state, [{ type: 'set-flag', flag: 'reward', value: true }], value, legend);
    expect(rewarded.state.flags.reward).toBe(true);
    expect(rewarded.events.filter((event) => event.type === 'stage-cleared')).toHaveLength(0);
  });
  it('checks death before clear', () => {
    const value = stage({ start: { line: 0, col: 10 }, entities: [], hearts: 1,
      clear: [{ type: 'reach', area: { from: { line: 0, col: 11 }, to: { line: 0, col: 11 } } }] });
    const result = run('l', value);
    expect(result.state.status).toBe('dead');
    expect(result.events.some((event) => event.type === 'stage-cleared')).toBe(false);
  });
  it('preserves field quitRequested for the app', () => {
    expect(run(':wq<CR>').state.engine.quitRequested).toBe(true);
  });
  it.each(['llw', 'io<Esc>u<C-r>', '7l:w<CR>', 'gg3l', '<CR>fnie<Esc>:q!<CR>'])('deterministic state and events for %s', (keys) => {
    const value = stage({ start: { line: 2, col: 4 } });
    expect(run(keys, value)).toEqual(run(keys, value));
  });
});

describe('atomic batches and ending conditions', () => {
  it('remaps once against the final batch buffer and adds one undo snapshot', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const result = sim.apply(initial, [
      { type: 'set-rows', fromLine: 3, lines: ['                '] },
      { type: 'set-rows', fromLine: 3, lines: [FIXTURE_STAGE.map[3] ?? ''] },
    ], FIXTURE_STAGE, legend);
    expect(result.state.entities).toEqual(initial.entities);
    expect(result.state.engine.undoStack).toEqual([]);
    expect(result.events.filter((event) => event.type === 'checkpoint-saved')).toHaveLength(1);
  });
  it('multiple buffer effects undo as one batch with the original cursor', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const result = sim.apply(initial, [
      { type: 'set-rows', fromLine: 1, lines: ['~~~~~~~oo~~~~~~~'] },
      { type: 'set-rows', fromLine: 3, lines: ['                '] },
      { type: 'move-player', to: { line: 2, col: 5 } },
    ], FIXTURE_STAGE, legend);
    expect(result.state.engine.undoStack).toHaveLength(1);
    expect(result.state.engine.undoStack[0]?.cursor).toEqual(FIXTURE_STAGE.start);
    const undone = keysFrom(result.state, 'u');
    expect(undone.state.engine.lines).toEqual(FIXTURE_STAGE.map);
    expect(undone.state.engine.cursor).toEqual(FIXTURE_STAGE.start);
  });
  it('checks clear after the entire batch rather than an intermediate flag', () => {
    const value = stage({ clear: [{ type: 'flag', flag: 'done' }] });
    const result = sim.apply(sim.init(value, legend, options), [
      { type: 'set-flag', flag: 'done', value: true },
      { type: 'set-flag', flag: 'done', value: false },
    ], value, legend);
    expect(result.state.status).toBe('playing');
    expect(result.events.some((event) => event.type === 'stage-cleared')).toBe(false);
  });
  it('stores a nonlethal effect checkpoint even if the batch clears the stage', () => {
    const value = stage({ clear: [{ type: 'flag', flag: 'done' }] });
    const result = sim.apply(sim.init(value, legend, options), [
      { type: 'set-flag', flag: 'done', value: true }, { type: 'heal', hearts: 1 },
    ], value, legend);
    expect(result.state.status).toBe('cleared');
    expect(result.state.checkpoint.hearts).toBe(4);
    expect(result.events.some((event) => event.type === 'checkpoint-saved')).toBe(true);
  });
  it.each([':w<CR>', ':wq<CR>', ':x<CR>', 'ZZ'])('%s saves at end of its turn', (keys) => {
    const result = run(keys);
    expect(result.state.checkpoint.turn).toBe(1);
    expect(result.state.checkpoint.engine).toEqual(result.state.engine);
  });
  it('clears a saved-buffer condition only after a write', () => {
    const value = stage({ clear: [{ type: 'saved' }] });
    expect(run('l', value).state.status).toBe('playing');
    expect(run(':w<CR>', value).state.status).toBe('cleared');
  });
  it('clears a no-entities condition after removal', () => {
    const value = stage({ clear: [{ type: 'no-entities', kind: 'blot' }] });
    const result = sim.apply(sim.init(value, legend, options), [{ type: 'remove-entity', entity: 'blot-1' }], value, legend);
    expect(result.state.status).toBe('cleared');
    expect(result.events).toContainEqual({ type: 'entity-removed', entity: 'blot-1', cause: 'effect' });
  });
  it('fires enter triggers even when the same turn clears the stage', () => {
    const value = stage({ clear: [{ type: 'reach', area: { from: { line: 2, col: 7 }, to: { line: 2, col: 7 } } }] });
    const result = run('7l', value);
    expect(result.state.status).toBe('cleared');
    expect(result.events).toContainEqual({ type: 'trigger-fired', trigger: 'at-save-stone' });
  });
  it('does not mutate the input stage, options or world state', () => {
    const value = stage();
    const initial = sim.init(value, legend, options);
    const original = JSON.stringify({ value, initial, options });
    keysFrom(initial, 'io<Esc>u', value);
    sim.apply(initial, [{ type: 'set-flag', flag: 'new', value: true }, { type: 'delete-row', line: 3 }], value, legend);
    expect(JSON.stringify({ value, initial, options })).toBe(original);
  });
});

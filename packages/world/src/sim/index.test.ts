import { describe, expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import type { Key } from '@escape/engine';
import { FIXTURE_LEGEND as legend, FIXTURE_STAGE } from '../fixtures.js';
import type { EntitySpawn, Stage, WorldOptions, WorldState } from '../types.js';
import { createWorldSim, playKeys } from './index.js';

const engine = createEngine();
const sim = createWorldSim(engine);
const options: WorldOptions = { learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'gg', 'G', 'f', 't', 'c', 'X', 'd', 'dd', 'y', 'yy', 'x', 'r', 'p', 'J', 'i', 'a', 'o', 'v', 'V', 'u', '<C-r>', ':w', ':wq', ':q', ':q!', ':x', 'ZZ'], flags: {} };
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
    const value = ['5j', 'jjjjj', 'vjd'].includes(keys)
      ? flat({ map: Array.from({ length: 7 }, () => 'ooo ooo         ') }) : FIXTURE_STAGE;
    expect(run(keys, value).state.turn).toBe(turns);
  });
  it('keeps visual Escape mode change without a turn', () => {
    const result = run('v<Esc>');
    expect(result.state.turn).toBe(1);
    expect(result.state.engine.mode).toBe('normal');
  });
  it('keeps visual mode toggles without a turn', () => {
    const result = run('vV');
    expect(result.state.turn).toBe(1);
    expect(result.state.engine.mode).toBe('visual-line');
  });
  it('restores the original pending state after an engine error', () => {
    const result = run('d?');
    expect(result.state.engine).toEqual(engine.init(FIXTURE_STAGE.map, FIXTURE_STAGE.start));
    expect(result.state.pending).toBeNull();
    expect(result.events.some((event) => event.type === 'engine-error')).toBe(true);
  });
  it('stores the pre-command state while typing a count', () => {
    const result = run('5');
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
    expect(result.events).toEqual([{ type: 'bump', reason: 'fixed', at: result.state.engine.cursor }]);
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
    expect(result.events).toEqual([{ type: 'bump', reason: 'wall', at: { line: 0, col: 2 } }]);
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
  it('rejects a walk landing on water', () => {
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
    const value = stage({ start: { line: 3, col: 1 }, entities: [blot({ line: 3, col: 1 }, { behaviour: { type: 'still' }, damage: 0 })] });
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
  it('a Blot next to the player deals no damage', () => {
    const value = stage({ entities: [blot({ line: 2, col: 2 })] });
    expect(run('l', value).state.hearts).toBe(3);
  });
  it('walking onto a Blot is a hit, also on a turn when it does not act', () => {
    const value = stage({ entities: [blot({ line: 2, col: 2 }, { every: 99 })] });
    const result = run('ll', value);
    expect(result.state.engine.cursor).toEqual({ line: 2, col: 2 });
    expect(result.state.hearts).toBe(2);
  });
  it('a chasing Blot steps onto a player who does not move away, and hits', () => {
    const value = flat({ start: { line: 1, col: 0 }, entities: [blot({ line: 1, col: 2 }, { every: 1 })] });
    const result = run('0', value);
    expect(result.state.entities[0]?.at).toEqual({ line: 1, col: 1 });
    expect(result.state.hearts).toBe(3);
    const second = run('00', value);
    expect(second.state.entities).toEqual([]);
    expect(second.events).toContainEqual({ type: 'entity-removed', entity: value.entities[0]?.id, cause: 'hit' });
    expect(second.state.hearts).toBe(2);
  });
  it('walking away from a chaser of the same speed is never a hit', () => {
    const value = flat({ start: { line: 1, col: 3 }, entities: [blot({ line: 1, col: 2 }, { every: 1 })] });
    expect(run('lllll', value).state.hearts).toBe(3);
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
    const solved = run('<CR>fnie<Esc><CR>x', value);
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
  it('remaps each buffer effect and shares one undo snapshot', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const result = sim.apply(initial, [
      { type: 'set-rows', fromLine: 3, lines: ['                '] },
      { type: 'set-rows', fromLine: 3, lines: [FIXTURE_STAGE.map[3] ?? ''] },
    ], FIXTURE_STAGE, legend);
    expect(result.state.entities).toEqual(initial.entities);
    expect(result.state.engine.undoStack).toHaveLength(1);
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
    expect(result.state.checkpoint.hearts).toBe(3);
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


describe('revised contract regressions', () => {
  const still = (col: number, id = `entity-${col}`, line = 0) => blot({ line, col },
    { id, behaviour: { type: 'still' }, damage: 0 });

  it('cancelled fixed deletion emits only bump, keeping the entity alive', () => {
    const value = stage({ map: ['    S  o '], start: { line: 0, col: 0 }, entities: [still(7)] });
    const result = run('dd', value);
    expect(result.events).toEqual([{ type: 'bump', reason: 'fixed', at: { line: 0, col: 0 } }]);
    expect(result.state.entities).toEqual(sim.init(value, legend, options).entities);
  });
  it('cancelled river walk emits only bump', () => {
    const value = stage({ start: { line: 0, col: 0 } });
    expect(run('j', value).events).toEqual([{ type: 'bump', reason: 'wall', at: { line: 1, col: 0 } }]);
  });
  it('open inserts emit only provisional rows and defer all entity remapping', () => {
    const result = run('io');
    expect(result.events.map((event) => event.type)).toEqual(['rows-changed']);
    expect(result.state.entities).toEqual(sim.init(FIXTURE_STAGE, legend, options).entities);
    expect(keysFrom(result.state, '<Esc>').events.filter((event) => event.type === 'command')).toHaveLength(1);
  });
  it('retyping the same cell in a change preserves its entity', () => {
    const value = stage({ map: ['o o'], start: { line: 0, col: 1 }, entities: [still(1)] });
    const result = run(['c', 'l', ' ', '<Esc>'], value);
    expect(result.state.entities).toEqual(sim.init(value, legend, options).entities);
    expect(result.events.filter((event) => event.type === 'entity-removed')).toEqual([]);
    expect(result.state.turn).toBe(1);
  });
  it.each([{ key: 'x', col: 2, removed: 2, survivor: 4, to: 3 },
    { key: 'x', col: 5, removed: 5, survivor: 2, to: 2 },
    // Known limit: X inside equal tiles is placed at the cursor, not to its left.
    { key: 'X', col: 2, removed: 2, survivor: 1, to: 1 }])(
    '$key in a run at $col anchors removal at the cursor', ({ key, col, removed, survivor, to }) => {
      const value = stage({ map: ['oooooo'], start: { line: 0, col }, entities: [still(removed), still(survivor)] });
      const result = run(key, value);
      expect(result.state.entities.map((entity) => ({ id: entity.id, at: entity.at })))
        .toEqual([{ id: `entity-${survivor}`, at: { line: 0, col: to } }]);
      expect(result.events.filter((event) => event.type === 'entity-removed'))
        .toEqual([{ type: 'entity-removed', entity: `entity-${removed}`, cause: 'deleted-tile' }]);
    });
  it('dd on identical rows removes only middle-row entities', () => {
    const value = stage({ map: ['ooo', 'ooo', 'ooo'], start: { line: 1, col: 0 },
      entities: [still(1, 'top', 0), still(1, 'middle', 1), still(1, 'bottom', 2)] });
    expect(run('dd', value).state.entities.map((entity) => ({ id: entity.id, at: entity.at }))).toEqual([
      { id: 'top', at: { line: 0, col: 1 } }, { id: 'bottom', at: { line: 1, col: 1 } },
    ]);
  });
  it('unwrite above the player preserves their tile and maps marks and visual anchor', () => {
    const value = stage({ entities: [blot({ line: 3, col: 14 }, { every: 1, damage: 0,
      behaviour: { type: 'unwrite', path: [{ line: 0, col: 0 }] } })] });
    const initial = sim.init(value, legend, options);
    const state = { ...initial, engine: { ...initial.engine, marks: { a: { line: 2, col: 3 }, b: { line: 0, col: 0 } } } };
    const result = keysFrom(state, 'v', value);
    expect(result.state.engine.cursor).toEqual({ line: 1, col: 0 });
    expect(result.state.engine.marks).toEqual({ a: { line: 1, col: 3 } });
    expect(result.state.engine.visualAnchor).toEqual({ line: 1, col: 0 });
    expect(result.state.hearts).toBe(3);
  });
  it('unwrite of the player row displaces, hits, and ends deleted visual selection', () => {
    const value = stage({ entities: [blot({ line: 3, col: 14 }, { every: 1, damage: 0,
      behaviour: { type: 'unwrite', path: [{ line: 2, col: 0 }] } })] });
    const result = run('v', value);
    expect(result.state.engine.cursor).toEqual({ line: 2, col: 1 });
    expect(result.state.engine.mode).toBe('normal');
    expect(result.state.engine.visualAnchor).toBeNull();
    expect(result.state.hearts).toBe(2);
    expect(result.events.filter((event) => event.type === 'player-hit' || event.type === 'player-moved')).toEqual([
      { type: 'player-hit', by: 'tile', hearts: 2 },
      { type: 'player-moved', from: { line: 2, col: 0 }, to: { line: 2, col: 1 }, style: 'jump' },
    ]);
  });
  it('a displaced player with no walkable cell left dies where they stood', () => {
    const value = stage({ map: ['o'], start: { line: 0, col: 0 }, entities: [], triggers: [], scripts: [],
      clear: [{ type: 'flag', flag: 'never' }] });
    const result = sim.apply(sim.init(value, legend, options), [{ type: 'set-rows', fromLine: 0, lines: ['~'] }], value, legend);
    expect(result.state.status).toBe('dead');
    expect(result.state.hearts).toBe(0);
    expect(result.state.engine.cursor).toEqual({ line: 0, col: 0 });
    expect(result.events.filter((event) => event.type === 'player-moved')).toEqual([]);
    expect(result.events.some((event) => event.type === 'player-died')).toBe(true);
  });
  it.each([{ line: 1, col: 0 }, { line: 3, col: 4 }, { line: 99, col: 0 }, { line: 2, col: 99 }])(
    'ignores invalid move-player to $line:$col', (to) => {
      const initial = sim.init(FIXTURE_STAGE, legend, options);
      const result = sim.apply(initial, [{ type: 'move-player', to }], FIXTURE_STAGE, legend);
      expect(result.state.engine.cursor).toEqual(initial.engine.cursor);
      expect(result.events.filter((event) => event.type === 'player-moved')).toEqual([]);
    });
  it('valid move-player emits a jump', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const to = { line: 0, col: 0 };
    expect(sim.apply(initial, [{ type: 'move-player', to }], FIXTURE_STAGE, legend).events).toEqual([
      { type: 'player-moved', from: initial.engine.cursor, to, style: 'jump' }, { type: 'checkpoint-saved' },
    ]);
  });
  it('fixture effects emit rows before flag', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const effects = FIXTURE_STAGE.scripts[0]?.effects ?? [];
    expect(sim.apply(initial, effects, FIXTURE_STAGE, legend).events.map((event) => event.type))
      .toEqual(['rows-changed', 'flag-set', 'checkpoint-saved']);
  });
  it('effects see preceding spawns and remap before subsequent effects', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const result = sim.apply(initial, [
      { type: 'spawn', entity: still(3, 'new', 2) }, { type: 'delete-row', line: 0 },
      { type: 'move-player', to: { line: 1, col: 5 } }, { type: 'delete-row', line: 0 },
    ], FIXTURE_STAGE, legend);
    expect(result.state.entities.find((entity) => entity.id === 'new')?.at).toEqual({ line: 0, col: 3 });
    expect(result.state.engine.cursor).toEqual({ line: 0, col: 5 });
    expect(result.state.engine.undoStack).toHaveLength(1);
  });
  it.each(['playing', 'dead'] as const)('restore works from %s', (status) => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    const changed = { ...run('l').state, status };
    expect(sim.restore(changed).state.engine).toEqual(initial.engine);
    expect(sim.restore(changed).state.status).toBe('playing');
  });
  it('restore does nothing once cleared', () => {
    const initial = { ...sim.init(FIXTURE_STAGE, legend, options), status: 'cleared' as const };
    expect(sim.restore(initial)).toEqual({ state: initial, events: [] });
  });
  it('solving emits solved, effects, then automatic close', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    const result = run('<CR>fnie<Esc>', value);
    expect(result.state.script).toBeNull();
    expect(result.events.filter((event) => ['script-solved', 'rows-changed', 'flag-set', 'script-closed'].includes(event.type)))
      .toEqual([{ type: 'script-solved', script: 'river-spell', keys: 5 },
        { type: 'rows-changed', fromLine: 1, toLine: 1, lineDelta: 0, by: 'effect' },
        { type: 'flag-set', flag: 'fixture.bridge-mended', value: true },
        { type: 'script-closed', script: 'river-spell', solved: true }]);
  });
  it('solved scripts allow motions, reject edits and close with :q', () => {
    const value = stage({ start: { line: 2, col: 4 } });
    const solved = run('<CR>fnie<Esc>', value).state;
    const reopened = keysFrom({ ...solved, script: null }, '<CR>l', value);
    expect(reopened.state.script?.engine.cursor).toEqual({ line: 0, col: 1 });
    const edited = keysFrom(reopened.state, 'ix<Esc>rxddu<C-r>:s/o/x/<CR>', value);
    expect(edited.state.script?.engine.lines).toEqual(['The bridge is broken.']);
    expect(keysFrom(edited.state, ':q<CR>', value).state.script).toBeNull();
  });
  it('heal is capped at stage maximum', () => {
    const initial = sim.init(FIXTURE_STAGE, legend, options);
    expect(sim.apply({ ...initial, hearts: 1 }, [{ type: 'heal', hearts: 99 }], FIXTURE_STAGE, legend).state.hearts).toBe(3);
  });
  it('real jump landing on water emits only bump', () => {
    expect(run('1G', stage({ start: { line: 0, col: 0 } })).state.turn).toBe(1);
    expect(run('2G').events).toEqual([{ type: 'bump', reason: 'wall', at: { line: 1, col: 0 } }]);
  });
  it('diagonal to the sign does not open it', () => {
    expect(run('<CR>', stage({ start: { line: 2, col: 3 } })).state.script).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { Position } from '@escape/engine';
import { SKILLS } from '../catalog.js';
import type { MapProgress, MapState, WorldMap } from '../phase3.js';
import { entityAt, mapCommands, startMap, stepMap, visibleLines } from './index.js';

const map: WorldMap = {
  lines: ['#########', '# N # K D', '# E     #', '#########', 'D       X', 'hidden', ''],
  start: { line: 1, col: 1 },
  walls: '#',
  entities: [
    { id: 'note', kind: 'note', at: { line: 1, col: 2 }, skill: 'motion.word' },
    { id: 'key', kind: 'key', at: { line: 1, col: 6 }, unlocks: 'edit-forge' },
    { id: 'door', kind: 'door', at: { line: 1, col: 8 }, skill: 'motion.WORD' },
    { id: 'echo', kind: 'echo', at: { line: 2, col: 2 } },
    { id: 'file-door', kind: 'door', at: { line: 4, col: 0 }, skill: 'motion.file' },
    { id: 'exit', kind: 'exit', at: { line: 4, col: 8 } },
  ],
  regions: [
    { id: 'motion-plains', title: 'Visible', rows: { from: 0, to: 4 }, unlockedBy: null },
    { id: 'edit-forge', title: 'Hidden', rows: { from: 5, to: 6 }, unlockedBy: 'key' },
  ],
};
const progress: MapProgress = {
  learned: new Set(SKILLS.map((skill) => skill.id)),
  collectedKeys: new Set(),
  clearedDoors: new Set(),
};
const at = (cursor: Position, world: WorldMap = map, saved: MapProgress = progress): MapState =>
  startMap({ ...world, start: cursor }, saved);
const press = (state: MapState, keys: readonly string[], saved: MapProgress = progress): MapState =>
  keys.reduce((current, key) => stepMap(current, key, saved).state, state);
const basic: MapProgress = { ...progress, learned: new Set() };

describe('map setup and visibility', () => {
  it('initializes the real engine buffer and cursor', () => {
    const state = startMap(map, progress);
    expect(state.engine.lines).toEqual(map.lines);
    expect(state.engine.cursor).toEqual(map.start);
    expect(state.engine.mode).toBe('normal');
  });
  it('reveals only initially available regions', () => {
    expect([...startMap(map, progress).revealed]).toEqual(['motion-plains']);
  });
  it('restores regions and keys from saved progress', () => {
    const saved = { ...progress, collectedKeys: new Set(['key']) };
    const state = startMap(map, saved);
    expect(state.revealed.has('edit-forge')).toBe(true);
    expect(state.collectedKeys).toEqual(saved.collectedKeys);
    expect(state.collectedKeys).not.toBe(saved.collectedKeys);
  });
  it('masks hidden rows without changing their dimensions', () => {
    const lines = visibleLines(startMap(map, progress));
    expect(lines).toEqual([...map.lines.slice(0, 5), '░░░░░░', '']);
    expect(lines.map((line) => line.length)).toEqual(map.lines.map((line) => line.length));
  });
  it('renders unlocked rows as their original text', () => {
    expect(visibleLines(startMap(map, { ...progress, collectedKeys: new Set(['key']) }))).toEqual(map.lines);
  });
  it('leaves rows outside region ranges visible', () => {
    expect(visibleLines(startMap({ ...map, regions: [] }, progress))).toEqual(map.lines);
  });
  it('looks up an entity by exact cell', () => {
    expect(entityAt(map, { line: 1, col: 2 })?.id).toBe('note');
  });
  it.each([{ line: 1, col: 3 }, { line: 2, col: 8 }, { line: 99, col: 0 }])('returns no entity at %j', (cursor) => {
    expect(entityAt(map, cursor)).toBeUndefined();
  });
});

describe('unlocked map tools', () => {
  it('always includes only basic movement initially', () => {
    expect(mapCommands(new Set())).toEqual(['h', 'j', 'k', 'l']);
  });
  it('includes learned motion commands without duplicates', () => {
    expect(mapCommands(new Set(['motion.hjkl', 'motion.word']))).toEqual(['h', 'j', 'k', 'l', 'w', 'b', 'e']);
  });
  it('ignores editing, quit, unknown and uncatalogued skills', () => {
    expect(mapCommands(new Set(['mode.insert', 'ex.wq', 'ex.q', 'motion.find', 'unknown']))).toEqual(['h', 'j', 'k', 'l']);
  });
  it('includes every catalog motion and no editing commands', () => {
    expect(mapCommands(progress.learned)).toEqual(['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G']);
  });
  it.each(['w', '$', 'G', '0', 'g', 'i', 'x', ':', '/', 'f', 't', '2'])('rejects locked or non-map key %s', (key) => {
    const initial = startMap(map, basic);
    const result = stepMap(initial, key, basic);
    expect(result.events).toEqual([{ type: 'not-learned', command: key }]);
    expect(result.state.engine.cursor).toEqual(initial.engine.cursor);
    expect(result.state.engine.mode).toBe('normal');
    expect(result.state.engine.pendingKeys).toEqual([]);
    expect(result.state.engine.lines).toEqual(map.lines);
  });
  it('keeps editing and ex commands blocked even when learned', () => {
    for (const key of ['i', ':', 'Z']) {
      expect(stepMap(startMap(map, progress), key, progress).events[0]?.type).toBe('not-learned');
    }
  });
  it('supports learned count prefixes without moving prematurely', () => {
    const state = at({ line: 2, col: 3 });
    const pending = stepMap(state, '2', progress);
    expect(pending.events).toEqual([]);
    expect(pending.state.engine.cursor).toEqual(state.engine.cursor);
    expect(pending.state.engine.pendingKeys).toEqual(['2']);
    expect(stepMap(pending.state, 'l', progress).state.engine.cursor).toEqual({ line: 2, col: 5 });
  });
  it('rejects counts when motion.count is not learned', () => {
    const saved = { ...progress, learned: new Set(['motion.word']) };
    expect(stepMap(startMap(map, saved), '3', saved).events[0]?.type).toBe('not-learned');
  });
  it('clears a rejected prefix so the next valid motion works', () => {
    const state = press(startMap(map, basic), ['f', 'l'], basic);
    expect(state.engine.cursor).toEqual({ line: 1, col: 2 });
    expect(state.engine.pendingKeys).toEqual([]);
  });
});

describe('engine motion and collision', () => {
  it.each([
    { key: 'h', cursor: { line: 1, col: 1 } },
    { key: 'l', cursor: { line: 1, col: 3 } },
    { key: 'w', cursor: { line: 1, col: 2 } },
    { key: '$', cursor: { line: 2, col: 2 } },
    { key: 'G', cursor: { line: 1, col: 1 } },
    { key: '0', cursor: { line: 1, col: 6 } },
  ])('bumps on a wall after $key', ({ key, cursor }) => {
    const world = key === 'G' ? { ...map, lines: map.lines.slice(0, 4) } : map;
    const initial = at(cursor, world);
    const result = stepMap(initial, key, progress);
    expect(result.events).toEqual([{ type: 'bump' }]);
    expect(result.state.engine.cursor).toEqual(cursor);
    expect(result.state.engine.desiredCol).toBe(initial.engine.desiredCol);
    expect(result.state.engine.pendingKeys).toEqual([]);
  });
  it('restores desiredCol even when it differs from the cursor column', () => {
    const initial = at({ line: 2, col: 3 });
    const state = { ...initial, engine: { ...initial.engine, desiredCol: 7 } };
    const result = stepMap(state, '$', progress);
    expect(result.state.engine.desiredCol).toBe(7);
  });
  it.each([
    { key: '0', cursor: { line: 4, col: 8 }, target: { line: 4, col: 0 } },
    { key: '$', cursor: { line: 1, col: 2 }, target: { line: 1, col: 8 } },
  ])('allows $key across intervening walls when the destination is clear', ({ key, cursor, target }) => {
    const world = { ...map, lines: ['#########', '# N # K D', '# E     #', '#########', 'D #     X', 'hidden', ''] };
    const result = stepMap(at(cursor, world), key, progress);
    expect(result.events).toEqual([]);
    expect(result.state.engine.cursor).toEqual(target);
  });
  it('rejects movement into fog and restores desiredCol', () => {
    const initial = at({ line: 4, col: 3 });
    const result = stepMap(initial, 'j', progress);
    expect(result.events).toEqual([{ type: 'fog' }]);
    expect(result.state.engine.cursor).toEqual(initial.engine.cursor);
    expect(result.state.engine.desiredCol).toBe(initial.engine.desiredCol);
  });
  it('checks fog on long-distance file motions', () => {
    expect(stepMap(startMap(map, progress), 'G', progress).events).toEqual([{ type: 'fog' }]);
  });
  it('does not treat an incomplete gg as a move', () => {
    const initial = at({ line: 0, col: 0 });
    const result = stepMap(initial, 'g', progress);
    expect(result.events).toEqual([]);
    expect(result.state.engine.pendingKeys).toEqual(['g']);
    expect(stepMap(result.state, 'g', progress).events).toEqual([{ type: 'bump' }]);
  });
  it('treats G over a wall as a jump to a clear door', () => {
    const world = { ...map, lines: map.lines.slice(0, 5) };
    const result = stepMap(at({ line: 2, col: 0 }, world), 'G', progress);
    expect(result.state.engine.cursor).toEqual({ line: 4, col: 0 });
    expect(result.events).toEqual([]);
    expect(stepMap(result.state, '<CR>', progress).events[0]?.type).toBe('open-door');
  });
  it.each([
    { keys: ['2', 'j'], cursor: { line: 2, col: 1 } },
    { keys: ['8', 'j'], cursor: { line: 2, col: 1 } },
    { keys: ['2', 'k'], cursor: { line: 4, col: 1 } },
    { keys: ['3', 'l'], cursor: { line: 1, col: 2 } },
    { keys: ['3', 'h'], cursor: { line: 1, col: 5 } },
  ])('bumps counted walking $keys across an intermediate wall', ({ keys, cursor }) => {
    const world = { ...map, lines: map.lines.slice(0, 5) };
    const initial = at(cursor, world);
    const pending = press(initial, keys.slice(0, -1));
    const result = stepMap(pending, keys[keys.length - 1]!, progress);
    expect(result.events).toEqual([{ type: 'bump' }]);
    expect(result.state.engine.cursor).toEqual(cursor);
    expect(result.state.engine.desiredCol).toBe(initial.engine.desiredCol);
    expect(result.state.engine.pendingKeys).toEqual([]);
  });
  it('lets plain w jump over wall characters inside a word', () => {
    const world = { ...map, lines: ['ax b'], walls: 'x', entities: [], regions: [] };
    const result = stepMap(startMap({ ...world, start: { line: 0, col: 0 } }, progress), 'w', progress);
    expect(result.events).toEqual([]);
    expect(result.state.engine.cursor).toEqual({ line: 0, col: 3 });
  });
  it('lets counted w jump over an intermediate wall to a clear landing cell', () => {
    const world = { ...map, lines: ['a # b'], entities: [], regions: [] };
    const pending = press(at({ line: 0, col: 0 }, world), ['2']);
    const result = stepMap(pending, 'w', progress);
    expect(result.events).toEqual([]);
    expect(result.state.engine.cursor).toEqual({ line: 0, col: 4 });
  });
  it.each([
    { keys: ['2', 'j'], cursor: { line: 0, col: 0 } },
    { keys: ['2', 'k'], cursor: { line: 2, col: 0 } },
  ])('cancels walking $keys across fog even with a visible landing', ({ keys, cursor }) => {
    const world: WorldMap = {
      ...map, lines: ['a', 'b', 'c'], entities: [],
      regions: [{ id: 'edit-forge', title: 'Hidden', rows: { from: 1, to: 1 }, unlockedBy: 'key' }],
    };
    const initial = at(cursor, world);
    const pending = press(initial, keys.slice(0, -1));
    const result = stepMap(pending, keys[keys.length - 1]!, progress);
    expect(result.events).toEqual([{ type: 'fog' }]);
    expect(result.state.engine.cursor).toEqual(cursor);
    expect(result.state.engine.desiredCol).toBe(initial.engine.desiredCol);
  });
  it('lets G jump across fog to a revealed row', () => {
    const world: WorldMap = {
      ...map, lines: ['a', 'b', 'c'], entities: [],
      regions: [{ id: 'edit-forge', title: 'Hidden', rows: { from: 1, to: 1 }, unlockedBy: 'key' }],
    };
    const result = stepMap(startMap(world, progress), 'G', progress);
    expect(result.events).toEqual([]);
    expect(result.state.engine.cursor).toEqual({ line: 2, col: 0 });
  });
  it('seals a full-width shaft against every hjkl walk and count but allows G', () => {
    const shaft: WorldMap = {
      lines: ['   ', '|||', '|||', ' D '], start: { line: 0, col: 1 }, walls: '|', regions: [],
      entities: [{ id: 'shaft-door', kind: 'door', at: { line: 3, col: 1 } }],
    };
    // Exhaust all reachable cells and every walking command, including counts
    // beyond the buffer height, to prove there is no route around the barrier.
    const reachable = [startMap(shaft, progress)];
    const visited = new Set(['0:1']);
    const counts = ['', '1', '2', '3', '4', '8', '9', '99'];
    for (const state of reachable) {
      for (const count of counts) {
        for (const motion of ['h', 'j', 'k', 'l']) {
          const next = press(state, [...count, motion]);
          expect(next.engine.cursor.line).toBe(0);
          const id = `${next.engine.cursor.line}:${next.engine.cursor.col}`;
          if (!visited.has(id)) {
            visited.add(id);
            reachable.push(next);
          }
        }
      }
    }
    expect(visited).toEqual(new Set(['0:0', '0:1', '0:2']));
    const jumped = stepMap(startMap(shaft, progress), 'G', progress);
    expect(jumped.events).toEqual([]);
    expect(jumped.state.engine.cursor).toEqual(shaft.entities[0]?.at);
    expect(stepMap(jumped.state, '<CR>', progress).events).toEqual([
      { type: 'open-door', entity: shaft.entities[0] },
    ]);
  });
  it('uses real word movement to land on a note', () => {
    const result = stepMap(startMap(map, progress), 'w', progress);
    expect(result.state.engine.cursor).toEqual({ line: 1, col: 2 });
    expect(result.events).toEqual([]);
    expect(stepMap(result.state, '<CR>', progress).events[0]?.type).toBe('open-note');
  });
  it('never mutates the map buffer, history, or input state', () => {
    const initial = startMap(map, progress);
    const snapshot = JSON.stringify(initial.engine);
    const final = press(initial, ['w', '$', 'h', '2', 'j', 'g', 'g', 'i', 'x', ':', 'l']);
    expect(final.engine.lines).toEqual(map.lines);
    expect(final.engine.undoStack).toEqual([]);
    expect(final.engine.changeSeq).toBe(0);
    expect(final.engine.modified).toBe(false);
    expect(JSON.stringify(initial.engine)).toBe(snapshot);
  });
});

describe('entities and interaction', () => {
  it.each([
    { cursor: { line: 1, col: 2 }, type: 'open-note' },
    { cursor: { line: 2, col: 2 }, type: 'echo' },
    { cursor: { line: 1, col: 8 }, type: 'open-door' },
  ])('emits $type on Enter', ({ cursor, type }) => {
    const result = stepMap(at(cursor), '<CR>', progress);
    expect(result.events).toEqual([{ type, entity: entityAt(map, cursor) }]);
  });
  it.each([{ line: 1, col: 3 }, { line: 4, col: 8 }, { line: 1, col: 6 }])('Enter does nothing at %j', (cursor) => {
    expect(stepMap(at(cursor), '<CR>', progress).events).toEqual([]);
  });
  it('does not interact while a command is pending', () => {
    const pending = press(at({ line: 1, col: 2 }), ['g']);
    expect(stepMap(pending, '<CR>', progress).events.every((event) => event.type === 'not-learned')).toBe(true);
  });
  it('locks doors with all missing transitive prerequisites', () => {
    const result = stepMap(at({ line: 1, col: 8 }), '<CR>', basic);
    expect(result.events).toEqual([{ type: 'door-locked', entity: map.entities[2], missing: ['motion.word', 'motion.hjkl'] }]);
  });
  it('checks transitive prerequisites even when the direct prerequisite is learned', () => {
    const saved = { ...progress, learned: new Set(['motion.word']) };
    const result = stepMap(at({ line: 1, col: 8 }), '<CR>', saved);
    expect(result.events).toEqual([{ type: 'door-locked', entity: map.entities[2], missing: ['motion.hjkl'] }]);
  });
  it('does not require the door skill itself to be learned', () => {
    const saved = { ...progress, learned: new Set(['motion.word', 'motion.hjkl']) };
    expect(stepMap(at({ line: 1, col: 8 }), '<CR>', saved).events[0]?.type).toBe('open-door');
  });
  it('opens a cleared door again on Enter so its room can be replayed', () => {
    const saved = { ...progress, clearedDoors: new Set(['door']) };
    const initial = at({ line: 1, col: 8 }, map, saved);
    const result = stepMap(initial, '<CR>', saved);
    expect(result.events).toEqual([{ type: 'open-door', entity: map.entities[2] }]);
    expect(result.state).toBe(initial);
    expect(stepMap(result.state, '<CR>', saved).events).toEqual(result.events);
  });
  it('does not bypass prerequisites on a cleared door', () => {
    const saved = { ...basic, clearedDoors: new Set(['door']) };
    expect(stepMap(at({ line: 1, col: 8 }), '<CR>', saved).events[0]?.type).toBe('door-locked');
  });
  it('collects a key and reveals its region on movement', () => {
    const initial = at({ line: 1, col: 5 });
    const result = stepMap(initial, 'l', progress);
    expect(result.events).toEqual([{ type: 'key-collected', entity: map.entities[1] }]);
    expect(result.state.collectedKeys.has('key')).toBe(true);
    expect(result.state.revealed.has('edit-forge')).toBe(true);
    expect(visibleLines(result.state)).toEqual(map.lines);
    expect(initial.collectedKeys.size).toBe(0);
    expect(progress.collectedKeys.size).toBe(0);
    expect(press(result.state, ['$', '0', 'G']).engine.cursor.line).toBe(6);
  });
  it('collects a key using w', () => {
    expect(stepMap(at({ line: 1, col: 4 }), 'w', progress).events[0]?.type).toBe('key-collected');
  });
  it('collects a key using $', () => {
    const world = { ...map, lines: map.lines.map((line, row) => row === 1 ? '# N # K' : line) };
    expect(stepMap(startMap(world, progress), '$', progress).events[0]?.type).toBe('key-collected');
  });
  it('never collects the same key twice', () => {
    const collected = press(at({ line: 1, col: 5 }), ['l']);
    expect(stepMap(press(collected, ['h']), 'l', progress).events).toEqual([]);
  });
  it('does not recollect a saved key', () => {
    const saved = { ...progress, collectedKeys: new Set(['key']) };
    expect(stepMap(at({ line: 1, col: 5 }, map, saved), 'l', saved).events).toEqual([]);
  });
  it('does not collect a key on initialization or pending input', () => {
    const state = at({ line: 1, col: 6 });
    expect(state.collectedKeys.size).toBe(0);
    expect(stepMap(state, 'g', progress).events).toEqual([]);
  });
  it('does not collect a key in fog', () => {
    const world = { ...map, entities: [...map.entities, { id: 'hidden-key', kind: 'key', at: { line: 5, col: 0 } } satisfies WorldMap['entities'][number]] };
    const result = stepMap(at({ line: 4, col: 0 }, world), 'j', progress);
    expect(result.events).toEqual([{ type: 'fog' }]);
    expect(result.state.collectedKeys.size).toBe(0);
  });
});

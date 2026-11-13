import { describe, expect, it } from 'vitest';
import type { Entity, WorldEvent } from '../types.js';
import { FIXTURE_LEGEND as legend, FIXTURE_STAGE } from '../fixtures.js';
import { changedRows, mapOffset, fixedChanged, offsetAt, positionAt, remapEntities } from './remap.js';

const definition = FIXTURE_STAGE.entities[0];
if (definition === undefined) throw new Error('Missing fixture entity');
const entity: Entity = { id: definition.id, def: definition, at: { line: 0, col: 2 }, pathIndex: 0 };

describe('text offset mapping', () => {
  it.each([
    { edit: { start: 2, removed: 0, inserted: 'o' }, offset: 1, result: 1 },
    { edit: { start: 2, removed: 0, inserted: 'o' }, offset: 2, result: 3 },
    { edit: { start: 1, removed: 1, inserted: '' }, offset: 1, result: null },
    { edit: { start: 1, removed: 1, inserted: '' }, offset: 4, result: 3 },
    { edit: { start: 1, removed: 2, inserted: '  ' }, offset: 1, result: 1 },
    { edit: { start: 1, removed: 2, inserted: ' ' }, offset: 2, result: null },
  ])('maps $offset through $edit', ({ edit, offset, result }) => {
    expect(mapOffset(offset, [edit])).toBe(result);
  });
  it('carries subsequent edit boundaries back to old rows', () => {
    expect(changedRows(['ooo', 'ooo', 'ooo'], [
      { start: 0, removed: 4, inserted: '' },
      { start: 4, removed: 3, inserted: 'o' },
    ])).toEqual({ fromLine: 0, toLine: 2 });
  });
  it('converts ragged row positions to text offsets', () => {
    expect(offsetAt(['ooo', 'o', 'oooo'], { line: 2, col: 2 })).toBe(8);
    expect(positionAt(['ooo', 'o', 'oooo'], 8)).toEqual({ line: 2, col: 2 });
  });
  it('rejects newline, end of text and negative offsets', () => {
    for (const offset of [-1, 3, 5]) expect(positionAt(['ooo', 'o'], offset)).toBeNull();
  });
  it('removes an entity mapped onto a newline', () => {
    const events: WorldEvent[] = [];
    expect(remapEntities(['oo oo'], ['oo', 'oo'], [entity], legend, events, [{ start: 2, removed: 1, inserted: '\n' }])).toEqual([]);
    expect(events).toContainEqual({ type: 'entity-removed', entity: entity.id, cause: 'deleted-tile' });
  });
  it('removes an entity mapped onto an unwalkable tile', () => {
    expect(remapEntities(['oooo'], ['ooTo'], [entity], legend, [], [{ start: 2, removed: 1, inserted: 'T' }])).toEqual([]);
  });
  it('retains an entity within a replacement span when its offset still fits', () => {
    expect(remapEntities(['ooooo'], ['o   o'], [entity], legend, [], [{ start: 1, removed: 3, inserted: '   ' }])[0]?.at).toEqual(entity.at);
  });
  it('maps split rows and their join back again', () => {
    const split = remapEntities(['oooo'], ['oo', 'oo'], [{ ...entity, at: { line: 0, col: 3 } }], legend, [], [{ start: 2, removed: 0, inserted: '\n' }]);
    expect(split[0]?.at).toEqual({ line: 1, col: 1 });
    expect(remapEntities(['oo', 'oo'], ['oooo'], split, legend, [], [{ start: 2, removed: 1, inserted: '' }])[0]?.at).toEqual({ line: 0, col: 3 });
  });
  it('allows a fixed tile to shift across rows', () => {
    expect(fixedChanged(['oo', ' S'], [' S'], legend, [{ start: 0, removed: 3, inserted: '' }])).toBe(false);
  });
  it('detects fixed replacement and deletion', () => {
    expect(fixedChanged(['oSo'], ['ooo'], legend, [{ start: 1, removed: 1, inserted: 'o' }])).toBe(true);
    expect(fixedChanged(['oSo'], ['oo'], legend, [{ start: 1, removed: 1, inserted: '' }])).toBe(true);
  });
  it('uses exact cells inside equal runs', () => {
    expect(mapOffset(1, [{ start: 1, removed: 1, inserted: '' }])).toBeNull();
    expect(mapOffset(3, [{ start: 1, removed: 1, inserted: '' }])).toBe(2);
  });
});

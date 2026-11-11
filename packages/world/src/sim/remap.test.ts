import { describe, expect, it } from 'vitest';
import type { Entity, WorldEvent } from '../types.js';
import { FIXTURE_LEGEND as legend, FIXTURE_STAGE } from '../fixtures.js';
import { changedSpan, fixedChanged, offsetAt, positionAt, remapEntities } from './remap.js';

const definition = FIXTURE_STAGE.entities[0];
if (definition === undefined) throw new Error('Missing fixture entity');
const entity: Entity = { id: definition.id, def: definition, at: { line: 0, col: 2 }, pathIndex: 0 };

describe('text offset mapping', () => {
  it.each([
    { before: ['oo oo'], after: ['ooo oo'], start: 2, oldEnd: 2, newEnd: 3 },
    { before: ['oo oo'], after: ['o oo'], start: 1, oldEnd: 2, newEnd: 1 },
    { before: ['oo', 'oo'], after: ['oo oo'], start: 2, oldEnd: 3, newEnd: 3 },
    { before: ['oo oo'], after: ['oo', 'oo'], start: 2, oldEnd: 3, newEnd: 3 },
    { before: ['oo'], after: ['oo'], start: 2, oldEnd: 2, newEnd: 2 },
    { before: ['ooo'], after: [''], start: 0, oldEnd: 3, newEnd: 0 },
  ])('finds prefix/suffix for $before -> $after', ({ before, after, start, oldEnd, newEnd }) => {
    expect(changedSpan(before, after)).toMatchObject({ start, oldEnd, newEnd });
  });
  it.each([
    { before: ['oo oo'], after: ['ooo oo'], offset: 1, result: 1 },
    { before: ['oo oo'], after: ['ooo oo'], offset: 2, result: 3 },
    { before: ['oo oo'], after: ['o oo'], offset: 1, result: null },
    { before: ['oo oo'], after: ['o oo'], offset: 4, result: 3 },
    { before: ['oooo'], after: ['o  o'], offset: 1, result: 1 },
    { before: ['oooo'], after: ['o o'], offset: 2, result: null },
  ])('maps $offset in $before -> $after', ({ before, after, offset, result }) => {
    expect(changedSpan(before, after).map(offset)).toBe(result);
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
    expect(remapEntities(['oo oo'], ['oo', 'oo'], [entity], legend, events)).toEqual([]);
    expect(events).toContainEqual({ type: 'entity-removed', entity: entity.id, cause: 'deleted-tile' });
  });
  it('removes an entity mapped onto an unwalkable tile', () => {
    expect(remapEntities(['oooo'], ['ooTo'], [entity], legend, [])).toEqual([]);
  });
  it('retains an entity within a replacement span when its offset still fits', () => {
    expect(remapEntities(['ooooo'], ['o   o'], [entity], legend, [])[0]?.at).toEqual(entity.at);
  });
  it('maps split rows and their join back again', () => {
    const split = remapEntities(['oooo'], ['oo', 'oo'], [{ ...entity, at: { line: 0, col: 3 } }], legend, []);
    expect(split[0]?.at).toEqual({ line: 1, col: 1 });
    expect(remapEntities(['oo', 'oo'], ['oooo'], split, legend, [])[0]?.at).toEqual({ line: 0, col: 3 });
  });
  it('allows a fixed tile to shift across rows', () => {
    expect(fixedChanged(['oo', ' S'], [' S'], legend)).toBe(false);
  });
  it('detects fixed replacement and deletion', () => {
    expect(fixedChanged(['oSo'], ['ooo'], legend)).toBe(true);
    expect(fixedChanged(['oSo'], ['oo'], legend)).toBe(true);
  });
  it('uses the specified longest prefix even with indistinguishable tiles', () => {
    expect(changedSpan(['oooo'], ['ooo']).map(1)).toBe(1);
    expect(changedSpan(['oooo'], ['ooo']).map(3)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
import { blankEdges, tileGrid } from './tiles.js';

describe('tileGrid', () => {
  it('maps ground', () => expect(tileGrid([' '], FIXTURE_LEGEND)).toEqual([['grass']]));
  it('maps objects', () => expect(tileGrid(['oTS'], FIXTURE_LEGEND)).toEqual([['stone', 'tree', 'save-stone']]));
  it('maps barriers', () => expect(tileGrid(['~^'], FIXTURE_LEGEND)).toEqual([['water', 'thorns']]));
  it('uses fallback for unknown characters', () => expect(tileGrid(['?z'], FIXTURE_LEGEND)).toEqual([['unknown', 'unknown']]));
  it('preserves ragged row lengths', () => expect(tileGrid([' oo', 'o'], FIXTURE_LEGEND).map(row => row.length)).toEqual([3, 1]));
  it('does not pad empty rows', () => expect(tileGrid(['', 'o'], FIXTURE_LEGEND)).toEqual([[], ['stone']]));
  it('preserves trailing spaces', () => expect(tileGrid(['o  '], FIXTURE_LEGEND)).toEqual([['stone', 'grass', 'grass']]));
  it('accepts no rows', () => expect(tileGrid([], FIXTURE_LEGEND)).toEqual([]));
  it('uses UTF-16 columns like the engine', () => expect(tileGrid(['😀'], FIXTURE_LEGEND)[0]).toHaveLength(2));
  it('uses the supplied legend', () => expect(tileGrid(['o'], { ...FIXTURE_LEGEND, tiles: [] })).toEqual([['unknown']]));
  it('does not mutate frozen inputs', () => expect(tileGrid(Object.freeze(['o']), FIXTURE_LEGEND)).toEqual([['stone']]));
  it('renders the shared fixture without inventing cells', () => {
    const grid = tileGrid(FIXTURE_STAGE.map, FIXTURE_LEGEND);
    expect(grid.map(row => row.length)).toEqual(FIXTURE_STAGE.map.map(row => row.length));
    expect(grid[0]?.[15]).toBe('door');
    expect(grid[2]?.[7]).toBe('save-stone');
  });
});

it('edges blank paper only against written cells, never missing cells', () => {
  expect(blankEdges(['\t\t\t', '\t\t\t', '\t\t\t'], 1, 1)).toBe(0);
  expect(blankEdges([' o ', 'o\to', ' o '], 1, 1)).toBe(15);
  expect(blankEdges(['\t'], 0, 0)).toBe(0);
  expect(blankEdges(['\t.'], 0, 0)).toBe(2);
});

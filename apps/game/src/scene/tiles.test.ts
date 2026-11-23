import { describe, expect, it } from 'vitest';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
import { blankEdges, tileGrid } from './tiles.js';

describe('tileGrid', () => {
  it('maps ground', () => expect(tileGrid([' '], FIXTURE_LEGEND)).toEqual([['grass']]));
  it('maps objects', () => expect(tileGrid(['oTS'], FIXTURE_LEGEND)).toEqual([['stone', 'tree', 'save-stone']]));
  it('maps barriers', () => expect(tileGrid(['~^'], FIXTURE_LEGEND)).toEqual([['water', 'thorns']]));
  it('uses fallback for unknown characters', () => expect(tileGrid(['?z'], FIXTURE_LEGEND)).toEqual([['unknown', 'unknown']]));
  it('pads ragged rows with visual unwritten paper', () => expect(tileGrid([' oo', 'o'], FIXTURE_LEGEND)).toEqual([['grass', 'stone', 'stone'], ['stone', 'blank', 'blank']]));
  it('draws empty rows as unwritten paper', () => expect(tileGrid(['', 'o'], FIXTURE_LEGEND)).toEqual([['blank'], ['stone']]));
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

it('draws one clearing cell, with unwritten paper filling the rest of the empty row', () => {
  const legend = { ...FIXTURE_LEGEND, emptyRow: { ...FIXTURE_LEGEND.fallback, sprite: 'grass' } };
  expect(tileGrid(['ooo', ''], legend)).toEqual([['stone', 'stone', 'stone'], ['grass', 'blank', 'blank']]);
  expect(tileGrid([''], legend)).toEqual([['grass']]);
});

it('draws actual shelf spaces as gaps and only missing columns as unwritten paper', async () => {
  const { stacksLegend } = await import('../play2/content.js');
  expect(tileGrid(['b d ', 'b'], stacksLegend)).toEqual([
    ['book', 'shelf-gap', 'library-dust', 'shelf-gap'],
    ['book', 'blank', 'blank', 'blank'],
  ]);
});

it('keeps tag labels after melting wax and draws seal keys as ribbon', async () => {
  const { notary, notaryLegend } = await import('../play2/content.js');
  const grid = tileGrid(notary.map, notaryLegend);
  expect(grid[2]?.slice(2, 5)).toEqual(['keys', 'keys', 'keys']);
  expect(grid[4]?.slice(2, 5)).toEqual(['seal-ribbon', 'seal-ribbon', 'seal-ribbon']);
  expect(grid[6]?.slice(2, 11)).toEqual(['tag-label', 'tag-close', 'wax', 'wax', 'wax', 'wax', 'tag-open', 'tag-slash', 'tag-label']);
  const empty = tileGrid(['.<w></w>.#'], notaryLegend)[0];
  expect(empty).not.toContain('wax');
  expect(empty?.filter(sprite => sprite === 'tag-label')).toHaveLength(2);
});

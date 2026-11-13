import { expect, it } from 'vitest';
import { FIXTURE_LEGEND } from '@escape/world';
import { checkLegend } from './legend-rules.js';
it('accepts unwritten tab ground', () => {
  expect(checkLegend({ ...FIXTURE_LEGEND, tiles: [...FIXTURE_LEGEND.tiles, {
    char: '\t', kind: 'ground', sprite: 'blank', walkable: false, fixed: false, label: 'unwritten ground',
  }] })).toEqual([]);
});
it('rejects a tab classified as an object', () => {
  expect(checkLegend({ ...FIXTURE_LEGEND, tiles: [{
    char: '\t', kind: 'object', sprite: 'blank', walkable: false, fixed: false, label: 'unwritten ground',
  }] })).toContainEqual(expect.objectContaining({ rule: 'legend-ground', severity: 'error' }));
});

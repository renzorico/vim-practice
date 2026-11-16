import { expect, it } from 'vitest';
import { canopy, canopyLegend } from '../../apps/game/src/play2/content.js';
import { lintLegend, lintStage } from './lint.js';

it('accepts the authored Wordwood word classes without relaxing other legends', () => {
  expect(lintLegend(canopyLegend)).toEqual([]);
  expect(lintLegend({ ...canopyLegend, id: 'other-world' }).filter(issue => issue.rule === 'legend-ground')).toHaveLength(5);
  const unknownGround = { ...canopyLegend.tiles[0]!, char: 'z' };
  expect(lintLegend({ ...canopyLegend, tiles: [unknownGround] })).toEqual([
    expect.objectContaining({ rule: 'legend-ground' }),
  ]);
});
it('rejects props on trunk tiles: the sim would remove them on an edit', () => {
  expect(lintStage(canopy, canopyLegend)).toEqual([]);
  const stage = { ...canopy, entities: canopy.entities.map(entity => entity.id === 'lift'
    ? { ...entity, at: { line: 7, col: 28 } } : entity) };
  expect(lintStage(stage, canopyLegend)).toContainEqual(expect.objectContaining({ rule: 'entity-cell' }));
});

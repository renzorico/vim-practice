import { expect, it } from 'vitest';
import { canopy, canopyLegend } from '../../apps/game/src/play2/content.js';
import { lintLegend, lintStage } from './lint.js';

it('lints the Wordwood legend clean: kinds follow Vim word classes', () => {
  expect(lintLegend(canopyLegend)).toEqual([]);
});
it('rejects props on trunk tiles: the sim would remove them on an edit', () => {
  expect(lintStage(canopy, canopyLegend)).toEqual([]);
  const stage = { ...canopy, entities: canopy.entities.map(entity => entity.id === 'lift'
    ? { ...entity, at: { line: 7, col: 28 } } : entity) };
  expect(lintStage(stage, canopyLegend)).toContainEqual(expect.objectContaining({ rule: 'entity-cell' }));
});

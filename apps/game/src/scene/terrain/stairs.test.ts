import { expect, it } from 'vitest';
import { lighthouse, lighthouseLegend, stage, legend } from '../../play2/content.js';
import { stairsAt } from './stairs.js';

it('draws stairs exactly in the three openings of the Lighthouse walls, and nowhere else', () => {
  const found = lighthouse.map.flatMap((row, line) => [...row].flatMap((_, col) =>
    stairsAt('lighthouse', lighthouse.map, lighthouseLegend, line, col) ? [`${line}:${col}`] : []));
  expect(found).toEqual(['4:0', '6:19', '12:1']);
  expect(stage.map.some((row, line) => [...row].some((_, col) => stairsAt(stage.id, stage.map, legend, line, col)))).toBe(false);
});

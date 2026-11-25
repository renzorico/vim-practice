import { expect, it } from 'vitest';
import { lighthouse, lighthouseLegend, stage, stages, legend } from '../../play2/content.js';
import { stairsAt } from './stairs.js';

it('draws stairs exactly in the three openings of the Lighthouse walls, and nowhere else', () => {
  const found = lighthouse.map.flatMap((row, line) => [...row].flatMap((_, col) =>
    stairsAt('lighthouse', lighthouse.map, lighthouseLegend, line, col) ? [`${line}:${col}`] : []));
  expect(found).toEqual(['4:0', '6:19', '12:1']);
  expect(stage.map.some((row, line) => [...row].some((_, col) => stairsAt(stage.id, stage.map, legend, line, col)))).toBe(false);
});
it('draws the labyrinth stair on the cell whose arrival takes you home', () => {
  const entry = stages.find(item => item.stage.id === 'labyrinth');
  const home = entry?.stage.triggers.find(trigger => trigger.id === 'labyrinth.home');
  if (!entry || home?.on !== 'enter') throw new Error('Missing labyrinth stair');
  const { line, col } = home.area.from;
  expect(stairsAt('labyrinth', entry.stage.map, entry.legend, line, col)).toBe(true);
  expect(stairsAt('labyrinth', entry.stage.map, entry.legend, line, col + 1)).toBe(false);
  expect(entry.stage.start).toEqual({ line, col });
});

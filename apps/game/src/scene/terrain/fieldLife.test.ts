import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, type WorldState } from '@escape/world';
import { stage, legend } from '../../play2/content.js';
import { findBuildings, intactBuildings, buildingArt } from './buildings.js';
import { canopyArt, treeArt, treeMask, treeVariant } from './forest.js';
import { ERASED_ROWS, erasedColumn, erasedArt } from './erased.js';
import { forestDistance, surroundingArt, surroundingVariant } from './atmosphere.js';
import { tileAtCoordinates } from './edges.js';
import { villageDecoration, wornCells } from './village.js';

it('finds the three Margin houses, one door per front, and falls back after edits', () => {
  const houses = findBuildings(stage.map, legend);
  expect(houses.map(house => [house.width, house.height])).toEqual([[4, 2], [3, 2], [3, 2]]);
  for (const house of houses) {
    const fronts = Array.from({ length: house.width }, (_, col) => buildingArt(house, 1, col));
    expect(fronts.filter(art => art.some(pixel => pixel.width === 8 && pixel.height === 11))).toHaveLength(1);
  }
  const edited = stage.map.map((row, line) => line === 1 ? row.slice(0, 5) + ' ' + row.slice(6) : row);
  expect(intactBuildings(houses, stage.map, edited)).toHaveLength(2);
  expect(findBuildings(edited, legend)).toHaveLength(2);
});
it('joins crowns on all neighbours with no trunk when another tree is below', () => {
  expect(treeMask([' T ', 'TTT', ' T '], 1, 1, legend)).toBe(15);
  expect(treeMask(['T'], 0, 0, legend)).toBe(0);
  expect(treeMask(['T'], 0, 0, legend, true)).toBe(10); // forest outside: left and right join
  const joined = treeArt('margin', 15, 0);
  for (let y = 0; y < 16; y++) expect(joined.filter(pixel => pixel.y === y)).toHaveLength(16);
  // Below the crown a lone tree shows only its four-pixel trunk.
  expect(treeArt('margin', 0, 0).filter(pixel => pixel.y === 13).map(pixel => pixel.x)).toEqual([6, 7, 8, 9]);
  for (const oddRow of [true, false]) expect(canopyArt('margin', 0, oddRow)).toHaveLength(256);
  expect(canopyArt('margin', 0, true)).not.toEqual(canopyArt('margin', 0, false));
  expect(new Set(Array.from({ length: 20 }, (_, col) => treeVariant(0, col)))).toEqual(new Set([0, 1, 2]));
  expect(new Set([0, 1, 2].map(variant => JSON.stringify(treeArt('margin', 15, variant)))).size).toBe(3);
  expect(treeArt('lowlands', 15, 0)).not.toEqual(joined);
  expect(treeArt('margin', 0, 0, true).some(pixel => pixel.y === 0)).toBe(true);
});
it('keeps the erased strip on walkable ground and walking leaves authoritative state unchanged', () => {
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: ['h', 'j', 'k', 'l'], flags: {} };
  // Isolate terrain traversal: Mira normally occupies and blocks column 8.
  const initial = { ...sim.init(stage, legend, options), entities: [] };
  for (const strip of ERASED_ROWS) {
    expect(strip.stage).toBe(stage.id);
    let walked: WorldState = { ...initial, engine: { ...initial.engine, cursor: { line: strip.line, col: strip.from } } };
    let reference = structuredClone(walked);
    for (let col = strip.from; col <= strip.to; col++) {
      const tile = tileAtCoordinates(stage.map, strip.line, col, legend);
      expect(tile?.kind).toBe('ground'); expect(tile?.walkable).toBe(true);
      expect(erasedColumn(stage.id, strip.line, col)).toBe(col - strip.from);
      erasedArt(col - strip.from); // Drawing may not mutate the sim or buffer.
      if (col < strip.to) {
        walked = sim.step(walked, 'l', stage, legend, options).state;
        reference = sim.step(reference, 'l', stage, legend, options).state;
      }
    }
    expect(walked.engine.cursor).toEqual({ line: strip.line, col: strip.to });
    expect(walked).toEqual(reference); expect(walked.engine.lines).toEqual(stage.map);
  }
  expect(erasedColumn('other', 8, 1)).toBeUndefined();
});
it('keeps wear and sheltered decoration deterministic and clipped to ground', () => {
  expect(wornCells(stage.map, legend, findBuildings(stage.map, legend))).toEqual(wornCells(stage.map, legend, findBuildings(stage.map, legend)));
  for (let line = 0; line < stage.map.length; line++) for (let col = 0; col < (stage.map[line]?.length ?? 0); col++) {
    if (villageDecoration(stage.map, legend, line, col)) {
      const tile = tileAtCoordinates(stage.map, line, col, legend);
      expect(tile?.walkable).toBe(true); expect(tile?.kind).toBe('ground');
    }
  }
});
it.each(['forest', 'books'] as const)('%s has no matching adjacent 4x4 blocks', kind => {
  const block = (line: number, col: number): string => JSON.stringify(Array.from({ length: 16 }, (_, index) => {
    const y = line * 4 + Math.floor(index / 4); const x = col * 4 + index % 4;
    return surroundingArt(kind, kind === 'forest' ? 'margin' : 'library', surroundingVariant(kind, y, x));
  }));
  for (let line = -8; line < 8; line++) for (let col = -8; col < 8; col++) {
    expect(block(line, col)).not.toBe(block(line + 1, col));
    expect(block(line, col)).not.toBe(block(line, col + 1));
  }
  expect([0, 1, 2].map(distance => forestDistance(stage.map, -distance - 1, 0))).toEqual([0, 1, 2]);
});

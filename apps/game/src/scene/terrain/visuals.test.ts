import { describe, expect, it } from 'vitest';
import type { Legend, Stage, TileDef, WorldId } from '@escape/world';
import { replacesGround, substrate, surface, SURFACES } from './surfaces.js';
import { chasmArt } from './chasm.js';
import { changedTerrainRows } from './edges.js';
import { groundArt } from './art.js';
import { WORLD_PALETTES } from '../palette.js';
import { SPRITES } from '../sprites/index.js';
import { DARK_STAGES, darknessAlpha, darknessSample, stageLights } from '../darkness.js';
import { glowStrength, mapContains, overhangVisible, surroundingArt, surroundingCells, surroundingFor, TALL_SPRITES } from './atmosphere.js';
import { particleInside } from './life.js';

const legends = import.meta.glob<Legend>('../../../../../packages/world/content/**/*.legend.json', { eager: true, import: 'default' });
const stages = import.meta.glob<Stage>(['../../../../../packages/world/content/**/*.json', '!../../../../../packages/world/content/**/*.legend.json'], { eager: true, import: 'default' });
const tile = (sprite: string): TileDef => ({ sprite, char: ' ', kind: 'ground', walkable: true, fixed: false, label: sprite });

describe('P-18 ground regressions', () => {
  it('classifies every shipped ground explicitly, preserving all built and specialised floors', () => {
    const ground = Object.values(legends).flatMap(legend => [...legend.tiles, ...(legend.emptyRow ? [legend.emptyRow] : [])]).filter(tile => tile.kind === 'ground');
    expect(ground).toHaveLength(14);
    for (const tile of ground) {
      expect(surface(tile.sprite), tile.sprite).toBeDefined();
      expect(replacesGround(tile), tile.sprite).toBe(['grass', 'dirt'].includes(tile.sprite));
    }
    for (const sprite of Object.keys(SURFACES)) if (!['grass', 'dirt'].includes(sprite)) expect(replacesGround(tile(sprite)), sprite).toBe(false);
    expect(replacesGround(tile('unknown-ground'))).toBe(false);
  });
  it('keeps the Lighthouse floor and the Shaft stone distinct from the Lowlands meadow', () => {
    const lighthouse = Object.values(legends).find(legend => legend.id === 'lighthouse');
    expect(lighthouse).toBeDefined();
    expect(lighthouse?.tiles.find(tile => tile.char === ' ')?.sprite).toBe('stone-floor');
    expect(replacesGround(lighthouse?.tiles.find(tile => tile.char === ' '))).toBe(false);
    expect(surface('stone-floor')).toBe('preserve');
  });
  it('makes pale chalk meadow with upright dry tufts, and the Last Page plain paper', () => {
    const color = WORLD_PALETTES.lowlands.ground;
    expect(color >>> 16 & 255).toBeGreaterThan(color & 255);
    expect(color >>> 8 & 255).toBeGreaterThan(color & 255);
    expect(color >>> 16 & 255).toBeGreaterThan(180);
    const plain = groundArt('lowlands', 0); const decorated = groundArt('lowlands', 0, true);
    expect(decorated.slice(plain.length).every(pixel => pixel.width === 1)).toBe(true);
    for (let variant = 0; variant < 4; variant++) expect(groundArt('last-page', variant, true)).toEqual([
      { x: 0, y: 0, width: 16, height: 16, color: 0xf6efd4, alpha: 1 },
    ]);
  });
  it('gives stepping stones the four-neighbour majority, including bare paper and built floors', () => {
    const legend: Legend = { id: 'test', tiles: [tile('grass'), { ...tile('blank'), char: '\t', walkable: false },
      { ...tile('stone'), char: 'o', kind: 'object' }, { ...tile('stone-floor'), char: '.' }], fallback: tile('grass') };
    expect(substrate(['\t\t\t', '\to\t', '   '], { line: 1, col: 1 }, legend)).toBe('paper');
    expect(substrate(['   ', ' o ', '\t\t\t'], { line: 1, col: 1 }, legend)).toBe('grass');
    expect(substrate(['...', '.o.', '...'], { line: 1, col: 1 }, legend)).toBe('stone-floor');
  });
  it('draws the chasm as continuous depth bands with no stars and the ledge as warm stone', () => {
    const chasm = SPRITES.chasm;
    expect(chasm?.frames[0]).toEqual(chasm?.frames[1]);
    for (const row of chasm?.frames[0] ?? []) expect(new Set(row).size).toBe(1);
    const colors = (chasm?.frames[0] ?? []).map(row => Number.parseInt(chasm?.palette[row[0] ?? '']?.slice(1) ?? '', 16));
    expect(colors[0]).toBeGreaterThan(colors[15] ?? 0);
    expect(chasmArt([1, 5, 5, 5])[0]?.color).toBeGreaterThan(chasmArt([5, 5, 5, 5])[0]?.color ?? 0);
    expect([...changedTerrainRows(['a', 'a', 'a', 'a', 'a', 'a'], ['a', 'a', 'x', 'a', 'a', 'a'], 4)]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(SPRITES.ledge?.palette.s).toBe('#a79c83');
  });
  it('halves moss grain contrast without changing its base pigment', () => {
    const moss = SPRITES.moss;
    expect(moss?.palette.M).toBe('#526749');
    expect(moss?.frames[0]?.join('')).not.toMatch(/[ag]/);
    const channels = (hex: string): number[] => [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16));
    const base = channels('#526749'); const old = channels('#a9b56d'); const quiet = channels(moss?.palette.m ?? '');
    for (let channel = 0; channel < 3; channel++) expect(Math.abs((quiet[channel] ?? 0) - (base[channel] ?? 0)))
      .toBeLessThanOrEqual(Math.ceil(Math.abs((old[channel] ?? 0) - (base[channel] ?? 0)) / 2));
  });
  it('clips the entire particle footprint to the visible ragged map', () => {
    expect(particleInside(['     ', '  ', '     '], 40, 24)).toBe(false);
    expect(particleInside(['     ', '  ', '     '], 24, 24)).toBe(true);
    expect(particleInside(['     ', '  ', '     '], 40, 35)).toBe(false);
    expect(particleInside(['     '], -1, 8)).toBe(false);
    expect(particleInside(['     '], 8, 8)).toBe(true);
  });
});

it('covers exactly the exterior cells of a 1920x1080 view, including ragged holes, with no walkable sprites', () => {
  const view = { left: -320, right: 320, top: -180, bottom: 180 };
  const rows = ['abc', '', 'abcde'];
  const cells = surroundingCells(rows, view, true);
  const exterior = new Set(cells.map(at => `${at.line}:${at.col}`));
  expect(exterior.size).toBe(cells.length);
  for (let line = Math.floor(view.top / 16); line < Math.ceil(view.bottom / 16); line++) {
    for (let col = Math.floor(view.left / 16); col < Math.ceil(view.right / 16); col++) {
      expect(exterior.has(`${line}:${col}`)).toBe(!mapContains(rows, line, col, true));
    }
  }
  for (const world of Object.keys(WORLD_PALETTES) as WorldId[]) {
    const kind = surroundingFor(world, world);
    expect(SPRITES[kind]).toBeUndefined();
    expect(surroundingArt(kind, world, 0)[0]).toMatchObject({ width: 16, height: 16, alpha: 1 });
  }
  expect(surroundingFor('lowlands', 'lighthouse')).toBe('sea');
  expect(surroundingFor('copper-port', 'jetty')).toBe('sea');
  expect(surroundingFor('copper-port', 'warehouse')).toBe('brick');
  expect(surroundingFor('quarry', 'shaft')).toBe('strata');
  expect(surroundingFor('library', 'archive')).toBe('books');
});

it('keeps precisely the original hidden cells in every dark stage and every lit crystal configuration', () => {
  const darkStages = Object.values(stages).filter(stage => DARK_STAGES[stage.id] !== undefined);
  expect(darkStages.length).toBe(Object.keys(DARK_STAGES).length);
  for (const stage of darkStages) {
    const lights = stageLights(stage).map(light => light.at);
    for (const lit of [[], lights]) for (const player of [stage.start, ...lights]) {
      const darkness = { radius: DARK_STAGES[stage.id] ?? 0, lights: lit };
      for (let line = 0; line < stage.map.length; line++) for (let col = 0; col < (stage.map[line]?.length ?? 0); col++) {
        const at = { line, col }; const hidden = darknessAlpha(at, player, darkness) === 0;
        for (const x of [-0.49, 0, 0.49]) for (const y of [-0.49, 0, 0.49]) {
          const sample = darknessSample(at, x, y, player, darkness);
          expect(sample === 0, `${stage.id}: ${line},${col}`).toBe(hidden);
        }
      }
    }
  }
  const darkness = { radius: 3, lights: [] };
  const sample = (x: number): number => darknessSample({ line: 0, col: 2 }, x, 0, { line: 0, col: 0 }, darkness);
  expect(sample(-0.4)).toBeGreaterThan(sample(0)); expect(sample(0)).toBeGreaterThan(sample(0.4));
});

it('pulses the glow by 4% at 0.5 Hz, with a steady reduced-motion version', () => {
  expect(glowStrength(0, false)).toBe(1);
  expect(glowStrength(500, false)).toBeCloseTo(1.04);
  expect(glowStrength(1500, false)).toBeCloseTo(0.96);
  expect(glowStrength(2000, false)).toBeCloseTo(1);
  for (const elapsed of [0, 500, 1500]) expect(glowStrength(elapsed, true)).toBe(1);
});

it('hides every upper eight-pixel overhang in source view and only crowns the top of a block', () => {
  for (const sprite of TALL_SPRITES) {
    expect(overhangVisible(sprite, undefined, false)).toBe(true);
    expect(overhangVisible(sprite, undefined, true)).toBe(false);
    expect(overhangVisible(sprite, sprite, false)).toBe(sprite === 'tree');
  }
  expect(overhangVisible('grass', undefined, false)).toBe(false);
});

import { overhangArt, paletteColor } from '../sprites/tall.js';
import { mapExtent } from './atmosphere.js';
import { terrainArt } from './art.js';
import { edgesFor } from './edges.js';

it('draws original shaped caps that join their 16px bodies, with a six-pixel tree peak', () => {
  for (const sprite of TALL_SPRITES) {
    const top = overhangArt(sprite);
    expect(top.length, sprite).toBeGreaterThan(0);
    const art = SPRITES[sprite];
    expect(art, sprite).toBeDefined();
    const join = top.filter(pixel => pixel.y === 7);
    expect(join.length, sprite).toBeGreaterThan(0);
    for (const pixel of join) {
      const pigment = art?.palette[art.frames[0]?.[0]?.[pixel.x] ?? '.'];
      expect(paletteColor(pigment), `${sprite} at ${pixel.x}`).toBeDefined();
    }
    expect(top.every(pixel => pixel.x >= 0 && pixel.x < 16 && pixel.y >= 0 && pixel.y < 8)).toBe(true);
  }
  const tree = overhangArt('tree');
  expect(tree.filter(pixel => pixel.y === 0)).toHaveLength(6);
  expect(tree.filter(pixel => pixel.y === 7)).toHaveLength(12);
  expect(tree.some(pixel => pixel.x === 0 || pixel.x === 15)).toBe(false);
  expect(paletteColor('#abc')).toBe(0xaabbcc);
  expect(paletteColor('#123456')).toBe(0x123456);
  expect(paletteColor('transparent')).toBeUndefined();
  expect(paletteColor('#broken')).toBeUndefined();
});

it('unions authored and live ragged lengths without shrinking deleted rows', () => {
  const extent = mapExtent(['abcde', 'ab', 'abcd'], ['a', 'abcdef']);
  expect(extent.map(row => row.length)).toEqual([5, 6, 4]);
  expect(surroundingCells(extent, { left: 0, right: 96, top: 0, bottom: 48 }))
    .toEqual([{ line: 0, col: 5 }, { line: 2, col: 4 }, { line: 2, col: 5 }]);
});

it('reserves sea for the Lighthouse, Jetty and harbour; field exteriors use meadow', () => {
  expect(surroundingFor('lowlands', 'wiped')).toBe('meadow');
  expect(surroundingFor('lowlands', 'lighthouse')).toBe('sea');
  expect(surroundingFor('copper-port', 'jetty')).toBe('sea');
  expect(surroundingFor('copper-port', 'port')).toBe('sea');
  expect(surroundingFor('copper-port', 'customs')).toBe('brick');
  expect(surroundingArt('meadow', 'lowlands', 0)[0]?.color).toBe(WORLD_PALETTES.lowlands.ground);
});

it('applies rock lips only to chasm and excludes every open cell from particle footprints', () => {
  const sprites = ['blank', 'page-blank', 'page-void', 'air', 'chasm', 'clause-gap'];
  for (const sprite of sprites) {
    const open = { ...tile(sprite), char: '~', kind: 'barrier' as const };
    const legend: Legend = { id: 'open-test', tiles: [tile('grass'), open], fallback: tile('grass') };
    const rows = ['   ', ' ~ ', '   '];
    expect(particleInside(rows, 24, 24, legend), sprite).toBe(false);
    expect(particleInside(rows, 8, 8, legend), sprite).toBe(true);
    const edges = edgesFor(rows, { line: 1, col: 1 }, legend);
    expect(terrainArt(edges, 'quarry', 0, false, 0, sprite === 'chasm').length > 0, sprite).toBe(sprite === 'chasm');
  }
  expect(SPRITES['page-paper']?.palette.p).toBe('#f6efd4');
});

import { falloffPattern } from '../darkness.js';
import { meadowFades } from './atmosphere.js';
it('keeps the fixed falloff atlas visibility identical to every dark-stage hidden set', () => {
  const pattern = { level: 0, horizontal: 1, vertical: 1 };
  for (const stage of Object.values(stages)) {
    const radius = DARK_STAGES[stage.id];
    if (radius === undefined) continue;
    const lights = stageLights(stage).map(light => light.at);
    for (const lit of [[], lights]) for (const player of [stage.start, ...lights]) {
      const sight = { radius, lights: lit };
      for (let line = 0; line < stage.map.length; line++) for (let col = 0; col < (stage.map[line]?.length ?? 0); col++) {
        falloffPattern(line, col, player, sight, pattern);
        expect(pattern.level === 0).toBe(darknessAlpha({ line, col }, player, sight) === 0);
      }
    }
  }
});
it('fades the Lowlands wiped strip into the same paper beyond its tree border', () => {
  expect(meadowFades(['TTTTTTTTTTT', '  \t\t\t\t\t\t\t  ', 'TTTTTTTTTTT']))
    .toEqual([0, 0, 1, 2, 3, 4, 3, 2, 1, 0, 0]);
  expect(surroundingArt('meadow', 'lowlands', 0, 0, 4)[0]?.color).toBe(WORLD_PALETTES.lowlands.paper);
});

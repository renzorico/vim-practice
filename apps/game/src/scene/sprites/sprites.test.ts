import { lowlands, lowlandsLegend } from '../../play2/content.js';
import { describe, expect, it } from 'vitest';
import { SPRITES } from './index.js';
describe('pixel art', () => {
  for (const [name, sprite] of Object.entries(SPRITES)) it(`${name} has complete 16 by 16 palette grids`, () => {
    for (const frame of sprite.frames) {
      expect(frame).toHaveLength(16);
      for (const row of frame) {
        expect(row).toHaveLength(16);
        for (const pixel of row) expect(sprite.palette[pixel]).toBeDefined();
      }
    }
  });
});

it('every Lowlands legend sprite has art, including its visible magenta checker fallback', () => {
  for (const tile of [...lowlandsLegend.tiles, lowlandsLegend.fallback]) {
    expect(SPRITES[tile.sprite], tile.sprite).toBeDefined();
  }
  expect(lowlandsLegend.tiles.some(tile => ['door', 'thorns'].includes(tile.sprite))).toBe(false);
  expect(lowlands.map.join('')).not.toMatch(/[D^]/);
  const fallback = SPRITES['unknown'];
  expect(fallback).toBeDefined();
  expect(Object.values(fallback?.palette ?? {})).toContain('#ff00ff');
  expect(fallback?.frames[0]?.[0]?.[0]).not.toBe(fallback?.frames[0]?.[0]?.[1]);
  expect(fallback?.frames[0]?.[0]?.[0]).toBe(fallback?.frames[0]?.[1]?.[1]);
});

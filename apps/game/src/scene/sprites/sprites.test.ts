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

it('every Canopy tile and actor has art, with opaque distant air and two branch variants', async () => {
  const { canopy, canopyLegend } = await import('../../play2/content.js');
  for (const sprite of [...canopyLegend.tiles.map(tile => tile.sprite), ...canopy.entities.map(entity => entity.sprite)]) {
    expect(SPRITES[sprite], sprite).toBeDefined();
  }
  expect(SPRITES['branch']?.frames).toHaveLength(2);
  expect(SPRITES['branch']?.frames[0]).not.toEqual(SPRITES['branch']?.frames[1]);
  expect(SPRITES['air']?.frames[0]?.join('')).not.toContain('.');
  expect(SPRITES['air']?.frames[0]).not.toEqual(SPRITES['branch']?.frames[0]);
});

it('draws Library materials and Quire, with three distinct book spine colours', async () => {
  const { stacksLegend } = await import('../../play2/content.js');
  for (const tile of [...stacksLegend.tiles, stacksLegend.fallback]) {
    expect(SPRITES[tile.sprite === 'dust' ? 'library-dust' : tile.sprite], tile.sprite).toBeDefined();
  }
  expect(SPRITES['quire']).toBeDefined();
  expect(new Set(SPRITES['book']?.frames.map(frame => frame.join(''))).size).toBe(3);
  expect(SPRITES['shelf-gap']?.frames[0]?.join('')).not.toContain('.');
  expect(SPRITES['shelf-gap']?.frames).not.toEqual(SPRITES['blank']?.frames);
});

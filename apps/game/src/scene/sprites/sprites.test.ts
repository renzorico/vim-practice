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

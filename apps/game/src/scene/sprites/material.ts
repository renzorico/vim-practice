import type { PixelSprite } from './sprite.js';

/** Deterministic pixel noise, 0 to 99. */
export function grain(x: number, y: number, seed = 0): number {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 2147483647);
  hash = Math.imul(hash ^ hash >>> 13, 1274126177);
  return ((hash ^ hash >>> 16) >>> 0) % 100;
}
export function grid(pixel: (x: number, y: number) => string): string[] {
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
}
/** Hand-set rectangles of one stone course: [left, top, width, height], wrapping inside the tile. */
type Stone = readonly [number, number, number, number];
/**
 * Rough masonry: each stone is lit along its top and left, shaded along its bottom and right, with
 * quiet seams. L light, M body, D shade, K seam.
 */
export function masonry(stones: readonly Stone[], x: number, y: number, seed = 0): string {
  for (let index = 0; index < stones.length; index++) {
    const [left, top, width, height] = stones[index] ?? [0, 0, 0, 0];
    const dx = (x - left + 16) % 16; const dy = (y - top + 16) % 16;
    if (dx >= width || dy >= height) continue;
    if (dx === width - 1 || dy === height - 1) return 'K';
    const corner = (dx === 0 || dx === width - 2) && (dy === 0 || dy === height - 2);
    if (corner) return 'K';
    if (dy === 0 || dx === 0) return 'L';
    if (dy === height - 2 || dx === width - 2) return 'D';
    return grain(x, y, seed + index) < 10 ? 'D' : 'M';
  }
  return 'K';
}
export const sprite = (palette: Readonly<Record<string, string>>, ...frames: string[][]): PixelSprite =>
  ({ palette: { '.': 'transparent', ...palette }, frames });

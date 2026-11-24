import type { PixelSprite } from '../sprites/sprite.js';
import type { PixelRect } from './art.js';

/** A one-pixel readable silhouette around original art; never changes its pixels or character design. */
export function outlineArt(art: PixelSprite | undefined, color: number): readonly PixelRect[] {
  const frame = art?.frames[0];
  if (!art || !frame) return [];
  const opaque = (x: number, y: number): boolean => {
    const pixel = frame[y]?.[x];
    const pigment = pixel === undefined ? undefined : art.palette[pixel];
    return pigment !== undefined && pigment !== 'transparent';
  };
  const pixels: PixelRect[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (opaque(x, y)) continue;
    if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
      pixels.push({ x, y, width: 1, height: 1, color, alpha: 1 });
    }
  }
  return pixels;
}

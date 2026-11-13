import { PALETTE, type PixelSprite } from './sprite.js';

const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
export const LEDGE: PixelSprite = { palette: PALETTE, frames: [surface((x, y) =>
  y < 2 ? 'w' : y > 12 ? 'T' : (x + y * 3) % 17 === 0 ? 'k' : 'b')] };
export const CHASM: PixelSprite = { palette: PALETTE, frames: [0, 1].map(frame => surface((x, y) =>
  (x * 7 + y * 11 + frame * 19) % 113 === 0 ? 'b' : y > 13 ? 'd' : 'k')) };
const dot = surface((x, y) => {
  if ((x - 8) ** 2 + (y - 9) ** 2 > 12) return '.';
  return y === 8 && (x === 7 || x === 9) || x === 6 && y === 7 ? 'w' : 'k';
});
export const DOT: PixelSprite = { palette: PALETTE, frames: [dot] };
export const DOT_CAGE: PixelSprite = { palette: PALETTE, frames: [surface((x, y) => {
  if (x < 3 || x > 13 || y < 3 || y > 14) return '.';
  if (y === 3 || y === 14 || x === 3 || x === 13) return 'b';
  if (x === 5 || x === 11) return 'T';
  return dot[y]?.[x] ?? '.';
})] };

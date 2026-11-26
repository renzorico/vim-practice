import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
export const LEDGE: PixelSprite = { palette: { ...PALETTE, s: '#a79c83', l: '#c6b99b', f: '#756c5c' }, frames: [surface((x, y) =>
  y < 2 ? 'l' : y > 12 ? 'f' : y === 8 && x > 9 ? 'f' : 's')] };
// Continuous rock shadow, never isolated flecks that read as stars.
export const CHASM: PixelSprite = { palette: { a: '#242326', b: '#1c1b20', c: '#14131a', d: '#0d0d13' },
  frames: [0, 1].map(() => surface((_x, y) => y < 3 ? 'a' : y < 7 ? 'b' : y < 11 ? 'c' : 'd')) };
export const DOT: PixelSprite = CHARACTER_FIELDS.dot;
export const DOT_CAGE: PixelSprite = { palette: PALETTE, frames: [surface((x, y) => {
  if (x < 3 || x > 13 || y < 3 || y > 14) return '.';
  if (y === 3 || y === 14 || x === 3 || x === 13) return 'b';
  if (x === 5 || x === 11) return 'T';
  return DOT.frames[0]?.[y]?.[x] ?? '.';
})] };

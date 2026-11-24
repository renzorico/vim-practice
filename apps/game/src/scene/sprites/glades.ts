import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, M: '#526749', m: '#7d8e5b', n: '#5b7157', L: '#a9c478', B: '#233c32', o: '#9aa19b', O: '#656f71', Y: '#ffe6a2' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (...frames: string[][]): PixelSprite => ({ palette, frames });
function moss(x: number, y: number, seed = 0): string {
  return (x * 7 + y * 11 + seed * 13) % 23 < 4 ? 'm' : (x + y + seed) % 7 === 0 ? 'n' : 'M';
}
export const MOSS = art(...[0, 1].map(seed => surface((x, y) => moss(x, y, seed))));
export const FERNS = art(surface((x, y) => {
  if (y > 5 && y < 13 && (x === 7 || Math.abs(x - 7) === (y % 4) + 1)) return y % 2 ? 'G' : 'a';
  return moss(x, y);
}));
export const BRAMBLE = art(surface((x, y) => {
  if ((x + 2 * y) % 7 === 0 || (2 * x - y + 32) % 9 === 0) return 'T';
  return (x * 3 + y) % 7 < 2 ? 'G' : 'B';
}));
export const CLEARING = art(surface((x, y) => {
  const radius = (x - 8) ** 2 + (y - 9) ** 2 * 2;
  if (radius < 19) return y === 7 ? 'w' : 'o';
  if ((x === 2 && y === 3) || (x === 13 && y === 12)) return 'w';
  return (x * 7 + y * 11) % 19 < 3 ? 'a' : 'L';
}));
export const PILCROW = CHARACTER_FIELDS.pilcrow;
export const ROPE = art(surface((x, y) => {
  if ((x - 8) ** 2 + (y - 3) ** 2 < 10) return x === 8 ? 'k' : 'O';
  if (y === 10 || y === 11) return 'T';
  if (x === 7 || x === 8) return y % 3 === 0 ? 'T' : 't';
  if (y > 11 && x >= 7 && x <= 11) return y === 14 || x === 11 ? 't' : '.';
  return '.';
}));
export const STUMP = art(surface((x, y) => {
  const radius = (x - 8) ** 2 + (y - 6) ** 2 * 3;
  if (y > 7 && y < 14 && x > 2 && x < 14) return x % 4 === 0 ? 'T' : 't';
  if (radius > 48) return '.';
  return radius < 4 || (radius > 12 && radius < 22) || radius > 37 ? 'T' : 's';
}));
function lantern(lit: boolean): PixelSprite {
  return art(surface((x, y) => {
    if (x === 11 && y > 2) return 'T';
    if (y === 2 && x >= 5 && x <= 11) return 'T';
    if (x >= 4 && x <= 8 && y >= 4 && y <= 9) {
      return x === 4 || x === 8 || y === 4 || y === 9 ? 'T' : lit ? 'Y' : 'B';
    }
    return lit && (x - 6) ** 2 + (y - 7) ** 2 < 28 ? 'a' : '.';
  }));
}
export const GLADE_LAMP_LIT = lantern(true);
export const GLADE_LAMP_OUT = lantern(false);

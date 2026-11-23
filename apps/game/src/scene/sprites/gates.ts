import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';
const palette = { ...PALETTE, H: '#d9b88c', L: '#f4d7a4', B: '#a97845', V: '#101c23', D: '#283540', Y: '#ffe3a0' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
function wood(x: number, y: number): string {
  const ring = Math.floor(Math.sqrt((x - 3) ** 2 + (y - 6) ** 2 * 2));
  return ring % 5 === 0 ? 'B' : ring % 5 === 1 ? 'L' : 'H';
}
export const HEARTWOOD = art(wood);
export const HOLLOW = art((x, y) => x === 0 || x === 15 ? 'T'
  : (x === 3 || x === 12) && y % 7 < 4 ? 'D' : 'V');
function mark(open: boolean): PixelSprite {
  return art((x, y) => {
    const column = open ? x : 15 - x;
    if (y >= 3 && y <= 12 && column === (y < 5 || y > 10 ? 9 : y < 7 || y > 8 ? 7 : 6)) return 'y';
    if (y >= 3 && y <= 12 && column === 10) return 'L';
    return wood(x, y);
  });
}
export const GATE_OPEN = mark(true);
export const GATE_CLOSE = mark(false);
export const OPE = CHARACTER_FIELDS.ope;
export const SHUT = CHARACTER_FIELDS.shut;

export const GATE_GLINT = art((x, y) => {
  const radius = (x - 7.5) ** 2 + (y - 7.5) ** 2;
  return radius > 36 && radius < 57 ? 'Y' : '.';
});

import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';
const palette = { ...PALETTE, H: '#d9b88c', L: '#e4c79b', B: '#c39a68', V: '#101c23', D: '#283540', Y: '#ffe3a0' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
function wood(x: number, y: number): string {
  // Growth rings of one great trunk, seen from inside: faint, and the same across every cell.
  const ring = (y + Math.round(Math.sin(x / 16 * Math.PI * 2) * 1.5) + 16) % 8;
  return ring === 0 ? 'B' : ring === 1 ? 'L' : 'H';
}
export const HEARTWOOD = art(wood);
export const HOLLOW = art((x, y) => x === 0 || x === 15 ? 'T'
  : (x === 3 || x === 12) && y % 7 < 4 ? 'D' : 'V');
function mark(open: boolean): PixelSprite {
  return art((x, y) => {
    const column = open ? x : 15 - x;
    if (y >= 3 && y <= 12 && column === (y < 5 || y > 10 ? 9 : y < 7 || y > 8 ? 7 : 6)) return 'y';
    if (y >= 3 && y <= 12 && column === (y < 5 || y > 10 ? 10 : y < 7 || y > 8 ? 8 : 7)) return 'T';
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

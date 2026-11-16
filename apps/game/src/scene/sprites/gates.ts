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
function keeper(open: boolean): PixelSprite {
  return art((sourceX, y) => {
    const x = open ? sourceX : 15 - sourceX;
    // The two halves of the same brass wheel sit on mirrored shoulders.
    const wheel = (x - 10) ** 2 + (y - 9) ** 2;
    if (x >= 10 && wheel >= 10 && wheel <= 21) return 'y';
    if (y === 15 && (x === 6 || x === 8)) return 'T';
    if (y >= 8 && y <= 14 && x >= 5 && x <= 9) {
      if (!open && y === 10) return 's';
      return x === 5 || x === 9 ? 'C' : 'c';
    }
    if (open && x === 3 && y >= 4 && y <= 10) return y < 6 ? 's' : 'c';
    if (open && y === 10 && x === 4) return 'c';
    if (y >= 2 && y <= 7 && x >= 4 && x <= 10) {
      if (y === 2 || x === 4 || x === 10) return 'w';
      if ((x === 6 || x === 8) && (y === 4 || open && y === 5)) return open && y === 4 ? 'w' : 'k';
      if (y === 7 && x >= 6 && x <= 8) return 'T';
      return 's';
    }
    return '.';
  });
}
export const OPE = keeper(true);
export const SHUT = keeper(false);

export const GATE_GLINT = art((x, y) => {
  const radius = (x - 7.5) ** 2 + (y - 7.5) ** 2;
  return radius > 36 && radius < 57 ? 'Y' : '.';
});

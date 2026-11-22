import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, K: '#261e20', O: '#563929', L: '#8a6241',
  V: '#e1d1a6', H: '#b39a70', A: '#752f39', B: '#324e43', C: '#2d405c',
  D: '#8d8981', E: '#c2bdb0', F: '#d3ae58' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
const shelf = (x: number, y: number): string => y === 14 ? 'F' : y === 15 ? 'O' : x === 0 || x === 15 ? 'L' : 'K';
export const GALLERY = art((x, y) => y === 2 || y === 5 ? 'F'
  : y < 6 ? x % 5 === 0 ? 'O' : 'K' : y % 5 === 0 ? 'L' : 'V');
export const LIBRARY_WALL = art((x, y) => x % 8 === 0 || y === 1 || y === 14 ? 'L'
  : x % 8 === 1 || y === 2 || y === 13 ? 'K' : 'O');
export const SHELF_POST = art((x, y) => x >= 4 && x <= 11
  ? y === 1 || y === 12 ? 'F' : x === 4 || x === 11 ? 'K' : x === 6 ? 'L' : 'O' : shelf(x, y));
// The one-character gap has a dark centre flanked by the edges of neighbouring spines.
export const SHELF_GAP = art((x, y) => y > 1 && y < 14 && (x < 4 || x > 11)
  ? y === 4 || y === 11 ? 'F' : x < 4 ? 'A' : 'C' : shelf(x, y));
export const BOOK: PixelSprite = { palette, frames: ['A', 'B', 'C'].map(colour => surface((x, y) =>
  y >= 1 && y <= 13 && x >= 1 && x <= 14
    ? x === 1 || x === 14 ? 'K' : y === 3 || y === 10 ? 'F' : x === 4 ? 'H' : colour : shelf(x, y))) };
export const DUST = art((x, y) => {
  if ((x === 3 && y === 2) || (x === 12 && y === 4) || (x === 8 && y === 1)) return 'E';
  const drift = (x - 7.5) ** 2 / 1.8 + (y - 10) ** 2;
  return drift < 29 && y < 14 ? (x + y) % 4 === 0 ? 'E' : 'D' : shelf(x, y);
});
export const DUST_PUFF = art((x, y) => {
  const radius = (x - 7.5) ** 2 + (y - 7.5) ** 2;
  return radius < 42 && (x * 3 + y * 7) % 5 < 2 ? (y % 2 ? 'E' : 'D') : '.';
});
export const QUIRE: PixelSprite = { palette, frames: [[
  '................',
  '......DDD.......',
  '.....DEEDD......',
  '....DssssD......',
  '....sKKsKK......',
  '.....ssssF......',
  '.....KssKF......',
  '....AAVAAF......',
  '...AAVVAAA......',
  '...AVVAAAAA.....',
  '...sVsAAAs......',
  '....VVVVVV......',
  '....AAAAFA......',
  '....AAAFKF......',
  '....AAAAFA......',
  '....KK.KK.......',
]] };

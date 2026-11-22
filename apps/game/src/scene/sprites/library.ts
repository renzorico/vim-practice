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

const parquet = (x: number, y: number, variant = 0): string =>
  y % 8 === 7 || (x + (y < 8 ? variant * 4 : 8 - variant * 4)) % 16 === 0 ? 'K'
    : y % 4 === 0 ? 'L' : 'O';
export const READING_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant =>
  surface((x, y) => parquet(x, y, variant))) };
export const READING_WALL = art((x, y) => {
  if (y >= 3 && y <= 6 && x >= 4 && x <= 11) return y === 6 ? 'F' : 'B';
  if (x === 7 && y > 6 && y < 11) return 'F';
  return x === 1 || x === 14 || y === 13 ? 'L' : x === 2 || y === 14 ? 'K' : 'O';
});
export const READING_POST = art((x, y) => x >= 4 && x <= 11
  ? y === 2 || y === 13 ? 'F' : x === 4 || x === 11 ? 'K' : x === 6 ? 'L' : 'O' : parquet(x, y));
export const READING_DOOR = art((x, y) => x <= 2 || y <= 1 ? 'L'
  : x === 3 || y === 2 ? 'F' : x === 12 && y === 9 ? 'F' : x % 4 === 0 ? 'K' : 'O');
const shackle = (right: boolean): PixelSprite => art((x, y) => {
  const across = right ? 15 - x : x;
  if ((across === 3 || across === 4) && (y === 3 || y === 12)) return 'F';
  const ring = ((across - 8) / 5) ** 2 + ((y - 7.5) / 5.5) ** 2;
  return across <= 8 && ring >= 0.5 && ring <= 1.25 ? across % 2 ? 'E' : 'D' : parquet(x, y);
});
export const SHACKLE_LEFT = shackle(false);
export const SHACKLE_RIGHT = shackle(true);
export const CHAIN = art((x, y) => {
  const ring = ((x % 8 - 3.5) / 3.5) ** 2 + ((y - 8) / 2.5) ** 2;
  return ring >= 0.35 && ring <= 1.4 ? y < 8 ? 'E' : 'D' : parquet(x, y);
});
export const CHAIN_CLATTER = art((x, y) => (x * 3 + y * 5) % 13 < 2
  && x > 1 && x < 14 && y > 2 && y < 14 ? y % 2 ? 'E' : 'F' : '.');
export const FOLIO: PixelSprite = { palette, frames: [[
  '...LOOOOOOOL....',
  '...LOKKKKOOL....',
  '...LOKDDKOOL....',
  '...LOssssOOL....',
  '...LOsKssOOL....',
  '...LOssssOOL....',
  '...LOOBBOOOL....',
  '...LOBVBOOOL....',
  '...LOBVBOOOL....',
  '...LsBVBBsDL....',
  '...LVVVKVVVL....',
  '...LVHVKVHVL....',
  '...LOOBBBOOL....',
  '...LOOBBBOOL....',
  '...L.K..K..L....',
  '...K.K..K..K....',
]] };

// One continuous shelf per paragraph: no vertical dividers between its cells.
const archiveShelf = (pixel: (x: number, y: number) => string): PixelSprite => art((x, y) =>
  y === 15 ? 'O' : y === 14 ? 'F' : pixel(x, y));
export const ATLAS_SHELF = archiveShelf((x, y) => y < 2 ? 'K'
  : y % 5 === 2 ? 'F' : y % 5 === 3 ? 'V' : x === 1 || x === 14 ? 'L' : 'C');
export const BIBLE_SHELF = archiveShelf((x, y) => y < 2 ? 'K'
  : x % 8 === 0 ? 'O' : y === 3 || y === 12 ? 'F' : x % 8 === 2 ? 'H' : 'K');
export const MISFILED_SHELF = archiveShelf((x, y) => {
  // Red question slip amid books tilted in opposite directions.
  if (x >= 10 && x <= 13 && y >= 2 && y <= 8) {
    return (y === 3 && x < 13 || y === 4 && x === 12 || y === 5 && x === 11 || y === 7 && x === 11) ? 'V' : 'A';
  }
  return (x + Math.floor(y / 3)) % 7 === 0 ? 'F' : y < 2 ? 'K' : x < 8 ? 'B' : 'L';
});
export const ARCHIVE_AISLE = art((x, y) => y < 5 || y > 10 ? 'V'
  : y === 5 || y === 10 ? 'F' : x % 5 === 0 ? 'H' : 'A');
export const ARCHIVE_RAIL = art((_x, y) => y === 6 || y === 9 ? 'H' : y === 7 || y === 8 ? 'F' : 'O');
export const ARCHIVE_POST = art((x, y) => x >= 5 && x <= 10
  ? y === 2 || y === 13 ? 'F' : x === 5 || x === 10 ? 'H' : 'L' : y === 7 || y === 8 ? 'F' : 'O');
export const CATALOGUE = art((x, y) => x === 0 || x === 15 || y === 0 || y === 15 ? 'K'
  : x === 7 || y % 5 === 0 ? 'L' : y % 5 === 2 && x % 8 >= 2 && x % 8 <= 5 ? 'F' : 'O');
export const FILED_STAMP = art((x, y) => y > 10 && y < 14 && x > 2 && x < 14 ? 'A'
  : y === 10 && x > 1 && x < 15 ? 'K' : y >= 5 && y <= 9 && x >= 6 && x <= 9 ? 'L' : 'V');
export const INDEX: PixelSprite = { palette, frames: [[
  '................',
  '................',
  '.....BBBB.......',
  '....BBBBBB......',
  '....FFFFFF......',
  '.....ssss.......',
  '.....sKss.......',
  '.....ssss.......',
  '....BBVBBB......',
  '....BBVBBB......',
  '...sBBVBBs......',
  '..LOOOOOOOOL....',
  '..LOFLOFLOFL....',
  '..LOOLOOLOOL....',
  '..LOFLOFLOFL....',
  '..KKKKKKKKKK....',
]] };

import { PALETTE, type PixelSprite } from './sprite.js';
const palette = { ...PALETTE, K: '#18292b', B: '#493b30', b: '#63503e', C: '#ad704b',
  c: '#d39b69', W: '#d6c6a0', V: '#28634b', I: '#749393', S: '#a3bfac' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
export const COUNTER_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) =>
  y % 4 === 0 || (x + Math.floor(y / 4) * 5 + variant * 3) % 16 === 0 ? 'K' : (x + y) % 7 === 0 ? 'b' : 'B')) };
export const COUNTER_WALL = art((x, y) => x % 8 === 0 || y === 14 ? 'C'
  : x >= 5 && x <= 10 && y >= 4 && y <= 8 ? (y === 4 || y === 8 ? 'C' : 'c') : 'B');
export const CLERK_DESK = art((x, y) => y < 3 || y > 12 ? 'B' : y === 3 || y === 12 ? 'c'
  : x >= 3 && x <= 12 && y < 10 ? (x === 8 || y % 3 === 0 ? 'K' : 'W') : 'C');
/** A pallet on the floor: the post behind it stays visible. */
export const CRATE_ROW = art((x, y) => y < 10 ? '.' : y === 10 ? 'c' : y === 15 || x % 5 === 0 ? 'K' : y < 13 ? 'C' : 'B');
export const FAKE: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => {
  if (x < 2 || x > 13 || y < 2 || y > 13) return variant && (x + y) % 11 === 0 ? 'S' : '.';
  if (x === 2 || x === 13 || y === 2 || y === 13) return 'B';
  if ((y === 6 && x >= 5 && x <= 10) || (y === 8 && x >= 6 && x <= 11) || (x === 6 && y >= 5 && y <= 10)) return 'K';
  return (x + y) % 7 === 0 ? 'I' : 'C';
})) };
export const COUNTERFEITER: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => {
  if (y >= 12) return y === 12 ? 'c' : x >= 4 && x <= 11 ? (x === 8 ? 'K' : 'W') : 'C';
  if (y >= 2 && y <= 4 && x >= 4 && x <= 12) return 'V';
  if (y >= 5 && y <= 7 && x >= 6 && x <= 10) return y === 5 && x === 9 ? 'K' : 'W';
  if (y >= 8 && x >= 5 && x <= 11) return x === 5 || x === 11 ? 'K' : 'B';
  if ((x === 3 || x === 13) && y >= 7 + variant && y <= 11) return y === 11 ? 'K' : 'W';
  return '.';
})) };

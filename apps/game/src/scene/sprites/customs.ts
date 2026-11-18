import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, K: '#18292b', C: '#ad704b', c: '#d39b69', W: '#d6c6a0',
  B: '#58483b', I: '#749393', V: '#28636a' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
const floor = (x: number, y: number, variant = 0): string =>
  y % 8 === 0 || (x + (y < 8 ? 0 : 4)) % 8 === 0 ? 'I' : (x * 3 + y + variant * 5) % 29 === 0 ? 'c' : 'W';
export const CUSTOMS_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => floor(x, y, variant))) };
export const CUSTOMS_WALL = art((x, y) => y === 3 || y === 4 ? 'C'
  : y % 5 === 0 || (x + Math.floor(y / 5) % 2 * 4) % 8 === 0 ? 'I' : 'W');
export const CUSTOMS_POST = art((x, y) => x >= 6 && x <= 9 ? (Math.floor(y / 3) % 2 ? 'C' : 'W') : floor(x, y));
export const CRATE_END = art((x, y) => x >= 2 && x <= 4 ? (x === 2 ? 'c' : 'B') : floor(x, y));
export const CRATE_LIP = art((x, y) => y >= 2 && y <= 13 ? (y === 2 ? 'c' : x % 5 === 0 || y === 13 ? 'K' : 'C') : floor(x, y));
export const CRATE_MARK = art((x, y) => {
  const letters = ['WWW..W..WW.', 'W.W.WWW.W.W', 'W.W..W..WW.', 'WWW.....W.W'];
  return letters[y - 6]?.[x - 5] === 'W' ? 'W' : '.';
});
export const TARE = art((x, y) => {
  if (y >= 13) return y === 13 ? 'c' : 'C'; // Booth counter.
  if (y >= 1 && y <= 4 && x >= 3 && x <= 12) return y === 2 && x === 8 ? 'c' : y === 4 ? 'K' : 'V';
  if (y >= 5 && y <= 8 && x >= 5 && x <= 10) return y === 6 && (x === 6 || x === 9) ? 'K' : 'W';
  if (y >= 9 && y <= 12 && x >= 3 && x <= 12) return x === 8 ? 'c' : 'V';
  if (x >= 13 && y >= 9 && y <= 12) return y === 12 ? 'K' : 'B'; // Rubber stamp.
  return '.';
});

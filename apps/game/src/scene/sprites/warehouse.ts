import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, K: '#18292b', V: '#28636a', C: '#ad704b', c: '#d39b69',
  B: '#58483b', W: '#8e7b60', N: '#d6c6a0', I: '#749393' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
const floor = (x: number, y: number, variant = 0): string =>
  y % 5 === 0 ? 'B' : (x + y * 3 + variant * 7) % 17 === 0 ? 'N' : 'W';
export const WAREHOUSE_FLOOR: PixelSprite = { palette,
  frames: [0, 1].map(variant => surface((x, y) => floor(x, y, variant))) };
export const WAREHOUSE_WALL = art((x, y) => y < 4 ? (x % 5 === 0 ? 'V' : 'C')
  : y % 4 === 0 || (x + Math.floor(y / 4) % 2 * 4) % 8 === 0 ? 'K' : 'B');
export const SHELF_END = art((x, y) => y >= 11 ? (y === 11 ? 'c' : 'W')
  : x >= 2 && x <= 5 ? (x === 2 ? 'K' : 'C') : floor(x, y));
export const SHELF_LIP = art((x, y) => y >= 3 && y <= 12
  ? (y === 3 || y === 12 ? 'K' : y === 4 ? 'c' : 'C') : floor(x, y));
export const OIL = art((x, y) => {
  if (y <= 3 && x >= 6 && x <= 9) return y === 0 ? 'B' : 'N';
  if (y >= 4 && y <= 13 && x >= (y < 6 ? 5 : 3) && x <= (y < 6 ? 10 : 12)) {
    return y === 8 || y === 9 ? 'c' : x === 3 || x === 12 || y === 13 ? 'B' : x < 7 ? 'C' : 'W';
  }
  return floor(x, y);
});
export const CARGO_ROPE = art((x, y) => {
  const radius = ((x - 7.5) / 1.1) ** 2 + (y - 8) ** 2;
  return radius < 40 ? (Math.floor(Math.sqrt(radius)) % 3 === 0 ? 'B' : 'N') : floor(x, y);
});
const stencil = (rope: boolean): PixelSprite => art((x, y) => {
  if (y < 4 || y > 9 || x < 7 || x > 12) return '.';
  const radius = (x - 9.5) ** 2 + (y - 6.5) ** 2;
  return rope ? radius > 2 && radius < 10 ? 'N' : '.' : y < 6 ? x >= 9 && x <= 10 ? 'N' : '.' : 'N';
});
export const OIL_STENCIL = stencil(false);
export const ROPE_STENCIL = stencil(true);
export const COUNTER_END = art((x, y) => y < 6 ? (y === 0 ? 'c' : 'C') : x < 3 || x > 12 ? 'B' : 'K');

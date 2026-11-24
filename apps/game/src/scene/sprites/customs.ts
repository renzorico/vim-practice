import { CHARACTER_FIELDS } from './characters.js';
import { grain } from './material.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, K: '#18292b', C: '#ad704b', c: '#d39b69', W: '#d6c6a0',
  B: '#58483b', I: '#749393', V: '#28636a', F: '#c4b38c', E: '#4f6468', N: '#647a7c', e: '#465a5f', n: '#34464b' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
/** Pale flagstones underfoot, dark brick around them: one glance says where you can walk. */
const floor = (x: number, y: number, variant = 0): string =>
  y % 8 === 7 || (x + (y < 8 ? 0 : 4)) % 8 === 7 ? 'F' : grain(x, y, variant) < 4 ? 'F' : 'W';
export const CUSTOMS_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => floor(x, y, variant))) };
export const CUSTOMS_WALL: PixelSprite = { palette, frames: [surface((x, y) => {
  if (y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7) return 'n';
  return y % 4 === 0 ? 'N' : grain(x >> 2, y >> 2, 6) < 22 ? 'e' : 'E';
})] };
export const CUSTOMS_POST = art((x, y) => x >= 6 && x <= 9 ? (Math.floor(y / 3) % 2 ? 'C' : 'W') : floor(x, y));
export const CRATE_END = art((x, y) => x >= 2 && x <= 4 ? (x === 2 ? 'c' : 'B') : floor(x, y));
export const CRATE_LIP = art((x, y) => y >= 2 && y <= 13 ? (y === 2 ? 'c' : x % 5 === 0 || y === 13 ? 'K' : 'C') : floor(x, y));
export const CRATE_MARK = art((x, y) => {
  const letters = ['WWW..W..WW.', 'W.W.WWW.W.W', 'W.W..W..WW.', 'WWW.....W.W'];
  return letters[y - 6]?.[x - 5] === 'W' ? 'W' : '.';
});
export const TARE = CHARACTER_FIELDS.tare;

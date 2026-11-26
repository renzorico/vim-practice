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
// The other upright of the same rack: `[` and `]` read as one shelf with goods between.
export const SHELF_LIP = art((x, y) => y >= 11 ? (y === 11 ? 'c' : 'W')
  : x >= 10 && x <= 13 ? (x === 13 ? 'K' : 'C') : floor(x, y));
// A stoppered copper jar with a label band; its dark outline keeps it off the planks.
const JAR = [
  '................', '......KKKK......', '......KNNK......', '.....KKKKKK.....',
  '.....KcCCBK.....', '....KcCCCCBK....', '...KcNCCCCCBK...', '...KcNCCCCCBK...',
  '...KNNNNNNNNK...', '...KNNBBBBNNK...', '...KNNNNNNNNK...', '...KcCCCCCCBK...',
  '....KcCCCCBK....', '....KCCCCBBK....', '.....KKKKKK.....', '................',
];
const jar = (x: number, y: number): string => JAR[y]?.[x] ?? '.';
const coil = (x: number, y: number): string => {
  const radius = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
  if (radius >= 7.4) return '.';
  return radius >= 6.4 || radius < 1.5 ? 'K' : radius >= 4.1 && radius < 5 || radius >= 2 && radius < 2.9 ? 'B' : 'N';
};
const onFloor = (pixel: (x: number, y: number) => string): PixelSprite => art((x, y) => {
  const own = pixel(x, y);
  return own === '.' ? floor(x, y) : own;
});
export const OIL = onFloor(jar);
export const CARGO_ROPE = onFloor(coil);
export const OIL_ICON = art(jar);
export const ROPE_ICON = art(coil);
const stencil = (rope: boolean): PixelSprite => art((x, y) => {
  if (y < 4 || y > 9 || x < 7 || x > 12) return '.';
  const radius = (x - 9.5) ** 2 + (y - 6.5) ** 2;
  return rope ? radius > 2 && radius < 10 ? 'N' : '.' : y < 6 ? x >= 9 && x <= 10 ? 'N' : '.' : 'N';
});
export const OIL_STENCIL = stencil(false);
export const ROPE_STENCIL = stencil(true);
export const COUNTER_END = art((x, y) => y < 6 ? (y === 0 ? 'c' : 'C') : x < 3 || x > 12 ? 'B' : 'K');

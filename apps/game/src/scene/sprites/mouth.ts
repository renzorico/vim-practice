import type { PixelSprite } from './sprite.js';
const palette = { '.': 'transparent', k: '#0b0a12', d: '#171522', s: '#292637',
  m: '#3e3a50', v: '#695182', V: '#ac79e5', w: '#e7ceff', a: '#dba55d' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
export const CAVE_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) =>
  (x + y * 3 + variant * 5) % 23 === 0 ? 'm' : y === 11 && x > 3 && x < 10 ? 's' : 'd')) };
export const CAVE_ROCK = art((x, y) => y === 0 || x === 0 || (x + 2 * y) % 17 === 0 ? 'k' : y < 4 ? 's' : 'd');
export const CRYSTAL_LEDGE = art((x, y) => y < 5 || y > 11 ? 'k' : y === 5 ? 'm' : y === 11 ? 'd' : 's');
function crystal(lit: boolean): PixelSprite {
  return art((x, y) => {
    const middle = y >= 2 && y <= 13 && Math.abs(x - 8) <= Math.min(3, (y - 2) / 2);
    const side = y >= 7 && y <= 13 && (Math.abs(x - 4) <= (y - 7) / 3 || Math.abs(x - 12) <= (y - 7) / 3);
    if (middle || side) return x % 4 === 0 ? lit ? 'w' : 'v' : lit ? 'V' : 's';
    return lit && y === 14 && x > 3 && x < 13 ? 'a' : 'd';
  });
}
export const CRYSTAL_DARK = crystal(false);
export const CRYSTAL_LIT = crystal(true);
export const ECHO = art((x, y) => {
  if (y >= 2 && y <= 8 && (x - 8) ** 2 + (y - 5) ** 2 < 15) {
    if (y >= 6 && x >= 7 && x <= 8) return 'k';
    return (x + y) % 3 === 0 ? '.' : 'w';
  }
  if (y >= 9 && y <= 14 && Math.abs(x - 8) < 3 + (y - 9) / 2) return (x + y) % 3 === 0 ? '.' : 'v';
  return '.';
});

/** Clay jar with a narrow neck and an amber oil glint. */
export const LAMP_OIL = art((x, y) => {
  if (y >= 3 && y <= 5 && x >= 6 && x <= 9) return y === 3 ? 'a' : 'm';
  if (y >= 6 && y <= 13 && Math.abs(x - 7.5) <= (y < 9 ? y - 3 : 5)) {
    return y === 13 ? 's' : x <= 5 ? 'a' : x >= 11 ? 's' : 'm';
  }
  return 'd';
});
/** Transparent pennant drawn above the marked tile, without changing that tile. */
export const MARK_FLAG = art((x, y) => {
  if (x === 5 && y >= 2 && y <= 14) return 'm';
  if (y >= 2 && y <= 7 && x >= 6 && x <= 13 - (y - 2)) return 'a';
  return '.';
});

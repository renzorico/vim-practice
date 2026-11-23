import { PALETTE, type PixelSprite } from './sprite.js';

// Library stone, parchment, brass and sealing wax.
const palette = { ...PALETTE, K: '#261e20', O: '#563929', L: '#8a6241',
  V: '#e1d1a6', H: '#b39a70', A: '#752f39', D: '#8d8981', E: '#c2bdb0', F: '#d3ae58' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
const stone = (x: number, y: number, variant = 0): string =>
  y === 15 || (x + (y < 8 ? 0 : 8) + variant * 4) % 16 === 0 ? 'K' : y === 0 ? 'E' : (x * 7 + y * 3) % 29 === 0 ? 'H' : 'D';
export const VAULT_FLOOR: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => stone(x, y, variant))) };
export const VAULT_WALL = art((x, y) => y === 4 || y === 11 ? 'K'
  : y === 5 || y === 10 ? x === 2 || x === 13 ? 'F' : 'O' : stone(x, y));
export const NOTARY_DESK = art((x, y) => y < 3 || y > 13 ? stone(x, y)
  : y === 3 || y === 13 || x === 0 ? 'K' : y < 11 && x > 3 && x < 13 ? y % 3 === 0 ? 'H' : 'V' : 'O');
export const CLAUSE_QUOTE = art((x, y) => y >= 4 && y <= 11 ? x > 5 && x < 10 && y > 5 && y < 10 ? 'A' : 'V' : 'K');
export const CLAUSE_TEXT = art((x, y) => y >= 4 && y <= 11
  ? (y === 6 || y === 9) && x > 2 && x < 13 || y === 7 && x === 3 || y === 8 && x === 12 ? 'K' : 'V' : 'K');
export const CLAUSE_GAP = art(() => 'K');
const lock = (right: boolean): PixelSprite => art((x, y) => {
  const across = right ? 15 - x : x;
  return y >= 2 && y <= 13 && across >= 2 && across <= 5 ? across === 3 ? 'E' : 'K'
    : (y === 2 || y === 13) && across > 4 ? 'F' : stone(x, y);
});
export const LOCK_LEFT = lock(false);
export const LOCK_RIGHT = lock(true);
const seal = (right: boolean): PixelSprite => art((x, y) => {
  const across = right ? 15 - x : x;
  return across >= 5 && ((across - 12) ** 2 + (y - 7.5) ** 2 < 48)
    ? across === 6 || y === 3 ? 'r' : 'A' : y === 7 || y === 8 ? 'F' : stone(x, y);
});
export const SEAL_LEFT = seal(false);
export const SEAL_RIGHT = seal(true);
export const KEYS = art((x, y) => {
  const ring = (x - 6) ** 2 + (y - 5) ** 2;
  return ring >= 5 && ring <= 14 || x >= 6 && x <= 8 && y >= 8 && y <= 13
    || y === 11 && x >= 8 && x <= 11 ? 'F' : y === 7 || y === 8 ? 'H' : stone(x, y);
});
const tag = (right: boolean): PixelSprite => art((x, y) => {
  const across = right ? 15 - x : x;
  return y >= 3 && y <= 12 ? across === Math.abs(y - 7) + 2 ? 'H' : across > 6 ? 'V' : stone(x, y) : stone(x, y);
});
export const TAG_OPEN = tag(false);
export const TAG_CLOSE = tag(true);
export const TAG_LABEL = art((x, y) => y >= 3 && y <= 12
  ? y >= 6 && y <= 9 && (x === 4 || x === 7 || x === 10) || y === 10 && x >= 4 && x <= 10 ? 'K' : 'V' : stone(x, y));
export const SEAL_RIBBON = art((x, y) => y >= 6 && y <= 9 ? x % 4 === 0 ? 'V' : 'F' : stone(x, y));
export const TAG_SLASH = art((x, y) => y >= 3 && y <= 12 ? x === 13 - y ? 'K' : 'V' : stone(x, y));
export const WAX = art((x, y) => (x - 7.5) ** 2 + (y - 8) ** 2 < 27 ? y < 7 ? 'r' : 'A'
  : y >= 3 && y <= 12 ? 'V' : stone(x, y));
export const VAULT_DOOR = art((x, y) => x < 2 || x > 13 || y < 2 ? 'O'
  : x % 4 === 2 ? 'K' : (x - 8) ** 2 + (y - 8) ** 2 < 6 ? 'F' : 'D');
export const LOCK_SHARDS = art((x, y) => x > 1 && x < 14 && y > 2 && y < 14
  && (x * 3 + y * 5) % 13 < 2 ? y % 2 ? 'E' : 'F' : '.');
export const WAX_MELT = art((x, y) => y > 10 && y < 15 && x > 2 && x < 14 ? y === 11 ? 'r' : 'A' : '.');
export const NOTARY: PixelSprite = { palette, frames: [[
  '................',
  '......DDD.......',
  '.....DssD.......',
  '.....EKKE.......',
  '.....ssss.......',
  '......ss........',
  '.....KVVK.......',
  '.....KKKK....V..',
  '.....KKKK...V...',
  '....sKKKKs.F....',
  '...FAKKKK.F.....',
  '...AAKKKK.......',
  '.....KKKK.......',
  '.....KKKK.......',
  '.....K..K.......',
  '....KK..KK......',
]] };

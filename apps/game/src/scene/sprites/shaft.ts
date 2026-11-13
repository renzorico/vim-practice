import { PALETTE, type PixelSprite } from './sprite.js';

const pixels = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));

export const MORTAR: PixelSprite = { palette: PALETTE, frames: [pixels((x, y) => {
  if (y === 7 || y === 15 || (x + (y < 7 ? 0 : 8)) % 16 === 0) return 'k';
  if (y === 1 && x > 2 && x < 7 || y === 9 && x > 10 && x < 14) return 'w';
  return (x * 3 + y * 7) % 23 === 0 ? 'c' : 'b';
})] };
export const SCAFFOLD: PixelSprite = { palette: PALETTE, frames: [pixels((x, y) => {
  if (y < 10) return y % 4 === 0 || x === 1 || x === 14 ? 'T' : 't';
  return y === 10 || (x + y) % 11 === 0 ? 'k' : 'b';
})] };
export const MASON: PixelSprite = { palette: PALETTE, frames: [[
  '.....bbbbbb.....',
  '....bbbbbbbb....',
  '....bssssssb....',
  '....sskssks.....',
  '....ssssssss....',
  '....bbbbbbbb....',
  '....bbwbwbbb....',
  '..tttbbbbtttt...',
  '.tssTttttTssst..',
  '.tssTttttTsssbb.',
  '..ssTtTTtTssbbb.',
  '....TtTTtT...b..',
  '....TttttT...t..',
  '....TTTTTT......',
  '....kk..kk......',
  '...kkk..kkk.....',
]] };

// Transparent highlights preserve the mortar beneath and mark its slippery diagonal grain.
export const WET_SHEEN: PixelSprite = { palette: { ...PALETTE, m: '#8196a2' }, frames: [pixels((x, y) =>
  (x + y) % 12 === 0 || (x + y) % 12 === 1 ? 'm' : '.') ] };
export const WET_EDGE: PixelSprite = { palette: { ...PALETTE, m: '#bdcbd0' }, frames: [pixels((_, y) =>
  y === 0 ? 'm' : y === 1 ? 'C' : '.') ] };

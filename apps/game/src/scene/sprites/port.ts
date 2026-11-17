import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, K: '#18292b', V: '#153e43', v: '#28636a', F: '#65a09a',
  C: '#ad704b', c: '#d39b69', B: '#58483b', W: '#8e7b60', N: '#d6c6a0', I: '#749393' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette, frames: [surface(pixel)] });
const board = (x: number, y: number, variant: number): string => {
  if (y % 5 === 0) return 'K';
  if ((x === 2 || x === 13) && y % 5 === 2) return 'I';
  return (x + y * 3 + variant * 7) % 13 === 0 ? 'B' : variant && y % 3 === 0 ? 'c' : 'W';
};
export const BOARDS: PixelSprite = { palette, frames: [0, 1].map(variant => surface((x, y) => board(x, y, variant))) };
export const PORT_WATER: PixelSprite = { palette, frames: [0, 1].map(frame => surface((x, y) =>
  y % 7 === frame * 2 && (x + frame * 3) % 12 < 6 ? 'v' : 'V')) };
export const PIER_POST = art((x, y) => {
  if (x >= 4 && x <= 12 && y >= 2 && y <= 14) {
    if (y === 2 || y === 3) return 'c';
    if (y === 9 || y === 11) return 'N';
    return x === 4 || x === 12 ? 'K' : x % 4 === 0 ? 'B' : 'C';
  }
  return board(x, y, 0);
});
export const PORT_LADDER = art((x, y) => x === 3 || x === 12 || y % 4 === 1 && x > 3 && x < 12
  ? (x === 3 || y % 4 === 1 ? 'I' : 'K') : 'V');
export const WAREHOUSE = art((x, y) => {
  if (y < 5) return y === 4 ? 'K' : x % 5 === 0 ? 'F' : 'C';
  return y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0 ? 'K' : 'B';
});
export const CRATES = art((x, y) => {
  // Raised boxes with dark gaps, loose diagonal braces and a stencilled cargo mark.
  const left = y < 8 ? 2 : 0; const right = y < 8 ? 13 : 15;
  if (x < left || x > right || y === 0 || y === 8 || y === 15) return 'K';
  if (x === left || x === right || y % 8 === 1 || y % 8 === 7) return 'c';
  if (x >= 6 && x <= 9 && y >= 10 && y <= 13) return x === 6 || y === 10 ? 'K' : 'C';
  return (x - left) % 7 === y % 8 ? 'B' : 'C';
});
export const NETS = art((x, y) => {
  if (y < 4 || y < 8 && (x < 3 || x > 12)) return 'V';
  if ((y === 7 && x % 6 < 2) || (y === 12 && x % 7 < 2)) return 'c';
  return (x + y) % 5 === 0 || (x - y + 20) % 5 === 0 ? 'N' : 'K';
});
export const CART = art((x, y) => {
  if ((x === 3 || x === 12) && y >= 10 && y <= 14) return 'K';
  if (x >= 3 && x <= 12 && y >= 4 && y <= 11) {
    return x === 3 || x === 12 || y === 4 || y === 11 ? 'c' : y % 3 === 0 ? 'B' : 'W';
  }
  return (x === 4 || x === 11) && y < 5 ? 'C' : '.';
});
export const BITT = art((x, y) => {
  const rope = (x - 11) ** 2 + (y - 9) ** 2;
  if (rope >= 4 && rope <= 10 && x >= 9) return 'N';
  if (y >= 13 && (x === 4 || x === 9)) return 'K';
  if (y >= 8 && y <= 13 && x >= 3 && x <= 10) return x === 3 || x === 10 ? 'V' : 'v';
  if (y >= 2 && y <= 7 && x >= 4 && x <= 10) {
    if (y <= 3) return x % 2 === 0 ? 'C' : 'B';
    if (y === 5 && (x === 5 || x === 9)) return 'K';
    return y === 7 ? 'B' : 's';
  }
  return '.';
});
export const REAM = art((x, y) => {
  if (x === 11 && y >= 3 && y <= 6) return 'y'; // pencil
  if (y === 15 && (x === 6 || x === 9)) return 'K';
  if (y >= 8 && y <= 14 && x >= 5 && x <= 10) return x === 5 || x === 10 ? 'V' : 'N';
  if (x >= 10 && x <= 13 && y >= 9 && y <= 12) return x === 10 || y === 9 ? 'C' : 'B'; // ledger
  if (y >= 1 && y <= 7 && x >= 5 && x <= 10) {
    if (y <= 2) return 'B';
    return y === 4 && (x === 6 || x === 9) ? 'K' : 's';
  }
  return '.';
});
export const SPLASH = art((x, y) => y >= 10 && y <= 13 && x >= 2 && x <= 13
  || y >= 6 && y < 10 && (x === 3 || x === 12) ? 'F' : '.');

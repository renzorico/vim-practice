import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, S: '#91bbc1', B: '#507d86', L: '#355e58', N: '#263c3d' };
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
const art = (...frames: string[][]): PixelSprite => ({ palette, frames });

// Pale sky above a dark, distant canopy: no horizontal surface to stand on.
function air(x: number, y: number): string {
  if (y < 9) return (x + y * 3) % 41 === 0 ? 'c' : 'S';
  if (y < 12) return 'B';
  return (x * 3 + y) % 11 < 4 ? 'L' : 'N';
}
function branch(x: number, y: number, seed = 0): string {
  if (y < 4 || y > 11) return air(x, y);
  if (y === 4) return 't';
  if (y === 11) return 'k';
  return (x * 7 + y * 3 + seed * 11) % 19 < 3 ? 'T' : 't';
}
export const BRANCH = art(...[0, 1].map(seed => surface((x, y) => branch(x, y, seed))));
export const AIR = art(surface(air));
export const KNOT = art(surface((x, y) => {
  const radius = (x - 8) ** 2 + (y - 8) ** 2;
  return radius < 6 ? 'k' : radius < 15 ? 'T' : branch(x, y);
}));
export const LEAVES = art(surface((x, y) => {
  if ((x - 9) ** 2 / 2 + (y - 4) ** 2 < 16) return (x + y) % 4 === 0 ? 'a' : 'G';
  return branch(x, y);
}));
export const TRUNK = art(surface((x, y) =>
  (x + Math.floor(y / 6)) % 6 === 0 ? 'k' : (x * 5 + y) % 23 < 2 ? 't' : 'T'));
export const LADDER = art(surface((x, y) =>
  x === 3 || x === 12 ? 'w' : (y % 5 === 2 && x > 3 && x < 12) ? 't' : air(x, y)));
export const THORNS = art(surface((x, y) => {
  const thorn = (x + y * 2) % 9 < 2 || (x * 2 - y + 16) % 11 < 2;
  return y < 12 && thorn ? (y % 3 === 0 ? 'r' : 'R') : air(x, y);
}));
export const PLATFORM = art(surface((x, y) =>
  y < 3 || y > 12 ? air(x, y) : y % 4 === 0 ? 'T' : x === 2 || x === 13 ? 'k' : 't'));
export const FERN = CHARACTER_FIELDS.fern;
export const KNOTHOLE = art(surface((x, y) => {
  const radius = (x - 8) ** 2 / 1.4 + (y - 8) ** 2;
  if (radius < 12) return y < 8 ? 'w' : 'c';
  if (radius < 24) return 'k';
  return (x + Math.floor(y / 6)) % 6 === 0 ? 'k' : 'T';
}));
export const LIFT = art(surface((x, y) => {
  if (y < 4) return x === 7 || x === 8 ? 'w' : '.';
  if (y === 4 || y > 13) return x > 1 && x < 14 ? (y === 4 || y === 14 ? 'w' : 't') : '.';
  return x === 2 || x === 6 || x === 10 || x === 13 ? 't' : '.';
}));

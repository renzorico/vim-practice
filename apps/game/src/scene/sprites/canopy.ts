import { CHARACTER_FIELDS } from './characters.js';
import { grain, grid } from './material.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, S: '#9cc4bf', s: '#86b1ae', B: '#6c9a98', N: '#4a7a72', n: '#3f6a62',
  P: '#8f6b45', p: '#a88257', q: '#6d4f33', K: '#2b241c', o: '#c9a26a', L: '#5f8a4d', l: '#466c41',
  W: '#4b3a2b', X: '#5b4734', Y: '#3b2e23', Z: '#30261d' };
const art = (...frames: string[][]): PixelSprite => ({ palette, frames });

/** Mist between the trunks: far crowns below, pale light above, and nothing to stand on. */
function air(x: number, y: number): string {
  const crown = 11 + Math.round(Math.sin((x + 2) / 2.4) * 1.4);
  if (y > crown + 1) return 'n';
  if (y > crown) return 'N';
  return y < 4 ? 'S' : y < 8 ? ((x + y) % 2 && y === 7 ? 'B' : 's') : 'B';
}
/** A plank walk with a rope rail behind it and a dark underside. */
function branch(x: number, y: number, seed = 0): string {
  if (y < 2) return grain(x, y, 5) < 40 ? 'l' : 'n';
  if (y === 2) return 'o';
  if (y < 5) return x % 8 === 3 ? 'q' : 'n';
  if (y === 5) return 'p';
  if (y > 13) return 'K';
  if (y === 13) return 'q';
  if (x % 8 === 7) return 'q';
  return grain(x >> 1, y, seed) < 9 ? 'q' : grain(x, y, seed + 9) > 90 ? 'p' : 'P';
}
export const BRANCH = art(...[0, 1].map(seed => grid((x, y) => branch(x, y, seed))));
export const AIR = art(grid(air));
export const KNOT = art(grid((x, y) => {
  const radius = (x - 7.5) ** 2 + (y - 9) ** 2;
  return radius < 5 ? 'K' : radius < 12 ? 'q' : branch(x, y);
}));
export const LEAVES = art(grid((x, y) => {
  const reach = ((x - 8) / 6.5) ** 2 + ((y - 5) / 4.4) ** 2;
  if (reach < 1) return reach > 0.75 ? 'n' : -(x - 8) - (y - 5) * 1.4 + (grain(x, y) % 5 - 2) > 1 ? 'L' : 'l';
  return branch(x, y);
}));
/** Bark: long wavering grain, no stripe that could be mistaken for a step. */
export const TRUNK = art(grid((x, y) => {
  const wave = Math.round(Math.sin((y + x) / 5) * 1.2);
  const ridge = (x + wave + 16) % 8;
  return ridge === 0 ? 'Z' : ridge === 1 ? 'X' : grain(x, y >> 1, 2) < 10 ? 'Y' : 'W';
}));
export const LADDER = art(grid((x, y) => {
  if (x === 3 || x === 12) return 'o';
  if (x === 4 || x === 13) return 'K';
  if (x > 3 && x < 12) { if (y % 5 === 2) return 'p'; if (y % 5 === 3) return 'q'; }
  return y % 8 < 4 ? 'W' : 'Y';
}));
export const THORNS = art(grid((x, y) => {
  for (const phase of [0, 2.4]) {
    const off = y - 8 - Math.round(Math.sin(x / 2.2 + phase) * 4);
    if (off === 0) return 'R';
    if (off === 1) return 'K';
    // A hooked spike every third pixel of the cane.
    if (x % 3 === 0 && (off === -1 || off === -2 || off === 2)) return 'r';
  }
  return air(x, y);
}));
export const PLATFORM = art(grid((x, y) => branch(x, y, 4)));
export const FERN = CHARACTER_FIELDS.fern;
export const KNOTHOLE = art(grid((x, y) => {
  const radius = (x - 7.5) ** 2 / 1.4 + (y - 8) ** 2;
  if (radius < 12) return y < 8 ? 'w' : 'c';
  if (radius < 22) return 'K';
  if (radius < 30) return 'X';
  return TRUNK.frames[0]?.[y]?.[x] ?? 'W';
}));
export const LIFT = art(grid((x, y) => {
  if (y < 4) return x === 7 || x === 8 ? 'w' : '.';
  if (y === 4 || y > 13) return x > 1 && x < 14 ? (y === 4 || y === 14 ? 'w' : 't') : '.';
  return x === 2 || x === 6 || x === 10 || x === 13 ? 't' : '.';
}));

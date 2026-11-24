import { CHARACTER_FIELDS } from './characters.js';
import { grain, grid, masonry, sprite } from './material.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const art = (...frames: string[][]): PixelSprite => ({ palette: PALETTE, frames });
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
export const DIRT = art(...[0, 1].map(seed => surface((x, y) =>
  (x * 7 + y * 11 + seed * 13) % 23 === 0 ? 'T' : 't')));
/** A trodden road: pebbles, densest where the carts ran. */
export const GRAVEL = sprite({ M: '#a3835a', L: '#b99a6d', D: '#8b6d49' }, grid((x, y) => {
  const rut = y === 4 || y === 5 || y === 10 || y === 11;
  const speck = grain(x, y, 3);
  return speck < (rut ? 34 : 9) ? 'D' : speck > 93 ? 'L' : 'M';
}));
/** Solid rock: big cut stones, quiet enough to sit behind the road. */
export const BEDROCK = sprite({ L: '#6e563f', M: '#5f4a37', D: '#554331', K: '#45372a' }, grid((x, y) =>
  masonry([[0, 0, 9, 8], [9, 0, 7, 8], [4, 8, 8, 8], [12, 8, 8, 8]], x, y)));
/** Loose boulders, drawn whole so each one reads as a thing you can remove. */
export const RUBBLE = sprite({ L: '#d8d3c4', M: '#a8a79f', D: '#74787a', K: '#3b3b3c' }, grid((x, y) => {
  for (const [cx, cy, rx, ry] of [[5, 10.5, 4.6, 4.2], [11.4, 11.2, 4, 3.6], [8.6, 5.2, 4.4, 4]] as const) {
    const reach = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (reach > 1) continue;
    if (reach > 0.8 && x - cx + (y - cy) > 0) return 'K';
    const lit = -(x - cx) - (y - cy) * 1.3;
    return lit > 2.4 ? 'L' : lit > -2 ? 'M' : 'D';
  }
  return '.';
}));
export const RIVER = art(...[0, 1].map(frame => surface((x, y) =>
  (x + frame * 4 + y * 2) % 13 < 4 && y % 4 === 0 ? 'c' : 'C')));
export const PLANK = art(surface((x, y) => y % 4 === 0 ? 'T' : x === 2 || x === 13 ? 'k' : 't'));
/** Canvas over a pole, flap open. */
export const TENT = sprite({ L: '#efe3c6', M: '#d3bf98', D: '#a38c6b', K: '#3a2e25', R: '#a5553f' }, grid((x, y) => {
  if (y === 0) return x === 7 || x === 8 ? 'K' : '.';
  if (y > 14) return '.';
  const half = Math.floor(1 + y * 0.5);
  const dx = x < 8 ? 7 - x : x - 8;
  if (dx > half) return '.';
  if (y === 14) return 'D';
  if (y > 6 && dx <= (y - 6) * 0.35) return 'K';
  if (y === 5 || y === 6) return 'R';
  return x < 8 ? (grain(x, y) < 8 ? 'M' : 'L') : dx > half - 3 ? 'D' : 'M';
}));
export const ASH = CHARACTER_FIELDS.ash;
export const KIT = CHARACTER_FIELDS.kit;
export const CRACK = art(surface((x, y) => {
  const seam = 7 + Math.floor(y / 3) % 3;
  return x === seam ? 'w' : Math.abs(x - seam) < 2 ? 'k' : y % 5 === 0 ? 'T' : 'b';
}));
export const QUARRY_GATE = art(surface((x, y) =>
  y < 4 || x < 4 || x > 11 ? (y % 4 === 0 ? 'T' : 'b') : '.'));
export const DUST = art(surface((x, y) =>
  (x - 8) ** 2 + (y - 8) ** 2 < 48 && (x * 3 + y * 7) % 5 < 2 ? 'w' : '.'));

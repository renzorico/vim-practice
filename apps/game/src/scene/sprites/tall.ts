import type { PixelSprite } from './sprite.js';
import type { PixelRect } from '../terrain/art.js';

/** Accept the CSS palette forms used by sprite artists; transparent pixels emit no ink. */
export function paletteColor(value: string | undefined): number | undefined {
  if (!value || value === 'transparent') return undefined;
  if (/^#[0-9a-f]{3}$/i.test(value)) return Number.parseInt(value.slice(1).split('').map(char => char + char).join(''), 16);
  return /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : undefined;
}
export const TALL_SPRITES = new Set(['tree', 'pillar', 'reading-post', 'shelf-post', 'customs-post', 'archive-post',
  'atlas-shelf', 'bible-shelf', 'misfiled-shelf', 'lamp', 'lamp-lit', 'glade-lamp-lit', 'lamp-out', 'save-stone']);

/** The gold mark carved in every Save Stone. */
const SAVE_MARK = ['.###', '#...', '.##.', '...#', '###.'];
const SAVE_MARK_TOP = 9;
const SAVE_MARK_LEFT = 6;
/** Original 24px silhouettes: the cap's last row meets the body's first row. */
function pixel(sprite: string, x: number, y: number): string | undefined {
  if (sprite === 'tree') {
    const halfWidth = y < 8 ? Math.min(7, 3 + Math.floor(y / 2)) : y < 17 ? 7 - Math.floor((y - 8) / 3) : 2;
    if (x < 8 - halfWidth || x >= 8 + halfWidth || y === 23) return '.';
    return y < 17 ? (x < 6 && y % 5 === 2 ? 'g' : 'G') : x === 6 ? 'T' : 't';
  }
  if (sprite === 'save-stone') {
    const halfWidth = y < 8 ? Math.min(5, 2 + Math.floor(y / 2)) : 5;
    if (y > 21 || x < 8 - halfWidth || x >= 8 + halfWidth) return '.';
    if (SAVE_MARK[y - SAVE_MARK_TOP]?.[x - SAVE_MARK_LEFT] === '#') return 'y';
    return x === 8 - halfWidth || y === 0 ? 'w' : x === 7 + halfWidth || y === 21 ? 'k' : 'b';
  }
  if (sprite.includes('lamp')) {
    if (y < 2) return x >= 6 && x < 10 ? 'k' : '.';
    if (y < 7) return x < 4 || x > 11 ? '.' : x === 4 || x === 11 ? 'T' : sprite.includes('lit') ? 'y' : 'b';
    if (y < 9) return x >= 3 && x < 13 ? 'T' : '.';
    return y < 22 && x >= 7 && x < 9 ? 'T' : y === 22 && x >= 5 && x < 11 ? 'T' : '.';
  }
  // Shelves keep their book spines; only their cornice and its join replace the first rows.
  if (sprite.includes('shelf')) return y < 2 ? '.' : y < 4 ? 'T' : y < 6 ? 't' : y < 9 ? 'T' : undefined;
  // A moulded capital sits on a narrow fluted shaft.
  return y < 2 ? '.' : y < 4 ? 's' : y < 6 ? 't' : y < 9 ? (x >= 2 && x < 14 ? 's' : '.')
    : x >= 4 && x < 12 ? (x === 5 ? 'w' : 's') : '.';
}
const palette = { '.': 'transparent', G: '#344e43', g: '#647b65', T: '#594332', t: '#936a4b',
  w: '#f6efd4', y: '#e9c86b', k: '#20252b', b: '#66788d', s: '#dfad80' };
export function tallBody(sprite: string, original: PixelSprite): PixelSprite {
  if (!TALL_SPRITES.has(sprite)) return original;
  // Separate pigment keys prevent cornice colours from changing the books below.
  const pigments: Record<string, string> = { ...original.palette };
  // PixelSprite uses one character per pixel, so reserve otherwise unused Unicode pigment keys.
  const keys = Object.keys(palette);
  const symbols = keys.map((_, index) => String.fromCharCode(0x100 + index));
  for (let index = 0; index < keys.length; index++) pigments[symbols[index] ?? ''] = palette[keys[index] as keyof typeof palette];
  return { palette: pigments, frames: original.frames.map(frame => Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const ink = pixel(sprite, x, y + 8);
      return ink === undefined ? frame[y]?.[x] ?? '.' : symbols[keys.indexOf(ink)] ?? '.';
    }).join(''))) };
}
export function overhangArt(sprite: string): readonly PixelRect[] {
  const pixels: PixelRect[] = [];
  if (!TALL_SPRITES.has(sprite)) return pixels;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const ink = pixel(sprite, x, y);
    const color = paletteColor(palette[ink as keyof typeof palette]);
    if (color !== undefined) pixels.push({ x, y, width: 1, height: 1, color, alpha: 1 });
  }
  return pixels;
}

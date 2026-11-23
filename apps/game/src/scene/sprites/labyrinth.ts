import type { PixelSprite } from './sprite.js';
import { CAVE_ROCK } from './mouth.js';

const palette = { ...CAVE_ROCK.palette, a: '#dba55d', v: '#695182', V: '#ac79e5', w: '#e7ceff' };
const art = (pixel: (x: number, y: number) => string): PixelSprite => ({ palette,
  frames: [Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''))] });

/** Empty archway: the keeper stays out of sight, even in Source view. */
export const MINOTAUR_LAIR = art((x, y) => {
  const arch = y >= 7 || (x - 7.5) ** 2 + (y - 8) ** 2 < 30;
  if (x >= 3 && x <= 12 && arch) return x === 3 || x === 12 ? 'm' : 'k';
  return CAVE_ROCK.frames[0]?.[y]?.[x] ?? 'd';
});
export const HOOFPRINT = art((x, y) => {
  // Two split hooves, pressed into the rock rather than standing on it.
  const hoof = (left: number, top: number): boolean => y >= top && y <= top + 5
    && x >= left && x <= left + 4 && x !== left + 2
    && (y > top || x === left + 1 || x === left + 3);
  return hoof(2, 3) || hoof(9, 8) ? 'k'
    : hoof(2, 2) || hoof(9, 7) ? 'm' : CAVE_ROCK.frames[0]?.[y]?.[x] ?? 'd';
});
const RUNES: Readonly<Record<string, readonly string[]>> = {
  x: ['101', '010', '101'], y: ['101', '010', '010'], z: ['111', '010', '111'],
};
function lever(rune: string, lit: boolean): PixelSprite {
  return art((x, y) => {
    if (y >= 3 && y <= 5 && RUNES[rune]?.[y - 3]?.[x - 6] === '1') return lit ? 'w' : 'v';
    if (y >= 8 && y <= 13 && x >= 3 && x <= 12) return y === 8 ? 'm' : y === 13 ? 'k' : 's';
    if (x >= (lit ? 9 : 5) && x <= (lit ? 10 : 6) && y >= 6 && y <= 10) return lit ? 'a' : 'v';
    return lit && y === 14 && x >= 3 && x <= 12 ? 'V' : 'd';
  });
}
export const RUNE_LEVERS: Readonly<Record<string, PixelSprite>> = Object.fromEntries(
  Object.keys(RUNES).flatMap(rune => [[`rune-lever-${rune}`, lever(rune, false)],
    [`rune-lever-${rune}-lit`, lever(rune, true)]]),
);
/** The entity is invisible; only its lair tile and prints are rendered. */
export const MINOTAUR: PixelSprite = { palette: { '.': 'transparent' }, frames: [Array.from({ length: 16 }, () => '.'.repeat(16))] };
export const RUNE_LEVER = lever('x', false);

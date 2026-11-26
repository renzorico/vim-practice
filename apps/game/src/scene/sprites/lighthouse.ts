import { CHARACTER_FIELDS } from './characters.js';
import { grain, grid } from './material.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const palette = { ...PALETTE, v: '#382d4d', V: '#584266', n: '#10121e', f: '#c5b79f', F: '#aa9d88', h: '#d2c5ad', q: '#e9cc82' };
export const UNWRITER: PixelSprite = { palette, frames: [[
  '.......vv.......', '......vVVv......', '.....vVnnVv.....', '.....vvnnvv...f.',
  '.....vvvvvv..ff.', '......vVVv..ff..', '.....vVVVVv.f...', '....vVVVVVVvf...',
  '...vvVVVVVVvf...', '...v.VVVVVVff...', '.....vVVVVv.f...', '.....vVVVVv.f...',
  '....vVVVVVVvf...', '....vvvvvvvvf...', '...vvvvvvvvvf...', '...vv.vvv.vvf...',
]] };
export const LAMPLIGHTER: PixelSprite = CHARACTER_FIELDS.lamplighter;
/** Worn slabs: warm seams that stay under whoever stands on them. */
export const STONE_FLOOR: PixelSprite = { palette, frames: [grid((x, y) =>
  y % 8 === 7 || (x + (y < 8 ? 0 : 8)) % 16 === 15 ? 'F' : grain(x, y, 2) < 4 ? 'F' : grain(x, y, 5) < 3 ? 'h' : 'f')] };
/** Four treads going up, each lit along its edge. */
export const STAIRS: PixelSprite = { palette, frames: [grid((x, y) =>
  x === 0 || x === 15 ? 'k' : y % 4 === 0 ? 'h' : y % 4 === 3 ? 'k' : y < 8 ? 'F' : 'f')] };
export const TOWER_WALL: PixelSprite = { palette, frames: [[
  'kkkkkkkkkkkkkkkk', 'kbbbbbbbkbbbbbbk', 'kbffffbbkbbfffbb', 'kbbbbbbbkbbbbbbk',
  'kkkkkkkkkkkkkkkk', 'bbbkbbbbbbbbkbbb', 'bfbkbbffffbbkbfb', 'bbbkbbbbbbbbkbbb',
  'kkkkkkkkkkkkkkkk', 'kbbbbbbbkbbbbbbk', 'kbbffffbkbbffffk', 'kbbbbbbbkbbbbbbk',
  'kkkkkkkkkkkkkkkk', 'bbbkbbbbbbbbkbbb', 'bbbkbbbbbbbbkbbb', 'kkkkkkkkkkkkkkkk',
]] };
export const PILLAR: PixelSprite = { palette, frames: [[
  '...kkkkkkkkkk...', '...bffffffffb...', '....bbbbbbbb....', '.....bffffb.....',
  '.....bffbfb.....', '.....bffbfb.....', '.....bffbfb.....', '.....bffbfb.....',
  '.....bffbfb.....', '.....bffbfb.....', '.....bffbfb.....', '.....bffbfb.....',
  '....bbbbbbbb....', '...bffffffffb...', '...bbbbbbbbbb...', '...kkkkkkkkkk...',
]] };
const lamp = [
  '......TTTT......', '.....TTTTTT.....', '....TTTTTTTT....', '....TkkkkkkT....',
  '....TkkkkkkT....', '....TkkkkkkT....', '....TkkkkkkT....', '....TTTTTTTT....',
  '......TTTT......', '.......TT.......', '.......TT.......', '.......TT.......',
  '.......TT.......', '......TTTT......', '.....TTTTTT.....', '....TTTTTTTT....',
];
export const LAMP: PixelSprite = { palette, frames: [lamp] };
export const LIT_LAMP: PixelSprite = { palette, frames: [lamp.map((row, index) =>
  index >= 3 && index <= 6 ? row.replaceAll('k', 'y').replace(/^\.\.\./, 'q.q').replace(/\.\.\.$/, 'q.q') : row)] };

export const UNWRITE_EDGE: PixelSprite = {
  palette: { '.': 'transparent', v: '#382d4d', n: '#211828' },
  frames: [Array.from({ length: 16 }, (_, row) =>
    Array.from({ length: 16 }, (_, col) => row < 4 ? '.' : row < 10
      ? (col % (row < 7 ? 4 : 2) === 0 ? 'v' : '.') : row < 13 ? 'v' : 'n').join(''))],
};

import { PALETTE, type PixelSprite } from './sprite.js';

export const WREN: PixelSprite = { palette: PALETTE, frames: [[
  '................', '.......GG.......', '......GGGG......', '.....GGggGG..t..',
  '.....GssssG...t.', '.....GskskG...t.', '......ssss....t.', '.....GGggGG...t.',
  '....GGggggGG..t.', '....sGggggGs.t..', '.....GGggGG.t...', '......GttG......',
  '......g..g......', '.....kk..kk.....', '................', '................',
]] };
export const GULL: PixelSprite = { palette: PALETTE, frames: [[
  '................', '................', '......yyyy......', '.....yyyyyy.....',
  '....yyyyyyyy....', '......ssss......', '......skss......', '......sssstt....',
  '.....yyyyyy.t...', '....yyyyyyyy....', '....syyyyyys....', '.....yyyyyy.....',
  '......b..b......', '.....kk..kk.....', '................', '................',
]] };
export const NOTE: PixelSprite = { palette: PALETTE, frames: [[
  '................', '.......TT.......', '...wwwwttwwww...', '...wwwwwwwwww...',
  '...wTTTTTTwww...', '...wwwwwwwwww...', '...wTTTTTTTww...', '...wwwwwwwwww...',
  '...wTTTTwwwww...', '...wwwwwwwwww...', '...wwwwwwwww....', '.......TT.......',
  '.......TT.......', '.......TT.......', '......TTTT......', '................',
]] };
export const STONE: PixelSprite = { palette: PALETTE, frames: [[
  '................', '................', '................', '.....bbbbbb.....',
  '...bbwwwwwwbb...', '..bwwwwwwwwwwb..', '..bwwwbwwwwwwb..', '.bwwwwwwwwwwwwb.',
  '.bwwwwwwwwwwwwb.', '..bwwwwwwwwwwb..', '..bbbbwwwwbbbb..', '...bbbbbbbbbb...',
  '.....bbbbbb.....', '................', '................', '................',
]] };
export const JETTY: PixelSprite = { palette: PALETTE, frames: [[
  'TTTTTTTTTTTTTTTT', 'tttttttttttttttt', 'tTttttttttttttTt', 'tttttttTtttttttt',
  'tttttttttttttttt', 'TTTTTTTTTTTTTTTT', 'tttttttttttttttt', 'tTttttttttttttTt',
  'tttttttttttttttt', 'ttttTttttttttttt', 'TTTTTTTTTTTTTTTT', 'tttttttttttttttt',
  'tTttttttttttttTt', 'ttttttttttTttttt', 'tttttttttttttttt', 'TTTTTTTTTTTTTTTT',
]] };
export const LIGHTHOUSE_DOOR: PixelSprite = { palette: PALETTE, frames: [[
  '.....bbbbbb.....', '...bbwwwwwwbb...', '..bwwwbbbbwwwb..', '.bwwbbTTTTbbwwb.',
  '.bwbTTTTTTTTbwb.', '.bwbTtTTTtTTbwb.', '.bwbTtTTTtTTbwb.', '.bwbTtTTTtTTbwb.',
  '.bwbTtTTTtTTbwb.', '.bwbTtTTTyTTbwb.', '.bwbTtTTTtTTbwb.', '.bwbTtTTTtTTbwb.',
  '.bwbTTTTTTTTbwb.', '.bwwbbbbbbbbwwb.', '.bbbbbbbbbbbbbb.', '................',
]] };
// Each bit adds a faint irregular paper edge only beside a written neighbour.
export const BLANK: PixelSprite = {
  palette: { p: '#eee5cf', e: '#d2c5a7' },
  frames: Array.from({ length: 16 }, (_, sides) => Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const torn = (x + y) % 5 === 0 ? 1 : 0;
      return ((sides & 1) !== 0 && y === torn)
        || ((sides & 2) !== 0 && x === 15 - torn)
        || ((sides & 4) !== 0 && y === 15 - torn)
        || ((sides & 8) !== 0 && x === torn) ? 'e' : 'p';
    }).join(''))),
};

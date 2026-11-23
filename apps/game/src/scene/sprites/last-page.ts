import type { PixelSprite } from './sprite.js';
const palette = { '.': 'transparent', p: '#f6efd4', e: '#d9cba5', g: '#88877f', G: '#aaa79c', k: '#292c2a' };
export const PAGE_PAPER: PixelSprite = { palette, frames: [Array.from({ length: 16 }, () => 'pppppppppppppppp')] };
export const PAGE_MARGIN: PixelSprite = { palette, frames: [[
  '................', '..pp....ppp.....', '.pppp..ppppp.pp.', 'pppppppppppppppp',
  ...Array.from({ length: 12 }, () => 'pppppppppppppppp'),
]] };
export const PAGE_DOOR: PixelSprite = { palette, frames: [Array.from({ length: 16 }, (_, row) =>
  row === 1 || row === 14 ? 'pkkkkkkkkkkkkkkp' : row > 1 && row < 14 ? 'pkppppppppppppkp' : 'pppppppppppppppp')] };
export const PAGE_SMEAR: PixelSprite = { palette, frames: [[
  '................', '................', '................', '................',
  '................', '................', '................', '................',
  '.....GG.........', '..GGGggGG..G....', '.GgggggggGGgG...', 'GggggggggggggGG.',
  '.GGgggggggggggG.', '...GGggggggGG...', '......GGGG......', '................',
]] };

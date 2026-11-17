import { PALETTE, type PixelSprite } from './sprite.js';

/** Semi's flat cap, weathered face, cheek scar and ferry pole. */
export const SEMI: PixelSprite = {
  palette: { ...PALETTE, v: '#89958b', S: '#bf8e69' },
  frames: [[
    '.............t..',
    '....GGGGG....t..',
    '...Ggggggg...t..',
    '..GGGGGGGGG..t..',
    '....wsssw....t..',
    '....skssk....t..',
    '....Sssrs....t..',
    '....svsss....t..',
    '.....vrs.....t..',
    '....CCvCC....t..',
    '...CCCCCCC...t..',
    '...C.CCCCCCsst..',
    '...s.CCCCC...t..',
    '.....GGGGG...t..',
    '.....GG.GG...t..',
    '.....TT.TT...t..',
  ]],
};

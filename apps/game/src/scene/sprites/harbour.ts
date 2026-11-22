import { PALETTE, type PixelSprite } from './sprite.js';

/** Cleat's broad salt-white beard, brass coat buttons and rope hitch lapel. */
export const CLEAT: PixelSprite = {
  palette: { ...PALETTE, B: '#bd984e', W: '#d7d9cf', v: '#c1a27a' },
  frames: [[
    '................',
    '....dddddddd....',
    '...ddCCCCCCdd...',
    '...dddddddddd...',
    '....WssssssW....',
    '...WWskssksWW...',
    '...WWssssssWW...',
    '...WWWWrrWWWW...',
    '....WWWWWWWW....',
    '...CCWWWWWWCC...',
    '..CCCCWWWCCCC...',
    '..CCBCCCCvvCC...',
    '..CCCCBCCvvCC...',
    '..ssCCCCCBCss...',
    '....dddddddd....',
    '....TTT..TTT....',
  ]],
};

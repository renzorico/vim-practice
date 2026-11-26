import { CHARACTER_FIELDS } from './characters.js';
import { PALETTE, type PixelSprite } from './sprite.js';

const down = CHARACTER_FIELDS.player.frames[0] ?? [];
const up = [
  '................', '................', '................', '................',
  '.......TTT......', '.......TTT......', '.....TTTTTT.....', '.....TTTTTT.....',
  '.....TTTTTTyyyy.', '.....TTTTTT..yyy', '.....TTTTTT....y', '....yyyyyyyy....',
  '.....GGGGGyyyy..', '.....GGGGGG.yy..', '.....kkkkkk.....', '................',
];
const left = [
  '................', '................', '................', '................',
  '......TTT.......', '......TTT.......', '....TTTTTTT.....', '....TssssTT.....',
  '...ssksTTTT.....', '....ssssTTT.....', '.....ssTTTT.....', '....yyyyyyyy....',
  '.....GGGGGyyyy..', '.....GGGGG.yy...', '.....kkkkkk.....', '................',
];
function walk(frame: readonly string[], alternate: boolean): readonly string[] {
  return frame.map((row, y) => y === 14 ? alternate ? '....kkk..kk.....' : '.....kk..kkk....'
    : y === 12 ? row.replace('yyyy', alternate ? 'yy..' : '.yyy') : row);
}
export const PLAYER: PixelSprite = { palette: PALETTE,
  frames: [down, CHARACTER_FIELDS.player.frames[1] ?? down, walk(down, false), walk(down, true), up, walk(up, false), walk(up, true), left, walk(left, false), walk(left, true)] };

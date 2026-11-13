import { PALETTE, type PixelSprite } from './sprite.js';

const art = (...frames: string[][]): PixelSprite => ({ palette: PALETTE, frames });
const surface = (pixel: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pixel(x, y)).join(''));
export const DIRT = art(...[0, 1].map(seed => surface((x, y) =>
  (x * 7 + y * 11 + seed * 13) % 23 === 0 ? 'T' : 't')));
export const GRAVEL = art(surface((x, y) => (x * 7 + y * 13) % 11 < 3 ? 'b' : 't'));
export const BEDROCK = art(surface((x, y) => y % 5 === 0 ? 'k' : (x + y * 3) % 13 === 0 ? 'b' : 'T'));
export const RUBBLE = art(surface((x, y) => {
  const stoneX = (x + (Math.floor(y / 5) % 2) * 3) % 7;
  return y % 5 === 0 || stoneX === 0 ? 'T' : y % 5 === 1 ? 'w' : 'b';
}));
export const RIVER = art(...[0, 1].map(frame => surface((x, y) =>
  (x + frame * 4 + y * 2) % 13 < 4 && y % 4 === 0 ? 'c' : 'C')));
export const PLANK = art(surface((x, y) => y % 4 === 0 ? 'T' : x === 2 || x === 13 ? 'k' : 't'));
export const TENT = art(surface((x, y) => {
  if (x < 8 - y / 2 || x > 8 + y / 2) return 't';
  return x > 6 && x < 10 && y > 7 ? 'T' : x < 8 ? 'w' : 'b';
}));
export const ASH = art([
  '................','.....TTTT.......','....TssssT......','....kyyyyk......',
  '....kskssk......','.....ssss.......','....tttttt......','...tttTtttt..bb.',
  '..ttttTtttt.bbb.','..ssttTttss..T..','....ttTtt....T..','....ttttt....T..',
  '....TT.TT....T..','....TT.TT....T..','...kkk.kkk......','................',
]);
export const KIT = art([
  '................','................','.....GGGG.......','....GGGGGGG.....',
  '.....sssss......','.....sksks......','......sss.......','.....ggggg......',
  '....ggggggg.....','...ttgggggtt....','...ttgggggtt....','.....TTTTT......',
  '.....TT.TT......','....kkk.kkk.....','................','................',
]);
export const CRACK = art(surface((x, y) => {
  const seam = 7 + Math.floor(y / 3) % 3;
  return x === seam ? 'w' : Math.abs(x - seam) < 2 ? 'k' : y % 5 === 0 ? 'T' : 'b';
}));
export const QUARRY_GATE = art(surface((x, y) =>
  y < 4 || x < 4 || x > 11 ? (y % 4 === 0 ? 'T' : 'b') : '.'));
export const DUST = art(surface((x, y) =>
  (x - 8) ** 2 + (y - 8) ** 2 < 48 && (x * 3 + y * 7) % 5 < 2 ? 'w' : '.'));

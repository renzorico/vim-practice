export const TILE_SIZE = 16;
export const TILE_SCALE = 3;
export const BUFFER_NAME = '.folio.txt.swp';
export const BACKGROUND = '#182523';

const PALETTE: Readonly<Record<string, number>> = {
  grass: 0x547650, stone: 0xa7b1a0, tree: 0x294a39,
  'save-stone': 0xe9c86b, door: 0xae7245, water: 0x376b89,
  thorns: 0xb66b6a, unknown: 0xaf70a4, player: 0xffe8b2,
  blot: 0x5d425f, sign: 0xcba479, dot: 0xe9c86b,
};

export function spriteColor(key: string): number {
  return PALETTE[key] ?? 0xaf70a4;
}

export function edgeColor(color: number): number {
  return ((color & 0xfefefe) >>> 1);
}

import type { WorldId } from '@escape/world';

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


/** Twelve pigments per place. Foreground roles are checked against all four ground variants. */
export interface WorldPalette {
  readonly ground: number; readonly grain: number; readonly light: number; readonly shade: number;
  readonly water: number; readonly foam: number; readonly wall: number; readonly face: number;
  readonly road: number; readonly accent: number; readonly ink: number; readonly paper: number;
}
function pigments(ground: number, grain: number, light: number, shade: number, water: number,
  foam: number, wall: number, face: number, road: number, accent: number): WorldPalette {
  return { ground, grain, light, shade, water, foam, wall, face, road, accent, ink: 0x171b24, paper: 0xf6efd4 };
}
export const WORLD_PALETTES: Readonly<Record<WorldId, WorldPalette>> = {
  margin: pigments(0x55794f, 0x5e8357, 0x668a5e, 0x34503a, 0x3f7390, 0xd1ddd0, 0xc9a888, 0x7c5946, 0xa58a62, 0xffe3a4),
  lowlands: pigments(0xc6c5a4, 0xbcbf9d, 0xd7d0ad, 0x777d62, 0x2f5a78, 0xc9dce0, 0xaebabf, 0x647684, 0x8f979c, 0x303b2d),
  quarry: pigments(0x8a6a48, 0x93724e, 0x9a7853, 0x5a422d, 0x3c6f82, 0xd4dfca, 0xd0a773, 0x7a573b, 0xa9834f, 0xffe4a8),
  wordwood: pigments(0x4c7048, 0x537950, 0x5c8358, 0x2f4a33, 0x35686c, 0xc0dcc4, 0x8a9566, 0x4b6042, 0x86805a, 0xe2f0b4),
  'copper-port': pigments(0x856a62, 0x8d726a, 0x947a70, 0x51403d, 0x345e76, 0xc4d6d6, 0xc98a63, 0x6f4d40, 0xa5775f, 0xffe6c8),
  library: pigments(0x846c54, 0x8c745b, 0x937b62, 0x52422f, 0x4d6d7a, 0xdcd2b7, 0xc9ac80, 0x77593f, 0xa58659, 0xffe6b4),
  'echo-caves': pigments(0x6a6588, 0x726d90, 0x7a7598, 0x443f5c, 0x45588a, 0xd2d7ed, 0xa5a1c4, 0x5e5980, 0x837ca0, 0xece2ff),
  'last-page': pigments(0xeee8d6, 0xe8e1cf, 0xf6efd4, 0xdcd5c4, 0xb5c3c5, 0xfaf7eb, 0x7c7a70, 0x575b58, 0xb7b4a5, 0x242931),
};
export function contrastRatio(a: number, b: number): number {
  const luminance = (color: number): number => {
    const channels = [color >>> 16 & 255, color >>> 8 & 255, color & 255].map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const first = luminance(a); const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

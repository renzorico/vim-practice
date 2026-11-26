import type { Position } from '@escape/engine';
import type { Legend } from '@escape/world';
import { tileAtCoordinates } from './edges.js';
import type { PixelRect } from './art.js';

export type ChasmBanks = readonly [number, number, number, number];
/** Distances to rock/land in tiles, capped beyond the three-tile depth falloff. */
export function chasmBanks(rows: readonly string[], at: Position, legend: Legend): ChasmBanks {
  const distance = (dy: number, dx: number): number => {
    for (let step = 1; step < 5; step++) {
      if (tileAtCoordinates(rows, at.line + dy * step, at.col + dx * step, legend)?.sprite !== 'chasm') return step;
    }
    return 5;
  };
  return [distance(-1, 0), distance(0, 1), distance(1, 0), distance(0, -1)];
}
/** Continuous depth across cell joins; no grain, specks or repeated horizontal bands. */
export function chasmArt(banks: ChasmBanks): readonly PixelRect[] {
  const pixels: PixelRect[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const distance = Math.min((banks[0] - 1) * 16 + y + 0.5, banks[1] * 16 - x - 0.5,
      banks[2] * 16 - y - 0.5, (banks[3] - 1) * 16 + x + 0.5);
    const fade = Math.max(0, 1 - distance / 48);
    const red = Math.round(11 + 29 * fade); const green = Math.round(11 + 24 * fade); const blue = Math.round(18 + 22 * fade);
    pixels.push({ x, y, width: 1, height: 1, color: red << 16 | green << 8 | blue, alpha: 1 });
  }
  return pixels;
}

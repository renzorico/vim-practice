import type { PixelRect } from './art.js';
import { positionHash } from './life.js';

/** Zero-based buffer coordinates; inclusive columns. Presentation only. */
export const ERASED_ROWS = [{ stage: 'margin', line: 8, from: 1, to: 16 }] as const;
export function erasedColumn(stage: string, line: number, col: number): number | undefined {
  const strip = ERASED_ROWS.find(row => row.stage === stage && row.line === line && col >= row.from && col <= row.to);
  return strip ? col - strip.from : undefined;
}
export function erasedArt(column: number): readonly PixelRect[] {
  const pixels: PixelRect[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: number, alpha = 1): void => {
    pixels.push({ x, y, width, height, color, alpha });
  };
  for (let x = 0; x < 16; x++) {
    const tear = positionHash(column, Math.floor(x / 3));
    const top = tear % 3; const bottom = (tear >>> 3) % 3;
    rect(x, top, 1, 16 - top - bottom, 0xf6efd4);
    rect(x, top, 1, 1, 0xd3c8aa, 0.6);
  }
  // A lost home's roof, front wall and one door, across buffer columns 6–9.
  if (column >= 5 && column <= 8) {
    const offset = (column - 5) * 16;
    for (let x = 0; x < 16; x++) {
      const global = offset + x;
      const roof = Math.round(2 + Math.abs(global - 31.5) / 8);
      rect(x, roof, 1, 1, 0x6e695c, 0.23);
      if (global === 3 || global === 60 || global === 28 || global === 36) rect(x, 8, 1, 6, 0x6e695c, 0.23);
      if (global >= 28 && global <= 36) rect(x, 8, 1, 1, 0x6e695c, 0.23);
    }
  }
  if (column === 0) for (let x = 3; x < 13; x++) rect(x, 7 + Math.round(Math.sin((x - 3) * Math.PI / 5)), 1, 1, 0x594f40, 0.65);
  return pixels;
}

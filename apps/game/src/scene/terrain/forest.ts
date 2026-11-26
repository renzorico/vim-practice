import type { Legend, WorldId } from '@escape/world';
import { tileAtCoordinates } from './edges.js';
import { positionHash } from './life.js';
import { WORLD_PALETTES } from '../palette.js';
import type { PixelRect } from './art.js';

/** Connected tree neighbours: top, right, bottom, left. Finite art keys, never coordinates. */
/** With forest outside the map, crowns at its left and right edges join it. */
export function treeMask(rows: readonly string[], line: number, col: number, legend: Legend, forestOutside = false): number {
  const outside = (column: number): boolean => forestOutside && (column < 0 || column >= (rows[line]?.length ?? 0));
  return [[-1, 0], [0, 1], [1, 0], [0, -1]].reduce((mask, [dy = 0, dx = 0], side) =>
    dx !== 0 && outside(col + dx) || tileAtCoordinates(rows, line + dy, col + dx, legend)?.sprite === 'tree' ? mask | 1 << side : mask, 0);
}
export function treeVariant(line: number, col: number): number { return positionHash(line, col) % 3; }
interface Leaves { readonly light: number; readonly mid: number; readonly dark: number; readonly line: number }
const TRUNK = 0x6b4a33;
const TRUNK_SHADE = 0x4b3425;
const LEAVES: Readonly<Partial<Record<WorldId, Leaves>>> = {
  margin: { light: 0x6f9a58, mid: 0x47734a, dark: 0x345a40, line: 0x223f31 },
  lowlands: { light: 0xb3b883, mid: 0x8d9563, dark: 0x717a53, line: 0x545c42 },
  wordwood: { light: 0x638d4c, mid: 0x3c683f, dark: 0x2a4f37, line: 0x1a3529 },
};
function leavesOf(world: WorldId): Leaves {
  const palette = WORLD_PALETTES[world];
  return LEAVES[world] ?? { light: palette.light, mid: palette.ground, dark: palette.shade, line: palette.ink };
}
/** One of the crown's four tones at a pixel of the full tree, or undefined outside its scalloped edge. */
function crownTone(x: number, y: number, variant: number): keyof Leaves | undefined {
  const dx = x - 7.5; const dy = y - 8.5;
  const reach = (dx / 8.2) ** 2 + (dy / 8.8) ** 2;
  const edge = 1 + 0.09 * Math.sin(Math.atan2(dy, dx) * 7 + variant * 2);
  if (reach > edge) return undefined;
  if (reach > edge * 0.86) return 'line';
  // Light falls from the top left; leaf clumps two pixels wide break the bands.
  const leaf = positionHash((y >> 1) + variant * 19, (x >> 1) + variant * 7) % 5 - 2;
  const lit = -dx * 0.5 - dy * 0.9 + leaf * 0.9;
  return lit > 4 ? 'light' : lit > -2.2 ? 'mid' : 'dark';
}
/** Coordinates describe the full 16x24 tree, with its crown eight pixels above the cell. */
export function treeArt(world: WorldId, mask: number, variant: number, top = false): readonly PixelRect[] {
  const leaves = leavesOf(world);
  const pixels: PixelRect[] = [];
  for (let y = top ? 0 : 8; y < (top ? 8 : 24); y++) for (let x = 0; x < 16; x++) {
    const tone = crownTone(x, y, variant);
    const beside = Boolean(mask & (x < 8 ? 8 : 2));
    const joined = beside && y >= 6 && y < 18 || Boolean(mask & 4) && y >= 12 && (beside || x >= 2 && x < 14);
    const trunk = !(mask & 4) && y >= 15 && y < 23 && x >= 6 && x < 10;
    const color = tone ? leaves[tone] : joined ? leaves.line : trunk ? (x < 7 || y < 18 ? TRUNK_SHADE : TRUNK) : undefined;
    if (color !== undefined) pixels.push({ x, y: top ? y : y - 8, width: 1, height: 1, color, alpha: 1 });
  }
  return pixels;
}
/** A cell of endless canopy. Odd rows stand half a crown aside, so no column of trees repeats. */
export function canopyArt(world: WorldId, variant: number, oddRow: boolean): readonly PixelRect[] {
  const leaves = leavesOf(world);
  const pixels: PixelRect[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const shift = (odd: boolean): number => (x + (odd ? 8 : 0)) % 16;
    const front = crownTone(shift(!oddRow), y - 8, variant);
    const tone = front ?? crownTone(shift(oddRow), y + 8, variant);
    pixels.push({ x, y, width: 1, height: 1, color: tone ? leaves[tone] : leaves.line, alpha: 1 });
  }
  return pixels;
}

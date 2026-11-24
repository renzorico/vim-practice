import type { Position } from '@escape/engine';
import type { WorldId } from '@escape/world';
import type { PixelRect } from './art.js';
import { WORLD_PALETTES } from '../palette.js';

export type Surrounding = 'sea' | 'strata' | 'forest' | 'brick' | 'books' | 'cave' | 'paper' | 'meadow';
export function surroundingFor(world: WorldId, place: string): Surrounding {
  if (place === 'lighthouse' || place === 'jetty') return 'sea';
  if (world === 'lowlands') return 'meadow';
  if (world === 'quarry') return 'strata';
  if (world === 'wordwood' || world === 'margin') return 'forest';
  if (world === 'copper-port') return place === 'harbour' || place === 'port' ? 'sea' : 'brick';
  if (world === 'library') return 'books';
  return world === 'last-page' ? 'paper' : 'cave';
}
export interface ViewBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export function mapContains(rows: readonly string[], line: number, col: number, emptyRow = false): boolean {
  const row = rows[line];
  return row !== undefined && col >= 0 && col < Math.max(emptyRow ? 1 : 0, row.length);
}
/** Only viewport-intersecting cells; ragged gaps are exterior too. No walkable tiles are reused. */
export function surroundingCells(rows: readonly string[], view: ViewBounds, emptyRow = false): readonly Position[] {
  const cells: Position[] = [];
  for (let line = Math.floor(view.top / 16); line < Math.ceil(view.bottom / 16); line++) {
    for (let col = Math.floor(view.left / 16); col < Math.ceil(view.right / 16); col++) {
      if (!mapContains(rows, line, col, emptyRow)) cells.push({ line, col });
    }
  }
  return cells;
}
/** New non-walkable silhouettes, blended 45% toward the background at texture creation. */
export function surroundingArt(kind: Surrounding, world: WorldId, variant: number, phase = 0, fade = 0): readonly PixelRect[] {
  const palette = WORLD_PALETTES[world];
  const mix = (color: number): number => {
    let result = 0;
    for (const shift of [0, 8, 16]) result |= Math.round(((color >>> shift) & 255) * 0.55 + ((0x182523 >>> shift) & 255) * 0.45) << shift;
    return result;
  };
  const rects: PixelRect[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: number, alpha = 1): void => {
    rects.push({ x, y, width, height, color: mix(color), alpha });
  };
  if (kind === 'paper') return [{ x: 0, y: 0, width: 16, height: 16, color: palette.paper, alpha: 1 }];
  if (kind === 'meadow') {
    let color = 0;
    for (let shift = 0; shift <= 16; shift += 8) color |= Math.round((palette.ground >>> shift & 255) * (1 - fade / 4)
      + (palette.paper >>> shift & 255) * fade / 4) << shift;
    return [{ x: 0, y: 0, width: 16, height: 16, color, alpha: 1 },
      { x: 3 + variant * 2, y: 10, width: 1, height: 3, color: palette.shade, alpha: 0.18 * (1 - fade / 4) }];
  }
  rect(0, 0, 16, 16, kind === 'sea' ? palette.water : palette.shade);
  if (kind === 'sea' && variant === 0) { rect(2 + phase * 2, 7, 5, 1, palette.foam, 0.22); rect(6 + phase * 2, 6, 3, 1, palette.foam, 0.14); }
  if (kind === 'strata' || kind === 'cave') {
    rect(0, 3 + variant, 16, 3, palette.face); rect(0, 10, 16, 1, palette.ink);
    rect(3 + variant * 3, 6, 2, 4, palette.ink, 0.4);
  }
  if (kind === 'forest') {
    rect(6, 0, 4, 16, palette.ink); rect(0, 0, 16, 5, palette.face);
    rect(2 + variant, 4, 10, 3, palette.shade); rect(8, 9, 8, 2, palette.ink, 0.5);
  }
  if (kind === 'brick') {
    rect(0, 7, 16, 1, palette.ink); rect(7 + variant, 0, 1, 7, palette.ink);
    rect(0, 14, 16, 2, palette.face); if (variant === 0) rect(1, 0, 3, 16, palette.ink);
  }
  if (kind === 'books') {
    rect(0, 14, 16, 2, palette.face); rect(0, 0, 2, 16, palette.ink);
    for (let x = 3; x < 15; x += 3) rect(x, 2 + (x + variant) % 3, 2, 10, x % 2 ? palette.wall : palette.road, 0.65);
  }
  return rects;
}
export function glowStrength(elapsed: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : 1 + 0.04 * Math.sin(elapsed * Math.PI / 1000);
}
export const GLOW_SPRITES = new Set(['lamp-lit', 'lamp', 'glade-lamp-lit', 'save-stone', 'crystal-lit', 'window']);
export { TALL_SPRITES } from '../sprites/tall.js';
import { TALL_SPRITES } from '../sprites/tall.js';
export function overhangVisible(sprite: string, above: string | undefined, showSource: boolean): boolean {
  return !showSource && TALL_SPRITES.has(sprite) && !TALL_SPRITES.has(above ?? '');
}

export function mapExtent(authored: readonly string[], live: readonly string[], emptyRow = false): readonly string[] {
  return Array.from({ length: Math.max(authored.length, live.length) }, (_, line) =>
    ' '.repeat(Math.max(emptyRow ? 1 : 0, authored[line]?.length ?? 0, live[line]?.length ?? 0)));
}

/** Project the wiped strip beyond tree borders, with four finite fade levels into paper. */
export function meadowFades(authored: readonly string[]): readonly number[] {
  const width = Math.max(0, ...authored.map(row => row.length));
  const wiped = Array.from({ length: width }, (_, col) => authored.some(row => row[col] === '\t'));
  return wiped.map((blank, col) => {
    if (!blank) return 0;
    for (let distance = 1; distance < 4; distance++) {
      if (wiped[col - distance] === false || wiped[col + distance] === false) return distance;
    }
    return 4;
  });
}

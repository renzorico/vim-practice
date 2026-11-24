import type { Position } from '@escape/engine';
import type { WorldId } from '@escape/world';
import type { PixelRect } from './art.js';
import { canopyArt } from './forest.js';
import { positionHash } from './life.js';
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
    // Joined crowns fill every seam. Three leaf patterns, three distance steps.
    for (const pixel of canopyArt(world, variant % 3, variant >= 3)) rect(pixel.x, pixel.y, pixel.width, pixel.height, pixel.color);
    rect(0, 0, 16, 16, palette.ink, 0.3 + fade * 0.14);
  }
  if (kind === 'brick') {
    rect(0, 7, 16, 1, palette.ink); rect(7 + variant, 0, 1, 7, palette.ink);
    rect(0, 14, 16, 2, palette.face); if (variant === 0) rect(1, 0, 3, 16, palette.ink);
  }
  if (kind === 'books') {
    const arrangement = Math.floor(variant / 16); const xCell = variant % 4; const yCell = Math.floor(variant / 4) % 4;
    const shelfWidth = 2 + arrangement % 3;
    const gap = xCell >= shelfWidth;
    if (!gap) {
      rect(0, 0, 16, 16, palette.face, 0.32);
      rect(0, 14, 16, 2, palette.road, 0.65);
      if (xCell === 0 || xCell === shelfWidth - 1) rect(xCell === 0 ? 0 : 15, 0, 1, 16, palette.ink, 0.6);
      for (let x = 2; x < 15; x += 3) {
        const height = 6 + (x + yCell * 3 + arrangement) % 6;
        rect(x, 14 - height, 2, height, (x + yCell) % 2 ? palette.wall : palette.road, 0.38);
      }
      if (arrangement === 2 && xCell === 1) {
        rect(4, 0, 1, 16, palette.wall, 0.55); rect(11, 0, 1, 16, palette.wall, 0.55);
        for (let y = 3; y < 16; y += 5) rect(5, y, 6, 1, palette.wall, 0.55);
      }
    } else if (arrangement === 1 && yCell === 1) {
      rect(7, 5, 1, 11, palette.road, 0.5); rect(4, 3, 7, 4, palette.light, 0.25);
    }
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
  // Crowns overlap the tree behind them; any other tall thing would show a doubled top.
  const covered = TALL_SPRITES.has(above ?? '') && !(sprite === 'tree' && above === 'tree');
  return !showSource && TALL_SPRITES.has(sprite) && !covered;
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

/** Books share a 4x4 layout: variable shelf spans, breathing gaps, ladders and lamps. */
export function surroundingVariant(kind: Surrounding, line: number, col: number): number {
  if (kind === 'books') {
    const blockLine = Math.floor(line / 4); const blockCol = Math.floor(col / 4);
    // Adjacent blocks have opposite parity, so even hash collisions cannot repeat a room.
    const arrangement = (positionHash(blockLine, blockCol) % 2) * 2 + ((blockLine + blockCol) & 1);
    return arrangement * 16 + ((line % 4 + 4) % 4) * 4 + (col % 4 + 4) % 4;
  }
  if (kind === 'forest') return positionHash(line, col) % 3 + (line & 1) * 3;
  return positionHash(line, col) % 4;
}
export function forestDistance(rows: readonly string[], line: number, col: number): number {
  const width = Math.max(0, ...rows.map(row => row.length));
  return Math.min(2, Math.max(0, -line - 1, line - rows.length, -col - 1, col - width));
}

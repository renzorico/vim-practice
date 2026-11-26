import type { WorldId } from '@escape/world';
import { WORLD_PALETTES } from '../palette.js';
import type { TerrainEdges } from './edges.js';

export interface PixelRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: number; readonly alpha: number }
export function terrainArt(edges: TerrainEdges, world: WorldId, variant: number, _decorated: boolean, phase: number, chasm = false): readonly PixelRect[] {
  const palette = WORLD_PALETTES[world];
  const pixels: PixelRect[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: number, alpha = 1): void => {
    pixels.push({ x, y, width, height, color, alpha });
  };
  const side = (mask: number, thickness: number, color: number, alpha = 1): void => {
    if (mask & 1) rect(0, 0, 16, thickness, color, alpha);
    if (mask & 2) rect(16 - thickness, 0, thickness, 16, color, alpha);
    if (mask & 4) rect(0, 16 - thickness, 16, thickness, color, alpha);
    if (mask & 8) rect(0, 0, thickness, 16, color, alpha);
  };
  if (edges.group === 'open' && chasm) {
    // The drop gets rock lips only where land meets it, with an unbroken dark centre.
    side(edges.mask & 15, 3, palette.face, 0.55);
    side(edges.mask & 15, 1, palette.wall, 0.7);
  }
  if (edges.group === 'water') {
    rect(0, 0, 16, 16, palette.water, 0.75);
    side(edges.mask & 15, 1, palette.foam, 0.55);
    rect(3 + phase * 4, 7, 4, 1, palette.foam, 0.4);
    // A second, broken line of foam drifts just off the shore; reduced motion freezes phase zero.
    for (let pixel = 1 + phase * 3; pixel < 14; pixel += 7) {
      if (edges.mask & 1) rect(pixel, 2, 3, 1, palette.foam, 0.3);
      if (edges.mask & 2) rect(13, pixel, 1, 3, palette.foam, 0.3);
      if (edges.mask & 4) rect(pixel, 13, 3, 1, palette.foam, 0.3);
      if (edges.mask & 8) rect(2, pixel, 1, 3, palette.foam, 0.3);
    }
  }
  if (edges.group === 'wall' || edges.group === 'roof') {
    if (edges.mask & 1) rect(0, 0, 16, 4, palette.wall);
    if (edges.mask & 4) {
      rect(0, 11, 16, 5, palette.face);
      rect(0, 11, 16, 1, palette.shade);
    }
    if (edges.mask & 8) rect(0, 4, 1, 7, palette.wall);
    if (edges.mask & 2) rect(15, 4, 1, 7, palette.shade);
  }
  if (edges.group === 'road') {
    for (let pixel = 0; pixel < 16; pixel++) {
      const width = (pixel + variant * 3) % 5 === 0 ? 2 : 1;
      if (edges.mask & 1) rect(pixel, 0, 1, width, palette.shade, 0.7);
      if (edges.mask & 4) rect(pixel, 16 - width, 1, width, palette.shade, 0.7);
      if (edges.mask & 8) rect(0, pixel, width, 1, palette.shade, 0.7);
      if (edges.mask & 2) rect(16 - width, pixel, width, 1, palette.shade, 0.7);
    }
  }
  // A concave join closes diagonal pinholes without rounding a solid interior tile.
  for (const [index, x, y] of [[4, 0, 0], [5, 15, 0], [6, 15, 15], [7, 0, 15]] as const) {
    if (edges.group === 'road' && edges.mask & (1 << index)) rect(x, y, 1, 1, palette.shade);
  }
  // Ink separates low-contrast obstacle fills from the surrounding ground.
  if (edges.group === 'water' || edges.group === 'wall' || edges.group === 'roof') side(edges.mask & 15, 1, palette.ink);
  // Damp land: darker toward the water, so the bank reads as a place to stand.
  side(edges.shore, 3, palette.shade, 0.35);
  side(edges.shore, 1, palette.shade, 0.6);
  if (edges.posts) { rect(1, 10, 2, 6, palette.face); rect(13, 10, 2, 6, palette.face); rect(1, 9, 2, 1, palette.wall); rect(13, 9, 2, 1, palette.wall); }
  if (edges.cast) { rect(0, 0, 16, 2, palette.ink, 0.28); rect(0, 2, 16, 1, palette.ink, 0.12); }
  return pixels;
}

/** Ground cells own this texture; transparent objects use an undecorated copy underneath. */
export function groundArt(world: WorldId, variant: number, decorated = false): readonly PixelRect[] {
  const palette = WORLD_PALETTES[world];
  const pixels: PixelRect[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: number, alpha = 1): void => {
    pixels.push({ x, y, width, height, color, alpha });
  };
  rect(0, 0, 16, 16, palette.ground);
  if (world === 'last-page') return [{ x: 0, y: 0, width: 16, height: 16, color: palette.paper, alpha: 1 }];
  // Quiet, sparse surface grain: four arrangements, never an obstacle silhouette.
  rect(2 + variant * 3, 4 + variant % 2 * 6, 2, 1, palette.grain);
  rect(12 - variant * 2, 12 - variant, 1, 1, palette.light, 0.35);
  if (decorated) {
    // Every motif fits in a five-pixel band and contains no text or Vim glyphs.
    if (world === 'margin') {
      rect(5, 10, 1, 4, palette.light); rect(4, 10, 3, 1, palette.accent); rect(10, 12, 1, 2, palette.light);
    } else if (world === 'wordwood') {
      rect(5, 11, 1, 3, palette.wall); rect(3, 10, 5, 2, palette.road); rect(10, 13, 3, 1, palette.light);
    } else if (world === 'library') {
      rect(4, 10, 5, 4, palette.wall); rect(5, 11, 3, 1, palette.face);
    } else if (world === 'copper-port') {
      rect(3, 11, 6, 1, palette.road); rect(3, 12, 1, 2, palette.road); rect(4, 13, 5, 1, palette.road); rect(11, 12, 3, 1, palette.water);
    } else if (world === 'echo-caves') {
      rect(5, 10, 1, 4, palette.light); rect(6, 12, 2, 2, palette.wall);
    } else if (world === 'lowlands') {
      rect(5, 10, 1, 4, 0x94966c); rect(4, 11, 1, 2, 0xa7a47b); rect(8, 12, 1, 2, 0x94966c);
    } else if (world === 'quarry') {
      rect(4, 12, 3, 2, palette.face); rect(9, 11, 2, 1, palette.wall);
    }
  }
  return pixels;
}

/** Soft oval assembled from translucent pixel bands; texture is shared by every actor. */
export function shadowArt(): readonly PixelRect[] {
  return [
    { x: 2, y: 10, width: 12, height: 4, color: 0x10141d, alpha: 0.1 },
    { x: 3, y: 9, width: 10, height: 6, color: 0x10141d, alpha: 0.1 },
    { x: 4, y: 10, width: 8, height: 4, color: 0x10141d, alpha: 0.18 },
  ];
}

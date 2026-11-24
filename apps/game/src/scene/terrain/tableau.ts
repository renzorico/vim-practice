import type { Legend, WorldId } from '@escape/world';
import { SPRITES } from '../sprites/index.js';
import { overhangArt, paletteColor } from '../sprites/tall.js';
import { groundArt, type PixelRect } from './art.js';
import { buildingArt, findBuildings } from './buildings.js';
import { tileAtCoordinates } from './edges.js';
import { treeArt, treeMask, treeVariant } from './forest.js';
import { groundVariant } from './life.js';
import { villageDecoration, wornCells, wearArt } from './village.js';

export const TABLEAU_TILE = 16;
/** The part of a canvas context a tableau needs: filled rectangles. */
export interface Brush { fillStyle: string | CanvasGradient | CanvasPattern; globalAlpha: number; fillRect(x: number, y: number, width: number, height: number): void }
const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export function paintPixels(brush: Brush, pixels: readonly PixelRect[], x: number, y: number): void {
  for (const pixel of pixels) {
    brush.globalAlpha = pixel.alpha;
    brush.fillStyle = hex(pixel.color);
    brush.fillRect(x + pixel.x, y + pixel.y, pixel.width, pixel.height);
  }
  brush.globalAlpha = 1;
}
export function paintSprite(brush: Brush, name: string, x: number, y: number, tint?: string): void {
  const art = SPRITES[name];
  art?.frames[0]?.forEach((row, line) => [...row].forEach((pixel, col) => {
    const color = paletteColor(art.palette[pixel]);
    if (color === undefined) return;
    brush.fillStyle = tint ?? hex(color);
    brush.fillRect(x + col, y + line, 1, 1);
  }));
}
/**
 * A still picture of map rows, drawn with the field's own art, for screens without Phaser.
 * `bleed`: crowns of the first row stand above the picture (a horizon) instead of being cut at its edge.
 */
export function paintTableau(brush: Brush, rows: readonly string[], legend: Legend, world: WorldId, left: number, top: number, bleed = false): void {
  const buildings = findBuildings(rows, legend);
  const worn = wornCells(rows, legend, buildings);
  const at = (line: number, col: number): { readonly x: number; readonly y: number } => ({ x: left + col * TABLEAU_TILE, y: top + line * TABLEAU_TILE });
  // Ground first, so a crown or a roof never loses to the next cell's grass.
  rows.forEach((row, line) => [...row].forEach((_, col) => {
    const tile = tileAtCoordinates(rows, line, col, legend);
    const { x, y } = at(line, col);
    const variant = groundVariant(line, col);
    paintPixels(brush, groundArt(world, variant, villageDecoration(rows, legend, line, col)), x, y);
    if (tile?.sprite === 'road') paintSprite(brush, 'road', x, y);
    else if (tile?.kind === 'ground' && worn.has(`${line}:${col}`)) paintPixels(brush, wearArt(variant, false), x, y);
  }));
  for (const building of buildings) for (let row = 0; row < building.height; row++) for (let col = 0; col < building.width; col++) {
    const { x, y } = at(building.line + row, building.col + col);
    paintPixels(brush, buildingArt(building, row, col), x, y);
  }
  rows.forEach((row, line) => [...row].forEach((_, col) => {
    const sprite = tileAtCoordinates(rows, line, col, legend)?.sprite;
    if (!sprite) return;
    const { x, y } = at(line, col);
    if (sprite === 'tree') {
      const mask = treeMask(rows, line, col, legend, true);
      const variant = treeVariant(line, col);
      paintPixels(brush, treeArt(world, mask, variant), x, y);
      if (bleed || line > 0) paintPixels(brush, treeArt(world, mask, variant, true), x, y - TABLEAU_TILE / 2);
    } else if (sprite === 'well' || sprite === 'save-stone') {
      paintSprite(brush, sprite, x, y);
      paintPixels(brush, overhangArt(sprite), x, y - TABLEAU_TILE / 2);
    }
  }));
}

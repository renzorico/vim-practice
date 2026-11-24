import type { Legend, Stage } from '@escape/world';
import { SPRITES } from '../sprites/index.js';
import { overhangArt, paletteColor, TALL_SPRITES } from '../sprites/tall.js';
import { DARK_STAGES } from '../darkness.js';
import { WORLD_PALETTES } from '../palette.js';
import { groundArt, terrainArt, type PixelRect } from './art.js';
import { surroundingFor } from './atmosphere.js';
import { buildingArt, buildingAt, findBuildings } from './buildings.js';
import { chasmArt, chasmBanks } from './chasm.js';
import { edgesFor, terrainGroup, tileAt } from './edges.js';
import { erasedArt, erasedColumn } from './erased.js';
import { treeArt, treeMask, treeVariant } from './forest.js';
import { decorationAt, groundVariant, positionHash } from './life.js';
import { outlineArt } from './outline.js';
import { replacesGround, substrate, surface } from './surfaces.js';
import { paintPixels, TABLEAU_TILE, type Brush } from './tableau.js';

/** A window of a map, in cells. */
export interface PictureWindow { readonly line: number; readonly col: number; readonly rows: number; readonly cols: number }
/** Legend names that the field draws with another sprite. */
const FIELD_SPRITE: Readonly<Record<string, string>> = { fern: 'fern-fronds', dust: 'library-dust', 'echo-rune': 'cave-floor' };

/** The window of `rows` by `cols` cells that holds the stage's start, kept inside the map. */
export function pictureWindow(stage: Stage, rows: number, cols: number): PictureWindow {
  const width = Math.max(...stage.map.map(row => row.length));
  const clamp = (value: number, limit: number): number => Math.max(0, Math.min(limit, value));
  return { rows, cols, line: clamp(stage.start.line - Math.floor(rows / 2), stage.map.length - rows),
    col: clamp(stage.start.col - Math.floor(cols / 3), width - cols) };
}
function paintArt(brush: Brush, name: string, frame: number, x: number, y: number): void {
  const art = SPRITES[name];
  const rows = art?.frames[frame] ?? art?.frames[0];
  rows?.forEach((row, line) => [...row].forEach((pixel, col) => {
    const color = paletteColor(art?.palette[pixel]);
    if (color === undefined) return;
    brush.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    brush.fillRect(x + col, y + line, 1, 1);
  }));
}
/** A still of a stage as it begins, drawn with the field's art, for screens without Phaser. */
export function paintStage(brush: Brush, stage: Stage, legend: Legend, view: PictureWindow): void {
  const { world, map: rows } = stage;
  const palette = WORLD_PALETTES[world];
  const forest = surroundingFor(world, stage.id) === 'forest';
  const buildings = findBuildings(rows, legend);
  const place = (line: number, col: number): { readonly x: number; readonly y: number } => ({
    x: (col - view.col) * TABLEAU_TILE, y: (line - view.line) * TABLEAU_TILE });
  const fill = (color: number): PixelRect => ({ x: 0, y: 0, width: TABLEAU_TILE, height: TABLEAU_TILE, color, alpha: 1 });
  const floor = (name: string, variant: number, x: number, y: number): void => {
    if (name === 'paper' || surface(name) === 'paper') paintPixels(brush, [fill(palette.paper)], x, y);
    else if (surface(name) === 'natural') paintPixels(brush, groundArt(world, variant), x, y);
    else paintArt(brush, name, 0, x, y);
  };
  const eachCell = (visit: (line: number, col: number) => void): void => {
    for (let line = view.line; line < view.line + view.rows; line++) {
      for (let col = view.col; col < view.col + view.cols; col++) visit(line, col);
    }
  };
  eachCell((line, col) => {
    const at = { line, col };
    const tile = tileAt(rows, at, legend);
    const { x, y } = place(line, col);
    if (!tile || col >= (rows[line]?.length ?? 0)) { paintPixels(brush, [fill(palette.shade)], x, y); return; }
    const variant = groundVariant(line, col);
    const group = terrainGroup(tile);
    const building = buildingAt(buildings, line, col);
    if (group === 'object') floor(substrate(rows, at, legend), variant, x, y);
    if (building) { paintPixels(brush, buildingArt(building, line - building.line, col - building.col), x, y); return; }
    if (tile.sprite === 'tree') { paintPixels(brush, treeArt(world, treeMask(rows, line, col, legend, forest), treeVariant(line, col)), x, y); return; }
    const name = FIELD_SPRITE[tile.sprite] ?? tile.sprite;
    if (replacesGround(tile)) paintPixels(brush, groundArt(world, variant, decorationAt(tile, line, col)), x, y);
    else if (group === 'paper') paintPixels(brush, [fill(palette.paper)], x, y);
    else paintArt(brush, name, positionHash(line, col) % (SPRITES[name]?.frames.length ?? 1), x, y);
    const edges = edgesFor(rows, at, legend);
    const banks = tile.sprite === 'chasm' ? chasmBanks(rows, at, legend) : undefined;
    const erased = erasedColumn(stage.id, line, col);
    if (erased !== undefined && tile.walkable) paintPixels(brush, erasedArt(erased), x, y);
    paintPixels(brush, [...(banks ? chasmArt(banks) : []), ...terrainArt(edges, world, variant, false, 0, tile.sprite === 'chasm'),
      ...(group === 'object' ? outlineArt(SPRITES[name], palette.ink, 0) : [])], x, y);
  });
  eachCell((line, col) => {
    const sprite = tileAt(rows, { line, col }, legend)?.sprite ?? '';
    const { x, y } = place(line, col);
    if (sprite === 'tree') paintPixels(brush, treeArt(world, treeMask(rows, line, col, legend, forest), treeVariant(line, col), true), x, y - TABLEAU_TILE / 2);
    else if (TALL_SPRITES.has(sprite)) paintPixels(brush, overhangArt(sprite), x, y - TABLEAU_TILE / 2);
  });
  const actor = (name: string, line: number, col: number): void => {
    if (line < view.line || line >= view.line + view.rows || col < view.col || col >= view.col + view.cols) return;
    const { x, y } = place(line, col);
    paintArt(brush, name, 0, x, y);
    paintPixels(brush, outlineArt(SPRITES[name], palette.ink, 0), x, y);
    if (TALL_SPRITES.has(name)) paintPixels(brush, overhangArt(name), x, y - TABLEAU_TILE / 2);
  };
  for (const entity of stage.entities) actor(entity.sprite, entity.at.line, entity.at.col);
  actor('player', stage.start.line, stage.start.col);
  // A dark place shows only what its arrival would light: no map given away.
  if (!DARK_STAGES[stage.id]) return;
  eachCell((line, col) => {
    const distance = Math.hypot(line - stage.start.line, col - stage.start.col);
    const { x, y } = place(line, col);
    paintPixels(brush, [{ ...fill(0x05050a), alpha: Math.min(1, Math.max(0, (distance - 1) / 2.5)) }], x, y);
  });
}

import type { Legend } from '@escape/world';
import { tileAtCoordinates } from './edges.js';
import { positionHash } from './life.js';
import { buildingAt, type Building } from './buildings.js';
import type { PixelRect } from './art.js';

export function villageDecoration(rows: readonly string[], legend: Legend, line: number, col: number): boolean {
  const tile = tileAtCoordinates(rows, line, col, legend);
  if (!tile?.walkable || tile.kind !== 'ground') return false;
  let sheltered = false;
  for (const [dy, dx] of [[-1, 0], [0, -1], [0, 1]] as const) {
    const sprite = tileAtCoordinates(rows, line + dy, col + dx, legend)?.sprite;
    if (sprite === 'tree' || sprite === 'house-wall') sheltered = true;
  }
  return positionHash(line, col) % 100 < (sheltered ? 28 : 2);
}
/** A short route from each door/well to the nearest road, clipped to ground when drawn. */
export function wornCells(rows: readonly string[], legend: Legend, buildings: readonly Building[]): ReadonlySet<string> {
  const cells = new Set<string>(); const roads: { line: number; col: number }[] = [];
  const starts = buildings.map(building => ({ line: building.line + building.height, col: building.col + building.door }));
  for (let line = 0; line < rows.length; line++) for (let col = 0; col < (rows[line]?.length ?? 0); col++) {
    const tile = tileAtCoordinates(rows, line, col, legend);
    if (tile?.sprite === 'road') roads.push({ line, col });
    if (tile?.sprite === 'well') {
      starts.push({ line: line + 1, col });
      for (const [dy, dx] of [[-1, 0], [0, 1], [1, 0], [0, -1]] as const) cells.add(`${line + dy}:${col + dx}`);
    }
  }
  for (const start of starts) {
    let nearest = roads[0];
    for (const road of roads) if (!nearest || Math.abs(road.line - start.line) + Math.abs(road.col - start.col)
      < Math.abs(nearest.line - start.line) + Math.abs(nearest.col - start.col)) nearest = road;
    let { line, col } = start;
    cells.add(`${line}:${col}`); cells.add(`${line}:${col - 1}`); cells.add(`${line}:${col + 1}`);
    // Bounded by the map, never a pathfinding or world-rule decision.
    if (nearest) for (let step = 0; step < 24 && (line !== nearest.line || col !== nearest.col); step++) {
      if (line !== nearest.line) line += Math.sign(nearest.line - line); else col += Math.sign(nearest.col - col);
      cells.add(`${line}:${col}`);
    }
  }
  return cells;
}
const WORN = 0x9c8963;
/** Trodden earth: dense in the middle of the path, crumbs of it at the edges. */
export function wearArt(variant: number, shadow: boolean): readonly PixelRect[] {
  const pixels: PixelRect[] = [];
  for (let y = 2; y < 14; y++) for (let x = 0; x < 16; x++) {
    const off = Math.abs(y - 7.5) - 1;
    const keep = off <= 1 ? 92 : off <= 3 ? 64 : 24;
    if (positionHash(y * 3 + variant * 31, x * 5 + variant * 17) % 100 < keep) {
      pixels.push({ x, y, width: 1, height: 1, color: WORN, alpha: off <= 2 ? 0.42 : 0.3 });
    }
  }
  if (shadow) pixels.push({ x: 0, y: 0, width: 16, height: 3, color: 0x302c29, alpha: 0.25 });
  return pixels;
}
export function belowBuilding(buildings: readonly Building[], line: number, col: number): boolean {
  const building = buildingAt(buildings, line - 1, col);
  return building !== undefined && line === building.line + building.height;
}

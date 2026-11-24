import type { Position } from '@escape/engine';
import type { Legend, TileDef } from '@escape/world';

/** `paper` has no character at all (deleted); `open` is a character drawn as a drop or a blank by its own sprite. */
export type TerrainGroup = 'water' | 'wall' | 'roof' | 'road' | 'ground' | 'paper' | 'open' | 'object';
export function terrainGroup(tile: TileDef | undefined): TerrainGroup {
  if (!tile) return 'paper';
  if (/blank|void|air|chasm|clause-gap/.test(tile.sprite)) return 'open';
  if (/water|river/.test(tile.sprite)) return 'water';
  if (/roof/.test(tile.sprite)) return 'roof';
  if (/wall|bedrock|cave-rock|trunk|heartwood/.test(tile.sprite)) return 'wall';
  if (/road|path|plank|boards|jetty|ledge|platform|branch/.test(tile.sprite)) return 'road';
  return tile.kind === 'ground' ? 'ground' : 'object';
}
export function tileAt(rows: readonly string[], cell: Position, legend: Legend): TileDef | undefined {
  const row = rows[cell.line];
  if (row === '' && cell.col === 0) return legend.emptyRow;
  const char = row?.[cell.col];
  return char === undefined ? undefined : legend.tiles.find(tile => tile.char === char) ?? legend.fallback;
}
const NEIGHBOURS = [[-1, 0], [0, 1], [1, 0], [0, -1], [-1, -1], [-1, 1], [1, 1], [1, -1]] as const;
export interface TerrainEdges {
  readonly group: TerrainGroup;
  /** Bits: top, right, bottom, left, top-left, top-right, bottom-right, bottom-left. */
  readonly mask: number;
  /** Land borders that touch water; missing ragged cells are paper, never water. */
  readonly shore: number;
  readonly cast: boolean;
  readonly posts: boolean;
}
export function edgesFor(rows: readonly string[], cell: Position, legend: Legend): TerrainEdges {
  const tile = tileAt(rows, cell, legend);
  const group = terrainGroup(tile);
  let mask = 0;
  let shore = 0;
  for (const [index, [line, col]] of NEIGHBOURS.entries()) {
    const neighbour = terrainGroup(tileAt(rows, { line: cell.line + line, col: cell.col + col }, legend));
    if (neighbour !== group) mask |= 1 << index;
    if (index < 4 && neighbour === 'water' && group !== 'water' && group !== 'paper' && group !== 'open') shore |= 1 << index;
  }
  const above = terrainGroup(tileAt(rows, { line: cell.line - 1, col: cell.col }, legend));
  return { group, mask, shore, cast: group !== 'paper' && group !== 'open' && (above === 'wall' || above === 'roof'),
    posts: tile?.sprite === 'plank' && (shore !== 0 || (mask & 10) !== 0) };
}

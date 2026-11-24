import type { Position } from '@escape/engine';
import type { Legend, TileDef } from '@escape/world';

/** `paper` has no character at all (deleted); `open` is a character drawn as a drop or a blank by its own sprite. */
export type TerrainGroup = 'water' | 'wall' | 'roof' | 'road' | 'ground' | 'paper' | 'open' | 'object';
const OPEN = new Set(['blank', 'page-blank', 'page-void', 'air', 'chasm', 'clause-gap']);
const WATER = new Set(['water', 'river', 'port-water']);
const ROOF = new Set(['house-roof']);
const WALL = new Set(['house-wall', 'tower-wall', 'counter-wall', 'customs-wall', 'warehouse-wall',
  'reading-wall', 'library-wall', 'vault-wall', 'bedrock', 'cave-rock', 'trunk', 'heartwood']);
const ROAD = new Set(['road', 'path', 'plank', 'boards', 'jetty', 'ledge', 'crystal-ledge', 'platform', 'branch']);
const legends = new WeakMap<Legend, ReadonlyMap<string, TileDef>>();
function tilesFor(legend: Legend): ReadonlyMap<string, TileDef> {
  let tiles = legends.get(legend);
  if (!tiles) { tiles = new Map(legend.tiles.map(tile => [tile.char, tile])); legends.set(legend, tiles); }
  return tiles;
}
/** Text changes affect adjacent joins; inserted/removed rows shift every row below. */
export function changedTerrainRows(before: readonly string[] | undefined, after: readonly string[]): Set<number> {
  const changed = new Set<number>();
  for (let line = 0; line < Math.max(before?.length ?? 0, after.length); line++) {
    if (before?.[line] === after[line]) continue;
    const end = before && before.length !== after.length ? after.length - 1 : line + 1;
    for (let row = Math.max(0, line - 1); row <= Math.min(after.length - 1, end); row++) changed.add(row);
    if (before && before.length !== after.length) break;
  }
  return changed;
}
export function terrainGroup(tile: TileDef | undefined): TerrainGroup {
  if (!tile) return 'paper';
  if (OPEN.has(tile.sprite)) return 'open';
  if (WATER.has(tile.sprite)) return 'water';
  if (ROOF.has(tile.sprite)) return 'roof';
  if (WALL.has(tile.sprite)) return 'wall';
  if (ROAD.has(tile.sprite)) return 'road';
  return tile.kind === 'ground' ? 'ground' : 'object';
}
export function tileAt(rows: readonly string[], cell: Position, legend: Legend): TileDef | undefined {
  const row = rows[cell.line];
  if (row === '' && cell.col === 0) return legend.emptyRow;
  const char = row?.[cell.col];
  return char === undefined ? undefined : tilesFor(legend).get(char) ?? legend.fallback;
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
  return { group, mask, shore, cast: (group === 'ground' || group === 'road' || group === 'water' || group === 'object') && (above === 'wall' || above === 'roof'),
    posts: tile?.sprite === 'plank' && (shore !== 0 || (mask & 10) !== 0) };
}

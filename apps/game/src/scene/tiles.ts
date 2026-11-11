import type { Legend, WorldState } from '@escape/world';

/** Row lengths are preserved: no invented cells beyond a ragged row's end.
 * Index by UTF-16 code unit, matching Engine.Position columns.
 */
export function tileGrid(lines: WorldState['engine']['lines'], legend: Legend): string[][] {
  const sprites = new Map(legend.tiles.map(tile => [tile.char, tile.sprite]));
  return lines.map(row => Array.from({ length: row.length }, (_, col) =>
    sprites.get(row.charAt(col)) ?? legend.fallback.sprite));
}

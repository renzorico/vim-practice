import type { Legend, WorldState } from '@escape/world';

/** Row lengths are preserved: no invented cells beyond a ragged row's end.
 * Index by UTF-16 code unit, matching Engine.Position columns.
 */
export function tileGrid(lines: WorldState['engine']['lines'], legend: Legend): string[][] {
  const sprites = new Map(legend.tiles.map(tile => [tile.char, tile.sprite]));
  return lines.map(row => Array.from({ length: row.length }, (_, col) =>
    sprites.get(row.charAt(col)) ?? legend.fallback.sprite));
}

/** Top, right, bottom, left. A ragged row's missing cells never become land. */
export function blankEdges(lines: readonly string[], line: number, col: number): number {
  return [[line - 1, col], [line, col + 1], [line + 1, col], [line, col - 1]]
    .reduce((mask, position, side) => {
      const row = position[0]; const column = position[1];
      const char = row === undefined || column === undefined ? undefined : lines[row]?.[column];
      return char !== undefined && char !== '\t' ? mask | (1 << side) : mask;
    }, 0);
}

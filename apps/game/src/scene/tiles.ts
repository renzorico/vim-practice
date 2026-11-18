import type { Legend, WorldState } from '@escape/world';

/** Pad the visual bounding box with unwritten paper; the simulation keeps ragged rows.
 * Index by UTF-16 code unit, matching Engine.Position columns.
 */
export function tileGrid(lines: WorldState['engine']['lines'], legend: Legend): string[][] {
  const sprites = new Map(legend.tiles.map(tile => [tile.char, ['warehouse', 'customs'].includes(legend.id) && tile.sprite === 'rope' ? 'cargo-rope' : legend.id === 'port' && ['water', 'ladder'].includes(tile.sprite) ? `port-${tile.sprite}` : legend.id === 'glades' && tile.sprite === 'fern' ? 'fern-fronds' : tile.sprite]));
  const width = Math.max(legend.emptyRow === undefined ? 0 : 1, ...lines.map(row => row.length));
  return lines.map(row => Array.from({ length: width }, (_, col) =>
    row === '' && col === 0 && legend.emptyRow !== undefined ? legend.emptyRow.sprite : col >= row.length ? 'blank' : sprites.get(row.charAt(col)) ?? legend.fallback.sprite));
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

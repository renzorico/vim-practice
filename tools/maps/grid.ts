import type { Position } from '@escape/engine';
import type { Area, Legend, Stage, TileDef } from '@escape/world';

export type AreaProblem = 'reversed' | 'outside';

/** The character at a cell, or undefined when the cell does not exist (rows may be ragged). */
export function cellChar(stage: Stage, cell: Position): string | undefined {
  const row = stage.map[cell.line];
  return row?.[cell.col];
}

/** Legend tile for a character. Unlisted characters fall back, as at runtime. */
export function tileFor(legend: Legend, char: string): TileDef {
  return legend.tiles.find((tile) => tile.char === char) ?? legend.fallback;
}

/** The tile at a cell, or undefined when the cell does not exist. */
export function tileAt(stage: Stage, legend: Legend, cell: Position): TileDef | undefined {
  const char = cellChar(stage, cell);
  return char === undefined ? undefined : tileFor(legend, char);
}

/** Whether every cell of an inclusive area exists. Returns the first problem found, if any. */
export function areaProblem(stage: Stage, area: Area): AreaProblem | undefined {
  if (area.from.line > area.to.line || area.from.col > area.to.col) {
    return 'reversed';
  }
  for (let lineIndex = area.from.line; lineIndex <= area.to.line; lineIndex += 1) {
    const row = stage.map[lineIndex];
    if (row === undefined || area.from.col < 0 || row.length <= area.to.col) {
      return 'outside';
    }
  }
  return undefined;
}

/** Human form of a cell: "line 2, column 0". */
export function describeCell(cell: Position): string {
  return `line ${cell.line}, column ${cell.col}`;
}

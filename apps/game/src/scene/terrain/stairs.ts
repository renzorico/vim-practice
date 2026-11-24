import type { Legend } from '@escape/world';
import { tileAtCoordinates } from './edges.js';

/** An opening in a tower wall, one cell wide, is where its stairs are. Presentation only: it stays floor. */
export function stairsAt(stageId: string, rows: readonly string[], legend: Legend, line: number, col: number): boolean {
  if (stageId !== 'lighthouse') return false;
  const sprite = (column: number): string | undefined => tileAtCoordinates(rows, line, column, legend)?.sprite;
  const wall = (column: number): boolean => sprite(column) === 'tower-wall';
  return sprite(col) === 'stone-floor' && wall(col + 1) && (col === 0 || wall(col - 1));
}

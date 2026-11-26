import type { Position } from '@escape/engine';
import type { Legend } from '@escape/world';
import { tileAtCoordinates } from './edges.js';

/** Where a stage's story puts a stair that no wall gives away: the way home from the labyrinth. */
const STORY_STAIRS: Readonly<Record<string, Position>> = { labyrinth: { line: 5, col: 3 } };
/** An opening in a tower wall, one cell wide, is where its stairs are. Presentation only: it stays floor. */
export function stairsAt(stageId: string, rows: readonly string[], legend: Legend, line: number, col: number): boolean {
  const story = STORY_STAIRS[stageId];
  if (story) return story.line === line && story.col === col;
  if (stageId !== 'lighthouse') return false;
  const sprite = (column: number): string | undefined => tileAtCoordinates(rows, line, column, legend)?.sprite;
  const wall = (column: number): boolean => sprite(column) === 'tower-wall';
  return sprite(col) === 'stone-floor' && wall(col + 1) && (col === 0 || wall(col - 1));
}

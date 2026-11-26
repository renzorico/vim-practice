import type { CommandRecord, EngineState, Position } from '@escape/engine';
import type { Area, BumpReason, Entity, Legend } from '../types.js';
import { tileAt } from './remap.js';

export const distance = (a: Position, b: Position): number => Math.abs(a.line - b.line) + Math.abs(a.col - b.col);
export const inside = (at: Position, area: Area): boolean => at.line >= area.from.line && at.line <= area.to.line
  && at.col >= area.from.col && at.col <= area.to.col;

export function blocked(lines: readonly string[], at: Position, entities: readonly Entity[], legend: Legend): BumpReason | null {
  const row = lines[at.line];
  const width = row === '' && legend.emptyRow !== undefined ? 1 : row?.length ?? 0;
  if (at.line < 0 || at.col < 0 || at.col >= width) return 'edge';
  if (!tileAt(legend, lines, at)?.walkable) return 'wall';
  return entities.some((entity) => entity.def.solid && distance(entity.at, at) === 0) ? 'solid-entity' : null;
}

/** Reading order resolves equal Manhattan distances by line, then column. */
export function nearestFreeCell(lines: readonly string[], target: Position,
  entities: readonly Entity[], legend: Legend): Position | null {
  let nearest: Position | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    for (let col = 0; col < (lines[line] === '' && legend.emptyRow !== undefined ? 1 : lines[line]?.length ?? 0); col += 1) {
      const candidate = { line, col };
      if (blocked(lines, candidate, entities, legend) === null
        && (nearest === null || distance(target, candidate) < distance(target, nearest))) nearest = candidate;
    }
  }
  return nearest;
}

export function isWalk(command: CommandRecord): boolean {
  return command.kind === 'motion' && ['h', 'j', 'k', 'l'].includes(command.id);
}

/**
 * Word and line-end motions: the moves a count turns into a long run across the page. Only these, when they leave their
 * line, must find a clear path. Everything else keeps its old behaviour: searches and marks jump anywhere; the
 * structural leaps (G gg % { } <C-d> <C-u>) are what whole stages are built on (Gates, Glades); finds stay on a row.
 */
const PATH_CHECKED: ReadonlySet<string> = new Set(['w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$']);

/** A tile no move passes through: not walkable and not a gap. Past the end of a row the world is solid too. */
function solidAt(lines: readonly string[], at: Position, legend: Legend): boolean {
  const row = lines[at.line];
  if (row === undefined) return true;
  if (row === '' && legend.emptyRow !== undefined) return !legend.emptyRow.walkable && legend.emptyRow.gap !== true;
  if (at.col < 0 || at.col >= row.length) return true;
  const tile = tileAt(legend, lines, at);
  return tile === undefined || (!tile.walkable && tile.gap !== true);
}

/** The cells strictly between two positions on an L-shaped route, turning at `corner`. */
function route(from: Position, corner: Position, to: Position): Position[] {
  const cells: Position[] = [];
  const walk = (a: Position, b: Position): void => {
    const lineStep = Math.sign(b.line - a.line);
    const colStep = Math.sign(b.col - a.col);
    for (let at = { line: a.line + lineStep, col: a.col + colStep }; ; at = { line: at.line + lineStep, col: at.col + colStep }) {
      cells.push(at);
      if (at.line === b.line && at.col === b.col) return;
    }
  };
  if (from.line !== corner.line || from.col !== corner.col) walk(from, corner);
  if (corner.line !== to.line || corner.col !== to.col) walk(corner, to);
  return cells.filter(cell => cell.line !== to.line || cell.col !== to.col);
}

/**
 * A run (a word or line-end motion leaving its line) may not pass through a solid tile. It is clear when either L-shaped route (down then across, or across then
 * down) is: a jump can go round one corner, never through rock. Returns the first solid cell of the down-first route.
 */
export function jumpBlocked(lines: readonly string[], from: Position, to: Position, legend: Legend): Position | null {
  const down = route(from, { line: to.line, col: from.col }, to);
  const across = route(from, { line: from.line, col: to.col }, to);
  const firstSolid = (cells: readonly Position[]): Position | null => cells.find(cell => solidAt(lines, cell, legend)) ?? null;
  const blockedDown = firstSolid(down);
  if (blockedDown === null || firstSolid(across) === null) return null;
  return blockedDown;
}

export function validateMovement(before: EngineState, after: EngineState, commands: readonly CommandRecord[],
  entities: readonly Entity[], legend: Legend): { reason: BumpReason; at: Position } | null {
  for (const command of commands.filter(isWalk)) {
    const vertical = command.id === 'j' || command.id === 'k';
    const direction = command.id === 'j' || command.id === 'l' ? 1 : -1;
    // Read the engine's actual path; ragged-row column clamping belongs to Vim.
    const steps = Math.abs(vertical ? after.cursor.line - before.cursor.line : after.cursor.col - before.cursor.col);
    if (steps === 0) return { reason: 'edge', at: after.cursor };
    for (let index = 1; index <= steps; index += 1) {
      const line = before.cursor.line + (vertical ? direction * index : 0);
      const at = { line, col: vertical ? Math.min(before.desiredCol, Math.max(0, (after.lines[line]?.length ?? 0) - 1))
        : before.cursor.col + direction * index };
      const reason = blocked(after.lines, at, entities, legend);
      if (reason !== null) return { reason, at };
    }
  }
  const crossesLines = before.cursor.line !== after.cursor.line;
  if (crossesLines && commands.some(command => command.kind === 'motion' && PATH_CHECKED.has(command.id))) {
    const at = jumpBlocked(before.lines, before.cursor, after.cursor, legend);
    if (at !== null) return { reason: 'wall', at };
  }
  const reason = blocked(after.lines, after.cursor, entities, legend);
  return reason === null ? null : { reason, at: after.cursor };
}

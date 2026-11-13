import type { CommandRecord, EngineState, Position } from '@escape/engine';
import type { Area, BumpReason, Entity, Legend } from '../types.js';
import { tile } from './remap.js';

export const distance = (a: Position, b: Position): number => Math.abs(a.line - b.line) + Math.abs(a.col - b.col);
export const inside = (at: Position, area: Area): boolean => at.line >= area.from.line && at.line <= area.to.line
  && at.col >= area.from.col && at.col <= area.to.col;

export function blocked(lines: readonly string[], at: Position, entities: readonly Entity[], legend: Legend): BumpReason | null {
  if (at.line < 0 || at.col < 0 || at.col >= (lines[at.line]?.length ?? 0)) return 'edge';
  if (!tile(legend, lines[at.line]?.[at.col]).walkable) return 'wall';
  return entities.some((entity) => entity.def.solid && distance(entity.at, at) === 0) ? 'solid-entity' : null;
}

/** Reading order resolves equal Manhattan distances by line, then column. */
export function nearestFreeCell(lines: readonly string[], target: Position,
  entities: readonly Entity[], legend: Legend): Position | null {
  let nearest: Position | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    for (let col = 0; col < (lines[line]?.length ?? 0); col += 1) {
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
  const reason = blocked(after.lines, after.cursor, entities, legend);
  return reason === null ? null : { reason, at: after.cursor };
}

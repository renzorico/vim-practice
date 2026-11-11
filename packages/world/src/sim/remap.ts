import type { Position } from '@escape/engine';
import type { Entity, Legend, WorldEvent } from '../types.js';

export function tile(legend: Legend, char: string | undefined) {
  return legend.tiles.find((entry) => entry.char === char) ?? legend.fallback;
}

export function offsetAt(lines: readonly string[], at: Position): number {
  return lines.slice(0, at.line).reduce((sum, line) => sum + line.length + 1, 0) + at.col;
}

export function positionAt(lines: readonly string[], offset: number): Position | null {
  for (let line = 0; line < lines.length; line += 1) {
    const length = lines[line]?.length ?? 0;
    if (offset < length && offset >= 0) return { line, col: offset };
    offset -= length + 1;
    if (offset < 0) return null;
  }
  return null;
}

export function changedSpan(oldLines: readonly string[], newLines: readonly string[]) {
  const before = oldLines.join('\n');
  const after = newLines.join('\n');
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let suffix = 0;
  while (suffix < before.length - start && suffix < after.length - start
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const oldEnd = before.length - suffix;
  const newEnd = after.length - suffix;
  return { start, oldEnd, newEnd, map: (offset: number): number | null => {
    if (offset < start) return offset;
    if (offset >= oldEnd) return offset + newEnd - oldEnd;
    return offset < newEnd ? offset : null;
  } };
}

export function fixedChanged(before: readonly string[], after: readonly string[], legend: Legend): boolean {
  const span = changedSpan(before, after);
  const text = before.join('\n');
  const result = after.join('\n');
  for (let offset = 0; offset < text.length; offset += 1) {
    if (!tile(legend, text[offset]).fixed || text[offset] === '\n') continue;
    const mapped = span.map(offset);
    if (mapped === null || result[mapped] !== text[offset]) return true;
  }
  return false;
}

export function remapEntities(before: readonly string[], after: readonly string[], entities: readonly Entity[], legend: Legend,
  events: WorldEvent[]): readonly Entity[] {
  const span = changedSpan(before, after);
  return entities.flatMap((entity) => {
    const offset = span.map(offsetAt(before, entity.at));
    const at = offset === null ? null : positionAt(after, offset);
    if (at === null || !tile(legend, after[at.line]?.[at.col]).walkable) {
      events.push({ type: 'entity-removed', entity: entity.id, cause: 'deleted-tile' });
      return [];
    }
    if (at.line !== entity.at.line || at.col !== entity.at.col) {
      events.push({ type: 'entity-moved', entity: entity.id, from: entity.at, to: at });
    }
    return [{ ...entity, at }];
  });
}

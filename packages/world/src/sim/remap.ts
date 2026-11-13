import type { Position, TextEdit } from '@escape/engine';
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

/** Rule 3: carry a cell through semantic edits, never infer identity from text. */
export function mapOffset(offset: number, edits: readonly TextEdit[]): number | null {
  let mapped = offset;
  for (const edit of edits) {
    if (mapped < edit.start) continue;
    if (mapped >= edit.start + edit.removed) mapped += edit.inserted.length - edit.removed;
    else if (mapped - edit.start >= edit.inserted.length) return null;
  }
  return mapped;
}

/** Bounds in pre-edit numbering; inserted text maps back to its insertion boundary. */
export function changedRows(before: readonly string[], edits: readonly TextEdit[]) {
  let earliest = Infinity;
  let latest = 0;
  const previous: TextEdit[] = [];
  const oldOffset = (offset: number, end: boolean): number => {
    let mapped = offset;
    for (const edit of [...previous].reverse()) {
      if (mapped < edit.start) continue;
      if (mapped >= edit.start + edit.inserted.length) mapped += edit.removed - edit.inserted.length;
      else mapped = edit.start + (end ? edit.removed : 0);
    }
    return mapped;
  };
  for (const edit of edits) {
    earliest = Math.min(earliest, oldOffset(edit.start, false));
    latest = Math.max(latest, oldOffset(edit.start + edit.removed, true));
    previous.push(edit);
  }
  const text = before.join('\n');
  return { fromLine: text.slice(0, Number.isFinite(earliest) ? earliest : 0).split('\n').length - 1,
    toLine: text.slice(0, latest).split('\n').length - 1 };
}

/** Delete a row with its following newline, or its preceding newline at EOF. */
export function deleteRowEdit(lines: readonly string[], line: number): readonly TextEdit[] {
  const row = lines[line];
  if (row === undefined) return [];
  const last = line === lines.length - 1;
  return [{ start: offsetAt(lines, { line, col: 0 }) - (last && line > 0 ? 1 : 0),
    removed: row.length + (lines.length > 1 ? 1 : 0), inserted: '' }];
}

export function fixedChanged(before: readonly string[], after: readonly string[], legend: Legend, edits: readonly TextEdit[]): boolean {
  const text = before.join('\n');
  const result = after.join('\n');
  for (let offset = 0; offset < text.length; offset += 1) {
    if (!tile(legend, text[offset]).fixed || text[offset] === '\n') continue;
    const mapped = mapOffset(offset, edits);
    if (mapped === null || result[mapped] !== text[offset]) return true;
  }
  return false;
}

export function remapEntities(before: readonly string[], after: readonly string[], entities: readonly Entity[], legend: Legend,
  events: WorldEvent[], edits: readonly TextEdit[]): readonly Entity[] {
  return entities.flatMap((entity) => {
    const offset = mapOffset(offsetAt(before, entity.at), edits);
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

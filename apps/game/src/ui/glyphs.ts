import type { EntityKind } from '@escape/curriculum';
import type { Position } from '@escape/engine';

/** Visual class of one map cell. Colour carries the same meaning everywhere (docs/VISUAL-DESIGN.md). */
export type GlyphClass = 'you' | 'note' | 'door' | 'key' | 'echo' | 'corrupted' | 'fog' | 'wall' | 'floor';

export const GLYPH_FOG = '░';
export const GLYPH_WALL = '#';
export const GLYPH_CORRUPTED = '~';
export const GLYPH_YOU = '@';

/** An entity seen from the UI: only its position and kind matter for colouring. */
export interface MapMarker {
  readonly at: Position;
  readonly kind: EntityKind;
}

const ENTITY_CLASS: Readonly<Record<EntityKind, GlyphClass>> = {
  note: 'note',
  door: 'door',
  key: 'key',
  echo: 'echo',
  exit: 'door',
};

export const markerKey = (at: Position): string => `${at.line}:${at.col}`;

export function markerIndex(markers: readonly MapMarker[]): ReadonlyMap<string, EntityKind> {
  return new Map(markers.map((marker) => [markerKey(marker.at), marker.kind]));
}

/**
 * Classifies one character. Letters only count as note/door/key/echo when an entity sits on the cell,
 * so labels like "BOOT SECTOR" never light up. The cursor cell is always 'you'.
 */
export function classifyGlyph(
  char: string,
  at: Position,
  cursor: Position,
  markers: ReadonlyMap<string, EntityKind>,
): GlyphClass {
  if (at.line === cursor.line && at.col === cursor.col) return 'you';
  if (char === GLYPH_YOU) return 'you';
  if (char === GLYPH_FOG) return 'fog';
  if (char === GLYPH_WALL) return 'wall';
  if (char === GLYPH_CORRUPTED) return 'corrupted';
  const kind = markers.get(markerKey(at));
  return kind === undefined ? 'floor' : ENTITY_CLASS[kind];
}

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "3 columns east, 1 row south"; empty when the points coincide. */
export function describeOffset(from: Position, to: Position): string {
  const parts: string[] = [];
  const cols = to.col - from.col;
  const rows = to.line - from.line;
  if (cols !== 0) parts.push(`${plural(Math.abs(cols), 'column')} ${cols > 0 ? 'east' : 'west'}`);
  if (rows !== 0) parts.push(`${plural(Math.abs(rows), 'row')} ${rows > 0 ? 'south' : 'north'}`);
  return parts.join(', ');
}

const distance = (a: Position, b: Position): number => Math.abs(a.line - b.line) + Math.abs(a.col - b.col);

/** Text for screen readers: where you are, what is under or near you, and the objective. */
export function describeMapSummary(cursor: Position, markers: readonly MapMarker[], objective: string): string {
  const parts = [`You are at row ${cursor.line + 1}, column ${cursor.col + 1}.`];
  const under = markers.find((marker) => distance(marker.at, cursor) === 0);
  if (under !== undefined) parts.push(`You are standing on a ${under.kind}.`);
  let nearest: MapMarker | undefined;
  for (const marker of markers) {
    const gap = distance(marker.at, cursor);
    if (gap === 0) continue;
    if (nearest === undefined || gap < distance(nearest.at, cursor)) nearest = marker;
  }
  if (nearest !== undefined) parts.push(`Nearest: a ${nearest.kind}, ${describeOffset(cursor, nearest.at)}.`);
  parts.push(`Objective: ${objective}`);
  return parts.join(' ');
}

export interface GlyphRun {
  readonly text: string;
  readonly glyph: GlyphClass;
}

/** One map row as runs of equal class, so the DOM stays small. */
export function classifyRow(
  line: string,
  lineIndex: number,
  cursor: Position,
  markers: ReadonlyMap<string, EntityKind>,
): GlyphRun[] {
  const runs: GlyphRun[] = [];
  for (let col = 0; col < line.length; col += 1) {
    const char = line[col] ?? '';
    const glyph = classifyGlyph(char, { line: lineIndex, col }, cursor, markers);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.glyph === glyph && glyph !== 'you') {
      runs[runs.length - 1] = { text: last.text + char, glyph };
    } else {
      runs.push({ text: char, glyph });
    }
  }
  return runs;
}

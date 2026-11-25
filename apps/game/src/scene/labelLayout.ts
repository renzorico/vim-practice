import type { Legend, WorldState } from '@escape/world';
import { bufferSize } from './camera.js';

/** A rectangle in map pixels: world pixels times the zoom, so labels keep one size on the screen. */
export interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
/** A label for something on one row of the field: the cells `from`..`to` it names. */
export interface FieldSign { readonly line: number; readonly from: number; readonly to: number; readonly text: string; readonly done?: boolean }
interface LabelRequest { readonly id: string; readonly names: Box; readonly width: number; readonly height: number }
export interface PlacedLabel extends Box { readonly id: string }
interface Obstacle { readonly box: Box; readonly cost: number }

export const LABEL_HEIGHT = 30;
/** A generous average for the label face at 18 px (measured: 8.4 px for the widest label on the field). */
const LABEL_ADVANCE = 10;
const LABEL_PADDING = 24;
const LARGE_VIEW = 1600;
const GAP = 4;
const MARGIN = 6;
const COST = { person: 60, label: 80, content: 24, floor: 4, outside: 400 } as const;
const DISTANCE_COST = 0.12;
/** Above reads as a sign on a wall; below is for when there is no room. */
const BELOW_COST = 10;
/** How far along the row a label may slide to find a free place, as shares of its own width. */
const SLIDES = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1] as const;

/** On a large screen the labels grow by a third: 18 px letters become 24. */
export const labelScale = (view: { readonly width: number }): number => view.width >= LARGE_VIEW ? 4 / 3 : 1;
export const labelWidth = (text: string, scale = 1): number => Math.ceil((text.length * LABEL_ADVANCE + LABEL_PADDING) * scale);
export const cellBox = (line: number, from: number, to: number, tile: number): Box =>
  ({ x: from * tile, y: line * tile, width: (to - from + 1) * tile, height: tile });
export const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
export const grow = (box: Box, by: number): Box =>
  ({ x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 });

/**
 * What a label should stay off, and how much. Walls and the void are free: paper hangs there best.
 * The player is left out, or every label would move at each step.
 */
export function obstaclesFor(lines: readonly string[], entities: WorldState['entities'], legend: Legend, tile: number): readonly Obstacle[] {
  const kinds = new Map(legend.tiles.map(def => [def.char, def]));
  const cells = lines.flatMap((text, line) => [...text].flatMap((char, col): readonly Obstacle[] => {
    const def = kinds.get(char) ?? legend.fallback;
    const cost = def.kind === 'ground' ? (def.walkable ? COST.floor : 0) : def.walkable || def.kind === 'object' ? COST.content : 0;
    return cost === 0 ? [] : [{ box: cellBox(line, col, col, tile), cost }];
  }));
  return [...cells,
    ...entities.map(entity => ({ box: cellBox(entity.at.line, entity.at.col, entity.at.col, tile), cost: COST.person }))];
}

/** Where a label may hang: the field, or the whole view when the field is smaller. */
export function labelArea(lines: readonly string[], tile: number, view: { readonly width: number; readonly height: number }): Box {
  const size = bufferSize(lines);
  const width = Math.max(size.width * tile, view.width); const height = Math.max(size.height * tile, view.height);
  return { x: (size.width * tile - width) / 2, y: (size.height * tile - height) / 2, width, height };
}

/** Each label in turn takes the cheapest free place above, below or beside what it names. */
export function layoutLabels(requests: readonly LabelRequest[], obstacles: readonly Obstacle[], area: Box, tile: number): readonly PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const inner = grow(area, -MARGIN);
  for (const { id, names, width, height } of requests) {
    const centre = names.x + names.width / 2;
    const beside = names.y + (names.height - height) / 2;
    const candidates: readonly (readonly [number, number, number?])[] = [
      ...SLIDES.map(slide => [centre - width / 2 + slide * width, names.y - GAP - height] as const),
      ...SLIDES.map(slide => [centre - width / 2 + slide * width, names.y + names.height + GAP, BELOW_COST] as const),
      [names.x + names.width + GAP, beside], [names.x - GAP - width, beside]];
    // Only what a candidate could touch: a map has thousands of cells.
    const reach = grow(names, width * 1.5 + height);
    const near = obstacles.filter(item => overlap(reach, item.box) > 0);
    let best: { readonly box: Box; readonly cost: number } | null = null;
    for (const [left, top, extra = 0] of candidates) {
      const box: Box = { x: Math.round(left), y: Math.round(top), width, height };
      const padded = grow(box, GAP / 2);
      const hidden = width * height - overlap(box, inner);
      const distance = Math.hypot(box.x + width / 2 - centre, box.y + height / 2 - (names.y + names.height / 2));
      const cost = extra + hidden / (tile * tile) * COST.outside + distance * DISTANCE_COST
        + overlap(box, names) / (tile * tile) * COST.content
        + near.reduce((sum, item) => sum + overlap(padded, item.box) / (tile * tile) * item.cost, 0)
        + placed.reduce((sum, other) => sum + (overlap(padded, other) > 0 ? COST.label + overlap(padded, other) / (tile * tile) * COST.label : 0), 0);
      if (!best || cost < best.cost) best = { box, cost };
    }
    if (best) placed.push({ id, ...best.box });
  }
  return placed;
}

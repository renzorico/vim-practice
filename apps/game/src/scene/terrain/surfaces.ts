import type { Legend, TileDef } from '@escape/world';
import type { Position } from '@escape/engine';
import { tileAtCoordinates } from './edges.js';

/** Every shipped ground sprite is assigned deliberately; only natural soil is replaced. */
export const SURFACES = {
  grass: 'natural', dirt: 'natural', clearing: 'preserve', moss: 'preserve',
  'stone-floor': 'preserve', 'warehouse-floor': 'preserve', 'customs-floor': 'preserve',
  'counter-floor': 'preserve', 'reading-floor': 'preserve', 'vault-floor': 'preserve',
  'cave-floor': 'preserve', 'archive-aisle': 'preserve', 'shelf-gap': 'preserve',
  boards: 'preserve', branch: 'preserve', ledge: 'preserve', 'crystal-ledge': 'preserve',
  mortar: 'preserve', scaffold: 'preserve', gallery: 'preserve', platform: 'preserve',
  jetty: 'preserve', plank: 'preserve', road: 'preserve', gravel: 'preserve',
  blank: 'paper', 'page-paper': 'paper', 'page-blank': 'paper', 'page-void': 'paper',
  'clause-gap': 'preserve', air: 'preserve', chasm: 'preserve', 'cave-rock': 'preserve',
} as const;
export function surface(sprite: string): 'natural' | 'preserve' | 'paper' | undefined {
  return Object.prototype.hasOwnProperty.call(SURFACES, sprite) ? SURFACES[sprite as keyof typeof SURFACES] : undefined;
}
export function replacesGround(tile: TileDef | undefined): boolean {
  return tile !== undefined && surface(tile.sprite) === 'natural';
}
/** Four-neighbour majority, with paper winning ties. Objects never vote for themselves. */
export function substrate(rows: readonly string[], at: Position, legend: Legend): string {
  let winner = 'paper'; let majority = 0;
  for (let side = 0; side < 4; side++) {
    const sprite = neighbourSurface(rows, at, legend, side);
    if (sprite === undefined) continue;
    let count = 0;
    for (let other = 0; other < 4; other++) if (neighbourSurface(rows, at, legend, other) === sprite) count++;
    if (count > majority || count === majority && sprite === 'paper') { winner = sprite; majority = count; }
  }
  return majority ? winner : legend.tiles.find(tile => tile.kind === 'ground' && tile.walkable)?.sprite
    ?? legend.tiles.find(tile => tile.walkable && surface(tile.sprite) === 'preserve')?.sprite ?? 'paper';
}
function neighbourSurface(rows: readonly string[], at: Position, legend: Legend, side: number): string | undefined {
  const tile = tileAtCoordinates(rows, at.line + (side === 0 ? -1 : side === 2 ? 1 : 0),
    at.col + (side === 1 ? 1 : side === 3 ? -1 : 0), legend);
  if (!tile || tile.sprite === 'chasm' || tile.sprite === 'air') return undefined;
  const kind = surface(tile.sprite);
  return kind === undefined ? undefined : kind === 'paper' ? 'paper' : tile.sprite;
}

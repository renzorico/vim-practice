import type { WorldId, TileDef } from '@escape/world';
import { terrainGroup } from './edges.js';

export const PARTICLE_CAP = 24;
export function positionHash(line: number, col: number): number {
  let hash = Math.imul(line + 1, 73856093) ^ Math.imul(col + 1, 19349663);
  hash = Math.imul(hash ^ hash >>> 16, 0x45d9f3b);
  return (hash ^ hash >>> 16) >>> 0;
}
export function groundVariant(line: number, col: number): number { return positionHash(line, col) % 4; }
export function decorationAt(tile: TileDef | undefined, line: number, col: number): boolean {
  return tile?.walkable === true && terrainGroup(tile) === 'ground' && positionHash(line, col) % 100 < 5;
}
export function particleCount(reducedMotion: boolean, dark: boolean, world: WorldId): number {
  return reducedMotion || dark || world === 'last-page' ? 0 : PARTICLE_CAP;
}
/** Analytic trajectories: no integrator, randomness, or per-frame object creation. */
export function particleX(index: number, elapsed: number, width: number): number {
  return (positionHash(index, 7) % Math.max(1, width) + elapsed * (0.002 + index % 3 * 0.001)) % Math.max(1, width);
}
export function particleY(index: number, elapsed: number, height: number): number {
  return (positionHash(3, index) % Math.max(1, height) + elapsed * (0.001 + index % 4 * 0.0005)) % Math.max(1, height);
}
export function shadowScale(height: number): number { return Math.max(0.35, 1 - Math.max(0, height) / 40); }

export const TITLE_ROW_CLOCK_MS = 8000;
export function titleRowGone(tick: number, reducedMotion: boolean): boolean {
  return !reducedMotion && tick % 2 === 1;
}

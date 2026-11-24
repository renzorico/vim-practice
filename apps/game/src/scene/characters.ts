import type { Position } from '@escape/engine';
import type { EntityKind, Entity, Stage, WorldState } from '@escape/world';
import { blockedReason } from '../play2/feedback.js';
import { idlePhase } from './animate.js';

export type Facing = 'down' | 'up' | 'left' | 'right';
export function movementFacing(from: Position, to: Position, previous: Facing = 'down'): Facing {
  const horizontal = to.col - from.col;
  const vertical = to.line - from.line;
  if (!horizontal && !vertical) return previous;
  return Math.abs(horizontal) > Math.abs(vertical) ? horizontal < 0 ? 'left' : 'right' : vertical < 0 ? 'up' : 'down';
}
/** Frame 0/1 stay compatible with the old front-facing playback effects. */
export function playerFrame(facing: Facing, distance = 0, walking = false, reducedMotion = false): number {
  const direction = facing === 'up' ? 4 : facing === 'left' || facing === 'right' ? 7 : 0;
  return direction + (walking && !reducedMotion ? (direction === 0 ? 2 : 1) + Math.floor(distance * 2) % 2 : 0);
}
export function isPerson(kind: EntityKind): boolean { return kind === 'npc' || kind === 'keeper' || kind === 'dot'; }
export function npcFacing(at: Position, player: Position, previous = false): boolean {
  return Math.abs(at.line - player.line) <= 1 && Math.abs(at.col - player.col) <= 3 && at.col !== player.col
    ? player.col < at.col : previous;
}
export function personIdleFrame(id: string, elapsed: number, reducedMotion = false): number {
  return reducedMotion ? 0 : Math.floor(((elapsed + idlePhase(id) * 2) % 1200) / 600);
}
/** Reuse feedback's classification, including its trigger/flag guards; no second sprite mapping. */
export function interactionLabel(entity: Entity, stage: Stage, state: WorldState): string {
  const reason = blockedReason([{ type: 'bump', at: entity.at, reason: 'solid-entity' }], stage,
    { ...state, entities: [entity] });
  if (reason === 'Press Enter to read.') return 'Enter: read';
  return reason === 'Press Enter to talk.' || isPerson(entity.def.kind) ? 'Enter: talk' : 'Enter: use';
}
export interface SlipPosition { readonly x: number; readonly y: number }
/** Text uses top-left origin. Choose a visible side that never intersects the player's 16px box. */
export function slipPosition(target: Position, player: Position, width: number, height: number,
  view: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }): SlipPosition {
  const px = player.col * 16; const py = player.line * 16;
  const tx = target.col * 16 + 8; const ty = target.line * 16;
  const candidates = [[tx - width / 2, ty - height - 4], [tx - width / 2, ty + 20],
    [px + 20, py], [px - width - 4, py], [tx - width / 2, py + 20]] as const;
  for (const [left, top] of candidates) {
    const x = Math.max(view.left + 2, Math.min(view.right - width - 2, left));
    const y = Math.max(view.top + 2, Math.min(view.bottom - height - 2, top));
    if (x + width <= px - 2 || x >= px + 18 || y + height <= py - 2 || y >= py + 18) return { x, y };
  }
  return { x: view.left + 2, y: view.top + 2 };
}

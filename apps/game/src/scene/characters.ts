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
const EXIT_LABELS: Readonly<Record<string, string>> = { 'quarry-gate': 'Enter: go south', lift: 'Enter: take lift' };
/** Reuse feedback's classification, including its trigger/flag guards; no second sprite mapping. */
export function interactionLabel(entity: Entity, stage: Stage, state: WorldState): string {
  // Two props lead somewhere: say where.
  const exit = EXIT_LABELS[entity.def.sprite];
  if (exit) return exit;
  const reason = blockedReason([{ type: 'bump', at: entity.at, reason: 'solid-entity' }], stage,
    { ...state, entities: [entity] });
  if (reason === 'Press Enter to read.') return 'Enter: read';
  return reason === 'Press Enter to talk.' || isPerson(entity.def.kind) ? 'Enter: talk' : 'Enter: use';
}

/** Enter fires the first trigger in reach: between two things, only that one is labelled. */
export function reachedEntity(stage: Stage, state: WorldState): Entity | null {
  const { cursor } = state.engine;
  for (const trigger of stage.triggers) {
    if (trigger.on !== 'interact' || trigger.target.type !== 'entity'
      || trigger.once && state.firedTriggers.includes(trigger.id)
      || trigger.onlyIf !== undefined && state.flags[trigger.onlyIf] !== true
      || trigger.unless !== undefined && state.flags[trigger.unless] === true) continue;
    const id = trigger.target.entity;
    const entity = state.entities.find(item => item.id === id);
    if (entity && Math.abs(cursor.line - entity.at.line) + Math.abs(cursor.col - entity.at.col) === 1) return entity;
  }
  return null;
}

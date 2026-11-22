import type { WorldEvent, WorldState } from '@escape/world';
export interface CounterStamp {
  readonly entity: string;
  readonly line: number;
  readonly col: number;
  readonly length: number;
}
/** Entity edits can accompany a player put: keep both motions on the shared clock. */
export function counterStamp(before: WorldState | undefined, after: WorldState,
  events: readonly WorldEvent[]): CounterStamp | null {
  if (!before || before.stage !== 'counter' || after.stage !== before.stage || after.turn !== before.turn + 1) return null;
  const clerk = after.entities.find(entity => entity.id === 'clerk');
  if (!clerk || clerk.def.behaviour.type !== 'put'
    || !events.some(event => event.type === 'rows-changed' && event.by === 'entity' && event.fromLine === clerk.at.line)) return null;
  return { entity: clerk.id, line: clerk.at.line, col: clerk.at.col + 1, length: clerk.def.behaviour.text.length };
}

import type { Entity, Legend, WorldEvent, WorldState } from '../types.js';
import { changeBuffer } from './effects.js';
import { blocked, distance } from './movement.js';
import { offsetAt, tile } from './remap.js';

export function actEntities(state: WorldState, legend: Legend, events: WorldEvent[]): WorldState {
  let next = state;
  // Capture ids: deletion may remap/remove later actors, but never changes their order.
  for (const id of state.entities.map((entity) => entity.id)) {
    const entity = next.entities.find((entry) => entry.id === id);
    if (entity === undefined || next.turn % entity.def.every !== 0) continue;
    const behaviour = entity.def.behaviour;
    if (behaviour.type === 'unwrite') {
      const target = behaviour.path[entity.pathIndex];
      if (target === undefined) continue;
      const lines = next.engine.lines.filter((_, index) => index !== target.line);
      next = changeBuffer(next, lines.length === 0 ? [''] : lines, legend, events, 'entity', undefined,
        offsetAt(next.engine.lines, { line: target.line, col: 0 }));
      next = { ...next, entities: next.entities.map((entry) => entry.id === id
        ? { ...entry, pathIndex: (entity.pathIndex + 1) % behaviour.path.length } : entry) };
      continue;
    }
    let moved: Entity = entity;
    const available = (at: Entity['at']): boolean => blocked(next.engine.lines, at, [], legend) === null
      && !next.entities.some((entry) => entry.id !== id && distance(entry.at, at) === 0);
    if (behaviour.type === 'patrol') {
      const at = behaviour.path[entity.pathIndex];
      if (at !== undefined && available(at)) moved = { ...entity, at, pathIndex: (entity.pathIndex + 1) % behaviour.path.length };
    } else if (behaviour.type === 'chase' || behaviour.type === 'follow') {
      if (behaviour.type !== 'follow' || distance(entity.at, next.engine.cursor) > 1) {
        const vertical = Math.sign(next.engine.cursor.line - entity.at.line);
        const horizontal = Math.sign(next.engine.cursor.col - entity.at.col);
        const candidates = [
          ...(vertical === 0 ? [] : [{ line: entity.at.line + vertical, col: entity.at.col }]),
          ...(horizontal === 0 ? [] : [{ line: entity.at.line, col: entity.at.col + horizontal }]),
        ];
        const at = candidates.find(available);
        if (at !== undefined) moved = { ...entity, at };
      }
    }
    if (distance(moved.at, entity.at) > 0) events.push({ type: 'entity-moved', entity: id, from: entity.at, to: moved.at });
    next = { ...next, entities: next.entities.map((entry) => entry.id === id ? moved : entry) };
  }
  for (const entity of next.entities) {
    if (entity.def.behaviour.type !== 'follow' && entity.def.damage > 0 && distance(entity.at, next.engine.cursor) === 0) {
      next = { ...next, hearts: Math.max(0, next.hearts - entity.def.damage) };
      events.push({ type: 'player-hit', by: entity.id, hearts: next.hearts });
    }
  }
  const damage = tile(legend, next.engine.lines[next.engine.cursor.line]?.[next.engine.cursor.col]).damage ?? 0;
  if (damage > 0) {
    next = { ...next, hearts: Math.max(0, next.hearts - damage) };
    events.push({ type: 'player-hit', by: 'tile', hearts: next.hearts });
  }
  return next;
}

import type { EngineState } from '@escape/engine';
import type { Legend, Stage, WorldEffect, WorldEvent, WorldState } from '../types.js';
import { inside } from './movement.js';
import { changedSpan, remapEntities } from './remap.js';

export function changeBuffer(state: WorldState, lines: readonly string[], legend: Legend, events: WorldEvent[],
  by: 'player' | 'effect' | 'entity', engine?: EngineState): WorldState {
  const before = state.engine;
  if (before.lines.join('\n') === lines.join('\n')) return engine === undefined ? state : { ...state, engine };
  const span = changedSpan(before.lines, lines);
  const fromLine = before.lines.join('\n').slice(0, span.start).split('\n').length - 1;
  const toLine = before.lines.join('\n').slice(0, span.oldEnd).split('\n').length - 1;
  events.push({ type: 'rows-changed', fromLine, toLine, lineDelta: lines.length - before.lines.length, by });
  const line = Math.min(before.cursor.line, lines.length - 1);
  const cursor = { line, col: Math.min(before.cursor.col, Math.max(0, (lines[line]?.length ?? 0) - 1)) };
  const changeSeq = Math.max(before.changeSeq, before.savedSeq) + 1;
  const next = engine ?? { ...before, lines, cursor, desiredCol: cursor.col, changeSeq, modified: changeSeq !== before.savedSeq,
    undoStack: [...before.undoStack, { lines: before.lines, cursor: before.cursor, seq: before.changeSeq }], redoStack: [] };
  return { ...state, engine: next, entities: remapEntities(before.lines, lines, state.entities, legend, events) };
}

export function finish(state: WorldState, stage: Stage, events: WorldEvent[]): WorldState {
  if (state.hearts <= 0) {
    if (state.status !== 'dead') events.push({ type: 'player-died' });
    return { ...state, hearts: 0, status: 'dead' };
  }
  if (state.status !== 'playing') return state;
  const clear = stage.clear.every((condition) => {
    switch (condition.type) {
      case 'reach': return inside(state.engine.cursor, condition.area);
      case 'flag': return state.flags[condition.flag] === true;
      case 'script-solved': return state.solvedScripts[condition.script] !== undefined;
      case 'no-entities': return !state.entities.some((entity) => entity.def.kind === condition.kind);
      case 'saved': return state.engine.saved && !state.engine.modified;
    }
  });
  if (!clear) return state;
  events.push({ type: 'stage-cleared', stage: stage.id, turns: state.turn });
  return { ...state, status: 'cleared' };
}

export function checkpoint(state: WorldState, events: WorldEvent[]): WorldState {
  if (state.status === 'dead') return state;
  events.push({ type: 'checkpoint-saved' });
  return { ...state, checkpoint: { engine: state.engine, entities: state.entities, hearts: state.hearts, turn: state.turn } };
}

export function applyBatch(state: WorldState, effects: readonly WorldEffect[], stage: Stage, legend: Legend,
  events: WorldEvent[]): WorldState {
  let next = state;
  let lines = state.engine.lines;
  for (const effect of effects) {
    switch (effect.type) {
      case 'set-flag':
        next = { ...next, flags: { ...next.flags, [effect.flag]: effect.value } };
        events.push({ type: 'flag-set', flag: effect.flag, value: effect.value });
        break;
      case 'set-rows': {
        const updated = [...lines];
        updated.splice(effect.fromLine, effect.lines.length, ...effect.lines);
        lines = updated;
        break;
      }
      case 'delete-row': {
        const updated = lines.filter((_, index) => index !== effect.line);
        lines = updated.length === 0 ? [''] : updated;
        break;
      }
      case 'spawn':
        next = { ...next, entities: [...next.entities, { id: effect.entity.id, def: effect.entity, at: effect.entity.at, pathIndex: 0 }] };
        events.push({ type: 'entity-spawned', entity: effect.entity.id, at: effect.entity.at });
        break;
      case 'remove-entity':
        if (next.entities.some((entity) => entity.id === effect.entity)) events.push({ type: 'entity-removed', entity: effect.entity, cause: 'effect' });
        next = { ...next, entities: next.entities.filter((entity) => entity.id !== effect.entity) };
        break;
      case 'heal': next = { ...next, hearts: next.hearts + effect.hearts }; break;
      case 'move-player': break; // Applied after buffer remapping, in final-buffer coordinates.
    }
  }
  next = changeBuffer(next, lines, legend, events, 'effect');
  // An explicit teleport is expressed in the resulting buffer's coordinates.
  const teleport = effects.filter((effect) => effect.type === 'move-player').at(-1);
  if (teleport !== undefined) next = { ...next, engine: { ...next.engine, cursor: teleport.to, desiredCol: teleport.to.col } };
  next = finish(next, stage, events);
  return effects.some((effect) => effect.type !== 'set-flag') ? checkpoint(next, events) : next;
}

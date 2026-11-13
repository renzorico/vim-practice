import type { EngineState, Position, TextEdit } from '@escape/engine';
import type { Legend, Stage, WorldEffect, WorldEvent, WorldState } from '../types.js';
import { blocked, distance, inside } from './movement.js';
import { changedRows, deleteRowEdit, mapOffset, offsetAt, positionAt, remapEntities } from './remap.js';

export function changeBuffer(state: WorldState, lines: readonly string[], legend: Legend, events: WorldEvent[],
  by: 'player' | 'effect' | 'entity', edits: readonly TextEdit[], engine?: EngineState): WorldState {
  const before = state.engine;
  if (before.lines.join('\n') === lines.join('\n')) return engine === undefined ? state : { ...state, engine };
  events.push({ type: 'rows-changed', ...changedRows(before.lines, edits), lineDelta: lines.length - before.lines.length, by });
  const entities = remapEntities(before.lines, lines, state.entities, legend, events, edits);
  if (engine !== undefined) return { ...state, engine, entities };
  const mapPosition = (at: Position): Position | null => {
    const offset = mapOffset(offsetAt(before.lines, at), edits);
    return offset === null ? null : positionAt(lines, offset);
  };
  const marks: Record<string, Position> = {};
  for (const [name, at] of Object.entries(before.marks)) {
    const mapped = mapPosition(at);
    if (mapped !== null) marks[name] = mapped;
  }
  const visualAnchor = before.visualAnchor === null ? null : mapPosition(before.visualAnchor);
  let cursor = mapPosition(before.cursor);
  const displaced = cursor === null || blocked(lines, cursor, entities, legend) !== null;
  const from = cursor ?? before.cursor;
  if (displaced) {
    // Iterating in reading order implements the line/column tie break.
    let nearest: Position | null = null;
    for (let line = 0; line < lines.length; line += 1) {
      for (let col = 0; col < (lines[line]?.length ?? 0); col += 1) {
        const candidate = { line, col };
        if (blocked(lines, candidate, entities, legend) === null
          && (nearest === null || distance(from, candidate) < distance(from, nearest))) nearest = candidate;
      }
    }
    cursor = nearest;
  }
  // Rule 3, THE PLAYER: with no legal cell anywhere, the player dies where they stood.
  const stranded = cursor === null;
  cursor ??= before.cursor;
  const changeSeq = Math.max(before.changeSeq, before.savedSeq) + 1;
  const next: EngineState = { ...before, lines, cursor, marks, visualAnchor,
    mode: before.mode.startsWith('visual') && visualAnchor === null ? 'normal' : before.mode,
    desiredCol: cursor.col, changeSeq, modified: changeSeq !== before.savedSeq,
    undoStack: [...before.undoStack, { lines: before.lines, cursor: before.cursor, seq: before.changeSeq, edits }], redoStack: [] };
  const hearts = stranded ? 0 : displaced ? Math.max(0, state.hearts - 1) : state.hearts;
  if (displaced) {
    events.push({ type: 'player-hit', by: 'tile', hearts });
    if (!stranded) events.push({ type: 'player-moved', from, to: cursor, style: 'jump' });
  }
  return { ...state, engine: next, entities, hearts };
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
  let bufferChanged = false;
  const edits: TextEdit[] = [];
  for (const effect of effects) {
    switch (effect.type) {
      case 'set-flag':
        next = { ...next, flags: { ...next.flags, [effect.flag]: effect.value } };
        events.push({ type: 'flag-set', flag: effect.flag, value: effect.value });
        break;
      case 'set-rows': {
        const updated = [...next.engine.lines];
        updated.splice(effect.fromLine, effect.lines.length, ...effect.lines);
        const rowEdits: TextEdit[] = [];
        let delta = 0;
        effect.lines.forEach((row, index) => {
          const line = effect.fromLine + index;
          const old = next.engine.lines[line];
          if (old === undefined || old === row) return;
          rowEdits.push({ start: offsetAt(next.engine.lines, { line, col: 0 }) + delta, removed: old.length, inserted: row });
          delta += row.length - old.length;
        });
        edits.push(...rowEdits);
        const changed = changeBuffer(next, updated, legend, events, 'effect', rowEdits);
        bufferChanged ||= changed.engine !== next.engine;
        next = changed;
        break;
      }
      case 'delete-row': {
        const updated = next.engine.lines.filter((_, index) => index !== effect.line);
        const rowEdits = deleteRowEdit(next.engine.lines, effect.line);
        edits.push(...rowEdits);
        const changed = changeBuffer(next, updated.length === 0 ? [''] : updated, legend, events, 'effect', rowEdits);
        bufferChanged ||= changed.engine !== next.engine;
        next = changed;
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
      case 'heal': next = { ...next, hearts: Math.min(stage.hearts, next.hearts + effect.hearts) }; break;
      case 'move-player':
        if (blocked(next.engine.lines, effect.to, next.entities, legend) === null) {
          events.push({ type: 'player-moved', from: next.engine.cursor, to: effect.to, style: 'jump' });
          next = { ...next, engine: { ...next.engine, cursor: effect.to, desiredCol: effect.to.col } };
        }
        break;
    }
  }
  if (bufferChanged) {
    const before = state.engine;
    const changeSeq = Math.max(before.changeSeq, before.savedSeq) + 1;
    next = { ...next, engine: { ...next.engine, changeSeq, modified: changeSeq !== before.savedSeq,
      undoStack: [...before.undoStack, { lines: before.lines, cursor: before.cursor, seq: before.changeSeq, edits }], redoStack: [] } };
  }
  next = finish(next, stage, events);
  return effects.some((effect) => effect.type !== 'set-flag') ? checkpoint(next, events) : next;
}

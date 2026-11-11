import type { Engine, Key } from '@escape/engine';
import type { Legend, Stage, WorldEvent, WorldOptions, WorldSim, WorldState, WorldStepResult } from '../types.js';
import { applyBatch, changeBuffer, checkpoint, finish } from './effects.js';
import { actEntities } from './entities.js';
import { distance, inside, isWalk, validateMovement } from './movement.js';
import { changedSpan, fixedChanged, offsetAt } from './remap.js';
import { eligible, fire, inReach, openScript, stepScript } from './scripts.js';
import { atRest } from './turn.js';

const SAVE_COMMANDS = [':w', ':wq', ':x', 'ZZ'];

export function createWorldSim(engine: Engine): WorldSim {
  return {
    init(stage, _legend, options) {
      const field = engine.init(stage.map, stage.start);
      const entities = stage.entities.filter((def) => (def.spawnIf === undefined || options.flags[def.spawnIf] === true)
        && (def.spawnUnless === undefined || options.flags[def.spawnUnless] !== true))
        .map((def) => ({ id: def.id, def, at: def.at, pathIndex: 0 }));
      const state: WorldState = { stage: stage.id, engine: field, entities, script: null, pending: null, hearts: stage.hearts,
        turn: 0, status: 'playing', flags: { ...options.flags }, solvedScripts: {}, firedTriggers: [],
        checkpoint: { engine: field, entities, hearts: stage.hearts, turn: 0 } };
      return stage.autoScript === undefined ? state : openScript(state, stage.autoScript, stage, engine);
    },
    step(state, key, stage, legend, options) {
      const events: WorldEvent[] = [];
      if (state.status !== 'playing') return { state, events };
      if (state.script !== null) return { state: stepScript(state, key, stage, legend, engine, events), events };
      if (key === '<CR>' && state.engine.mode === 'normal' && atRest(state.engine)) {
        const trigger = stage.triggers.find((entry) => eligible(state, entry) && inReach(state, entry));
        if (trigger !== undefined) return { state: fire(state, trigger, stage, engine, events), events };
      }
      const pending = state.pending ?? { engine: state.engine, entities: state.entities, commands: [] };
      const allowedCommands = stage.allowedCommands === undefined ? options.learnedCommands
        : options.learnedCommands.filter((command) => stage.allowedCommands?.includes(command));
      const result = engine.step(state.engine, key, { allowedCommands });
      const commands = [...pending.commands, ...result.commands];
      if (result.error !== null) {
        events.push({ type: 'engine-error', error: result.error });
        return { state: { ...state, engine: pending.engine, entities: pending.entities, pending: null }, events };
      }
      if (!atRest(result.state)) {
        if (state.engine.lines.join('\n') !== result.state.lines.join('\n')) {
          const span = changedSpan(state.engine.lines, result.state.lines, offsetAt(pending.engine.lines, pending.engine.cursor));
          events.push({ type: 'rows-changed',
            fromLine: state.engine.lines.join('\n').slice(0, span.start).split('\n').length - 1,
            toLine: state.engine.lines.join('\n').slice(0, span.oldEnd).split('\n').length - 1,
            lineDelta: result.state.lines.length - state.engine.lines.length, by: 'player' });
        }
        return { state: { ...state, engine: result.state, pending: { ...pending, commands } }, events };
      }
      let next: WorldState = { ...state, engine: result.state, pending: null };
      if (commands.length === 0) {
        // The engine emits no record for a walk at the edge. Announce that failed
        // attempt without manufacturing a Vim command or spending a turn (rule 1).
        if (['h', 'j', 'k', 'l'].includes(key) && distance(pending.engine.cursor, next.engine.cursor) === 0) {
          events.push({ type: 'bump', reason: 'edge', at: next.engine.cursor });
        }
        return { state: next, events };
      }
      const anchor = offsetAt(pending.engine.lines, pending.engine.cursor);
      const commitEvents: WorldEvent[] = [];
      const candidate = changeBuffer({ ...next, engine: pending.engine, entities: pending.entities }, result.state.lines,
        legend, commitEvents, 'player', result.state, anchor);
      const bump = fixedChanged(pending.engine.lines, result.state.lines, legend, anchor)
        ? { reason: 'fixed' as const, at: result.state.cursor }
        : validateMovement(pending.engine, result.state, commands, candidate.entities, legend);
      if (bump !== null) {
        events.push({ type: 'bump', ...bump });
        return { state: { ...state, engine: pending.engine, entities: pending.entities, pending: null }, events };
      }
      for (const command of commands) events.push({ type: 'command', command, in: 'field' });
      next = candidate;
      events.push(...commitEvents);
      if (distance(pending.engine.cursor, next.engine.cursor) > 0) events.push({ type: 'player-moved', from: pending.engine.cursor,
        to: next.engine.cursor, style: commands.some(isWalk) ? 'walk' : 'jump' });
      next = actEntities({ ...next, turn: state.turn + 1 }, legend, events);
      next = finish(next, stage, events);
      if (next.status === 'playing' && commands.some((command) => SAVE_COMMANDS.includes(command.id))) next = checkpoint(next, events);
      if (next.status !== 'dead') {
        for (const trigger of stage.triggers) {
          if (trigger.on === 'enter' && eligible(next, trigger) && inside(next.engine.cursor, trigger.area)) {
            next = fire(next, trigger, stage, engine, events);
          }
        }
      }
      events.push({ type: 'turn-ended', turn: next.turn });
      return { state: next, events };
    },
    apply(state, effects, stage, legend) {
      const events: WorldEvent[] = [];
      return { state: state.status === 'dead' ? state : applyBatch(state, effects, stage, legend, events), events };
    },
    restore(state) {
      if (state.status === 'cleared') return { state, events: [] };
      return { state: { ...state, ...state.checkpoint, status: 'playing', pending: null, script: null },
        events: [{ type: 'checkpoint-restored' }] };
    },
  };
}

export function playKeys(sim: WorldSim, stage: Stage, legend: Legend, options: WorldOptions, keys: readonly Key[]): WorldStepResult {
  let state = sim.init(stage, legend, options);
  const events: WorldEvent[] = [];
  for (const key of keys) {
    const result = sim.step(state, key, stage, legend, options);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

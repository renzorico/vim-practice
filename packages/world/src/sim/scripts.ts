import { checkGoals, usedSkills } from '@escape/curriculum';
import type { Engine, Key } from '@escape/engine';
import type { Legend, Stage, Trigger, WorldEvent, WorldState } from '../types.js';
import { applyBatch } from './effects.js';
import { distance, inside } from './movement.js';
import { atRest } from './turn.js';

export function eligible(state: WorldState, trigger: Trigger): boolean {
  return !(trigger.once && state.firedTriggers.includes(trigger.id))
    && (trigger.onlyIf === undefined || state.flags[trigger.onlyIf] === true)
    && (trigger.unless === undefined || state.flags[trigger.unless] !== true);
}

export function inReach(state: WorldState, trigger: Trigger): boolean {
  if (trigger.on !== 'interact') return false;
  if (trigger.target.type === 'area') return inside(state.engine.cursor, trigger.target.area);
  const targetId = trigger.target.entity;
  const entity = state.entities.find((entry) => entry.id === targetId);
  return entity !== undefined && distance(entity.at, state.engine.cursor) === 1;
}

export function openScript(state: WorldState, id: string, stage: Stage, engine: Engine, events?: WorldEvent[]): WorldState {
  const script = stage.scripts.find((entry) => entry.id === id);
  if (script === undefined) return state;
  events?.push({ type: 'script-opened', script: id });
  return { ...state, script: { id, engine: engine.init(state.solvedScripts[id] ?? script.startLines, script.startCursor), keys: 0, commands: [] } };
}

export function fire(state: WorldState, trigger: Trigger, stage: Stage, engine: Engine, events: WorldEvent[]): WorldState {
  events.push({ type: 'trigger-fired', trigger: trigger.id });
  const next = trigger.once ? { ...state, firedTriggers: [...state.firedTriggers, trigger.id] } : state;
  return trigger.opensScript === undefined ? next : openScript(next, trigger.opensScript, stage, engine, events);
}

export function stepScript(state: WorldState, key: Key, stage: Stage, legend: Legend, engine: Engine, events: WorldEvent[]): WorldState {
  const opened = state.script;
  if (opened === null) return state;
  const script = stage.scripts.find((entry) => entry.id === opened.id);
  if (script === undefined) return state;
  const solved = state.solvedScripts[script.id] !== undefined;
  const result = script.allowedCommands === undefined || solved ? engine.step(opened.engine, key)
    : engine.step(opened.engine, key, { allowedCommands: script.allowedCommands });
  // Let the engine parse motions and prefixes. Reject entry to editing modes,
  // completed edits (including no-op edits), and any buffer mutation.
  if (solved && (result.state.mode === 'insert' || result.state.mode === 'operator-pending'
    || result.state.changeInProgress !== null
    || result.state.lines.join('\n') !== opened.engine.lines.join('\n')
    || result.commands.some((command) => ['edit', 'operator', 'undo', 'repeat'].includes(command.kind))
    || result.commands.some((command) => command.kind === 'ex' && ![':q', ':q!'].includes(command.id)))) {
    return { ...state, script: { ...opened, engine: { ...opened.engine, pendingKeys: [], commandLine: '',
      mode: opened.engine.mode === 'command-line' ? 'normal' : opened.engine.mode } } };
  }
  const commands = [...opened.commands, ...result.commands];
  for (const command of result.commands) events.push({ type: 'command', command, in: 'script' });
  if (result.error !== null) events.push({ type: 'engine-error', error: result.error });
  let next: WorldState = { ...state, script: { ...opened, engine: result.state, commands, keys: opened.keys + 1 } };
  const skills = usedSkills(commands);
  const completed = atRest(result.state) && (result.commands.length > 0 || opened.engine.mode === 'insert');
  if (!solved && result.error === null && completed && checkGoals(script.goals, result.state).every(Boolean)
    && (script.mustUse ?? []).every((skill) => skills.has(skill))) {
    next = { ...next, solvedScripts: { ...next.solvedScripts, [script.id]: result.state.lines } };
    events.push({ type: 'script-solved', script: script.id, keys: opened.keys + 1 });
    next = applyBatch(next, script.effects, stage, legend, events);
    events.push({ type: 'script-closed', script: script.id, solved: true });
    return { ...next, script: null };
  }
  if (result.state.quitRequested) {
    events.push({ type: 'script-closed', script: script.id, solved: next.solvedScripts[script.id] !== undefined });
    next = { ...next, script: null, engine: stage.autoScript === script.id && next.solvedScripts[script.id] === undefined
      ? { ...next.engine, quitRequested: true } : next.engine };
  }
  return next;
}

import { createEngine, type EngineState, type Key, type Position } from '@escape/engine';
import { stages } from '../content.js';
import { stageCommands } from '../session.js';
import { cellOf, standOf, type Draft, type DraftTask } from './drafts.js';

const engine = createEngine();

export interface DraftState {
  readonly engine: EngineState;
  /** How many of the reach tasks are done; they are done in order. */
  readonly reached: number;
  /** Commands used since the last reach task was done. */
  readonly since: readonly string[];
  /** Commands used at all. */
  readonly used: readonly string[];
  /** Copies that were in their register at some point, as `register=text`. */
  readonly held: readonly string[];
  readonly error: string | null;
}

export const openDraft = (draft: Draft): DraftState =>
  ({ engine: engine.init(draft.lines, draft.cursor), reached: 0, since: [], used: [], held: [], error: null });

const reachTasks = (draft: Draft): readonly DraftTask[] => draft.tasks.filter(task => task.goal.type === 'reach');

/** The cell to go to now: the one to reach, or where to stand for an edit. */
export function goToCell(draft: Draft, state: DraftState): Position | undefined {
  const current = draft.tasks.find(task => !taskDone(draft, state, task));
  if (!current) return undefined;
  return current.goal.type === 'reach' ? cellOf(draft, current.goal) : standOf(current, state.engine.lines);
}

export function taskDone(draft: Draft, state: DraftState, task: DraftTask): boolean {
  if (task.goal.type === 'reach') return reachTasks(draft).indexOf(task) < state.reached;
  if (task.goal.type === 'hold') return state.held.includes(`${task.goal.register}=${task.goal.text}`);
  if (task.goal.type === 'use') return state.used.includes(task.goal.command);
  return !task.goal.unfinished(state.engine.lines.join('\n'));
}

const atRest = (state: EngineState): boolean => state.mode === 'normal' && state.pendingKeys.length === 0;

export function draftDone(draft: Draft, state: DraftState): boolean {
  return atRest(state.engine) && draft.tasks.every(task => taskDone(draft, state, task))
    && (draft.target === undefined || draft.target.join('\n') === state.engine.lines.join('\n'));
}

/** Everything the player has learned by the end of this stage, text stages included. */
export function draftCommands(stageId: string): readonly string[] {
  const last = stages.findIndex(item => item.stage.id === stageId);
  return [...new Set(stages.slice(0, last + 1).flatMap(item => stageCommands(item.stage)))];
}

/** One key. Pure: the caller keeps the result. */
export function draftKey(draft: Draft, state: DraftState, key: Key, commands: readonly string[]): DraftState {
  const result = engine.step(state.engine, key, { allowedCommands: commands });
  const ids = result.commands.map(command => command.id);
  const next: DraftState = { ...state, engine: result.state, since: [...state.since, ...ids], used: [...state.used, ...ids],
    held: [...state.held, ...draft.tasks.flatMap(({ goal }) => goal.type === 'hold' && result.state.registers[goal.register]?.text === goal.text
      ? [`${goal.register}=${goal.text}`] : [])],
    error: result.error?.message ?? null };
  const task = draft.tasks.find(item => !taskDone(draft, next, item));
  if (task?.goal.type !== 'reach' || !atRest(next.engine)) return next;
  const cell = cellOf(draft, task.goal);
  const arrived = next.engine.cursor.line === cell.line && next.engine.cursor.col === cell.col;
  // Reached, but not with the key the task is about: it stays, and the sheet says so.
  if (!arrived || !task.goal.by.some(command => next.since.includes(command))) return next;
  return { ...next, reached: next.reached + 1, since: [] };
}

/** The player stands on the cell, but got there some other way. */
export function reachedOtherwise(draft: Draft, state: DraftState): boolean {
  const task = draft.tasks.find(item => !taskDone(draft, state, item));
  const cell = task?.goal.type === 'reach' ? cellOf(draft, task.goal) : undefined;
  return cell !== undefined && state.since.length > 0 && atRest(state.engine)
    && state.engine.cursor.line === cell.line && state.engine.cursor.col === cell.col;
}

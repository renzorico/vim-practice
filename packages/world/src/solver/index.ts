import { parseKeys } from '@escape/engine';
import type { Key } from '@escape/engine';
import { playKeys } from '../sim/index.js';
import type { Legend, Stage, WorldOptions, WorldSim, WorldState, Trigger } from '../types.js';

export interface StageSolution {
  readonly keys: readonly Key[];
  readonly turns: number;
  readonly expanded: number;
}

export interface StageSolveLimits {
  readonly maxTurns?: number;
  readonly maxExpanded?: number;
}

const MOTIONS = new Set([
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G',
  'f', 'F', 't', 'T', ';', ',', '%', '{', '}', 'n', 'N', '*', '#',
]);
const FINDS = new Set(['f', 'F', 't', 'T']);

interface Node {
  readonly state: WorldState;
  readonly keys: readonly Key[];
  readonly identity: string;
  readonly order: number;
}

function compare(a: Node, b: Node): number {
  return a.state.turn - b.state.turn || a.keys.length - b.keys.length || a.order - b.order;
}

/** Uniform-cost frontier, as in the curriculum solver, ordered by turns then keys. */
class Frontier {
  private readonly heap: Node[] = [];

  push(node: Node): void {
    let index = this.heap.length;
    this.heap.push(node);
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      if (parent === undefined || compare(parent, node) <= 0) break;
      this.heap[index] = parent;
      index = parentIndex;
    }
    this.heap[index] = node;
  }

  pop(): Node | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (last === undefined || this.heap.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.heap.length) {
      let childIndex = index * 2 + 1;
      let child = this.heap[childIndex];
      const right = this.heap[childIndex + 1];
      if (right !== undefined && child !== undefined && compare(right, child) < 0) {
        childIndex += 1;
        child = right;
      }
      if (child === undefined || compare(last, child) <= 0) break;
      this.heap[index] = child;
      index = childIndex;
    }
    this.heap[index] = last;
    return first;
  }
}

const SATURATING = new Set([
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '{', '}', 'n', 'N', '*', '#',
  'f', 'F', 't', 'T',
]);

/** Generate counts lazily; feedback is the simulated identity, or null for a rejection. */
function* fieldActions(
  state: WorldState, commands: readonly string[], legend: Legend,
): Generator<readonly Key[], void, string | null> {
  const characters = [...new Set((state.engine.lines[state.engine.cursor.line] ?? '').split(''))].sort();
  const dimension = Math.max(state.engine.lines.length, ...state.engine.lines.map((line) => line.length));
  const totalCells = state.engine.lines.reduce((total, line) => total + line.length, 0);
  for (const command of [...new Set(commands)].sort()) {
    if (command === ':w') {
      yield [':', 'w', '<CR>'];
      continue;
    }
    if (command === 'u' || command === '<C-r>') {
      yield [command];
      continue;
    }
    if (command === 'x' || command === 'r' || command === 'dd') {
      const length = command === 'dd' ? state.engine.lines.length : state.engine.lines[state.engine.cursor.line]?.length ?? 0;
      const sequences = command === 'dd' ? [['d', 'd']] : command === 'x' ? [['x']] : legend.tiles.filter(tile => tile.walkable).map(tile => ['r', tile.char]);
      for (const sequence of sequences) {
        let previous: string | null = null;
        for (let count = 1; count <= length; count += 1) {
          const current = yield count === 1 ? sequence : [...String(count), ...sequence];
          // A rejected landing can become walkable with a larger edit (x vs 4x).
          // Replacement counts can match inside an unchanged run before reaching a barrier.
          if (command !== 'r' && current !== null && current === previous) break;
          previous = current;
        }
      }
      continue;
    }
    if (!MOTIONS.has(command)) continue;
    const sequences = FINDS.has(command) ? characters.map((char) => [command, char]) : [parseKeys(command)];
    for (const sequence of sequences) {
      let previous = yield sequence;
      if (['0', '^'].includes(command)) continue;
      const maxCount = command === '%' ? 100
        : ['w', 'b', 'e', 'W', 'B', 'E', '{', '}', 'n', 'N', '*', '#'].includes(command) ? totalCells : dimension;
      for (let count = command === 'G' || command === '%' ? 1 : 2; count <= maxCount; count += 1) {
        const current = yield [...String(count), ...sequence];
        // Absolute line/percentage counts must keep scanning: adjacent counts can round
        // to the same destination before a later count reaches a new one.
        if (SATURATING.has(command) && (current === null || current === previous)) break;
        previous = current;
      }
    }
  }
}

/** Mirror only the contract's interaction reach; the sim chooses and fires the trigger. */
function canInteract(state: WorldState, trigger: Trigger): boolean {
  if (trigger.on !== 'interact' || (trigger.once && state.firedTriggers.includes(trigger.id))
    || (trigger.onlyIf !== undefined && state.flags[trigger.onlyIf] !== true)
    || (trigger.unless !== undefined && state.flags[trigger.unless] === true)) return false;
  const cursor = state.engine.cursor;
  if (trigger.target.type === 'area') {
    const { from, to } = trigger.target.area;
    return cursor.line >= from.line && cursor.line <= to.line && cursor.col >= from.col && cursor.col <= to.col;
  }
  const id = trigger.target.entity;
  const entity = state.entities.find((entry) => entry.id === id);
  return entity !== undefined && Math.abs(entity.at.line - cursor.line) + Math.abs(entity.at.col - cursor.col) === 1;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function periodFor(stage: Stage): number {
  const entities = [...stage.entities, ...stage.scripts.flatMap((script) => script.effects.flatMap(
    (effect) => effect.type === 'spawn' ? [effect.entity] : [],
  ))];
  return entities.reduce((period, entity) => period / gcd(period, entity.every) * entity.every, 1);
}

function identity(state: WorldState, period: number, history: boolean): string {
  const engine = state.engine;
  return JSON.stringify([
    engine.lines, history ? [engine.undoStack, engine.redoStack] : null, engine.cursor, engine.desiredCol, engine.lastFind, engine.lastSearch, engine.saved, engine.modified,
    state.entities.map((entity) => [entity.id, entity.at, entity.pathIndex]),
    state.hearts, state.turn % period,
    Object.keys(state.flags).sort().map((flag) => [flag, state.flags[flag]]),
    Object.keys(state.solvedScripts).sort().map((id) => [id, state.solvedScripts[id]]),
    [...state.firedTriggers].sort(), state.script?.id ?? null, state.status,
  ]);
}

export function solveStage(
  sim: WorldSim, stage: Stage, legend: Legend, options: WorldOptions, limits: StageSolveLimits = {},
): StageSolution | null {
  const maxTurns = limits.maxTurns ?? 60;
  const maxExpanded = limits.maxExpanded ?? 200000;
  if (!Number.isFinite(maxTurns) || maxTurns < 0 || !Number.isFinite(maxExpanded) || maxExpanded < 0) return null;
  const commands = options.learnedCommands.filter((command) => stage.allowedCommands === undefined
    || stage.allowedCommands.includes(command));
  const period = periodFor(stage);
  // Undo/redo futures depend on snapshots, even when current text and cursor match.
  const history = commands.includes('u') || commands.includes('<C-r>');
  const initial = sim.init(stage, legend, options);
  const frontier = new Frontier();
  let order = 0;
  const root: Node = { state: initial, keys: [], identity: identity(initial, period, history), order: order++ };
  frontier.push(root);
  const best = new Map<string, Node>([[root.identity, root]]);
  let expanded = 0;
  for (let node = frontier.pop(); node !== undefined; node = frontier.pop()) {
    if (best.get(node.identity) !== node) continue;
    if (node.state.status === 'dead' || node.state.hearts <= 0) continue;
    if (node.state.status === 'cleared') return { keys: node.keys, turns: node.state.turn, expanded };
    if (expanded >= maxExpanded) return null;
    expanded += 1;
    let actions: Generator<readonly Key[], void, string | null>;
    if (node.state.script !== null) {
      const script = stage.scripts.find((entry) => entry.id === node.state.script?.id);
      // Solved scripts are read-only. Closing one is the only useful action.
      actions = (function* () {
        if (script !== undefined) yield node.state.solvedScripts[script.id] === undefined
          ? script.solution : [':', 'q', '<CR>'];
      })();
    } else {
      actions = (function* () {
        yield* fieldActions(node.state, commands, legend);
        if (stage.triggers.some((trigger) => canInteract(node.state, trigger))) yield ['<CR>'];
      })();
    }
    const prefixes = new Map<Key, WorldState>();
    const successors = new Map<string, Node>();
    let feedback: string | null = null;
    for (let trial = actions.next(); !trial.done; trial = actions.next(feedback)) {
      const action = trial.value;
      feedback = null;
      let state = node.state;
      const keys: Key[] = [];
      let rejected = false;
      for (const [index, key] of action.entries()) {
        let next = index === 0 && node.state.script === null ? prefixes.get(key) : undefined;
        if (next === undefined) {
          const result = sim.step(state, key, stage, legend, options);
          if (result.events.some((event) => event.type === 'bump' || event.type === 'engine-error')) {
            rejected = true;
            break;
          }
          next = result.state;
          if (index === 0 && node.state.script === null) prefixes.set(key, next);
        }
        state = next;
        keys.push(key);
        if (state.status !== 'playing' || (node.state.script !== null && state.script === null)) break;
      }
      if (!rejected) feedback = identity(state, period, history);
      if (rejected || state.status === 'dead' || state.hearts <= 0 || state.turn > maxTurns
        || state.pending !== null || state.engine.mode !== 'normal' || state.engine.pendingKeys.length !== 0) continue;
      // Script solutions are atomic, never search their intermediate editor states.
      if (node.state.script !== null && state.script !== null) continue;
      const next: Node = { state, keys: [...node.keys, ...keys], identity: feedback ?? identity(state, period, history), order: order++ };
      const sibling = successors.get(next.identity);
      if (sibling === undefined || compare(next, sibling) < 0) successors.set(next.identity, next);
    }
    for (const next of successors.values()) {
      const previous = best.get(next.identity);
      if (previous !== undefined && compare(previous, next) <= 0) continue;
      best.set(next.identity, next);
      frontier.push(next);
    }
  }
  return null;
}

export function finalizeStage(stage: Stage, solution: StageSolution): Stage {
  return { ...stage, parTurns: solution.turns, solution: [...solution.keys] };
}

/** Public replay helper accepts the simulation implementation supplied by the caller. */
export function stageReplayIssue(sim: WorldSim, stage: Stage, legend: Legend, options: WorldOptions): string | null {
  const { state } = playKeys(sim, stage, legend, options, stage.solution);
  if (state.status === 'dead' || state.hearts <= 0) return 'The player is dead at the end of the solution.';
  if (state.status !== 'cleared') return 'The solution does not clear the stage.';
  if (state.turn > stage.parTurns) return `The solution takes ${state.turn} turns, more than parTurns (${stage.parTurns}).`;
  return null;
}

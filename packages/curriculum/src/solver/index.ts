import type { EngineState, Key } from '@escape/engine';
import { parseKeys } from '@escape/engine';
import { SKILLS } from '../catalog.js';
import type { LevelRun } from '../contracts.js';
import type { SolveFn } from '../phase3.js';
import { startLevel, stepLevel, usedSkills } from '../runner/index.js';
import type { Level } from '../types.js';

const DEFAULT_MAX_KEYS = 14;
const MIN_COUNT = 2;
const MAX_COUNT = 9;
const FIND_COMMANDS = new Set(['f', 'F', 't', 'T']);
// Command vocabulary only; all movement and command validation belong to the engine.
const MOTIONS = new Set([
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G',
  'f', 'F', 't', 'T', ';', ',', '%', '{', '}',
]);

interface Action {
  readonly keys: readonly Key[];
  readonly name: string;
}

interface SearchNode {
  readonly run: LevelRun;
  readonly keys: readonly Key[];
  readonly actions: readonly string[];
  readonly identity: string;
}

function compare(left: SearchNode, right: SearchNode): number {
  const cost = left.keys.length - right.keys.length;
  if (cost !== 0) return cost;
  const actions = left.actions.length - right.actions.length;
  if (actions !== 0) return actions;
  for (let index = 0; index < left.actions.length; index += 1) {
    const a = left.actions[index] ?? '';
    const b = right.actions[index] ?? '';
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

/** Min-heap ordered by keystrokes, command count, then command strings. */
class Frontier {
  private readonly nodes: SearchNode[] = [];

  push(node: SearchNode): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.nodes[parentIndex];
      if (parent === undefined || compare(parent, node) <= 0) break;
      this.nodes[index] = parent;
      index = parentIndex;
    }
    this.nodes[index] = node;
  }

  pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (last === undefined || this.nodes.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let childIndex = index * 2 + 1;
      let child = this.nodes[childIndex];
      const right = this.nodes[childIndex + 1];
      if (right !== undefined && child !== undefined && compare(right, child) < 0) {
        childIndex += 1;
        child = right;
      }
      if (child === undefined || compare(last, child) <= 0) break;
      this.nodes[index] = child;
      index = childIndex;
    }
    this.nodes[index] = last;
    return first;
  }
}

function commandsFor(level: Level): readonly string[] {
  if (level.allowedCommands !== undefined) return level.allowedCommands;
  const skills = new Set([...level.teaches, ...level.requires]);
  return [...SKILLS.filter((skill) => skills.has(skill.id)).flatMap((skill) => skill.commands), ':q', ':q!'];
}

function actionsFor(commands: readonly string[], lines: readonly string[], counts: boolean): Action[] {
  const characters = [...new Set(lines.flatMap((line) => [...line]))].sort();
  const actions = new Map<string, Action>();
  for (const command of commands) {
    const sequences = FIND_COMMANDS.has(command)
      ? characters.map((character) => [command, character])
      : [command.startsWith(':') ? [...command, '<CR>'] : parseKeys(command)];
    for (const keys of sequences) {
      const add = (sequence: readonly Key[]): void => {
        if (sequence.length === 0) return;
        const name = sequence.join('');
        actions.set(JSON.stringify(sequence), { keys: sequence, name });
      };
      add(keys);
      if (counts && MOTIONS.has(command)) {
        for (let count = MIN_COUNT; count <= MAX_COUNT; count += 1) add([String(count), ...keys]);
      }
    }
  }
  return [...actions.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function intern(value: string, values: Map<string, number>): number {
  const previous = values.get(value);
  if (previous !== undefined) return previous;
  const id = values.size;
  values.set(value, id);
  return id;
}

/** Intern contents, so motion edges need not repeatedly hash the entire buffer. */
function stateIdentity(level: Level): (run: LevelRun) => string {
  const lines = new WeakMap<readonly string[], number>();
  const registers = new WeakMap<EngineState['registers'], number>();
  const buffers = new Map<string, number>();
  const registerContents = new Map<string, number>();
  const mustUse = [...new Set(level.mustUse ?? [])].sort();
  return (run) => {
    const { state } = run;
    let buffer = lines.get(state.lines);
    if (buffer === undefined) {
      buffer = intern(JSON.stringify(state.lines), buffers);
      lines.set(state.lines, buffer);
    }
    let registerValues = registers.get(state.registers);
    if (registerValues === undefined) {
      registerValues = intern(JSON.stringify(Object.keys(state.registers).sort().map((name) => {
        const value = state.registers[name];
        return [name, value?.text, value?.linewise];
      })), registerContents);
      registers.set(state.registers, registerValues);
    }
    const skills = mustUse.length === 0 ? undefined : usedSkills(run.commandLog);
    return JSON.stringify([
      buffer, state.cursor.line, state.cursor.col, state.mode, state.pendingKeys,
      registerValues, state.quitRequested, state.saved, state.desiredCol, state.lastFind,
      skills === undefined ? [] : mustUse.filter((skill) => skills.has(skill)),
    ]);
  };
}

export const solve: SolveFn = (level, options) => {
  const maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS;
  if (!Number.isFinite(maxKeys) || maxKeys < 0) return null;
  const run = startLevel(level);
  // The runner evaluates victory on a keypress; an already solved room needs none.
  if (run.goalsMet.every(Boolean) && (level.mustUse?.length ?? 0) === 0) return { keys: [] };
  if (maxKeys < 1) return null;
  const commands = commandsFor(level);
  const counts = [...level.teaches, ...level.requires].includes('motion.count');
  const actionCache = new WeakMap<readonly string[], readonly Action[]>();
  const identity = stateIdentity(level);
  const initial: SearchNode = { run, keys: [], actions: [], identity: identity(run) };
  const best = new Map<string, SearchNode>([[initial.identity, initial]]);
  const frontier = new Frontier();
  frontier.push(initial);
  let winningCost = maxKeys;

  for (let node = frontier.pop(); node !== undefined; node = frontier.pop()) {
    if (node.run.status === 'won') return { keys: node.keys };
    if (best.get(node.identity) !== node || node.keys.length >= winningCost) continue;
    let actions = actionCache.get(node.run.state.lines);
    if (actions === undefined) {
      actions = actionsFor(commands, node.run.state.lines, counts);
      actionCache.set(node.run.state.lines, actions);
    }
    // Counted motions share their first key. Run that prefix once per vertex.
    const prefixes = new Map<Key, LevelRun>();
    for (const action of actions) {
      const cost = node.keys.length + action.keys.length;
      if (cost > winningCost) continue;
      let nextRun = node.run;
      for (const [index, key] of action.keys.entries()) {
        if (index === 0 && action.keys.length > 1) {
          const cached = prefixes.get(key);
          nextRun = cached ?? stepLevel(nextRun, key);
          if (cached === undefined) prefixes.set(key, nextRun);
        } else {
          nextRun = stepLevel(nextRun, key);
        }
        if (nextRun.status !== 'playing') break;
        // Never interpret the next action's keys as insert-mode text.
        if (nextRun.state.mode === 'insert') break;
      }
      if (nextRun.status === 'failed') continue;
      // Only complete command boundaries are search vertices.
      if (nextRun.status !== 'won' && (nextRun.state.mode === 'insert'
        || nextRun.state.mode === 'command-line' || nextRun.state.pendingKeys.length !== 0)) continue;
      const nextIdentity = identity(nextRun);
      const previous = best.get(nextIdentity);
      if (nextRun.status !== 'won' && previous !== undefined
        && (previous.keys.length < cost || (previous.keys.length === cost
          && previous.actions.length < node.actions.length + 1))) continue;
      const next: SearchNode = {
        run: nextRun,
        keys: [...node.keys, ...action.keys],
        actions: [...node.actions, action.name],
        identity: nextIdentity,
      };
      if (nextRun.status === 'won') {
        winningCost = Math.min(winningCost, next.keys.length);
        frontier.push(next);
        continue;
      }
      if (previous !== undefined && compare(previous, next) <= 0) continue;
      best.set(next.identity, next);
      frontier.push(next);
    }
  }
  return null;
};

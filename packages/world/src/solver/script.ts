import { checkGoals, usedSkills } from '@escape/curriculum';
import type { Engine, EngineState, Key } from '@escape/engine';
import type { Script } from '../types.js';

interface ScriptSearchLimits {
  readonly maxKeys: number;
  readonly maxExpanded: number;
  /** Explicit finite alphabet: a result is shortest only within this vocabulary. */
  readonly alphabet: readonly Key[];
}
interface ScriptSearchResult {
  readonly solution: readonly Key[] | null;
  readonly expanded: number;
  readonly exhausted: boolean;
}

/** Bounded breadth-first search by individual keys. All Vim semantics stay in Engine.step. */
export function searchScript(engine: Engine, script: Script, limits: ScriptSearchLimits): ScriptSearchResult {
  interface Node {
    readonly state: EngineState;
    readonly keys: readonly Key[];
    readonly skills: readonly string[];
  }
  const alphabet = [...new Set(limits.alphabet)];
  const initial: Node = { state: engine.init(script.startLines, script.startCursor), keys: [], skills: [] };
  const queue: Node[] = [initial];
  const identity = (node: Node): string => JSON.stringify([node.state, node.skills]);
  const visited = new Set([identity(initial)]);
  let expanded = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (!node) break;
    const atRest = node.state.mode === 'normal' && node.state.pendingKeys.length === 0;
    if (atRest && checkGoals(script.goals, node.state).every(Boolean)
      && (script.mustUse ?? []).every(skill => node.skills.includes(skill))) {
      return { solution: node.keys, expanded, exhausted: false };
    }
    if (node.keys.length >= limits.maxKeys) continue;
    if (expanded >= limits.maxExpanded) return { solution: null, expanded, exhausted: true };
    expanded += 1;
    for (const key of alphabet) {
      const result = script.allowedCommands === undefined ? engine.step(node.state, key)
        : engine.step(node.state, key, { allowedCommands: script.allowedCommands });
      if (result.error || result.state.quitRequested) continue;
      const skills = [...new Set([...node.skills, ...usedSkills(result.commands)])].sort();
      const next: Node = { state: result.state, keys: [...node.keys, key], skills };
      const id = identity(next);
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(next);
    }
  }
  return { solution: null, expanded, exhausted: false };
}

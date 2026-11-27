import { checkGoals, usedSkills } from '@escape/curriculum';
import { createEngine, type Key } from '@escape/engine';
import type { Script } from '@escape/world';

const engine = createEngine();

/** Replays keys; returns the number of keys at which the script is first solved at rest (goals and `mustUse`), or null. */
export function solvedAt(script: Script, keys: readonly Key[], allowedCommands: readonly string[]): number | null {
  let state = engine.init(script.startLines, script.startCursor);
  const skills = new Set<string>();
  const solved = (): boolean => state.mode === 'normal' && state.pendingKeys.length === 0
    && checkGoals(script.goals, state).every(Boolean) && (script.mustUse ?? []).every(skill => skills.has(skill));
  if (solved()) return 0;
  for (let index = 0; index < keys.length; index += 1) {
    const result = engine.step(state, keys[index] ?? '', { allowedCommands });
    if (result.error) return null;
    state = result.state;
    for (const skill of usedSkills(result.commands)) skills.add(skill);
    if (solved()) return index + 1;
  }
  return null;
}

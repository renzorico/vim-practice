import { parseKeys } from '../../packages/engine/src/keys.js';
import type { Level } from '../../packages/curriculum/src/types.js';

export interface LevelProblem {
  readonly levelId: string;
  readonly message: string;
}

/** Every occurrence of a duplicated id is reported, so both files can be found. */
export function checkDuplicateIds(levels: readonly Level[]): LevelProblem[] {
  const counts = new Map<string, number>();
  for (const level of levels) counts.set(level.id, (counts.get(level.id) ?? 0) + 1);
  return levels
    .filter((level) => (counts.get(level.id) ?? 0) > 1)
    .map((level) => ({ levelId: level.id, message: `duplicate id "${level.id}"` }));
}

/**
 * A required skill must be taught by some level other than the one requiring it.
 * A level that is the only teacher of its own requirement is also reported.
 */
export function checkRequires(levels: readonly Level[]): LevelProblem[] {
  return levels.flatMap((level) =>
    level.requires
      .filter((skill) => !levels.some((other) => other !== level && other.teaches.includes(skill)))
      .map((skill) => ({ levelId: level.id, message: `requires "${skill}", which no other level teaches` })),
  );
}

/** Every level except review levels must teach at least one skill. */
export function checkTeaches(levels: readonly Level[]): LevelProblem[] {
  return levels
    .filter((level) => level.type !== 'review' && level.teaches.length === 0)
    .map((level) => ({ levelId: level.id, message: 'teaches nothing (only review levels may)' }));
}

/** Each solution entry must be exactly one canonical Vim notation key, e.g. "<Esc>", not "<esc>" or "dw". */
export function checkSolutionKeys(levels: readonly Level[]): LevelProblem[] {
  return levels.flatMap((level) =>
    level.solution
      .filter((key) => {
        const tokens = parseKeys(key);
        return tokens.length !== 1 || tokens[0] !== key;
      })
      .map((key) => ({ levelId: level.id, message: `solution key "${key}" is not canonical Vim notation` })),
  );
}

/** Runs every check and returns all problems. An empty list means the levels pass. */
export function checkLevels(levels: readonly Level[]): LevelProblem[] {
  return [
    ...checkDuplicateIds(levels),
    ...checkRequires(levels),
    ...checkTeaches(levels),
    ...checkSolutionKeys(levels),
  ];
}

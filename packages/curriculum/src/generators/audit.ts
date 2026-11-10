import { SKILLS } from '../catalog.js';
import type { GeneratedRoom } from '../phase3.js';
import { startLevel, stepLevel } from '../runner/index.js';
import type { Level, SkillId } from '../types.js';

type Run = ReturnType<typeof startLevel>;

/** Motion skills whose rooms must be won faster with the taught skill than without it. */
export const isAuditedSkill = (skill: SkillId): boolean => skill.startsWith('motion.') && skill !== 'motion.hjkl';

/**
 * True when some path that avoids the taught skill's own commands wins in at most as many keys as the
 * intended solution. Such a room would not make the taught skill the efficient path, so the generator redraws it.
 * Search: cheapest-first over complete commands, deduplicated on engine state, capped at the intended length.
 */
export function hasEarlierSkillShortcut(room: GeneratedRoom, skill: SkillId): boolean {
  const { intendedSolution, ...rest } = room;
  const level: Level = { ...rest, par: intendedSolution.length, solution: intendedSolution };
  const own = SKILLS.find((entry) => entry.id === skill)?.commands ?? [];
  const actions = (room.allowedCommands ?? [])
    .filter((command) => !own.includes(command) && !command.startsWith(':'))
    .map((command) => [...command]);
  const maxCost = intendedSolution.length;
  const buckets: Map<string, Run>[] = Array.from({ length: maxCost + 1 }, () => new Map());
  const seen = new Set<string>();
  const start = startLevel(level);
  buckets[0]?.set(JSON.stringify(start.state), start);
  for (let cost = 0; cost <= maxCost; cost += 1) {
    for (const [stateKey, run] of buckets[cost] ?? []) {
      if (seen.has(stateKey)) continue;
      seen.add(stateKey);
      if (run.status === 'won') return true;
      if (run.status !== 'playing') continue;
      for (const action of actions) {
        const nextCost = cost + action.length;
        if (nextCost > maxCost) continue;
        const after = action.reduce(stepLevel, run);
        buckets[nextCost]?.set(JSON.stringify(after.state), after);
      }
    }
  }
  return false;
}

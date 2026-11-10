import type { FinalizeRoomFn, RoomGenerator } from '../phase3.js';
import type { Level, SkillId } from '../types.js';
import { bigWordGenerator, wordGenerator } from './hops.js';
import { countGenerator, fileGenerator, hjklGenerator, lineGenerator } from './grid.js';
import { forceQuitGenerator, insertGenerator, quitGenerator, writeQuitGenerator } from './prologue.js';

export { createRng } from './rng.js';

export const GENERATORS: Readonly<Record<SkillId, RoomGenerator>> = {
  'ex.q': quitGenerator,
  'ex.q!': forceQuitGenerator,
  'mode.insert': insertGenerator,
  'ex.wq': writeQuitGenerator,
  'motion.hjkl': hjklGenerator,
  'motion.word': wordGenerator,
  'motion.WORD': bigWordGenerator,
  'motion.line': lineGenerator,
  'motion.file': fileGenerator,
  'motion.count': countGenerator,
};

/**
 * Computes par and the stored solution. The solver is injected, never imported. The solver wins ties:
 * its answer is used whenever it is not longer than the generator's intended solution.
 */
export const finalizeRoom: FinalizeRoomFn = (room, solve) => {
  const { intendedSolution, ...level } = room;
  const draft: Level = { ...level, par: intendedSolution.length, solution: intendedSolution };
  const found = solve(draft);
  const solution = found !== null && found.keys.length <= intendedSolution.length ? found.keys : intendedSolution;
  return { ...level, par: solution.length, solution };
};

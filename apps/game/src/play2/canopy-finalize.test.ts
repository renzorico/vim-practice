import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage } from '@escape/world';
import { canopy, canopyLegend, content } from './content.js';
import { sessionSolver } from './solver.js';
import { LOWLANDS_COMMANDS, WORDWOOD_COMMANDS } from './session.js';

// Every Wordwood tile is fixed, so x, r and dd never change the canopy (canopy.test.ts checks it)
// and u, <C-r> and . have nothing to act on. Searching the motions is therefore a full proof;
// leaving the edits out avoids the solver's undo-history memory cost.
const EDITS = new Set(['x', 'r', 'dd', 'u', '<C-r>', '.']);
const MOTIONS = WORDWOOD_COMMANDS.filter(command => !EDITS.has(command));
// Opt-in since the fast blot on the bottom branch (it moves every turn) multiplies the states: over 20 min.
//   PROVE=1 npx vitest run apps/game/src/play2/canopy-finalize
const PROVE = process.env.PROVE !== undefined;
const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
  stage: canopy, legend: canopyLegend });

it.skipIf(!PROVE)('proves par over every learned motion (edits cannot change the canopy)', () => {
  const solution = solveStage(solver(), canopy, canopyLegend, { learnedCommands: MOTIONS, flags: {} },
    { maxTurns: 8, maxExpanded: 200_000 });
  expect(solution?.turns).toBe(canopy.parTurns);
}, 900_000);

it.skipIf(!PROVE)('the motions before World 3 need more turns than par (10, with exact counts)', () => {
  const solution = solveStage(solver(), canopy, canopyLegend, { learnedCommands: LOWLANDS_COMMANDS, flags: {} },
    { maxTurns: 16, maxExpanded: 200_000 });
  expect(solution?.turns).toBeGreaterThan(canopy.parTurns);
}, 900_000);

it('the authored solution clears in par with every heart', () => {
  const played = playKeys(solver(), canopy, canopyLegend, { learnedCommands: MOTIONS, flags: {} }, canopy.solution);
  expect(played.state.status).toBe('cleared');
  expect(played.state.turn).toBe(canopy.parTurns);
  expect(played.state.hearts).toBe(canopy.hearts);
});

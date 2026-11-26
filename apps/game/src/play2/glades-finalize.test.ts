import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage } from '@escape/world';
import { content, glades, gladesLegend } from './content.js';
import { GLADES_COMMANDS, WORDWOOD_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

// Every character tile is fixed, and deleting a clearing also deletes fixed rows.
// glades.test.ts proves edits leave terrain unchanged (no-op edits can spend a turn), so undo,
// redo and repeat have no edits to act on. Search motions without undo histories.
const EDITS = new Set(['x', 'r', 'dd', 'u', '<C-r>', '.']);
it('proves the Glades optimum', () => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: glades, legend: gladesLegend });
  const options = { learnedCommands: GLADES_COMMANDS.filter(command => !EDITS.has(command)), flags: {} };
  const solution = solveStage(solver, glades, gladesLegend, options, { maxTurns: 8, maxExpanded: 200_000 });
  expect(solution).not.toBeNull();
  if (!solution) throw new Error('No solution');
  expect(playKeys(solver, glades, gladesLegend, options, solution.keys).state.status).toBe('cleared');
  expect(solution.turns).toBe(glades.parTurns);
}, 120_000);
it('needs its own keys: the Wordwood motions alone find no route within 8 turns (word runs stop at brambles)', () => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: glades, legend: gladesLegend });
  const options = { learnedCommands: WORDWOOD_COMMANDS.filter(command => !EDITS.has(command)), flags: {} };
  expect(solveStage(solver, glades, gladesLegend, options, { maxTurns: 8, maxExpanded: 200_000 })).toBeNull();
}, 120_000);
it('the authored solution clears in par', () => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: glades, legend: gladesLegend });
  const played = playKeys(solver, glades, gladesLegend, { learnedCommands: GLADES_COMMANDS, flags: {} }, glades.solution);
  expect(played.state.status).toBe('cleared');
  expect(played.state.turn).toBe(glades.parTurns);
});

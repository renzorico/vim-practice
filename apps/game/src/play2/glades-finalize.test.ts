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
it.each([['Glades', GLADES_COMMANDS], ['old motions', WORDWOOD_COMMANDS]] as const)('proves the %s optimum', (name, commands) => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: glades, legend: gladesLegend });
  const options = { learnedCommands: commands.filter(command => !EDITS.has(command)), flags: {} };
  const solution = solveStage(solver, glades, gladesLegend, options, { maxTurns: 8, maxExpanded: 200_000 });
  expect(solution).not.toBeNull();
  if (!solution) throw new Error('No solution');
  expect(playKeys(solver, glades, gladesLegend, options, solution.keys).state.status).toBe('cleared');
  expect(solution.turns).toBe(name === 'Glades' ? glades.parTurns : 8);
  if (name === 'Glades') expect(solution.keys).toEqual(glades.solution);
}, 120_000);

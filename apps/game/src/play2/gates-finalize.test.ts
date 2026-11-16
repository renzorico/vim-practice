import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage } from '@escape/world';
import { content, gates, gatesLegend } from './content.js';
import { sessionSolver } from './solver.js';
// Full GATES_COMMANDS and GLADES_COMMANDS motions were searched at 15,000 expansions:
// both exhausted the cap. These focused searches reproduce the best known routes.
it.each([['Gates', ['h', 'l', 'G', '%']], ['old motions', ['h', 'l', 'G']]] as const)('searches %s motions', (name, commands) => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: gates, legend: gatesLegend });
  const options = { learnedCommands: commands, flags: {} };
  const solution = solveStage(solver, gates, gatesLegend, options, { maxTurns: 8, maxExpanded: 30000 });
  expect(solution?.turns).toBe(gates.parTurns);
  expect(solution).not.toBeNull();
  if (!solution) throw new Error('No solution within search budget');
  expect(playKeys(solver, gates, gatesLegend, options, solution.keys).state.status).toBe('cleared');
}, 120_000);

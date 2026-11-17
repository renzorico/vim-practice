import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage } from '@escape/world';
import { content, jetty, portLegend } from './content.js';
import { GATES_COMMANDS, PORT_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(),
  content, stage: jetty, legend: portLegend });
// The full PORT_COMMANDS search is too wide to reach depth 6 (null at 40,000 expansions), so par is
// proven on the stage's own vocabulary below; the old-vocabulary bound shows `d` is needed.
it('finds no route with the old vocabulary in the bounded search', () => {
  const solution = solveStage(solver(), jetty, portLegend, { learnedCommands: GATES_COMMANDS, flags: {} },
    { maxTurns: 10, maxExpanded: 40_000 });
  console.info('GATES SOLVER', solution);
  expect(solution).toBeNull();
}, 600_000);

it('finds and replays the teaching route in six turns', () => {
  const solution = solveStage(solver(), jetty, portLegend,
    { learnedCommands: ['b', 'd', '.', '<C-u>', '$'], flags: {} },
    { maxTurns: 6, maxExpanded: 10_000 });
  expect(solution?.turns).toBe(jetty.parTurns);
  expect(solution?.keys).toEqual(jetty.solution);
});

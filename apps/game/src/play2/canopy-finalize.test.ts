import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage } from '@escape/world';
import { canopy, canopyLegend, content } from './content.js';
import { sessionSolver } from './solver.js';

// Full learned-command search ran out of a 1.5 GB heap, including a retry
// dropping u/<C-r>/. as permitted by D-1. This smaller search proves only the
// find-and-ladder route; seven remains best known when all edits are available.
it('finds the authored seven-turn route in the focused motion search', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: canopy, legend: canopyLegend });
  const solution = solveStage(sim, canopy, canopyLegend, { learnedCommands: ['f', 't', ',', 'j'], flags: {} },
    { maxTurns: 7, maxExpanded: 6000 });
  expect(solution?.turns).toBe(canopy.parTurns);
  expect(solution?.keys).toEqual(canopy.solution);
}, 120_000);

// Moving the knothole onto branch (1,29) keeps it alive through edits and
// blocks the original thirteen-turn old-motion route; the new optimum is 14.
it('finds a fourteen-turn route with the old motions alone', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
    stage: canopy, legend: canopyLegend });
  const solution = solveStage(sim, canopy, canopyLegend, {
    learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$'], flags: {},
  }, { maxTurns: 14, maxExpanded: 6000 });
  expect(solution?.turns).toBe(14);
}, 120_000);

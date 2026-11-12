import { it, expect } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, finalizeStage, solveStage } from '@escape/world';
import { content, legend, stage } from './content.js';
import { sessionSolver } from './solver.js';
it('proves the story route with the real solver', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, legend, stage });
  const solution = solveStage(sim, stage, legend, { learnedCommands: ['h', 'j', 'k', 'l'], flags: {} }, { maxTurns: 15, maxExpanded: 30000 });
  expect(solution).not.toBeNull();
  if (solution) {
    const finalized = finalizeStage(stage, solution);
    expect(finalized).toEqual(stage);
  }
}, 120000);

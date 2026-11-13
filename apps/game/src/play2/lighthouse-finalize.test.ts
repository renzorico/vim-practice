import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage } from '@escape/world';
import { content, lighthouse as stage, lighthouseLegend as legend } from './content.js';
import { sessionSolver } from './solver.js';
import { LOWLANDS_COMMANDS } from './session.js';
it('proves the Lighthouse shortest route with the story-aware solver', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage, legend });
  const solution = solveStage(sim, stage, legend, { learnedCommands: LOWLANDS_COMMANDS, flags: {} }, { maxTurns: 12, maxExpanded: 30000 });
  expect(solution?.keys).toEqual(stage.solution);
  expect(solution?.turns).toBe(stage.parTurns);
}, 120000);

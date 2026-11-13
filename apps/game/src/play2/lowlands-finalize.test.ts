import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage } from '@escape/world';
import { content, lowlands as stage, lowlandsLegend as legend } from './content.js';
import { sessionSolver } from './solver.js';
import { LOWLANDS_COMMANDS } from './session.js';

it('proves the Lowlands with the actual solver and story', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage, legend });
  const solution = solveStage(sim, stage, legend, { learnedCommands: LOWLANDS_COMMANDS, flags: {} }, { maxTurns: 6, maxExpanded: 30000 });
  expect(solution?.keys).toEqual(stage.solution);
  expect(solution?.turns).toBe(stage.parTurns);
}, 120000);

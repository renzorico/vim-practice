/**
 * Glades par proof, off in CI (about 20 min, under 1 GB, with the stage's own command list):
 *   PROVE=1 npx vitest run apps/game/src/play2/glades-proof
 */
import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage } from '@escape/world';
import { content, glades, gladesLegend } from './content.js';
import { sessionSolver } from './solver.js';
import { stageCommands } from './session.js';

const SEARCH_CAP = 3_000_000;

it.skipIf(process.env.PROVE === undefined)('no route clears in fewer turns than par', () => {
  const solver = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage: glades, legend: gladesLegend });
  const options = { learnedCommands: stageCommands(glades), flags: {} };
  // A search at par expands about 92,000 states, so a null under par is not the cap running out.
  const atPar = solveStage(solver, glades, gladesLegend, options, { maxTurns: glades.parTurns, maxExpanded: SEARCH_CAP });
  expect(atPar?.turns).toBe(glades.parTurns);
  expect(atPar?.expanded ?? SEARCH_CAP).toBeLessThan(SEARCH_CAP / 10);
  expect(solveStage(solver, glades, gladesLegend, options, { maxTurns: glades.parTurns - 1, maxExpanded: SEARCH_CAP })).toBeNull();
}, 1_800_000);

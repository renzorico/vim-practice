import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { content, shaft, shaftLegend } from './content.js';
import { QUARRY_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage: shaft, legend: shaftLegend });

// Full search over the Shaft's commands. `.` and a retyped `4dd` both cost a turn, so the solver may pick either.
it('proves the Shaft: three drops, never one, because the beams will not delete', () => {
  expect(stageReplayIssue(solver(), shaft, shaftLegend, options)).toBeNull();
  const found = solveStage(solver(), shaft, shaftLegend, options, { maxTurns: shaft.parTurns, maxExpanded: 30_000, skipBumpedCounts: 10 });
  expect(found?.turns).toBe(shaft.parTurns);
}, 120_000);

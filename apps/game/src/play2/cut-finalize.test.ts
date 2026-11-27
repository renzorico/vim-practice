import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { content, cut, cutLegend } from './content.js';
import { QUARRY_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage: cut, legend: cutLegend });

// The full search over the Cut's commands (h j k l w b e 0 $ dd u <C-r>), through the story, proves par.
it('proves the Cut: dd, u, then <C-r> back to the start is the shortest clear', () => {
  expect(stageReplayIssue(solver(), cut, cutLegend, options)).toBeNull();
  const found = solveStage(solver(), cut, cutLegend, options, { maxTurns: cut.parTurns, maxExpanded: 30_000 });
  expect(found?.turns).toBe(cut.parTurns);
}, 600_000);

it('without <C-r>, bringing Dot back takes longer than par', () => {
  const found = solveStage(solver(), cut, cutLegend, { ...options, learnedCommands: QUARRY_COMMANDS.filter(command => command !== '<C-r>') },
    { maxTurns: cut.parTurns, maxExpanded: 30_000 });
  expect(found).toBeNull();
}, 600_000);

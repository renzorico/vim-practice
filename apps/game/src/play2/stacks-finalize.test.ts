import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage } from '@escape/world';
import { content, stacks, stacksLegend } from './content.js';
import { stageCommands } from './session.js';
import { sessionSolver } from './solver.js';

const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(),
  content, stage: stacks, legend: stacksLegend });
const options = () => ({ learnedCommands: stageCommands(stacks), flags: {} });

it('stores a par route that uses every taught key (iw, aw)', () => {
  const route = stacks.solution.join('');
  expect(route).toContain('diw');
  expect(route).toContain('daw');
});

it('replays the stored route at parTurns', () => {
  const result = playKeys(solver(), stacks, stacksLegend, options(), stacks.solution);
  expect(result.state.status).toBe('cleared');
  expect(result.state.turn).toBe(stacks.parTurns);
});

it('finds no route faster than parTurns with the full stage vocabulary', () => {
  const solution = solveStage(solver(), stacks, stacksLegend, options(),
    { maxTurns: stacks.parTurns - 1, maxExpanded: 200_000 });
  expect(solution).toBeNull();
}, 600_000);

import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage, stageReplayIssue } from '@escape/world';
import { content, notary, notaryLegend } from './content.js';
import { sessionSolver } from './solver.js';
import { stageCommands } from './session.js';

const solver = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
  stage: notary, legend: notaryLegend });
const options = { learnedCommands: stageCommands(notary), flags: {} };
const SEARCH_CAP = 3_000_000;

it('the stored route clears at par and uses every object the stage teaches', () => {
  expect(stageReplayIssue(solver(), notary, notaryLegend, options)).toBeNull();
  const played = playKeys(solver(), notary, notaryLegend, options, notary.solution);
  expect(played.state.status).toBe('cleared');
  expect(played.state.turn).toBe(notary.parTurns);
  const text = notary.solution.join('');
  for (const command of ['da[', 'da{', 'dit', 'di[', 'di{', 'dat']) expect(text, command).toContain(command);
});

// Opt-in: with the Notary's full command set the exhaustive search ran out of heap (3.6 GB, ~520 s) before finishing.
it.skipIf(process.env.PROVE === undefined)('no route clears in fewer turns than par', () => {
  let steps = 0;
  const base = solver();
  const counted = { ...base, step: (...args: Parameters<typeof base.step>) => { steps += 1; return base.step(...args); } };
  const found = solveStage(counted, notary, notaryLegend, options, { maxTurns: notary.parTurns - 1, maxExpanded: SEARCH_CAP });
  console.info('Notary optimum proof: ' + steps + ' engine steps');
  expect(found).toBeNull();
  expect(steps).toBeLessThan(SEARCH_CAP);
}, 1_800_000);

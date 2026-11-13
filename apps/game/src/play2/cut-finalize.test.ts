import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { content, cut, cutLegend } from './content.js';
import { QUARRY_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

// Full edit/history searches are bounded to avoid the Quarry's earlier memory exhaustion.
// Par 4 is the designed route (3j dd u 26l <CR>); the full-command budget is exhausted, so it is best known.
it.each([true, false])('searches the guarded Cut with dd enabled: %s', includeDd => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(),
    content, stage: cut, legend: cutLegend });
  const options = { learnedCommands: QUARRY_COMMANDS.filter(command => includeDd || command !== 'dd'), flags: {} };
  const result = solveStage(sim, cut, cutLegend, options, { maxTurns: cut.parTurns, maxExpanded: 500 });
  console.info(`Cut ${includeDd ? 'full' : 'without dd'} search: ${result ? JSON.stringify(result) : 'no route within 500 expansions / 3 turns'}`);
  if (includeDd) {
    expect(stageReplayIssue(sim, cut, cutLegend, options)).toBeNull();
    if (result) expect(result.turns).toBeLessThanOrEqual(cut.parTurns);
  } else if (result) {
    expect(stageReplayIssue(sim, { ...cut, solution: result.keys, parTurns: result.turns }, cutLegend, options)).toBeNull();
  }
}, 60_000);

it.each(['dd', 'x'])('searches a focused %s route', edit => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage: cut, legend: cutLegend });
  const options = { learnedCommands: ['j', 'l', edit, 'u'], flags: {} };
  const result = solveStage(sim, cut, cutLegend, options, { maxTurns: 4, maxExpanded: 5_000 });
  console.info(`Cut focused ${edit}: ${JSON.stringify(result)}`);
  // x alone never frees Dot: shortening the ledge removes the cage cell.
  if (edit === 'x') { expect(result).toBeNull(); return; }
  expect(result?.turns).toBe(4);
  if (!result) throw new Error('Missing focused solution');
  expect(stageReplayIssue(sim, { ...cut, solution: result.keys, parTurns: result.turns }, cutLegend, options)).toBeNull();
}, 60_000);

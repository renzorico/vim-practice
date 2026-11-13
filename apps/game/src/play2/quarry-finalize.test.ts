import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { sessionSolver } from './solver.js';
import { content, quarry, quarryLegend } from './content.js';
import { QUARRY_COMMANDS } from './session.js';

// Three turns is the accepted best-known par, not an exhaustive proof of optimality.
// Quarry edit search is bounded to maxTurns: 4; a 500-expansion search exhausted its budget without a solution.
it('replays the accepted three-turn Quarry solution at the remapped gate', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage: quarry, legend: quarryLegend });
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  expect(quarry.solution.join('')).toBe('26r=4j16r=<CR>');
  expect(quarry.parTurns).toBe(3);
  expect(stageReplayIssue(sim, quarry, quarryLegend, options)).toBeNull();
  const { state } = playKeys(sim, quarry, quarryLegend, options, quarry.solution);
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(3);
  expect(state.hearts).toBe(3);
  expect(state.firedTriggers).toContain('quarry.talk-gate');
});

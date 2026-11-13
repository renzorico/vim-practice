import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { quarry, quarryLegend } from './content.js';
import { QUARRY_COMMANDS } from './session.js';

// Four turns is the accepted best-known par, not an exhaustive proof of optimality.
// Quarry edit search is bounded to maxTurns: 4; a 500-expansion search exhausted its budget without a solution.
it('replays the accepted four-turn Quarry solution through both progression triggers', () => {
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  expect(quarry.solution.join('')).toBe('26r=3j8r=8l');
  expect(quarry.parTurns).toBe(4);
  expect(stageReplayIssue(sim, quarry, quarryLegend, options)).toBeNull();
  const { state } = playKeys(sim, quarry, quarryLegend, options, quarry.solution);
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(4);
  expect(state.hearts).toBe(3);
  expect(state.firedTriggers).toEqual(expect.arrayContaining(['quarry.through', 'quarry.far']));
});

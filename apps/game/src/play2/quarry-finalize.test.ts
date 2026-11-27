import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, solveStage, stageReplayIssue, type Stage } from '@escape/world';
import { content, quarry as stage, quarryLegend as legend } from './content.js';
import { sessionSolver } from './solver.js';
import { QUARRY_COMMANDS } from './session.js';

const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };

it('replays the ten-turn Quarry route through the story: Ash, the shaft, the bridge, then the gate', () => {
  const sim = sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage, legend });
  expect(stageReplayIssue(sim, stage, legend, options)).toBeNull();
  const { state } = playKeys(sim, stage, legend, options, stage.solution);
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(stage.parTurns);
  expect(state.firedTriggers).toEqual(expect.arrayContaining(['quarry.cut', 'quarry.through', 'quarry.far', 'quarry.talk-gate']));
});

/**
 * Par proof, off in CI (about 35 min since the solver tries every count, under 1 GB): PROVE=1 npx vitest run apps/game/src/play2/quarry-finalize
 * A search through the story runs out of memory, but talking takes no turns and the story adds no world effects
 * here, so the turns to merely enter the gate room bound the real clear from below. Run 2026-11-27: 10 turns, passed.
 */
it.skipIf(process.env.PROVE === undefined)('proves par: no route even reaches the gate room in fewer turns', () => {
  const gateRoom: Stage = { ...stage, clear: [{ type: 'reach', area: { from: { line: 1, col: 20 }, to: { line: 2, col: 28 } } }] };
  const found = solveStage(createWorldSim(createEngine()), gateRoom, legend, options, { maxTurns: stage.parTurns, maxExpanded: 400_000 });
  expect(found?.turns).toBe(stage.parTurns);
}, 900_000);

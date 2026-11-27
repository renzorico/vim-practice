import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys } from '@escape/world';
import { archive, archiveLegend, content } from './content.js';
import { ARCHIVE_COMMANDS } from './session.js';
import { sessionSolver } from './solver.js';

const solverFor = () => sessionSolver({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content,
  stage: archive, legend: archiveLegend });
const options = { learnedCommands: ARCHIVE_COMMANDS, flags: {} };
it('the authored solution clears in par', () => {
  const solver = solverFor();
  const played = playKeys(solver, archive, archiveLegend, options, archive.solution);
  expect(played.state.status).toBe('cleared');
  expect(played.state.turn).toBe(archive.parTurns);
});
it('rejects the yap route: its extra empty row breaks the target layout', () => {
  const played = playKeys(solverFor(), archive, archiveLegend, options, parseKeys('dap}p6kyapGkP'));
  expect(played.state.status).toBe('playing');
});

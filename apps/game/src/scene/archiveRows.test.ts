import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createWorldSim, type WorldState } from '@escape/world';
import { archive, archiveLegend } from '../play2/content.js';
import { ARCHIVE_COMMANDS } from '../play2/session.js';
import { archiveRows, archiveRowPose } from './archiveRows.js';
const sim = createWorldSim(createEngine());
const options = { learnedCommands: ARCHIVE_COMMANDS, flags: {} };
function command(before: WorldState, input: string) {
  let state = before;
  let result = { state, events: [] as ReturnType<typeof sim.step>['events'] };
  for (const key of parseKeys(input)) {
    result = sim.step(state, key, archive, archiveLegend, options);
    state = result.state;
  }
  return result;
}
it('uses all four rows of dap, closes the gap only after folding', () => {
  const before = sim.init(archive, archiveLegend, options);
  const result = command(before, 'dap');
  const plan = archiveRows(before, result.state, result.events);
  expect(plan).toEqual({ type: 'delete', fromLine: 5, count: 4 });
  if (!plan) throw new Error('Missing plan');
  expect(archiveRowPose(plan, 5, 0)).toEqual({ line: 9, scale: 1 });
  expect(archiveRowPose(plan, 5, 0.4)).toEqual({ line: 9, scale: 1 });
  expect(archiveRowPose(plan, 5, 1)).toEqual({ line: 5, scale: 1 });
  expect(archiveRowPose(plan, 4, 0)).toEqual({ line: 4, scale: 1 });
});
it('handles both p after an empty row and P before the bottom rail', () => {
  const initial = sim.init(archive, archiveLegend, options);
  const lifted = command(initial, 'dap}').state;
  const put = command(lifted, 'p');
  expect(archiveRows(lifted, put.state, put.events)).toEqual({ type: 'put', fromLine: 8, count: 4 });
  const copied = command(put.state, 'gg2jyapG').state;
  const end = command(copied, 'P');
  const plan = archiveRows(copied, end.state, end.events);
  // The Archive gained a blank row before the bottom rail (World 5): everything below moved down one.
  expect(plan).toEqual({ type: 'put', fromLine: 13, count: 3 });
  if (!plan) throw new Error('Missing plan');
  expect(archiveRowPose(plan, 13, 0).scale).toBe(0);
  expect(archiveRowPose(plan, 14, 1)).toEqual({ line: 14, scale: 1 });
  expect(archiveRowPose(plan, 16, 0)).toEqual({ line: 13, scale: 1 });
  expect(archiveRowPose(plan, 15, 1)).toEqual({ line: 15, scale: 1 });
});
it('does not invent deleted rows for yank, pending commands, bumps or undo', () => {
  const before = sim.init(archive, archiveLegend, options);
  for (const input of ['yap', 'd', 'ggdd', 'dapu']) {
    const result = command(before, input);
    expect(archiveRows(before, result.state, result.events)).toBeNull();
  }
});

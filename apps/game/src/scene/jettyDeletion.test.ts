import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createWorldSim, playKeys } from '@escape/world';
import { jetty, portLegend } from '../play2/content.js';
import { PORT_COMMANDS } from '../play2/session.js';
import { jettyDeletion } from './jettyDeletion.js';

const sim = createWorldSim(createEngine());
const options = { learnedCommands: PORT_COMMANDS, flags: {} };
it.each([
  { keys: 'bdb', col: 14, junk: 'nnnnnn' },
  { keys: 'bdbb.', col: 6, junk: 'ccccc' },
  { keys: 'db', col: 0, junk: null },
  { keys: 'b', col: 0, junk: null },
])('uses exact engine edits for $keys', ({ keys, col, junk }) => {
  const result = playKeys(sim, jetty, portLegend, options, parseKeys(keys));
  const plan = jettyDeletion(result.state, result.events);
  if (junk === null) expect(plan).toBeNull();
  else expect(plan).toEqual({ line: 3, col, junk });
});

it.each([
  ['jdaw', 'ddddd '], ['jdiw', 'ddddd'], ['jdawj.', 'dddd '], ['jdawu', null], ['jdawu<C-r>', null],
] as const)('reads a shelf dust edit and its real spaces for %s', async (keys, junk) => {
  const { stacks, stacksLegend } = await import('../play2/content.js');
  const { STACKS_COMMANDS } = await import('../play2/session.js');
  const result = playKeys(sim, stacks, stacksLegend, { learnedCommands: STACKS_COMMANDS, flags: {} }, parseKeys(keys));
  expect(jettyDeletion(result.state, result.events)?.junk ?? null).toBe(junk);
});


it.each(['u', 'u<C-r>'])('blocks %s when the Vim undo cursor would land on crates', (keys) => {
  const deleted = playKeys(sim, jetty, portLegend, options, parseKeys('bdbb.'));
  let state = deleted.state;
  const events = [...deleted.events];
  for (const key of parseKeys(keys)) {
    const result = sim.step(state, key, jetty, portLegend, options);
    events.push(...result.events);
    state = result.state;
  }
  // Backward-delete undo now returns to the deleted range start (crate column 6),
  // rather than the original cursor on ground. The field rejects that landing.
  expect(events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 3, col: 6 } });
  expect(state.engine).toEqual(deleted.state.engine);
  expect(state.turn).toBe(deleted.state.turn);
  expect(jettyDeletion(state, events)).toEqual({ line: 3, col: 6, junk: 'ccccc' });
});

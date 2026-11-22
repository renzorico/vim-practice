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
  { keys: 'bdbb.u<C-r>', col: 6, junk: null },
  { keys: 'db', col: 0, junk: null },
  { keys: 'bdbb.u', col: 0, junk: null },
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

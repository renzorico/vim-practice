import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, playKeys } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stages, shaft, shaftLegend, cut } from './content.js';
import { createSession, QUARRY_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps } from './PlayScreen.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: shaft, legend: shaftLegend };
const controller = createSession({ ...dependencies, stages: stages.slice(0, stages.findIndex(entry => entry.stage.id === 'shaft') + 1) });
const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count += 1) {
    if (count > 60) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
function keys(session: Session, route: string): Session {
  return parseKeys(route).reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
const lip = () => dismiss(keys(start(), '2j'));

it('chains the Cut clear into the shaft with story and the main quest', () => {
  const before = controller.resume({ stage: cut.id, story: storyEngine.init(content) });
  const ended = cut.solution.reduce((next, key) => controller.reduce(dismiss(next), key), before);
  const entered = dismiss(ended);
  expect(entered.world.stage).toBe('shaft');
  expect(entered.story.flags['cut.dot-free']).toBe(true);
  expect(entered.story.quests['quarry.mason']).toEqual({ step: 0, done: false });
});
it('spawns the Mason and two Blots once and teaches the dot keycap', () => {
  const ready = lip();
  expect(ready.world.entities.map(e => e.id)).toEqual(['dot', 'mason', 'shaft.blot-0', 'shaft.blot-1']);
  expect(learnedKeycaps(ready.story.flags)).toContain('.');
  expect(keys(ready, 'kj').world.entities).toHaveLength(4);
  expect(ready.story.firedReactions.filter(id => id === 'shaft.lip')).toHaveLength(1);
});
it('mortar cannot be walked, and a fixed beam stops one long dd', () => {
  const ready = lip();
  expect(keys(ready, 'j').world.engine.cursor).toEqual(ready.world.engine.cursor);
  const overshot = keys(ready, '5dd');
  expect(overshot.world.turn).toBe(ready.world.turn);
  expect(overshot.world.engine.lines).toEqual(shaft.map);
  expect(overshot.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
});
it.each(['2j4ddj.j.<CR>', '2j4ddj4ddj4dd<CR>', '2j4ddj.j4dd<CR>'])('cures the Mason alive: %s', route => {
  const cured = dismiss(keys(start(), route));
  expect(cured.world.status).toBe('cleared');
  expect(cured.world.turn).toBe(shaft.parTurns);
  expect(cured.world.hearts).toBe(3);
  expect(cured.story.flags['shaft.mason-cured']).toBe(true);
  expect(cured.story.statues).toContain('E');
});
it('a short dd bumps: it would leave you standing on wet mortar', () => {
  const ready = lip();
  for (const count of ['dd', '2dd', '3dd']) {
    const bumped = keys(ready, count);
    expect(bumped.world.engine.lines, count).toEqual(shaft.map);
    expect(bumped.world.turn, count).toBe(ready.world.turn);
  }
});
it('the chamber floor will not delete', () => {
  const chamber = keys(start(), 'dd');
  expect(chamber.world.engine.lines).toEqual(shaft.map);
  expect(chamber.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
});
it(':e! restores the lip spawn checkpoint, and Continue restores stage entry', () => {
  const ready = lip();
  const edited = keys(ready, '4dd');
  const restored = keys(edited, ':e!<CR>');
  expect(restored.world.engine.lines).toEqual(shaft.map);
  expect(restored.world.entities).toEqual(ready.world.entities);
  expect(restored.world.turn).toBe(ready.world.turn);
  expect(restored.world.firedTriggers).toContain('shaft.lip');
  const continued = controller.resume(edited.stageEntry);
  expect(continued.world.stage).toBe('shaft');
  expect(continued.world.engine.cursor).toEqual(shaft.start);
  expect(continued.world.entities[0]?.id).toBe('mason-idle');
});
it('validates story and the map with its story-spawned build entities', () => {
  const spawns = content.dialogues.find(d => d.id === 'shaft.lip')?.then.flatMap(effect =>
    effect.type === 'world' ? effect.effects.flatMap(inner => inner.type === 'spawn' ? [inner.entity] : []) : []) ?? [];
  expect(lintStage(shaft, shaftLegend, spawns)).toEqual([]);
  expect(validateContent(content, { worldFlags: [] })).toEqual([]);
  const replay = sessionSolver(dependencies);
  const result = playKeys(replay, shaft, shaftLegend, options, shaft.solution);
  expect(result.state.status).toBe('cleared');
  expect(result.state.turn).toBe(shaft.parTurns);
});
it.each(['12j<CR>', '20w<CR>', '20e<CR>', '20$<CR>', '2j9x<CR>'])('cannot skip the shaft without deleting rows: %s', route => {
  const result = keys(start(), route);
  expect(result.story.flags['shaft.mason-cured']).not.toBe(true);
});
it('Dot follows without blocking a player landing', () => {
  const ready = lip();
  const dot = ready.world.entities.find(entity => entity.id === 'dot');
  expect(dot).toMatchObject({ def: { solid: false, damage: 0, behaviour: { type: 'follow' } } });
  expect(dot?.at).not.toEqual({ line: 1, col: 5 });
  if (!dot) throw new Error('Missing Dot');
  const together: Session = { ...ready, world: { ...ready.world, entities: [
    ...ready.world.entities.filter(entity => entity.id !== 'dot'), { ...dot, at: { line: 4, col: 4 } },
  ] } };
  const landed = keys(together, '4dd');
  expect(landed.world.engine.cursor).toEqual({ line: 3, col: 4 });
  expect(landed.world.hearts).toBe(3);
  expect(landed.lastEvents.some(event => event.type === 'bump')).toBe(false);
});

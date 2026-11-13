import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stages, cut, cutLegend, quarry } from './content.js';
import { createSession, QUARRY_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps } from './PlayScreen.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));

const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: cut, legend: cutLegend };
const controller = createSession({ ...dependencies, stages });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count += 1) {
    if (count > 40) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
function keys(session: Session, input: string): Session {
  return parseKeys(input).reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
const ledge = () => dismiss(keys(start(), '3j'));
const blots = (session: Session) => session.world.entities.filter(entity => entity.def.kind === 'blot');

it('keeps story and starts the Cut quest after the Quarry Road ending', () => {
  const before = controller.resume({ stage: quarry.id, story: storyEngine.init(content) });
  const cleared = quarry.solution.reduce((next, key) => controller.reduce(dismiss(next), key), before);
  expect(cleared.queue[0]).toMatchObject({ dialogue: 'quarry-road.end' });
  const entered = dismiss(cleared);
  expect(entered.world.stage).toBe('cut');
  expect(entered.story.flags['quarry.south']).toBe(true);
  expect(entered.story.quests['quarry.cut']).toEqual({ step: 0, done: false });
});
it('the note teaches dd and u keycaps on dismissal', () => {
  const reading = keys(start(), '2j2l<CR>');
  expect(reading.queue[0]).toMatchObject({ dialogue: 'cut.note' });
  expect(content.dialogues.find(dialogue => dialogue.id === 'cut.note')?.lines[2]).toEqual({
    speaker: 'scribe', text: 'Three of them sit on the cage itself.\nYou cannot step through that. Delete it.',
  });
  const read = dismiss(reading);
  expect(read.story.flags['cut.knows-dd']).toBe(true);
  expect(read.story.flags['cut.knows-u']).toBe(true);
  expect(learnedKeycaps(read.story.flags)).toEqual(expect.arrayContaining(['dd', 'u']));
});
it('spawns four Blots once, deletes their row, and restores only land with u', () => {
  const before = ledge();
  expect(blots(start())).toHaveLength(3);
  expect(blots(before)).toHaveLength(7);
  expect(blots(before).filter(entity => entity.id.startsWith('cut.blot'))).toHaveLength(4);
  expect(blots(keys(before, 'hl'))).toHaveLength(7);
  const deleted = keys(before, 'dd');
  expect(deleted.world.engine.lines).toHaveLength(cut.map.length - 1);
  expect(blots(deleted)).toHaveLength(0);
  expect(keys(deleted, 'dd').lastEvents).toEqual([expect.objectContaining({ type: 'bump', reason: 'fixed' })]);
  const restored = keys(deleted, 'u');
  expect(restored.world.engine.lines).toEqual(cut.map);
  expect(blots(restored)).toHaveLength(0);
  const redone = keys(restored, '<C-r>');
  expect(redone.world.engine.lines).toEqual(deleted.world.engine.lines);
  expect(blots(redone)).toHaveLength(0);
});
it('dd at column 15 bumps because its landing is the drop', () => {
  const east = keys(ledge(), '12l');
  expect(east.world.engine.cursor.col).toBe(15);
  const bumped = keys(east, 'dd');
  expect(bumped.lastEvents).toEqual([expect.objectContaining({ type: 'bump' })]);
  expect(bumped.world.engine.lines).toEqual(cut.map);
  expect(bumped.world.turn).toBe(east.world.turn);
});
it('frees Dot alive in five turns and presents the ending before To be continued', () => {
  const atDot = keys(start(), '3jddu029l<CR>');
  expect(atDot.queue[0]).toMatchObject({ dialogue: 'cut.dot' });
  let ended = atDot;
  for (let line = 0; line < 3; line += 1) ended = controller.reduce(ended, '<CR>');
  expect(ended.world.status).toBe('cleared');
  expect(ended.world.turn).toBe(5);
  expect(ended.world.hearts).toBe(3);
  expect(ended.world.entities.some(entity => entity.id === 'dot-caged')).toBe(false);
  expect(ended.world.entities.find(entity => entity.id === 'dot')?.def.behaviour).toEqual({ type: 'follow' });
  expect(ended.queue[0]).toMatchObject({ dialogue: 'cut.end' });
  expect(dismiss(ended).queue).toEqual([]);
});
it('walking east one step at a time dies', () => {
  let next = ledge();
  for (let step = 0; step < 30 && next.world.status === 'playing'; step += 1) next = keys(next, 'l');
  expect(next.world.status).toBe('dead');
});
it(':e! restores the spawn checkpoint and keeps the fired trigger as the sim defines', () => {
  const deleted = keys(ledge(), 'dd');
  const expected = sim.restore(deleted.world);
  const restored = keys(deleted, ':e!<CR>');
  expect(restored.world).toEqual(expected.state);
  expect(restored.world.engine.lines).toEqual(cut.map);
  expect(blots(restored)).toHaveLength(7);
  expect(restored.world.firedTriggers).toContain('cut.ledge');
});
it('Continue restores Cut entry with story kept', () => {
  const moved = keys(start(), '3jddu');
  const restored = dismiss(controller.resume(moved.stageEntry));
  expect(restored.world.stage).toBe('cut');
  expect(restored.world.engine.lines).toEqual(cut.map);
  expect(restored.world.engine.cursor).toEqual(cut.start);
  expect(restored.story).toEqual(moved.stageEntry.story);
});
it('lints and replays the best-known Cut solution', () => {
  expect(lintStage(cut, cutLegend)).toEqual([]);
  const replay = sessionSolver(dependencies);
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  expect(stageReplayIssue(replay, cut, cutLegend, options)).toBeNull();
});
it('3j26l<CR> dies on the three cage guards before Dot can be freed', () => {
  // Assert death before Enter: Enter on the death panel is the session retry action.
  const dead = keys(start(), '3j26l');
  expect(dead.world.status).toBe('dead');
  expect(dead.world.hearts).toBe(0);
  expect(dead.lastEvents).toContainEqual({ type: 'player-died' });
  expect(dead.story.flags['cut.dot-free']).not.toBe(true);
  const replay = sessionSolver(dependencies);
  const result = playKeys(replay, cut, cutLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} }, parseKeys('3j26l<CR>'));
  expect(result.events).toContainEqual({ type: 'player-died' });
  expect(result.state.flags['cut.dot-free']).not.toBe(true);
});
it('2j26r. bumps against the fixed drop', () => {
  const before = keys(start(), '2j');
  const bumped = keys(before, '26r.');
  expect(bumped.lastEvents).toEqual([expect.objectContaining({ type: 'bump', reason: 'fixed' })]);
  expect(bumped.world.engine.lines).toEqual(cut.map);
  expect(bumped.world.turn).toBe(before.world.turn);
  expect(blots(bumped)).toHaveLength(3);
});

it('x on the ledge cannot shift the guards off the cage: the ledge ends at the cage cell', () => {
  const replay = sessionSolver(dependencies);
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  for (const route of ['3jx26l<CR>', '3j3x26l<CR>', '3j$<CR>', '3jxu26l<CR>']) {
    const result = playKeys(replay, cut, cutLegend, options, parseKeys(route));
    expect(result.state.status, route).not.toBe('cleared');
    expect(result.state.flags['cut.dot-free'], route).not.toBe(true);
  }
});

it('x and r on the dirt bump: the cage never moves', () => {
  const before = keys(start(), '2j');
  for (const edit of ['4x', 'x', '3r.']) {
    const bumped = keys(before, edit);
    expect(bumped.world.engine.lines, edit).toEqual(cut.map);
  }
});
it('accepted alternative: counted x over the ledge, then u, also frees Dot', () => {
  const replay = sessionSolver(dependencies);
  const result = playKeys(replay, cut, cutLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} }, parseKeys('3j27xu26l<CR>'));
  expect(result.state.flags['cut.dot-free']).toBe(true);
  expect(result.state.entities.filter(entity => entity.def.kind === 'blot')).toHaveLength(0);
});

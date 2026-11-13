import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, playKeys, solveStage } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stages, shaft, shaftLegend, cut } from './content.js';
import { createSession, QUARRY_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps } from './PlayScreen.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: shaft, legend: shaftLegend };
const controller = createSession({ ...dependencies, stages });
const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count += 1) {
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
it('spawns the builder and four Blots once and teaches the dot keycap', () => {
  const ready = lip();
  expect(ready.world.entities.map(e => e.id)).toEqual(['mason', 'shaft.blot-0', 'shaft.blot-1', 'shaft.blot-2', 'shaft.blot-3']);
  expect(learnedKeycaps(ready.story.flags)).toContain('.');
  expect(keys(ready, 'kj').world.entities).toHaveLength(5);
  expect(ready.story.firedReactions.filter(id => id === 'shaft.lip')).toHaveLength(1);
});
it('throws back on every descent and explains wet mortar only once', () => {
  const first = keys(lip(), 'j');
  expect(first.world.engine.cursor).toEqual({ line: 2, col: 4 });
  expect(first.lastEvents).toContainEqual({ type: 'player-moved', from: { line: 4, col: 4 }, to: { line: 2, col: 4 }, style: 'jump' });
  expect(first.queue[0]).toMatchObject({ dialogue: 'shaft.thrown' });
  const second = keys(first, '2j');
  expect(second.world.engine.cursor).toEqual({ line: 2, col: 4 });
  expect(second.queue).toEqual([]);
});
it.each(['jj10dd<CR>', '2j10dddd<CR>', '2j3dd...<CR>', '2j3dd..2dddddd<CR>'])('cures the Mason alive: %s', route => {
  const cured = dismiss(keys(start(), route));
  expect(cured.world.status).toBe('cleared');
  expect(cured.world.hearts).toBe(3);
  expect(cured.story.flags['shaft.mason-cured']).toBe(true);
  expect(cured.story.statues).toContain('E');
  expect(content.cutscenes.find(scene => scene.id === 'shaft.end')?.beats.at(-1)).toEqual({
    type: 'line', line: { speaker: 'system', text: 'End of World 2.' },
  });
});
it('single dd takes 17 turns, over twice the best-known route', () => {
  const route = '2j' + 'dd'.repeat(16) + '<CR>';
  const cured = dismiss(keys(start(), route));
  expect(cured.world.status).toBe('cleared');
  expect(cured.world.turn).toBe(17);
  expect(cured.world.hearts).toBe(3);
  expect(cured.world.turn).toBeGreaterThanOrEqual(shaft.parTurns * 2);
});
it('a single dd landing on a Blot costs a heart, while 2dd swallows it', () => {
  const ready = lip();
  const blot = ready.world.entities.find(e => e.def.kind === 'blot');
  if (!blot) throw new Error('Missing Blot');
  const arranged: Session = { ...ready, world: { ...ready.world, turn: 2,
    entities: [ready.world.entities[0]!, { ...blot, at: { line: 4, col: 4 } }] } };
  expect(keys(arranged, 'dd').world.hearts).toBe(2);
  expect(keys(arranged, '2dd').world.hearts).toBe(3);
});
it('overshooting the fixed scaffold and deleting the chamber bump without spending a turn', () => {
  const chamber = keys(start(), 'dd');
  expect(chamber.world.engine.lines).toEqual(shaft.map);
  expect(chamber.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
  const ready = lip();
  const overshot = keys(ready, '12dd');
  expect(overshot.world.turn).toBe(ready.world.turn);
  expect(overshot.world.engine.lines).toEqual(shaft.map);
  expect(overshot.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
});
it(':e! restores the lip spawn checkpoint, and Continue restores stage entry', () => {
  const ready = lip();
  const edited = keys(ready, '3dd');
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
it('searches all learned commands, focused edits, and routes without row deletion', () => {
  for (const commands of [QUARRY_COMMANDS, ['j', 'dd', '.'], QUARRY_COMMANDS.filter(command => command !== 'dd')]) {
    const replay = sessionSolver(dependencies);
    const result = solveStage(replay, shaft, shaftLegend, { ...options, learnedCommands: commands },
      { maxTurns: 3, maxExpanded: 1000 });
    console.info('Shaft search', commands.join(' '), result ?? 'budget exhausted; no route found');
    if (commands.includes('dd') && result) expect(result.turns).toBeLessThanOrEqual(shaft.parTurns);
    if (!commands.includes('dd')) expect(result).toBeNull();
  }
}, 60_000);
it.each(['12j<CR>', '20w<CR>', '20e<CR>', '20$<CR>', '2j9x<CR>', '2j9r=<CR>'])('cannot skip the shaft without deleting rows: %s', route => {
  const result = keys(start(), route);
  expect(result.story.flags['shaft.mason-cured']).not.toBe(true);
});

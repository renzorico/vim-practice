import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stages, quarry, quarryLegend, lighthouse } from './content.js';
import { createSession, QUARRY_COMMANDS, type Session } from './session.js';

import { sessionSolver } from './solver.js';

const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: quarry, legend: quarryLegend });
function dismiss(session: Session): Session {
  let next = session;
  while (next.queue.length) next = controller.reduce(next, '<CR>');
  return next;
}
function keys(session: Session, input: string): Session {
  return [...input].reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
const edge = () => keys(start(), '13l');
const bank = () => keys(edge(), '4x8l2j7l');
const learner = 'l12l4x8l2j7l5r=8l2j';
it('validates the unchanged map and all four replay solutions', () => {
  expect(lintStage(quarry, quarryLegend)).toEqual([]);
  for (const entry of stages) {
    // Margin and Lighthouse clear through story effects; replay the existing session adapter.
    const replaySim = sessionSolver({ sim, storyEngine, content, ...entry });
    expect(stageReplayIssue(replaySim, entry.stage, entry.legend,
      { learnedCommands: QUARRY_COMMANDS, flags: {} }), entry.stage.id).toBeNull();
  }
});
it('keeps story and starts the Quarry quest after the Lighthouse ending', () => {
  const before = controller.resume({ stage: 'lighthouse', story: storyEngine.init(content) });
  const cleared = lighthouse.solution.reduce((next, key) => controller.reduce(dismiss(next), key), before);
  const entered = dismiss(cleared);
  expect(entered.world.stage).toBe('quarry-road');
  expect(entered.story.flags['lighthouse.lit']).toBe(true);
  expect(entered.story.statues).toContain('R');
  expect(entered.story.quests['quarry.road']).toEqual({ step: 0, done: false });
});
it('Ash calls out once; x bumps and 4x opens the cut', () => {
  const atCut = edge();
  expect(atCut.queue[0]).toMatchObject({ dialogue: 'quarry.ash' });
  const ready = dismiss(atCut);
  expect(ready.story.flags['quarry.knows-x']).toBe(true);
  const bump = keys(ready, 'x');
  expect(bump.lastEvents).toEqual([expect.objectContaining({ type: 'bump' })]);
  expect(bump.world.turn).toBe(ready.world.turn);
  expect(bump.world.engine.lines).toEqual(quarry.map);
  const open = keys(bump, '4x');
  expect(open.world.engine.lines[6]).not.toContain('R');
  expect(keys(open, 'hl').queue).toEqual([]);
});
it('5r= lays planks and 5x also reaches the far side', () => {
  const before = bank();
  expect(before.world.engine.cursor).toEqual({ line: 8, col: 30 });
  const bridge = keys(before, '5r=');
  expect(bridge.world.engine.lines[8]?.slice(30, 35)).toBe('=====');
  expect(keys(bridge, '8l').world.firedTriggers).toContain('quarry.far');
  const deleted = keys(before, '5x');
  expect(deleted.world.engine.lines[8]).not.toContain('~');
  expect(keys(deleted, '7l').world.firedTriggers).toContain('quarry.far');
});
it('the nine-turn learner route clears with three hearts and presents the ending', () => {
  const ended = controller.reduce(keys(start(), learner), '<CR>');
  expect(ended.world.status).toBe('cleared');
  expect(ended.world.turn).toBe(9);
  expect(ended.world.hearts).toBe(3);
  expect(ended.queue[0]).toMatchObject({ dialogue: 'quarry-road.end' });
  expect(dismiss(ended).queue).toEqual([]);
});
it('Continue restores Quarry entry and its story', () => {
  const moved = bank();
  const continued = dismiss(controller.resume(moved.stageEntry));
  expect(continued.world.stage).toBe('quarry-road');
  expect(continued.world.engine.lines).toEqual(quarry.map);
  expect(continued.world.engine.cursor).toEqual(quarry.start);
  expect(continued.story).toEqual(moved.stageEntry.story);
});

it.each(['11l9x', '12x'])('restores the cut after overcounting %s without losing hearts or story', route => {
  const sealed = keys(start(), route);
  expect(sealed.world.engine.lines).not.toEqual(quarry.map);
  expect(sealed.world.status).toBe('playing');
  const command = keys(sealed, ':e!');
  expect(command.world.engine.commandLine).toBe(':e!');
  const restored = controller.reduce(command, '<CR>');
  expect(restored.world.engine.lines).toEqual(quarry.map);
  expect(restored.world.engine.cursor).toEqual(quarry.start);
  expect(restored.world.hearts).toBe(3);
  expect(restored.world.turn).toBe(0);
  expect(restored.world.pending).toBeNull();
  expect(restored.story).toEqual(command.story);
  expect(restored.lastEvents).toContainEqual({ type: 'checkpoint-restored' });
});
it('teaches retry as the last line of Ash’s first dialogue', () => {
  expect(content.dialogues.find(dialogue => dialogue.id === 'quarry.ash')?.lines.at(-1)).toEqual({
    speaker: 'npc', name: 'Foreman Ash',
    text: 'Cut too much? :e! puts the quarry back\nthe way it was. No shame in it.',
  });
});
it('clears at the remapped gate after shortening all three old clear rows', () => {
  const shortened = keys(start(), '26r=3j8xj8xj8x');
  expect(shortened.world.engine.lines.slice(9, 12).map(row => row.length)).toEqual([38, 38, 38]);
  expect(shortened.world.entities.find(entity => entity.id === 'gate')?.at).toEqual({ line: 10, col: 35 });
  const atGate = keys(shortened, 'k7l');
  expect(atGate.world.engine.cursor).toEqual({ line: 10, col: 34 });
  const cleared = controller.reduce(atGate, '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.story.flags['quarry.south']).toBe(true);
  expect(cleared.queue[0]).toMatchObject({ dialogue: 'quarry-road.end' });
});
it('clears the three-turn replacement route at the gate with Enter', () => {
  const ready = keys(start(), '26r=4j16r=');
  expect(ready.world.status).toBe('playing');
  const cleared = controller.reduce(ready, '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.turn).toBe(3);
  expect(cleared.world.hearts).toBe(3);
});

it.each(stages)('supports :e! in $stage.id', entry => {
  const game = createSession({ sim, storyEngine, content, ...entry });
  let session = game.init(false);
  session = game.reduce(session, 'l');
  while (session.queue.length) session = game.reduce(session, '<CR>');
  for (const key of ':e!') session = game.reduce(session, key);
  session = game.reduce(session, '<CR>');
  expect(session.lastEvents).toContainEqual({ type: 'checkpoint-restored' });
  expect(session.world.engine).toEqual(session.world.checkpoint.engine);
  expect(session.world.entities).toEqual(session.world.checkpoint.entities);
  expect(session.world.turn).toBe(session.world.checkpoint.turn);
});
it('restores the last :w checkpoint rather than the stage start', () => {
  let session = dismiss(keys(edge(), '4x'));
  const options = { learnedCommands: [...QUARRY_COMMANDS, ':w'], flags: session.story.flags };
  for (const key of [':', 'w', '<CR>']) {
    const result = sim.step(session.world, key, quarry, quarryLegend, options);
    session = { ...session, world: result.state, lastEvents: result.events };
  }
  const checkpoint = session.world.checkpoint;
  expect(checkpoint.engine.lines).not.toEqual(quarry.map);
  session = controller.reduce(keys(session, 'l:e!'), '<CR>');
  expect(session.world.engine).toEqual(checkpoint.engine);
  expect(session.world.entities).toEqual(checkpoint.entities);
  expect(session.world.hearts).toBe(checkpoint.hearts);
  expect(session.world.turn).toBe(checkpoint.turn);
});
it('only intercepts exactly :e! followed by Enter', () => {
  const before = keys(start(), 'l:e!x');
  const after = controller.reduce(before, '<CR>');
  expect(after.lastEvents).not.toContainEqual({ type: 'checkpoint-restored' });
});

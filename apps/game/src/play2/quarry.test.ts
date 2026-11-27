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
  while (next.queue.length || next.clearCard) next = controller.reduce(next, '<CR>');
  return next;
}
function keys(session: Session, input: string): Session {
  return [...input].reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
/** On the gravel by Ash: the road's first cell. */
const road = () => keys(start(), '3j');
/** 4x has slid the road: open ground now lies under the shaft. */
const slid = () => keys(road(), '4x');
/** At the bottom of the shaft, past the boulder. */
const below = () => keys(slid(), '7k5l7j');
/** On the riverbank, the Scribe's note read. */
const bank = () => dismiss(controller.reduce(keys(below(), '5l3k'), '<CR>'));

it('validates the map and all four replay solutions', () => {
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
it('Ash calls out on the road; packed earth will not delete, and 4x slides the road under the shaft', () => {
  const atRoad = road();
  expect(atRoad.queue[0]).toMatchObject({ dialogue: 'quarry.ash' });
  const ready = dismiss(atRoad);
  expect(ready.story.flags['quarry.knows-x']).toBe(true);
  const camp = keys(ready, 'kx');
  expect(camp.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'fixed' }));
  const open = keys(ready, '4x');
  expect(open.world.engine.lines[9]?.slice(5, 14)).toBe('.#RRR    ');
  // Before the slide the shaft ends on the boulder (7j bumps at the top); after it, on open road.
  expect(keys(ready, '7k5l7j').world.engine.cursor).toEqual({ line: 2, col: 10 });
  expect(keys(open, '7k5l7j').world.engine.cursor).toEqual({ line: 9, col: 10 });
  expect(keys(open, '7k5l7j').world.firedTriggers).toContain('quarry.through');
});
it.each(['3x', '6x'])('a wrong count (%s) leaves the shaft blocked or bumps the boulder; :e! puts the road back', count => {
  const tried = keys(road(), count);
  expect(keys(tried, '7k5l7j').world.firedTriggers).not.toContain('quarry.through');
  const restored = controller.reduce(keys(tried, ':e!'), '<CR>');
  expect(restored.world.engine.lines).toEqual(quarry.map);
  expect(restored.world.hearts).toBe(3);
});
it('5r= bridges the river onto the stairs; 5x drags the far bank off them', () => {
  const before = bank();
  expect(before.world.engine.cursor).toEqual({ line: 6, col: 15 });
  expect(before.story.flags['quarry.knows-r']).toBe(true);
  const bridge = keys(before, '5r=');
  expect(bridge.world.engine.lines[6]?.slice(15, 24)).toBe('=====   |');
  expect(keys(bridge, '4l5k').world.engine.cursor).toEqual({ line: 1, col: 23 });
  const deleted = keys(before, '5x');
  expect(deleted.world.engine.lines[6]?.slice(15, 19)).toBe('   |');
  // The stairs went with the bank: four columns west of the flight above them.
  expect(keys(deleted, '3l5k').world.engine.cursor).toEqual({ line: 6, col: 18 });
});
it('the gate needs the Scribe\'s note: crossing without reading it does not clear', () => {
  const unread = keys(below(), '5l3k5r=4l5k');
  expect(unread.story.flags['quarry.knows-r']).not.toBe(true);
  expect(dismiss(controller.reduce(unread, '<CR>')).world.status).toBe('playing');
});
it('the ten-turn route clears with three hearts and presents the ending', () => {
  const ended = controller.reduce(keys(bank(), '5r=4l5k'), '<CR>');
  expect(ended.world.status).toBe('cleared');
  expect(ended.world.turn).toBe(quarry.parTurns);
  expect(ended.world.hearts).toBe(3);
  expect(ended.queue[0]).toMatchObject({ dialogue: 'quarry-road.end' });
});
it('Continue restores Quarry entry and its story', () => {
  const moved = slid();
  const continued = dismiss(controller.resume(moved.stageEntry));
  expect(continued.world.stage).toBe('quarry-road');
  expect(continued.world.engine.lines).toEqual(quarry.map);
  expect(continued.world.engine.cursor).toEqual(quarry.start);
  expect(continued.story).toEqual(moved.stageEntry.story);
});

it('teaches retry in Ash’s first dialogue, before the closing 4x instruction', () => {
  const lines = content.dialogues.find(dialogue => dialogue.id === 'quarry.ash')?.lines ?? [];
  expect(lines).toContainEqual({
    speaker: 'npc', name: 'Foreman Ash',
    text: "Cut too much? `:e!` puts the quarry back.\nNo shame. I've done it twice. Today.",
  });
  expect(lines.at(-1)).toEqual({
    speaker: 'system',
    text: 'The shaft drops onto a boulder. Stand on the\ngravel, press `4x`: the road slides under it.',
  });
});

it.each(stages)('supports :e! in $stage.id', entry => {
  const game = createSession({ sim, storyEngine, content, ...entry });
  let session = game.init(false);
  session = game.reduce(session, 'l');
  while (session.queue.length) session = game.reduce(session, '<CR>');
  for (const key of ':e!') session = game.reduce(session, key);
  session = game.reduce(session, '<CR>');
  if (entry.stage.type === 'text') {
    const script = entry.stage.scripts.find(item => item.id === entry.stage.autoScript);
    expect(session.world.script?.engine.lines).toEqual(script?.startLines);
    expect(session.world.script?.keys).toBe(0);
  } else expect(session.lastEvents).toContainEqual({ type: 'checkpoint-restored' });
  expect(session.world.engine).toEqual(session.world.checkpoint.engine);
  expect(session.world.entities).toEqual(session.world.checkpoint.entities);
  expect(session.world.turn).toBe(session.world.checkpoint.turn);
});
it('restores the last :w checkpoint rather than the stage start', () => {
  let session = slid();
  const options = { learnedCommands: [...QUARRY_COMMANDS, ':w'], flags: session.story.flags };
  // :w is taught on the Last Page; this stage's command list leaves it out, so save as a stage without one.
  const { allowedCommands: _unused, ...saving } = quarry;
  for (const key of [':', 'w', '<CR>']) {
    const result = sim.step(session.world, key, saving, quarryLegend, options);
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


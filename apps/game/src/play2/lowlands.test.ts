import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { content, stage, legend, stages, lowlands, lowlandsLegend } from './content.js';
import { createSession, type Session } from './session.js';

const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stage, legend, stages });
function dismiss(initial: Session): Session {
  let session = initial;
  for (let count = 0; (session.queue.length || session.clearCard) && count < 100; count += 1) session = controller.reduce(session, '<CR>');
  return session;
}
function keys(initial: Session, input: readonly string[]): Session {
  return input.reduce((session, key) => controller.reduce(dismiss(session), key), initial);
}
function startLowlands(): Session {
  const story = storyEngine.apply(storyEngine.init(content), [{ type: 'start-quest', quest: 'lowlands.lighthouse' }], content).state;
  return dismiss(controller.resume({ stage: 'lowlands', story }));
}
function move(session: Session, line: number, col: number): Session {
  const moved = sim.apply(session.world, [{ type: 'move-player', to: { line, col } }], lowlands, lowlandsLegend);
  return { ...session, world: moved.state };
}
it('keeps Margin story, resets hearts, presents the ending before entering Lowlands, and shows each intro once', () => {
  let session = keys(dismiss(controller.init()), ['5','h','4','k','<CR>', ...'jjjjjjj', ...'llll', '<CR>', 'k','k','k','8','l','3','0','l']);
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ dialogue: 'margin.end' });
  const flags = session.story.flags;
  session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('lowlands');
  expect(session.world.hearts).toBe(3);
  expect(session.world.engine.cursor).toEqual(lowlands.start);
  expect(session.story.flags).toMatchObject(flags);
  expect(session.story.quests['lowlands.lighthouse']?.step).toBe(0);
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.intro' });
  const resumed = controller.resume({ stage: 'lowlands', story: session.story });
  expect(resumed.queue).toEqual([]);
});
it('Wren calls out at the edge once, teaches w, and answers repeat interactions', () => {
  let session = keys(startLowlands(), [...'9l']);
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.wren', index: 0 });
  session = dismiss(session);
  expect(session.story.flags['lowlands.knows-w']).toBe(true);
  expect(session.story.quests['lowlands.lighthouse']?.step).toBe(1);
  session = keys(session, ['l','h','l']);
  expect(session.queue).toEqual([]);
  session = controller.reduce(session, '<CR>');
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.wren-again' });
});
it('l bumps into blank; w, e and b cross four rows of stones, and the far side advances the quest', () => {
  let session = dismiss(keys(startLowlands(), ['9','l']));
  session = keys(session, ['w']);
  expect(session.world.engine.cursor).toEqual({ line: 7, col: 13 });
  session = keys(session, ['l']); // second cell of the first stone
  const bumped = controller.reduce(session, 'l');
  expect(bumped.world.engine.cursor.col).toBe(14);
  expect(bumped.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  session = keys(bumped, ['w','b']);
  expect(session.world.engine.cursor).toEqual({ line: 7, col: 13 });
  session = keys(session, ['2','w','2','j']);
  expect(session.world.engine.cursor).toEqual({ line: 9, col: 19 });
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.long-stone' });
  session = keys(dismiss(session), ['2','e']);
  expect(session.world.engine.cursor).toEqual({ line: 9, col: 31 });
  session = dismiss(keys(session, ['2','j']));
  expect(session.story.flags['lowlands.knows-e']).toBe(true);
  // East is a dead end: the next word is the hedge.
  const east = controller.reduce(session, 'w');
  expect(east.world.engine.cursor).toEqual({ line: 11, col: 31 });
  session = keys(session, ['2','b','2','j','3','e']);
  expect(session.world.engine.cursor).toEqual({ line: 13, col: 33 });
  expect(session.world.firedTriggers).not.toContain('lowlands.far-side');
  session = keys(session, ['l']);
  expect(session.world.firedTriggers).toContain('lowlands.far-side');
  expect(session.story.quests['lowlands.lighthouse']?.step).toBe(2);
});
it('a ladder is climbed: a counted jump cannot fall down it, so each row has to be crossed', () => {
  const onB = keys(move(startLowlands(), 9, 31), []);
  const fall = controller.reduce(onB, '8');
  const fallen = controller.reduce(fall, 'e');
  expect(fallen.world.engine.cursor).toEqual({ line: 9, col: 31 });
  expect(fallen.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall', at: { line: 10, col: 31 } }));
  expect(keys(onB, ['2', 'j']).world.engine.cursor).toEqual({ line: 11, col: 31 });
});
function jetty(): Session {
  // Wren, the far side and the note: the door needs all three.
  const met = dismiss(keys(startLowlands(), ['e']));
  const crossed = keys(move(met, 13, 36), ['l']);
  const read = dismiss(controller.reduce(move(crossed, 14, 38), '<CR>'));
  return dismiss(keys(read, ['l', 'l']));
}
it('the note blocks the jetty until read, then is removed', () => {
  const approach = move(startLowlands(), 14, 38);
  const blocked = controller.reduce(approach, 'l');
  expect(blocked.world.engine.cursor).toEqual({ line: 14, col: 38 });
  expect(blocked.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'solid-entity' }));
  const reading = controller.reduce(blocked, '<CR>');
  expect(reading.queue[0]).toMatchObject({ dialogue: 'lowlands.note' });
  expect(reading.world.entities.some(entity => entity.id === 'scribe-note')).toBe(true);
  expect(reading.story.flags['lowlands.knows-dollar']).not.toBe(true);
  const read = dismiss(reading);
  expect(read.story.flags['lowlands.knows-dollar']).toBe(true);
  expect(read.world.entities.some(entity => entity.id === 'scribe-note')).toBe(false);
  const entered = keys(read, ['l']);
  expect(entered.world.engine.cursor).toEqual({ line: 14, col: 39 });
  expect(entered.world.firedTriggers).not.toContain('lowlands.jetty');
});
it('the old 5$ shortcut runs into the trees: the field has to be crossed (path rule)', () => {
  const start = startLowlands();
  const shortcut = keys(start, ['5', '$']);
  expect(shortcut.world.engine.cursor).toEqual(start.world.engine.cursor);
  expect(shortcut.world.turn).toBe(0);
  expect(shortcut.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
});
it('the door does not open before the far side and the Scribe\'s note', () => {
  const atDoor = move(startLowlands(), 14, 55);
  const stepped = keys(atDoor, ['h', 'l']);
  expect(stepped.world.status).toBe('playing');
});
it('$ crosses the jetty untouched; single steps lose exactly two hearts', () => {
  const start = jetty();
  expect(start.world.engine.cursor).toEqual({ line: 14, col: 40 });
  expect(start.world.firedTriggers).toContain('lowlands.jetty');
  expect(start.world.entities.filter(entity => entity.def.kind === 'blot').map(entity => entity.at))
    .toEqual([{ line: 14, col: 50 }, { line: 14, col: 53 }]);
  expect(start.story.flags['lowlands.knows-dollar']).toBe(true);
  const leap = controller.reduce(start, '$');
  expect(leap.world.status).toBe('cleared'); expect(leap.world.hearts).toBe(3);
  expect(leap.queue[0]).toMatchObject({ dialogue: 'lowlands.end' });
  const slow = keys(start, Array.from({ length: 15 }, () => 'l'));
  expect(slow.world.status).toBe('cleared'); expect(slow.world.hearts).toBe(1);
});
it('advances the Lighthouse quest and enters the castle after its ending', () => {
  const session = keys(startLowlands(), lowlands.solution);
  expect(session.story.quests['lowlands.lighthouse']).toEqual({ step: 4, done: false });
  expect(session.queue).toHaveLength(1);
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.end' });
  const ended = dismiss(session);
  expect(ended.world.stage).toBe('lighthouse');
  expect(ended.world.engine.cursor).toEqual({ line: 25, col: 10 });
  expect(controller.reduce(ended, 'l').queue).toEqual([]);
});
it('holds story world effects while dead and drops them on restore: the dying turn is undone (S-1)', () => {
  const authored = { ...content,
    dialogues: content.dialogues.map(dialogue => dialogue.id === 'margin.intro'
      ? { ...dialogue, then: [{ type: 'world' as const, effects: [
        { type: 'set-rows' as const, fromLine: 0, lines: stage.map.map(row => 'T'.repeat(row.length)) },
        { type: 'set-flag' as const, flag: 'dead-reward', value: true },
      ] }] } : dialogue),
    reactions: [...content.reactions, { id: 'dead-reward', once: true,
      when: { type: 'flag' as const, flag: 'dead-reward', value: true },
      then: [{ type: 'world' as const, effects: [{ type: 'remove-entity' as const, entity: 'bram' }] }] }],
  };
  const game = createSession({ sim, storyEngine, content: authored, stage, legend });
  let held = game.init();
  held = game.reduce(game.reduce(held, '<CR>'), '<CR>');
  expect(held.world.status).toBe('dead');
  expect(held.deferredEffects).toEqual([{ type: 'remove-entity', entity: 'bram' }]);
  const restored = game.reduce(held, 'l');
  expect(restored.deferredEffects).toEqual([]);
  expect(restored.world.status).toBe('playing');
  // Back to the last checkpoint, story included: the lethal batch and its reaction never happened.
  expect(restored.world.entities.some(entity => entity.id === 'bram')).toBe(true);
  expect(restored.story.flags['dead-reward']).not.toBe(true);
  expect(restored.world.flags['dead-reward']).not.toBe(true);
});

it('Margin solver solution enters Lowlands and starts its quest', () => {
  const next = dismiss(keys(dismiss(controller.init()), stage.solution));
  expect(next.world.stage).toBe('lowlands');
  expect(next.story.quests['lowlands.lighthouse']).toEqual({ step: 0, done: false });
});
it('Margin clear starts the next quest even when its lesson quest was skipped', () => {
  const result = storyEngine.onEvents(storyEngine.init(content), [{ type: 'stage-cleared', stage: 'margin', turns: stage.parTurns }], content);
  expect(result.state.quests['lowlands.lighthouse']).toEqual({ step: 0, done: false });
});
it('the solver route crosses the field and reads the Scribe\'s note before the door', () => {
  const cleared = keys(startLowlands(), lowlands.solution);
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.story.flags['lowlands.crossed']).toBe(true);
  expect(cleared.story.flags['lowlands.read-note']).toBe(true);
  // Wren is on the route: the door needs her lesson too.
  expect(cleared.story.flags['lowlands.knows-w']).toBe(true);
  expect(cleared.queue).toEqual([{ type: 'dialogue', dialogue: 'lowlands.end', index: 0 }]);
  expect(dismiss(cleared).world.stage).toBe('lighthouse');
});

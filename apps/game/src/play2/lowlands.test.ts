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
  for (let count = 0; session.queue.length && count < 100; count += 1) session = controller.reduce(session, '<CR>');
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
  let session = keys(dismiss(controller.init()), ['4','k','3','l','<CR>', 'j', ...'llll', ...'jjjjjj', 'l','l','<CR>', 'k','k','k','8','l','3','0','l']);
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ dialogue: 'margin.end' });
  const flags = session.story.flags;
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
it('l bumps into blank; w leaps each gap, b returns, and the far-side trigger advances the quest', () => {
  let session = dismiss(keys(startLowlands(), ['9','l']));
  session = keys(session, ['w']);
  expect(session.world.engine.cursor.col).toBe(13);
  session = keys(session, ['l']); // second cell of the first stone
  const bumped = controller.reduce(session, 'l');
  expect(bumped.world.engine.cursor.col).toBe(14);
  expect(bumped.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  session = keys(bumped, ['w','b']);
  expect(session.world.engine.cursor.col).toBe(13);
  session = keys(session, ['w','w','w']);
  expect(session.world.engine.cursor.col).toBe(26);
  session = controller.reduce(session, 'w');
  expect(session.world.engine.cursor).toEqual({ line: 7, col: 26 });
  expect(session.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  session = keys(session, ['l']);
  expect(session.world.engine.cursor).toEqual({ line: 7, col: 27 });
  expect(session.world.firedTriggers).toContain('lowlands.far-side');
  expect(session.story.quests['lowlands.lighthouse']?.step).toBe(2);
});
function jetty(): Session {
  const read = dismiss(controller.reduce(move(startLowlands(), 11, 38), '<CR>'));
  return dismiss(keys(read, ['l', 'l']));
}
it('the note blocks the jetty until read, then is removed', () => {
  const approach = move(startLowlands(), 11, 38);
  const blocked = controller.reduce(approach, 'l');
  expect(blocked.world.engine.cursor).toEqual({ line: 11, col: 38 });
  expect(blocked.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'solid-entity' }));
  const reading = controller.reduce(blocked, '<CR>');
  expect(reading.queue[0]).toMatchObject({ dialogue: 'lowlands.note' });
  expect(reading.world.entities.some(entity => entity.id === 'scribe-note')).toBe(true);
  expect(reading.story.flags['lowlands.knows-dollar']).not.toBe(true);
  const read = dismiss(reading);
  expect(read.story.flags['lowlands.knows-dollar']).toBe(true);
  expect(read.world.entities.some(entity => entity.id === 'scribe-note')).toBe(false);
  const entered = keys(read, ['l']);
  expect(entered.world.engine.cursor).toEqual({ line: 11, col: 39 });
  expect(entered.world.firedTriggers).not.toContain('lowlands.jetty');
});
it('allows the expert shortcut 5$ from the start to the Lighthouse door', () => {
  const shortcut = keys(startLowlands(), ['5', '$']);
  expect(shortcut.world.engine.cursor).toEqual({ line: 11, col: 55 });
  expect(shortcut.world.status).toBe('cleared');
  expect(shortcut.world.hearts).toBe(3);
});
it('$ crosses the jetty untouched; single steps lose exactly two hearts', () => {
  const start = jetty();
  expect(start.world.engine.cursor).toEqual({ line: 11, col: 40 });
  expect(start.world.firedTriggers).toContain('lowlands.jetty');
  expect(start.world.entities.filter(entity => entity.def.kind === 'blot').map(entity => entity.at))
    .toEqual([{ line: 11, col: 50 }, { line: 11, col: 53 }]);
  expect(start.story.flags['lowlands.knows-dollar']).toBe(true);
  const leap = controller.reduce(start, '$');
  expect(leap.world.status).toBe('cleared'); expect(leap.world.hearts).toBe(3);
  expect(leap.queue[0]).toMatchObject({ dialogue: 'lowlands.end' });
  const slow = keys(start, Array.from({ length: 15 }, () => 'l'));
  expect(slow.world.status).toBe('cleared'); expect(slow.world.hearts).toBe(1);
});
it('completes the Lighthouse quest and presents its exact ending once', () => {
  let session = dismiss(keys(startLowlands(), ['9','l']));
  session = keys(session, ['w','w','w','w','l']);
  session = keys(session, ['1','1','l','4','j','<CR>','l','l','$']);
  expect(session.story.quests['lowlands.lighthouse']?.done).toBe(true);
  expect(session.queue).toHaveLength(1);
  expect(session.queue[0]).toMatchObject({ dialogue: 'lowlands.end' });
  const ended = dismiss(session);
  expect(ended.world.status).toBe('cleared');
  expect(ended.world.engine.cursor).toEqual({ line: 11, col: 55 });
  expect(controller.reduce(ended, 'l').queue).toEqual([]);
});
it('holds story world effects while dead and applies them immediately after restore', () => {
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
  expect(restored.world.entities.some(entity => entity.id === 'bram')).toBe(false);
});

import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { content, legend, stage, stages } from './content.js';
import { currentObjectives, currentQuest } from './currentQuest.js';
import { createSession, type Session } from './session.js';

const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stages, stage, legend });
function cross(session: Session, keys: readonly string[]): Session {
  const from = session.world.stage;
  const settle = (state: Session): Session => {
    let next = state;
    for (let count = 0; next.world.stage === from && (next.queue.length > 0 || next.clearCard) && count < 100; count++) next = game.reduce(next, '<CR>');
    return next;
  };
  return settle(keys.reduce((state, key) => game.reduce(settle(state), key), session));
}
it('a shortcut past an objective does not keep it on screen in later stages', () => {
  let session = game.init();
  for (const { stage: played } of stages.slice(0, 2)) session = cross(session, played.solution);
  // The 5$ route never touched the stepping stones; the next stage asks for its own part all the same.
  expect(session.world.stage).toBe('lighthouse');
  expect(currentObjectives(content, session.story)).toEqual(['Climb the Lighthouse to whoever is crying.']);
  for (const { stage: played } of stages.slice(2, 4)) session = cross(session, played.solution);
  expect(session.world.stage).toBe('cut');
  // A save from before that fix still has the old quest open underneath.
  const story = { ...session.story, quests: { ...session.story.quests, 'lowlands.lighthouse': { step: 0, done: false } } };
  expect(currentQuest(content, story)?.quest.id).toBe('quarry.cut');
  expect(currentObjectives(content, story)).toEqual(['Cross the ledge: `dd` wipes the Blots, `u` restores the ledge.']);
});
it('quests are listed in story order, which "latest" relies on', () => {
  const stageOrder = stages.map(item => item.stage.world);
  const worlds = content.quests.map(quest => stageOrder.indexOf(quest.world));
  expect(worlds).toEqual(worlds.slice().sort((left, right) => left - right));
});
it('shows nothing once the latest quest is done, even with an earlier one left open', () => {
  const story = game.init().story;
  expect(currentQuest(content, { ...story, quests: { 'lowlands.lighthouse': { step: 0, done: false }, 'last.page': { step: 1, done: true } } })).toBeNull();
});
it('has nothing to show without a quest under way', () => {
  expect(currentObjectives(content, { ...game.init().story, quests: {} })).toEqual([]);
});

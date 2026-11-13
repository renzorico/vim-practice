import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stage, legend, stages, lighthouse, lighthouseLegend, lowlands } from './content.js';
import { createSession, type Session } from './session.js';

const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stage, legend, stages });
function dismiss(initial: Session): Session {
  let next = initial;
  for (let count = 0; next.queue.length && count < 100; count += 1) next = controller.reduce(next, '<CR>');
  return next;
}
function keys(initial: Session, input: readonly string[]): Session {
  return input.reduce((next, key) => controller.reduce(dismiss(next), key), initial);
}
function start(): Session {
  const story = storyEngine.apply(storyEngine.init(content), [{ type: 'start-quest', quest: 'lowlands.lighthouse' }], content).state;
  return dismiss(controller.resume({ stage: 'lighthouse', story }));
}
const hall = ['9', 'h', '1', '2', 'k'];
const climb = [...hall, 'k'];
const learner = [...climb, ...'kkk', ...'wwww', ...'ll', ...'kkkk', '0', ...'kk', '9', 'l', 'k', '<CR>'];

it('lints the supplied 26 by 21 castle with zero errors', () => {
  expect(lighthouse.map).toHaveLength(26);
  expect(lighthouse.map.every(row => row.length === 21)).toBe(true);
  expect(lintStage(lighthouse, lighthouseLegend)).toEqual([]);
});
it('enters the Lighthouse only after Lowlands ending is dismissed', () => {
  const initial = controller.resume({ stage: 'lowlands', story: storyEngine.init(content) });
  const cleared = keys(initial, lowlands.solution);
  expect(cleared.world.stage).toBe('lowlands');
  expect(cleared.queue[0]).toMatchObject({ dialogue: 'lowlands.end' });
  const entered = controller.reduce(cleared, '<CR>');
  expect(entered.world.stage).toBe('lighthouse');
  expect(entered.world.engine.cursor).toEqual(lighthouse.start);
  expect(entered.queue[0]).toMatchObject({ dialogue: 'lighthouse.intro' });
});
it('spawns the Unwriter after the climb dialogue, exactly once', () => {
  const climbing = keys(start(), climb);
  expect(climbing.queue[0]).toMatchObject({ dialogue: 'lighthouse.climb' });
  expect(climbing.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  const spawned = dismiss(climbing);
  expect(spawned.world.entities.filter(entity => entity.id === 'unwriter')).toHaveLength(1);
  expect(spawned.world.engine.lines).toHaveLength(26);
  const returned = keys(spawned, ['j', 'k']);
  expect(returned.queue).toEqual([]);
  expect(returned.world.entities.filter(entity => entity.id === 'unwriter')).toHaveLength(1);
  expect(returned.world.engine.lines).toHaveLength(24);
});
it('spawns the Unwriter when a count lands above the old climb cell', () => {
  const climbing = keys(start(), ['9', 'h', '1', '4', 'k']);
  expect(climbing.world.engine.cursor).toEqual({ line: 11, col: 1 });
  expect(climbing.world.firedTriggers).toContain('lighthouse.climb');
  expect(climbing.queue[0]).toMatchObject({ dialogue: 'lighthouse.climb' });
  const spawned = dismiss(climbing);
  expect(spawned.world.entities.filter(entity => entity.id === 'unwriter')).toHaveLength(1);
});
it('a learner using counts and w clears with all three hearts and lights R after the ending once', () => {
  const talking = keys(start(), learner);
  expect(talking.queue[0]).toMatchObject({ dialogue: 'lighthouse.lamplighter' });
  expect(talking.world.engine.lines.length).toBeGreaterThanOrEqual(6);
  expect(talking.world.status).toBe('playing');
  const first = controller.reduce(talking, '<CR>');
  const cleared = controller.reduce(first, '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.hearts).toBe(3);
  expect(cleared.world.turn).toBe(21);
  expect(cleared.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  expect(cleared.queue).toEqual([{ type: 'cutscene', cutscene: 'lighthouse.end', index: 0 }]);
  expect(cleared.story.statues).toEqual([]);
  const ended = dismiss(cleared);
  expect(ended.story.statues).toEqual(['R']);
  expect(controller.reduce(ended, 'l').queue).toEqual([]);
  expect(controller.reduce(ended, 'l').story.statues).toEqual(['R']);
});
it('single steps get caught and die instead of reaching the keeper', () => {
  let next = keys(start(), climb);
  const slow = [...'kkk', ...'wwww', ...'ll', ...'kkkk', '0', ...'kk', ...'lllllllll', 'k'];
  for (const key of slow) {
    next = controller.reduce(dismiss(next), key);
    if (next.world.status === 'dead') break;
  }
  expect(next.world.status).toBe('dead');
  expect(next.world.hearts).toBe(0);
});
it('Continue starts at the stage entry with no Unwriter, then permits the climb again', () => {
  const climbing = keys(start(), [...climb, 'k']);
  const continued = dismiss(controller.resume(climbing.stageEntry));
  expect(continued.world.engine.cursor).toEqual(lighthouse.start);
  expect(continued.world.hearts).toBe(3);
  expect(continued.world.firedTriggers).toEqual([]);
  expect(continued.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  expect(dismiss(keys(continued, climb)).world.entities.some(entity => entity.id === 'unwriter')).toBe(true);
});
it('the shortest solver route enters the Quarry alive after the ending', () => {
  const ended = dismiss(keys(start(), lighthouse.solution));
  expect(ended.world.stage).toBe('quarry-road');
  expect(ended.world.hearts).toBe(3);
  expect(ended.story.flags['lighthouse.lit']).toBe(true);
});

it('completes the third quest step on the lit flag after the normal Lowlands route', () => {
  const initial = controller.resume({ stage: 'lowlands', story: storyEngine.apply(storyEngine.init(content),
    [{ type: 'start-quest', quest: 'lowlands.lighthouse' }], content).state });
  const crossing = keys(initial, ['9','l','w','w','w','w','l','1','1','l','4','j','<CR>','l','l','$']);
  const entered = dismiss(crossing);
  expect(entered.story.quests['lowlands.lighthouse']).toEqual({ step: 2, done: false });
  const cleared = dismiss(keys(entered, lighthouse.solution));
  expect(cleared.story.flags['lighthouse.lit']).toBe(true);
  expect(cleared.story.quests['lowlands.lighthouse']).toEqual({ step: 3, done: true });
});

import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { createSession } from './session.js';
import { content, stage, legend, stages } from './content.js';
import { clearProgress, PROGRESS_KEY, readProgress, saveProgress, type ProgressStorage } from './progress.js';

const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), stage, legend, stages, content });
function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
it('Continue restores the saved stage and story, while New game removes it and starts fresh', () => {
  const store = memory();
  const story = { ...controller.init().story, flags: { 'margin.met-elder': true, 'lowlands.knows-w': true } };
  expect(saveProgress(() => store, { stage: 'lowlands', story })).toBe(true);
  const saved = readProgress(() => store, stages.map(item => item.stage.id));
  expect(saved).not.toBeNull();
  if (!saved) throw new Error('Expected a save');
  const resumed = controller.resume(saved);
  expect(resumed.world.stage).toBe('lowlands');
  expect(resumed.story.flags).toMatchObject(story.flags);
  expect(clearProgress(() => store)).toBe(true);
  expect(store.getItem(PROGRESS_KEY)).toBeNull();
  expect(controller.init().story.flags['lowlands.knows-w']).toBeUndefined();
});
it('survives throwing storage accessors, readers, writers and removal', () => {
  const progress = { stage: 'margin', story: controller.init().story };
  const denied = (): never => { throw new Error('Storage blocked'); };
  const throwing = (): ProgressStorage => ({ getItem: denied, setItem: denied, removeItem: denied });
  for (const storage of [denied, throwing]) {
    expect(readProgress(storage, ['margin'])).toBeNull();
    expect(saveProgress(storage, progress)).toBe(false);
    expect(clearProgress(storage)).toBe(false);
  }
});
it('ignores invalid JSON, invalid story shapes and unknown stage IDs', () => {
  const store = memory();
  for (const text of ['{', '{}', JSON.stringify({ stage: 'unknown', story: controller.init().story }),
    JSON.stringify({ stage: 'margin', story: { ...controller.init().story, flags: [] } })]) {
    store.setItem(PROGRESS_KEY, text);
    expect(readProgress(() => store, ['margin', 'lowlands'])).toBeNull();
  }
});

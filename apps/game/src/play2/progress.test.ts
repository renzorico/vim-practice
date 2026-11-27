import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { createSession } from './session.js';
import { content, stage, legend, stages } from './content.js';
import { storeStageEntry, updateProgress, recordBest, clearProgress, PROGRESS_KEY, readProgress, saveProgress, type Progress, type ProgressStorage } from './progress.js';

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

it('does not record bests for hubs, preserving existing records; text stages record keys', () => {
  const best = { lowlands: { turns: 3, stars: 3 as const } };
  for (const { stage } of stages.filter(({ stage }) => stage.id === 'margin')) {
    expect(recordBest(best, stage.id, 1, stage.parTurns)).toBe(best);
  }
  expect(recordBest(best, 'ledger', 60, 52).ledger).toEqual({ turns: 60, stars: 2 });
  expect(recordBest(best, 'lowlands', 2, 6).lowlands).toEqual({ turns: 2, stars: 3 });
});

it('stores three canonical entries once and loads them through the strict schema', () => {
  const story = controller.init().story;
  let progress: Progress = { stage: 'lighthouse', story };
  for (const id of ['margin', 'lowlands', 'lighthouse']) progress = storeStageEntry(progress, id, story);
  const original = progress;
  progress = storeStageEntry(progress, 'lowlands', { ...story, flags: { changed: true } });
  expect(progress).toBe(original);
  expect(Object.keys(progress.entries ?? {})).toEqual(['margin', 'lowlands', 'lighthouse']);
  const store = memory();
  saveProgress(() => store, progress);
  expect(readProgress(() => store, stages.map(item => item.stage.id))).toEqual(progress);
});
it('old saves have no invented entries and malformed entries are rejected', () => {
  const store = memory();
  const progress = { stage: 'margin', story: controller.init().story };
  saveProgress(() => store, progress);
  expect(readProgress(() => store, ['margin'])?.entries).toBeUndefined();
  for (const entries of [{ margin: { ...progress.story, extra: true } }, { margin: null }, []]) {
    store.setItem(PROGRESS_KEY, JSON.stringify({ ...progress, entries }));
    expect(readProgress(() => store, ['margin'])).toBeNull();
  }
});
it('replay bests improve without replacing Continue or its entries', () => {
  const story = controller.init().story;
  const saved = storeStageEntry({ stage: 'lighthouse', story }, 'lowlands', story);
  const best = recordBest({}, 'lowlands', 1, 1);
  const improved = updateProgress(saved, { stage: 'lowlands', story, best }, true);
  expect(improved).toEqual({ ...saved, best });
  expect(improved.entries).toBe(saved.entries);
  expect(updateProgress(improved, { stage: 'lowlands', story, best }, true)).toBe(improved);
});

it('drops unknown stage entry keys while keeping known entries and the rest of the save', () => {
  const store = memory();
  const story = controller.init().story;
  const progress = { stage: 'lowlands', story, entries: { margin: story, lowlands: story, unknown: story } };
  saveProgress(() => store, progress);
  expect(readProgress(() => store, ['margin', 'lowlands'])).toEqual({ ...progress, entries: { margin: story, lowlands: story } });
});

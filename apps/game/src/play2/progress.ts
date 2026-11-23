import { z } from 'zod';
import { stages } from './content.js';
import { isScoredStage } from './stageScoring.js';
import type { StoryState } from '@escape/story';

export const PROGRESS_KEY = 'unsaved.progress.v1';
export interface BestResult { readonly turns: number; readonly stars: 1 | 2 | 3 }
export type StageBests = Readonly<Record<string, BestResult>>;
export type StageEntries = Readonly<Record<string, StoryState>>;
export interface Progress { readonly entries?: StageEntries; readonly best?: StageBests; readonly stage: string; readonly story: StoryState; readonly previous?: Progress }
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const storySchema = z.object({
  flags: z.record(z.boolean()), learnedSkills: z.array(z.string()),
  quests: z.record(z.object({ step: z.number().int().nonnegative(), done: z.boolean() }).strict()),
  unlockedStages: z.array(z.string()), clearedStages: z.array(z.string()), firedReactions: z.array(z.string()),
  statues: z.array(z.enum(['O', 'E', 'R', 'D', 'Q', 'A'])),
  ending: z.enum(['recover', 'delete', 'quit']).nullable(),
}).strict();
const bestSchema = z.record(z.object({ turns: z.number().int().nonnegative(), stars: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict());
const entrySchema = z.object({ stage: z.string(), story: storySchema, best: bestSchema.optional() }).strict();
const progressSchema = entrySchema.extend({ previous: entrySchema.optional(), entries: z.record(storySchema).optional() }).strict();

// Resolve storage inside the guard: even reading window.localStorage can throw.
export function readProgress(storage: () => ProgressStorage, stageIds: readonly string[]): Progress | null {
  try {
    const value = storage().getItem(PROGRESS_KEY);
    if (value === null) return null;
    const parsed = progressSchema.safeParse(JSON.parse(value));
    if (!parsed.success || !stageIds.includes(parsed.data.stage)
      || (parsed.data.previous && !stageIds.includes(parsed.data.previous.stage))) return null;
    return { stage: parsed.data.stage, story: parsed.data.story,
      ...(parsed.data.best ? { best: parsed.data.best } : {}),
      ...(parsed.data.entries ? { entries: Object.fromEntries(Object.entries(parsed.data.entries).filter(([id]) => stageIds.includes(id))) } : {}),
      ...(parsed.data.previous ? { previous: { stage: parsed.data.previous.stage, story: parsed.data.previous.story,
        ...(parsed.data.previous.best ? { best: parsed.data.previous.best } : {}) } } : {}) };
  } catch { return null; } // Storage is optional; blocked or corrupt saves mean a fresh game.
}
export function saveProgress(storage: () => ProgressStorage, progress: Progress): boolean {
  try { storage().setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
export function clearProgress(storage: () => ProgressStorage): boolean {
  try { storage().removeItem(PROGRESS_KEY); return true; }
  catch { return false; }
}

/** Endings update storage only after their final cutscene beat is dismissed. */
export function endingProgress(progress: Progress, story: StoryState): Progress {
  if (story.ending === 'recover') return { ...progress, story };
  if (story.ending === 'delete') return { ...(progress.previous ?? { stage: 'study', story: withoutFinale({
    ...progress.story, ending: null,
    flags: { ...progress.story.flags, 'study.intro-seen': false },
  }) }), ...(progress.best ? { best: progress.best } : {}),
    ...(progress.entries ? { entries: progress.entries } : {}) };
  return progress;
}

/** A delete with no stored study save must not carry the finale's flags, quest or reactions back. */
function withoutFinale(story: StoryState): StoryState {
  const finale = (id: string): boolean => id.startsWith('last.') || id.startsWith('last-page');
  return {
    ...story,
    flags: Object.fromEntries(Object.entries(story.flags).filter(([flag]) => !finale(flag))),
    quests: Object.fromEntries(Object.entries(story.quests).filter(([quest]) => !finale(quest))),
    firedReactions: story.firedReactions.filter(reaction => !finale(reaction)),
    clearedStages: story.clearedStages.filter(stage => stage !== 'study' && stage !== 'last-page'),
  };
}

export function starsFor(turns: number, par: number): 1 | 2 | 3 {
  return turns <= par ? 3 : turns <= Math.ceil(par * 1.5) ? 2 : 1;
}
export function recordBest(best: StageBests = {}, stage: string, turns: number, par: number): StageBests {
  const definition = stages.find(entry => entry.stage.id === stage)?.stage;
  if (definition && !isScoredStage(definition)) return best;
  const previous = best[stage];
  if (previous && previous.turns <= turns) return best;
  return { ...best, [stage]: { turns, stars: starsFor(turns, par) } };
}

/** Canonical starts belong to the save, never the solver's Session graph. */
export function storeStageEntry(progress: Progress, stageId: string, story: StoryState): Progress {
  if (progress.entries?.[stageId]) return progress;
  return { ...progress, entries: { ...progress.entries, [stageId]: story } };
}

/** Replays can improve records without moving Continue away from the story. */
export function updateProgress(saved: Progress | null, entry: Progress, replay: boolean): Progress {
  if (replay && saved) {
    return !entry.best || saved.best === entry.best ? saved : { ...saved, best: entry.best };
  }
  if (saved?.stage === entry.stage && saved.story === entry.story && saved.best === entry.best) return storeStageEntry(saved, entry.stage, entry.story);
  return storeStageEntry({ ...entry, ...(saved?.entries ? { entries: saved.entries } : {}) }, entry.stage, entry.story);
}

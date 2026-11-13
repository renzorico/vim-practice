import { z } from 'zod';
import type { StoryState } from '@escape/story';

export const PROGRESS_KEY = 'unsaved.progress.v1';
export interface Progress { readonly stage: string; readonly story: StoryState }
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
const progressSchema = z.object({ stage: z.string(), story: storySchema }).strict();

// Resolve storage inside the guard: even reading window.localStorage can throw.
export function readProgress(storage: () => ProgressStorage, stageIds: readonly string[]): Progress | null {
  try {
    const value = storage().getItem(PROGRESS_KEY);
    if (value === null) return null;
    const parsed = progressSchema.safeParse(JSON.parse(value));
    return parsed.success && stageIds.includes(parsed.data.stage) ? parsed.data : null;
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

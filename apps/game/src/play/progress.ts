/** Everything the player has done, saved between visits. */
import { emptySave } from '@escape/curriculum';
import type { SaveData } from '@escape/curriculum';
import { z } from 'zod';

export interface Progress {
  readonly save: SaveData;
  readonly collectedKeys: readonly string[];
  readonly clearedDoors: readonly string[];
  /** Seeds for generated rooms: each room opened takes the next one, so rooms differ between visits. */
  readonly seedCounter: number;
}

export interface ProgressStorage {
  load(): Progress | null;
  save(progress: Progress): void;
}

export const emptyProgress = (): Progress => ({ save: emptySave(), collectedKeys: [], clearedDoors: [], seedCounter: 0 });

const STORAGE_KEY = 'escape.progress.v3';

const ProgressSchema = z.object({
  save: z.object({
    version: z.literal(1),
    completed: z.record(z.object({
      stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
      bestKeystrokes: z.number().int().nonnegative(),
    }).strict()),
    mastery: z.record(z.object({
      skill: z.string(),
      box: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      lastPracticed: z.string().datetime(),
      successes: z.number().int().nonnegative(),
      failures: z.number().int().nonnegative(),
    }).strict()),
  }).strict(),
  collectedKeys: z.array(z.string()),
  clearedDoors: z.array(z.string()),
  seedCounter: z.number().int().nonnegative(),
}).strict();

/** Blocked or corrupted storage never crashes the game: it starts fresh and warns once. */
export function createProgressStorage(getStorage: () => Storage | undefined = () => globalThis.localStorage): ProgressStorage {
  return {
    load() {
      try {
        const raw = getStorage()?.getItem(STORAGE_KEY);
        if (raw === null || raw === undefined) return null;
        const parsed = ProgressSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          console.warn('ESCAPE: ignoring invalid saved progress', parsed.error.issues);
          return null;
        }
        return parsed.data;
      } catch (error) {
        console.warn('ESCAPE: could not read saved progress', error);
        return null;
      }
    },
    save(progress) {
      try {
        getStorage()?.setItem(STORAGE_KEY, JSON.stringify(progress));
      } catch (error) {
        console.warn('ESCAPE: could not save progress', error);
      }
    },
  };
}

export const createMemoryProgressStorage = (initial: Progress | null = null): ProgressStorage => {
  let stored = initial === null ? null : JSON.stringify(initial);
  return {
    load: () => (stored === null ? null : (JSON.parse(stored) as Progress)),
    save: (progress) => { stored = JSON.stringify(progress); },
  };
};

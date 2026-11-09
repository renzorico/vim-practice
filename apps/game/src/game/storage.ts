import type { SaveData, StorageAdapter } from '@escape/curriculum';
import { z } from 'zod';

const STORAGE_KEY = 'escape.save.v1';

/** Full shape check: a hand-edited or corrupted save must never reach the game. */
const SaveSchema = z.object({
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
}).strict();

/** Reading `globalThis.localStorage` itself throws when storage is blocked, so it is resolved lazily inside try. */
const defaultStorage = (): Storage | undefined => globalThis.localStorage;

/**
 * localStorage can be missing or throw (private windows, blocked storage). The game must still run,
 * so failures fall back to "no save" and are reported to the console.
 */
export function createLocalStorage(getStorage: () => Storage | undefined = defaultStorage): StorageAdapter {
  return {
    load() {
      try {
        const raw = getStorage()?.getItem(STORAGE_KEY);
        if (raw === null || raw === undefined) return null;
        const parsed = SaveSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          console.warn('ESCAPE: ignoring an invalid saved game', parsed.error.issues);
          return null;
        }
        return parsed.data;
      } catch (error) {
        console.warn('ESCAPE: could not read saved progress', error);
        return null;
      }
    },
    save(data) {
      try {
        getStorage()?.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('ESCAPE: could not save progress', error);
      }
    },
  };
}

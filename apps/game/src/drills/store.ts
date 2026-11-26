import { z } from 'zod';
import type { Mastery } from '@escape/curriculum';
import type { ProgressStorage } from '../play2/progress.js';

export const DRILLS_KEY = 'unsaved.drills.v1';

export interface DrillProgress {
  /** Leitner state per drill skill. */
  readonly mastery: Readonly<Record<string, Mastery>>;
  /** Next seed per skill: every set of a skill is new text. */
  readonly seeds: Readonly<Record<string, number>>;
}

export const EMPTY_DRILLS: DrillProgress = { mastery: {}, seeds: {} };

const masterySchema = z.object({
  skill: z.string(),
  box: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lastPracticed: z.string(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
}).strict();
const drillsSchema = z.object({
  mastery: z.record(masterySchema),
  seeds: z.record(z.number().int().nonnegative()),
}).strict();

/** Missing, blocked or corrupt storage means an empty Copybook, never a crash. */
export function readDrills(storage: () => ProgressStorage): DrillProgress {
  try {
    const value = storage().getItem(DRILLS_KEY);
    if (value === null) return EMPTY_DRILLS;
    const parsed = drillsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : EMPTY_DRILLS;
  } catch { return EMPTY_DRILLS; } // Storage is optional, as for progress saves.
}

export function saveDrills(storage: () => ProgressStorage, progress: DrillProgress): void {
  try { storage().setItem(DRILLS_KEY, JSON.stringify(progress)); }
  catch { /* Storage is optional: a full or blocked store only means practice is not remembered. */ }
}

export function nextSeed(progress: DrillProgress, skill: string): number {
  return progress.seeds[skill] ?? 1;
}

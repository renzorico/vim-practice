import type { LevelResult, SaveData, StorageAdapter } from '../contracts.js';
import type { Level, Mastery, SkillId } from '../types.js';

type Box = Mastery['box'];

const MAX_BOX: Box = 5;
const MIN_LEARNED_BOX: Box = 1;
/** Review interval in days, indexed by Leitner box. */
const REVIEW_INTERVAL_DAYS: readonly number[] = [0, 1, 2, 4, 7, 15];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toBox = (value: number): Box => {
  switch (Math.max(0, Math.min(MAX_BOX, Math.trunc(value)))) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
      return 4;
    default:
      return 5;
  }
};

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Own-property lookup: ids like 'constructor' or 'toString' must not hit Object.prototype. */
const getOwn = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

const cloneSave = (data: SaveData): SaveData => JSON.parse(JSON.stringify(data)) as SaveData;

export const emptySave = (): SaveData => ({ version: 1, completed: {}, mastery: {} });

export const learnedSkills = (save: SaveData, levels: readonly Level[]): ReadonlySet<SkillId> => {
  const learned = new Set<SkillId>();
  for (const level of levels) {
    if (getOwn(save.completed, level.id) === undefined) continue;
    for (const skill of level.teaches) learned.add(skill);
  }
  return learned;
};

const emptyMastery = (skill: SkillId, finishedAt: string): Mastery => ({
  skill,
  box: 0,
  lastPracticed: finishedAt,
  successes: 0,
  failures: 0,
});

export const recordResult = (save: SaveData, result: LevelResult, levels: readonly Level[]): SaveData => {
  const level = levels.find((candidate) => candidate.id === result.levelId);
  const learnedBefore = learnedSkills(save, levels);

  let completed = save.completed;
  if (result.won) {
    const previous = getOwn(completed, result.levelId);
    completed = {
      ...completed,
      [result.levelId]: {
        stars: previous === undefined ? result.stars : previous.stars > result.stars ? previous.stars : result.stars,
        bestKeystrokes:
          previous === undefined ? result.keystrokes : Math.min(previous.bestKeystrokes, result.keystrokes),
      },
    };
  }

  const affected = new Set<SkillId>(result.usedSkills);
  if (result.won && level !== undefined) {
    for (const skill of level.teaches) affected.add(skill);
  }

  const mastery = new Map<SkillId, Mastery>(Object.entries(save.mastery));
  for (const skill of [...affected].sort(compareText)) {
    const current = mastery.get(skill) ?? emptyMastery(skill, result.finishedAt);
    if (result.won) {
      mastery.set(skill, {
        ...current,
        box: toBox(current.box + 1),
        lastPracticed: result.finishedAt,
        successes: current.successes + 1,
      });
    } else {
      const floor: Box = learnedBefore.has(skill) ? MIN_LEARNED_BOX : 0;
      mastery.set(skill, {
        ...current,
        box: toBox(Math.max(floor, current.box - 1)),
        lastPracticed: result.finishedAt,
        failures: current.failures + 1,
      });
    }
  }

  return cloneSave({ version: 1, completed, mastery: Object.fromEntries(mastery) });
};

const intervalMs = (box: Box): number => (REVIEW_INTERVAL_DAYS[box] ?? 0) * MS_PER_DAY;

const dueTime = (mastery: Mastery): number => Date.parse(mastery.lastPracticed) + intervalMs(mastery.box);

export const effectiveBox = (mastery: Mastery, now: string): Box => {
  const interval = intervalMs(mastery.box);
  if (mastery.box === 0 || interval <= 0) return mastery.box;
  const overdueMs = Date.parse(now) - dueTime(mastery);
  if (overdueMs <= 0) return mastery.box;
  const missedIntervals = Math.floor(overdueMs / interval);
  return toBox(Math.max(MIN_LEARNED_BOX, mastery.box - missedIntervals));
};

export const isUnlocked = (level: Level, save: SaveData, levels: readonly Level[]): boolean => {
  const learned = learnedSkills(save, levels);
  return level.requires.every((skill) => learned.has(skill));
};

/** Learned = mastery box >= 1 (a win lifts every taught or used skill to at least box 1). */
export const reviewQueue = (save: SaveData, now: string, limit: number): SkillId[] => {
  if (limit <= 0) return [];
  const nowMs = Date.parse(now);
  const entries = Object.values(save.mastery)
    .filter((mastery) => mastery.box >= 1)
    .map((mastery) => ({
      skill: mastery.skill,
      box: effectiveBox(mastery, now),
      overdueMs: nowMs - dueTime(mastery),
    }));
  entries.sort((a, b) => a.box - b.box || b.overdueMs - a.overdueMs || compareText(a.skill, b.skill));
  return entries.slice(0, limit).map((entry) => entry.skill);
};

export const pickReviewLevels = (
  save: SaveData,
  levels: readonly Level[],
  now: string,
  count: number,
): Level[] => {
  if (count <= 0) return [];
  const queue = new Set(reviewQueue(save, now, Number.MAX_SAFE_INTEGER));
  const scored = levels
    .filter((level) => getOwn(save.completed, level.id) !== undefined)
    .map((level) => ({ level, score: new Set(level.teaches.filter((skill) => queue.has(skill))).size }))
    .filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || compareText(a.level.id, b.level.id));
  return scored.slice(0, count).map((entry) => entry.level);
};

export const createMemoryStorage = (initial?: SaveData): StorageAdapter => {
  let stored: SaveData | null = initial === undefined ? null : cloneSave(initial);
  return {
    load: () => (stored === null ? null : cloneSave(stored)),
    save: (data) => {
      stored = cloneSave(data);
    },
  };
};

import { describe, expect, it } from 'vitest';
import type { LevelResult, SaveData } from '../contracts.js';
import { SKILLS } from '../catalog.js';
import type { Level, Mastery, SkillId } from '../types.js';
import {
  createMemoryStorage,
  effectiveBox,
  emptySave,
  isUnlocked,
  learnedSkills,
  pickReviewLevels,
  recordResult,
  reviewQueue,
} from './index.js';

const T0 = '2026-01-01T00:00:00.000Z';
const day = (n: number): string => new Date(Date.parse(T0) + n * 86_400_000).toISOString();

const makeLevel = (id: string, teaches: SkillId[], requires: SkillId[] = []): Level => ({
  id,
  region: 'prologue',
  type: 'reach',
  title: id,
  intro: 'x',
  startLines: ['a'],
  startCursor: { line: 0, col: 0 },
  goals: [],
  teaches,
  requires,
  par: 1,
  solution: [],
  hints: [],
});

const win = (levelId: string, extra: Partial<LevelResult> = {}): LevelResult => ({
  levelId,
  won: true,
  stars: 3,
  keystrokes: 5,
  usedSkills: [],
  finishedAt: T0,
  ...extra,
});

const lose = (levelId: string, usedSkills: SkillId[], finishedAt = T0): LevelResult => ({
  levelId,
  won: false,
  stars: 0,
  keystrokes: 9,
  usedSkills,
  finishedAt,
});

const mastery = (box: Mastery['box'], lastPracticed = T0, skill = 's'): Mastery => ({
  skill,
  box,
  lastPracticed,
  successes: 0,
  failures: 0,
});

const saveWith = (entries: Mastery[], completed: SaveData['completed'] = {}): SaveData => ({
  version: 1,
  completed,
  mastery: Object.fromEntries(entries.map((entry) => [entry.skill, entry])),
});

describe('emptySave', () => {
  it('is version 1 and empty', () => {
    expect(emptySave()).toEqual({ version: 1, completed: {}, mastery: {} });
  });
  it('returns a fresh object each call', () => {
    expect(emptySave()).not.toBe(emptySave());
  });
});

describe('recordResult', () => {
  const levels = [makeLevel('L1', ['motion.hjkl']), makeLevel('L2', ['motion.word', 'motion.line'])];

  it('records a win and moves taught skills to box 1', () => {
    const next = recordResult(emptySave(), win('L1', { keystrokes: 7, stars: 2 }), levels);
    expect(next.completed['L1']).toEqual({ stars: 2, bestKeystrokes: 7 });
    expect(next.mastery['motion.hjkl']).toMatchObject({ box: 1, successes: 1, failures: 0, lastPracticed: T0 });
  });
  it('advances taught and used skills on a win', () => {
    const next = recordResult(emptySave(), win('L1', { usedSkills: ['motion.word'] }), levels);
    expect(next.mastery['motion.word']?.box).toBe(1);
    expect(next.mastery['motion.hjkl']?.box).toBe(1);
  });
  it('does not touch unrelated skills', () => {
    const next = recordResult(emptySave(), win('L1'), levels);
    expect(Object.keys(next.mastery)).toEqual(['motion.hjkl']);
  });
  it('caps the box at 5', () => {
    let save = emptySave();
    for (let i = 0; i < 9; i += 1) save = recordResult(save, win('L1'), levels);
    expect(save.mastery['motion.hjkl']?.box).toBe(5);
    expect(save.mastery['motion.hjkl']?.successes).toBe(9);
  });
  it('keeps the best stars', () => {
    let save = recordResult(emptySave(), win('L1', { stars: 3 }), levels);
    save = recordResult(save, win('L1', { stars: 1 }), levels);
    expect(save.completed['L1']?.stars).toBe(3);
  });
  it('raises stars when a later run is better', () => {
    let save = recordResult(emptySave(), win('L1', { stars: 1 }), levels);
    save = recordResult(save, win('L1', { stars: 2 }), levels);
    expect(save.completed['L1']?.stars).toBe(2);
  });
  it('keeps the fewest keystrokes', () => {
    let save = recordResult(emptySave(), win('L1', { keystrokes: 4 }), levels);
    save = recordResult(save, win('L1', { keystrokes: 10 }), levels);
    expect(save.completed['L1']?.bestKeystrokes).toBe(4);
    save = recordResult(save, win('L1', { keystrokes: 3 }), levels);
    expect(save.completed['L1']?.bestKeystrokes).toBe(3);
  });
  it('best stars and best keystrokes are independent', () => {
    let save = recordResult(emptySave(), win('L1', { stars: 3, keystrokes: 8 }), levels);
    save = recordResult(save, win('L1', { stars: 1, keystrokes: 2 }), levels);
    expect(save.completed['L1']).toEqual({ stars: 3, bestKeystrokes: 2 });
  });
  it('a loss does not complete a level', () => {
    const next = recordResult(emptySave(), lose('L1', ['motion.hjkl']), levels);
    expect(next.completed).toEqual({});
  });
  it('a loss does not erase an earlier completion', () => {
    let save = recordResult(emptySave(), win('L1'), levels);
    save = recordResult(save, lose('L1', ['motion.hjkl'], day(1)), levels);
    expect(save.completed['L1']).toEqual({ stars: 3, bestKeystrokes: 5 });
  });
  it('a loss drops used skills one box', () => {
    let save = recordResult(emptySave(), win('L1'), levels);
    save = recordResult(save, win('L1'), levels);
    save = recordResult(save, lose('L1', ['motion.hjkl'], day(1)), levels);
    expect(save.mastery['motion.hjkl']).toMatchObject({ box: 1, failures: 1, lastPracticed: day(1) });
  });
  it('a loss never drops a learned skill below box 1', () => {
    let save = recordResult(emptySave(), win('L1'), levels);
    save = recordResult(save, lose('L1', ['motion.hjkl'], day(1)), levels);
    save = recordResult(save, lose('L1', ['motion.hjkl'], day(2)), levels);
    expect(save.mastery['motion.hjkl']?.box).toBe(1);
    expect(save.mastery['motion.hjkl']?.failures).toBe(2);
  });
  it('a loss on an unlearned skill stays at box 0', () => {
    const next = recordResult(emptySave(), lose('L2', ['motion.word']), levels);
    expect(next.mastery['motion.word']).toMatchObject({ box: 0, failures: 1 });
  });
  it('a loss only touches used skills, not taught ones', () => {
    const next = recordResult(emptySave(), lose('L2', ['motion.word']), levels);
    expect(next.mastery['motion.line']).toBeUndefined();
  });
  it('lastPracticed equals finishedAt', () => {
    const next = recordResult(emptySave(), win('L1', { finishedAt: day(3) }), levels);
    expect(next.mastery['motion.hjkl']?.lastPracticed).toBe(day(3));
  });
  it('does not mutate the input save', () => {
    const save = emptySave();
    const snapshot = JSON.stringify(save);
    recordResult(save, win('L1'), levels);
    expect(JSON.stringify(save)).toBe(snapshot);
  });
  it('is deterministic', () => {
    const a = recordResult(emptySave(), win('L2', { usedSkills: ['motion.hjkl', 'motion.word'] }), levels);
    const b = recordResult(emptySave(), win('L2', { usedSkills: ['motion.word', 'motion.hjkl'] }), levels);
    expect(a).toEqual(b);
  });
  it('tolerates an unknown level id (used skills still count)', () => {
    const next = recordResult(emptySave(), win('nope', { usedSkills: ['motion.hjkl'] }), levels);
    expect(next.completed['nope']).toBeDefined();
    expect(next.mastery['motion.hjkl']?.box).toBe(1);
  });
});

describe('effectiveBox', () => {
  it('box 0 stays 0', () => {
    expect(effectiveBox(mastery(0), day(400))).toBe(0);
  });
  it('is unchanged before the due date', () => {
    expect(effectiveBox(mastery(3), day(3))).toBe(3);
  });
  it('is unchanged exactly at the due date', () => {
    expect(effectiveBox(mastery(3), day(4))).toBe(3);
  });
  it('is unchanged within the first interval after due', () => {
    expect(effectiveBox(mastery(3), day(7.9))).toBe(3);
  });
  it('loses one box after one full missed interval', () => {
    expect(effectiveBox(mastery(3), day(8))).toBe(2);
  });
  it('loses two boxes after two missed intervals', () => {
    expect(effectiveBox(mastery(3), day(12))).toBe(1);
  });
  it('box 1 loses nothing (floor)', () => {
    expect(effectiveBox(mastery(1), day(1))).toBe(1);
    expect(effectiveBox(mastery(1), day(500))).toBe(1);
  });
  it('box 5 decays by full 15-day intervals', () => {
    expect(effectiveBox(mastery(5), day(29))).toBe(5);
    expect(effectiveBox(mastery(5), day(30))).toBe(4);
    expect(effectiveBox(mastery(5), day(45))).toBe(3);
    expect(effectiveBox(mastery(5), day(75))).toBe(1);
  });
  it('decays to the floor across months', () => {
    expect(effectiveBox(mastery(5), day(180))).toBe(1);
    expect(effectiveBox(mastery(4), day(90))).toBe(1);
    expect(effectiveBox(mastery(2), day(365))).toBe(1);
  });
  it('is never below 1 for a learned skill', () => {
    for (const box of [1, 2, 3, 4, 5] as const) {
      expect(effectiveBox(mastery(box), day(10_000))).toBeGreaterThanOrEqual(1);
    }
  });
  it('does not mutate the mastery', () => {
    const m = mastery(4);
    effectiveBox(m, day(100));
    expect(m.box).toBe(4);
  });
});

describe('learnedSkills and isUnlocked on the real catalog', () => {
  const catalogIds = new Set(SKILLS.map((skill) => skill.id));
  const prologue = [
    makeLevel('p1', ['ex.q']),
    makeLevel('p2', ['ex.q!']),
    makeLevel('p3', ['mode.insert'], ['ex.q']),
    makeLevel('p4', ['ex.wq'], ['mode.insert']),
  ];
  const region1 = [
    makeLevel('r1', ['motion.hjkl'], ['ex.wq']),
    makeLevel('r2', ['motion.word'], ['motion.hjkl']),
    makeLevel('r3', ['motion.WORD'], ['motion.word']),
    makeLevel('r4', ['motion.count'], ['motion.word']),
    makeLevel('r5', ['motion.file', 'motion.line'], ['motion.hjkl']),
  ];
  const levels = [...prologue, ...region1];

  it('fixture skills exist in the catalog', () => {
    for (const level of levels) for (const skill of [...level.teaches, ...level.requires]) expect(catalogIds.has(skill)).toBe(true);
  });
  it('nothing learned on an empty save', () => {
    expect(learnedSkills(emptySave(), levels).size).toBe(0);
  });
  it('a level with no requirements is always unlocked', () => {
    expect(isUnlocked(prologue[0]!, emptySave(), levels)).toBe(true);
    expect(isUnlocked(prologue[1]!, emptySave(), levels)).toBe(true);
  });
  it('gated levels stay locked until prerequisites are learned', () => {
    expect(isUnlocked(prologue[2]!, emptySave(), levels)).toBe(false);
    expect(isUnlocked(region1[0]!, emptySave(), levels)).toBe(false);
  });
  it('unlock chain: Prologue then Region 1', () => {
    let save = emptySave();
    const order = ['p1', 'p3', 'p4', 'r1', 'r2', 'r3'];
    const expectedUnlockedAfter: Record<string, string[]> = {
      p1: ['p1', 'p2', 'p3'],
      p3: ['p1', 'p2', 'p3', 'p4'],
      p4: ['p1', 'p2', 'p3', 'p4', 'r1'],
      r1: ['p1', 'p2', 'p3', 'p4', 'r1', 'r2', 'r5'],
      r2: ['p1', 'p2', 'p3', 'p4', 'r1', 'r2', 'r3', 'r4', 'r5'],
    };
    for (const id of order.slice(0, -1)) {
      save = recordResult(save, win(id), levels);
      const unlocked = levels.filter((level) => isUnlocked(level, save, levels)).map((level) => level.id);
      expect(unlocked).toEqual(expectedUnlockedAfter[id]);
    }
  });
  it('unlocking is cumulative: no level order needed', () => {
    let save = emptySave();
    for (const id of ['p1', 'p3', 'p4', 'r1', 'r2']) save = recordResult(save, win(id), levels);
    expect(isUnlocked(region1[3]!, save, levels)).toBe(true);
    expect(isUnlocked(region1[2]!, save, levels)).toBe(true);
  });
  it('a failed level teaches nothing', () => {
    const save = recordResult(emptySave(), lose('p1', ['ex.q']), levels);
    expect(learnedSkills(save, levels).size).toBe(0);
    expect(isUnlocked(prologue[2]!, save, levels)).toBe(false);
  });
  it('learnedSkills collects every taught skill of completed levels', () => {
    let save = recordResult(emptySave(), win('r5'), levels);
    expect([...learnedSkills(save, levels)].sort()).toEqual(['motion.file', 'motion.line']);
    save = recordResult(save, win('p2'), levels);
    expect(learnedSkills(save, levels).has('ex.q!')).toBe(true);
  });
  it('requires with several skills need all of them', () => {
    const multi = makeLevel('m', ['motion.count'], ['motion.word', 'motion.line']);
    let save = recordResult(emptySave(), win('r2'), [...levels, multi]);
    expect(isUnlocked(multi, save, [...levels, multi])).toBe(false);
    save = recordResult(save, win('r5'), [...levels, multi]);
    expect(isUnlocked(multi, save, [...levels, multi])).toBe(true);
  });
});

describe('reviewQueue', () => {
  it('is empty for an empty save', () => {
    expect(reviewQueue(emptySave(), T0, 5)).toEqual([]);
  });
  it('orders weakest effective box first', () => {
    const save = saveWith([mastery(4, T0, 'a'), mastery(2, T0, 'b'), mastery(3, T0, 'c')]);
    expect(reviewQueue(save, T0, 10)).toEqual(['b', 'c', 'a']);
  });
  it('uses the effective (decayed) box', () => {
    const save = saveWith([mastery(5, T0, 'old'), mastery(2, day(99), 'fresh')]);
    expect(reviewQueue(save, day(100), 10)).toEqual(['old', 'fresh']);
  });
  it('breaks ties by most overdue', () => {
    const save = saveWith([mastery(2, day(5), 'recent'), mastery(2, day(0), 'stale')]);
    expect(reviewQueue(save, day(6), 10)).toEqual(['stale', 'recent']);
  });
  it('breaks remaining ties by skill id', () => {
    const save = saveWith([mastery(2, T0, 'b'), mastery(2, T0, 'a')]);
    expect(reviewQueue(save, T0, 10)).toEqual(['a', 'b']);
  });
  it('respects the limit', () => {
    const save = saveWith([mastery(1, T0, 'a'), mastery(2, T0, 'b'), mastery(3, T0, 'c')]);
    expect(reviewQueue(save, T0, 2)).toEqual(['a', 'b']);
    expect(reviewQueue(save, T0, 0)).toEqual([]);
  });
  it('skips unlearned (box 0) skills', () => {
    const save = saveWith([mastery(0, T0, 'new'), mastery(1, T0, 'known')]);
    expect(reviewQueue(save, T0, 10)).toEqual(['known']);
  });
});

describe('pickReviewLevels', () => {
  const levels = [
    makeLevel('c', ['s1']),
    makeLevel('b', ['s1', 's2']),
    makeLevel('a', ['s1']),
    makeLevel('d', ['s3']),
    makeLevel('z', ['s9']),
  ];
  const done = (...ids: string[]): SaveData['completed'] =>
    Object.fromEntries(ids.map((id) => [id, { stars: 1 as const, bestKeystrokes: 1 }]));

  it('prefers levels covering most queue skills', () => {
    const save = saveWith([mastery(1, T0, 's1'), mastery(1, T0, 's2')], done('a', 'b', 'c'));
    expect(pickReviewLevels(save, levels, T0, 1).map((l) => l.id)).toEqual(['b']);
  });
  it('breaks ties by level id', () => {
    const save = saveWith([mastery(1, T0, 's1')], done('c', 'a'));
    expect(pickReviewLevels(save, levels, T0, 2).map((l) => l.id)).toEqual(['a', 'c']);
  });
  it('only picks completed levels', () => {
    const save = saveWith([mastery(1, T0, 's1')], done('c'));
    expect(pickReviewLevels(save, levels, T0, 5).map((l) => l.id)).toEqual(['c']);
  });
  it('ignores levels that teach nothing in the queue', () => {
    const save = saveWith([mastery(1, T0, 's1'), mastery(1, T0, 's9')], done('a', 'z', 'd'));
    expect(pickReviewLevels(save, levels, T0, 5).map((l) => l.id)).toEqual(['a', 'z']);
  });
  it('respects count', () => {
    const save = saveWith([mastery(1, T0, 's1'), mastery(1, T0, 's3')], done('a', 'c', 'd'));
    expect(pickReviewLevels(save, levels, T0, 2)).toHaveLength(2);
    expect(pickReviewLevels(save, levels, T0, 0)).toEqual([]);
  });
  it('is empty for an empty save', () => {
    expect(pickReviewLevels(emptySave(), levels, T0, 3)).toEqual([]);
  });
  it('is independent of the level array order', () => {
    const save = saveWith([mastery(1, T0, 's1')], done('a', 'b', 'c'));
    const forward = pickReviewLevels(save, levels, T0, 3).map((l) => l.id);
    const backward = pickReviewLevels(save, [...levels].reverse(), T0, 3).map((l) => l.id);
    expect(backward).toEqual(forward);
  });
});

describe('createMemoryStorage', () => {
  it('loads null when empty', () => {
    expect(createMemoryStorage().load()).toBeNull();
  });
  it('round-trips a save', () => {
    const storage = createMemoryStorage();
    const save = saveWith([mastery(2)], { L: { stars: 2, bestKeystrokes: 4 } });
    storage.save(save);
    expect(storage.load()).toEqual(save);
  });
  it('initial data is copied in', () => {
    const initial = saveWith([mastery(2)]);
    const storage = createMemoryStorage(initial);
    expect(storage.load()).toEqual(initial);
    expect(storage.load()).not.toBe(initial);
  });
  it('mutating a loaded object does not change storage', () => {
    const storage = createMemoryStorage(saveWith([mastery(2)], { L: { stars: 1, bestKeystrokes: 3 } }));
    const loaded = storage.load() as unknown as {
      completed: Record<string, { stars: number }>;
      mastery: Record<string, { box: number }>;
    };
    loaded.completed['L']!.stars = 3;
    loaded.mastery['s']!.box = 5;
    const again = storage.load();
    expect(again?.completed['L']?.stars).toBe(1);
    expect(again?.mastery['s']?.box).toBe(2);
  });
  it('mutating the saved object afterwards does not change storage', () => {
    const storage = createMemoryStorage();
    const save = saveWith([mastery(2)]) as unknown as { mastery: Record<string, { box: number }> };
    storage.save(save as unknown as SaveData);
    save.mastery['s']!.box = 5;
    expect(storage.load()?.mastery['s']?.box).toBe(2);
  });
  it('each load returns a distinct object', () => {
    const storage = createMemoryStorage(emptySave());
    expect(storage.load()).not.toBe(storage.load());
  });
});

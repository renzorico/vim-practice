import { describe, expect, it } from 'vitest';
import { SKILLS, skillSlug } from '../catalog.js';
import type { Difficulty, GeneratedRoom, SolveFn } from '../phase3.js';
import { startLevel, stepLevel } from '../runner/index.js';
import { parseLevel } from '../schema.js';
import type { Level } from '../types.js';
import { GENERATORS, createRng, finalizeRoom } from './index.js';

const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3];
const SEEDS = Array.from({ length: 20 }, (_, seed) => seed);
const MAX_LINE_LENGTH = 60;

const noSolver: SolveFn = () => null;

function replay(level: Level, keys: readonly string[]): ReturnType<typeof startLevel> {
  return keys.reduce(stepLevel, startLevel(level));
}

function withoutId(room: GeneratedRoom): Omit<GeneratedRoom, 'id'> {
  const { id: _id, ...rest } = room;
  return rest;
}

describe('createRng', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const first = createRng(42);
    const second = createRng(42);
    for (let index = 0; index < 50; index += 1) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe('GENERATORS', () => {
  it('has one generator per catalog skill', () => {
    expect(Object.keys(GENERATORS).sort()).toEqual(SKILLS.map((skill) => skill.id).sort());
    for (const skill of SKILLS) expect(GENERATORS[skill.id]?.skill).toBe(skill.id);
  });

  for (const skill of SKILLS) {
    describe(skill.id, () => {
      const generator = GENERATORS[skill.id];
      if (generator === undefined) throw new Error(`missing generator ${skill.id}`);

      for (const difficulty of DIFFICULTIES) {
        it(`difficulty ${difficulty}: valid, solvable, deterministic, varied over ${SEEDS.length} seeds`, () => {
          const serialized = new Set<string>();
          for (const seed of SEEDS) {
            const room = generator.generate(seed, difficulty);
            const level = finalizeRoom(room, noSolver);

            expect(parseLevel(level)).toEqual(level);
            expect(room.id).toBe(`gen-${skillSlug(skill.id)}-${difficulty}-${seed}`);
            expect(room.teaches).toEqual([skill.id]);
            expect(room.allowedCommands).toEqual(expect.arrayContaining([':q', ':q!']));
            expect(room.hints.length).toBeGreaterThanOrEqual(2);
            expect(room.hints.length).toBeLessThanOrEqual(3);
            expect(room.startLines.length).toBeGreaterThanOrEqual(3);
            expect(room.startLines.length).toBeLessThanOrEqual(8);
            for (const line of room.startLines) expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);

            const run = replay(level, room.intendedSolution);
            expect(run.status, `${room.id}: ${room.startLines.join(' | ')} keys ${room.intendedSolution.join(' ')}`).toBe('won');
            expect(run.keystrokes).toBeLessThanOrEqual(room.intendedSolution.length);
            expect(run.lastError).toBeNull();

            expect(generator.generate(seed, difficulty)).toEqual(room);
            serialized.add(JSON.stringify(withoutId(room)));
          }
          expect(serialized.size).toBe(SEEDS.length);
        });
      }
    });
  }
});

describe('generated room design', () => {
  it('requires the skill prerequisites, transitively', () => {
    expect(GENERATORS['motion.count']?.generate(1, 1).requires).toEqual(['motion.hjkl', 'motion.word']);
    expect(GENERATORS['ex.wq']?.generate(1, 1).requires).toEqual(['ex.q', 'mode.insert']);
    expect(GENERATORS['ex.q']?.generate(1, 1).requires).toEqual([]);
  });

  it('keeps the taught move out of reach of an easy shortcut for the skill below it', () => {
    const room = GENERATORS['motion.word']?.generate(3, 2);
    expect(room?.allowedCommands).not.toContain('W');
    expect(room?.allowedCommands).toEqual(expect.arrayContaining(['h', 'j', 'k', 'l', 'w', 'b', 'e']));
  });

  it('makes the taught move much shorter than walking with l', () => {
    for (const seed of SEEDS) {
      const room = GENERATORS['motion.line']?.generate(seed, 1);
      const goal = room?.goals[0];
      if (room === undefined || goal?.type !== 'reach') throw new Error('expected a reach room');
      const walk = Math.abs(goal.target.col - room.startCursor.col);
      expect(walk).toBeGreaterThanOrEqual(25);
      expect(room.intendedSolution).toHaveLength(1);
    }
  });
});

describe('finalizeRoom', () => {
  const room = GENERATORS['motion.word']?.generate(5, 2);
  if (room === undefined) throw new Error('missing generator');
  const shorter = room.intendedSolution.slice(1);

  it('falls back to the intended solution when the solver finds nothing', () => {
    const level = finalizeRoom(room, () => null);
    expect(level.par).toBe(room.intendedSolution.length);
    expect(level.solution).toEqual(room.intendedSolution);
    expect('intendedSolution' in level).toBe(false);
  });

  it('uses a shorter solver solution for par', () => {
    const level = finalizeRoom(room, () => ({ keys: shorter }));
    expect(level.par).toBe(shorter.length);
    expect(level.solution).toEqual(shorter);
  });

  it('lets the solver win ties', () => {
    const tie = [...room.intendedSolution].reverse();
    expect(finalizeRoom(room, () => ({ keys: tie })).solution).toEqual(tie);
  });

  it('ignores a solver solution that is longer', () => {
    const level = finalizeRoom(room, () => ({ keys: [...room.intendedSolution, 'l'] }));
    expect(level.solution).toEqual(room.intendedSolution);
    expect(level.par).toBe(room.intendedSolution.length);
  });
});

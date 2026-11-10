import type { Position } from '@escape/engine';
import { SKILLS, skillSlug } from '../catalog.js';
import type { Difficulty, GeneratedRoom, RoomGenerator } from '../phase3.js';
import type { Goal, LevelType, SkillId } from '../types.js';
import { createRng, type Rng } from './rng.js';

/** Commands each skill adds to a room's toolkit. Narrower than the catalog on purpose (':wq' only, no ZZ or ':x'). */
const TOOLKIT: Readonly<Record<SkillId, readonly string[]>> = {
  'ex.q': [':q'],
  'ex.q!': [':q!'],
  'mode.insert': ['i'],
  'ex.wq': [':wq'],
  'motion.hjkl': ['h', 'j', 'k', 'l'],
  'motion.word': ['w', 'b', 'e'],
  'motion.WORD': ['W', 'B', 'E'],
  'motion.line': ['0', '^', '$'],
  'motion.file': ['gg', 'G'],
  'motion.count': [],
};

const ALWAYS_ALLOWED: readonly string[] = [':q', ':q!'];

/** Everything the designer decides; `assembleRoom` adds the plumbing. */
export interface RoomParts {
  readonly type: LevelType;
  readonly title: string;
  readonly intro: string;
  readonly goalText: string;
  readonly startLines: readonly string[];
  readonly startCursor: Position;
  readonly goals: readonly Goal[];
  readonly hints: readonly string[];
  readonly intendedSolution: readonly string[];
  readonly mustUse?: readonly SkillId[];
}

function findSkill(skill: SkillId): (typeof SKILLS)[number] {
  const found = SKILLS.find((entry) => entry.id === skill);
  if (found === undefined) throw new Error(`Unknown skill: ${skill}`);
  return found;
}

/** Transitive prerequisites, dependencies first. */
export function prerequisitesOf(skill: SkillId): SkillId[] {
  const ordered: SkillId[] = [];
  const visit = (id: SkillId): void => {
    for (const parent of findSkill(id).prerequisites) {
      visit(parent);
      if (!ordered.includes(parent)) ordered.push(parent);
    }
  };
  visit(skill);
  return ordered;
}

export function allowedCommandsFor(skill: SkillId): string[] {
  const commands = [...prerequisitesOf(skill), skill].flatMap((id) => TOOLKIT[id] ?? []);
  return [...new Set([...commands, ...ALWAYS_ALLOWED])];
}

export function assembleRoom(skill: SkillId, difficulty: Difficulty, seed: number, parts: RoomParts): GeneratedRoom {
  const { mustUse, ...rest } = parts;
  return {
    ...rest,
    id: `gen-${skillSlug(skill)}-${difficulty}-${seed}`,
    region: findSkill(skill).region,
    teaches: [skill],
    requires: prerequisitesOf(skill),
    allowedCommands: allowedCommandsFor(skill),
    ...(mustUse === undefined ? {} : { mustUse }),
  };
}

export type Design = (rng: Rng, difficulty: Difficulty) => RoomParts;

/** The same seed and difficulty always build the same room; each difficulty draws its own random stream. */
export function makeGenerator(skill: SkillId, design: Design): RoomGenerator {
  return {
    skill,
    generate: (seed, difficulty) =>
      assembleRoom(skill, difficulty, seed, design(createRng((seed + difficulty * 7919) >>> 0), difficulty)),
  };
}

import { createEngine } from '../../../engine/src/engine.js';
import type { EngineState, Key, Position } from '@escape/engine';
import { skillSlug } from '../catalog.js';
import type { Difficulty } from '../phase3.js';
import type { Goal, Level, RegionId, SkillId } from '../types.js';
import { drillSkill } from './skills.js';
import type { DrillRep, DrillSkill } from './types.js';

const engine = createEngine();

/** What a generator decides. The goal is never written by hand: it is whatever real Vim does with `keys`. */
export interface RepDesign {
  readonly goal: 'reach' | 'transform';
  readonly goalText: string;
  readonly lines: readonly string[];
  readonly cursor: Position;
  /** Applied before the player starts (an edit to undo or repeat). */
  readonly setup?: readonly Key[];
  /** The intended (par) solution. A trailing <Esc> is dropped: the goal is met on the last typed key. */
  readonly keys: readonly Key[];
  /** Keep a trailing <Esc>: a block insert (<C-v>I) only reaches the other lines when insert mode ends. */
  readonly keepEsc?: boolean;
}

function requireSkill(id: SkillId): DrillSkill {
  const skill = drillSkill(id);
  if (skill === undefined) throw new Error(`Unknown drill skill: ${id}`);
  return skill;
}

function region(id: SkillId): RegionId {
  return id.startsWith('motion.') ? 'motion-plains' : 'edit-forge';
}

/** Runs keys on the engine with the skill's allow-list; a rejected key is a generator bug, so it throws. */
export function play(state: EngineState, keys: readonly Key[], allowed: readonly string[]): EngineState {
  let current = state;
  for (const key of keys) {
    const result = engine.step(current, key, { allowedCommands: allowed });
    if (result.error !== null) throw new Error(`Drill key ${key} failed: ${result.error.message}`);
    current = result.state;
  }
  return current;
}

export function startState(lines: readonly string[], cursor: Position, setup: readonly Key[], allowed: readonly string[]): EngineState {
  return play(engine.init(lines, cursor), setup, allowed);
}

function trimEsc(keys: readonly Key[]): readonly Key[] {
  return keys[keys.length - 1] === '<Esc>' ? keys.slice(0, -1) : keys;
}

export function buildRep(skillId: SkillId, difficulty: Difficulty, seed: number, design: RepDesign): DrillRep {
  const skill = requireSkill(skillId);
  const setup = design.setup ?? [];
  const keys = design.keepEsc === true ? design.keys : trimEsc(design.keys);
  const start = startState(design.lines, design.cursor, setup, skill.allowed);
  const end = play(start, keys, skill.allowed);
  const goal: Goal = design.goal === 'reach'
    ? { type: 'reach', target: end.cursor }
    : { type: 'transform', targetLines: end.lines };
  const level: Level = {
    id: `drill-${skillSlug(skillId)}-${difficulty}-${seed}`,
    region: region(skillId),
    type: design.goal === 'reach' ? 'reach' : 'transform',
    title: skill.name,
    intro: '',
    goalText: design.goalText,
    startLines: design.lines,
    startCursor: design.cursor,
    goals: [goal],
    teaches: [skillId],
    // Counts are always typeable; listing the skill lets the solver try them when checking par.
    requires: ['motion.count'],
    allowedCommands: skill.allowed,
    par: keys.length,
    solution: keys,
    hints: [],
  };
  return { skill: skillId, difficulty, level, setup };
}

/** The engine state a rep starts from: its lines and cursor, then its setup keys. */
export function repStartState(rep: DrillRep): EngineState {
  const allowed = rep.level.allowedCommands ?? [];
  return startState(rep.level.startLines, rep.level.startCursor, rep.setup, allowed);
}

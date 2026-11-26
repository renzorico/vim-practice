import type { SkillId } from '../types.js';
import type { DrillSkill } from './types.js';

/**
 * Engine allow-lists by the stage that completes them. They mirror the game's teaching order
 * (apps/game/src/play2/introducedAt.ts) one stage at a time, so a rep never needs a key the player has not met.
 */
const MARGIN = ['h', 'j', 'k', 'l'] as const;
const LOWLANDS = [...MARGIN, 'w', 'b', 'e', '0', '$'] as const;
const QUARRY_ROAD = [...LOWLANDS, 'x', 'r'] as const;
const CUT = [...QUARRY_ROAD, 'dd', 'u', '<C-r>'] as const;
const SHAFT = [...CUT, '.'] as const;
const LEDGER = [...SHAFT, 'o', 'D', 'i', 'a', 'A', 'I', '<Esc>'] as const;

/** Pilot scope: Worlds 0-2. Teaching order; later skills interleave earlier ones in reps 8-10. */
export const DRILL_SKILLS: readonly DrillSkill[] = [
  { id: 'motion.hjkl', name: 'Steps', keys: ['h', 'j', 'k', 'l'], stage: 'margin', allowed: MARGIN },
  { id: 'motion.count', name: 'Counts', keys: ['5j', '3l'], stage: 'margin', allowed: MARGIN },
  { id: 'motion.word', name: 'Words', keys: ['w', 'b', 'e'], stage: 'lowlands', allowed: LOWLANDS },
  { id: 'motion.line', name: 'Line ends', keys: ['0', '$'], stage: 'lowlands', allowed: LOWLANDS },
  { id: 'edit.x', name: 'Delete a character', keys: ['x'], stage: 'quarry-road', allowed: QUARRY_ROAD },
  { id: 'edit.r', name: 'Replace a character', keys: ['r'], stage: 'quarry-road', allowed: QUARRY_ROAD },
  { id: 'edit.dd', name: 'Delete a line', keys: ['dd'], stage: 'cut', allowed: CUT },
  { id: 'edit.undo', name: 'Undo and redo', keys: ['u', '<C-r>'], stage: 'cut', allowed: CUT },
  { id: 'edit.dot', name: 'Repeat a change', keys: ['.'], stage: 'shaft', allowed: SHAFT },
  { id: 'mode.insert', name: 'Insert', keys: ['i', '<Esc>'], stage: 'ledger', allowed: LEDGER },
  { id: 'mode.append', name: 'Append', keys: ['a'], stage: 'ledger', allowed: LEDGER },
  { id: 'mode.edges', name: 'Line edges', keys: ['A', 'I'], stage: 'ledger', allowed: LEDGER },
  { id: 'mode.open', name: 'Open a line', keys: ['o'], stage: 'ledger', allowed: LEDGER },
  { id: 'edit.D', name: 'Delete to the end', keys: ['D'], stage: 'ledger', allowed: LEDGER },
];

export function drillSkill(id: SkillId): DrillSkill | undefined {
  return DRILL_SKILLS.find(skill => skill.id === id);
}

export function drillSkillsForStage(stageId: string): readonly DrillSkill[] {
  return DRILL_SKILLS.filter(skill => skill.stage === stageId);
}

/** Skills taught before `id`, in teaching order: the pool reps 8-10 interleave. */
export function earlierSkills(id: SkillId): readonly DrillSkill[] {
  const index = DRILL_SKILLS.findIndex(skill => skill.id === id);
  return index < 0 ? [] : DRILL_SKILLS.slice(0, index);
}

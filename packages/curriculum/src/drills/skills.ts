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
const CANOPY = [...LEDGER, 'f', 't', ';', ','] as const;
const GLADES = [...CANOPY, '{', '}', 'gg', 'G'] as const;
const GATES = [...GLADES, '%', '<C-d>', '<C-u>'] as const;
const JETTY = [...GATES, 'd'] as const;
const WAREHOUSE = [...JETTY, 'y', 'p'] as const;
const CUSTOMS = [...WAREHOUSE, '"'] as const;
const HARBOUR = [...CUSTOMS, 'c', 'C', 'P', 'yy'] as const;
const STACKS = [...HARBOUR, 'iw', 'aw'] as const;
const READING = [...STACKS, 'i(', 'a(', 'ib', 'ab'] as const;
const ARCHIVE = [...READING, 'ip', 'ap'] as const;
const NOTARY = [...ARCHIVE, 'i[', 'a[', 'i{', 'a{', 'iB', 'aB', 'it', 'at'] as const;
const CONTRACT = [...NOTARY, 'i"', 'a"', "i'", "a'"] as const;
const MOUTH = [...CONTRACT, '/', '?', 'n', 'N'] as const;
const GALLERY = [...MOUTH, '*', '#'] as const;
const MARKED = [...GALLERY, 'm', '`', "'"] as const;
const STUDY = [...MARKED, 'v', 'V', '<C-v>'] as const;

/**
 * Worlds 0-6, in teaching order; later skills interleave earlier ones in reps 8-10. <C-d>/<C-u> have no drill yet:
 * half a screen is 14 lines, and the drill page shows the whole buffer, not a window onto it.
 */
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
  { id: 'motion.find', name: 'Find a letter', keys: ['f', 't'], stage: 'canopy', allowed: CANOPY },
  { id: 'motion.find-repeat', name: 'Find again', keys: [';', ','], stage: 'canopy', allowed: CANOPY },
  { id: 'motion.paragraph', name: 'Paragraphs', keys: ['{', '}'], stage: 'glades', allowed: GLADES },
  { id: 'motion.file', name: 'File ends', keys: ['gg', 'G'], stage: 'glades', allowed: GLADES },
  { id: 'motion.match', name: 'Matching bracket', keys: ['%'], stage: 'gates', allowed: GATES },
  { id: 'operator.d', name: 'Delete with a motion', keys: ['dw', 'd2w', 'df'], stage: 'jetty', allowed: JETTY },
  { id: 'operator.y', name: 'Copy and put', keys: ['ye', 'y2e', 'p'], stage: 'warehouse', allowed: WAREHOUSE },
  { id: 'register.named', name: 'Named registers', keys: ['"a', '"ap'], stage: 'customs', allowed: CUSTOMS },
  { id: 'operator.c', name: 'Change', keys: ['cw', 'C'], stage: 'harbour', allowed: HARBOUR },
  { id: 'edit.lines', name: 'Copy and move lines', keys: ['yy', 'P'], stage: 'harbour', allowed: HARBOUR },
  { id: 'textobj.word', name: 'Word objects', keys: ['daw', 'ciw', 'd2aw'], stage: 'stacks', allowed: STACKS },
  { id: 'textobj.paren', name: 'Paren objects', keys: ['di(', 'ci(', 'da('], stage: 'reading', allowed: READING },
  { id: 'textobj.paragraph', name: 'Paragraph objects', keys: ['dap', 'd2ap'], stage: 'archive', allowed: ARCHIVE },
  { id: 'textobj.bracket', name: 'Bracket and tag objects', keys: ['di[', 'di{', 'dit'], stage: 'notary', allowed: NOTARY },
  { id: 'textobj.quote', name: 'Quote objects', keys: ['di"', 'ci"', 'da"'], stage: 'contract', allowed: CONTRACT },
  { id: 'search.pattern', name: 'Search', keys: ['/', '?', 'n'], stage: 'mouth', allowed: MOUTH },
  { id: 'search.word', name: 'Search for this word', keys: ['*', '#'], stage: 'gallery', allowed: GALLERY },
  { id: 'mark.jump', name: 'Marks', keys: ['m', '`', "'"], stage: 'marked', allowed: MARKED },
  { id: 'visual.select', name: 'Visual selections', keys: ['v', '<C-v>'], stage: 'study', allowed: STUDY },
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

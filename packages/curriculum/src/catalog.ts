/**
 * Skill catalog for the Prologue and Region 1. FROZEN contract for Phase 2: levels (P2-D) may only use
 * these ids, and skills logic (P2-B) reads them. Only the orchestrator adds skills.
 *
 * `commands` lists engine CommandRecord ids (as emitted by Engine.step: 'w', ':wq', 'ZZ', 'd' + motion 'w').
 * Special rule: 'motion.count' has no command ids. Any CommandRecord with kind 'motion' and count !== null
 * counts as practising it.
 */
import type { Skill } from './types.js';

export const SKILLS: readonly Skill[] = [
  // Prologue: getting out of Vim.
  { id: 'ex.q', name: 'Quit with :q', commands: [':q'], prerequisites: [], region: 'prologue' },
  { id: 'ex.q!', name: 'Force quit with :q!', commands: [':q!'], prerequisites: ['ex.q'], region: 'prologue' },
  { id: 'mode.insert', name: 'Insert mode with i', commands: ['i'], prerequisites: ['ex.q'], region: 'prologue' },
  { id: 'ex.wq', name: 'Save and quit (:wq, :x, ZZ)', commands: [':wq', ':x', 'ZZ'], prerequisites: ['mode.insert'], region: 'prologue' },

  // Region 1: Motion Plains.
  { id: 'motion.hjkl', name: 'Move with h j k l', commands: ['h', 'j', 'k', 'l'], prerequisites: [], region: 'motion-plains' },
  { id: 'motion.word', name: 'Word jumps w b e', commands: ['w', 'b', 'e'], prerequisites: ['motion.hjkl'], region: 'motion-plains' },
  { id: 'motion.WORD', name: 'WORD jumps W B E', commands: ['W', 'B', 'E'], prerequisites: ['motion.word'], region: 'motion-plains' },
  { id: 'motion.line', name: 'Line ends 0 ^ $', commands: ['0', '^', '$'], prerequisites: ['motion.hjkl'], region: 'motion-plains' },
  { id: 'motion.file', name: 'File ends gg G', commands: ['gg', 'G'], prerequisites: ['motion.hjkl'], region: 'motion-plains' },
  { id: 'motion.count', name: 'Counts (3w, 5j)', commands: [], prerequisites: ['motion.word'], region: 'motion-plains' },
];

export const SKILL_IDS: ReadonlySet<string> = new Set(SKILLS.map((skill) => skill.id));

/**
 * A file-name- and id-safe form of a skill id. Skill ids differ only by case ('motion.word' vs 'motion.WORD') and
 * contain '.' and '!', which break case-insensitive file systems (macOS) and the level id format.
 * Lowercase, '.' -> '-', '!' -> '-force', plus '-caps' when the id has uppercase letters:
 * 'motion.WORD' -> 'motion-word-caps', 'ex.q!' -> 'ex-q-force'.
 */
export function skillSlug(skill: string): string {
  const base = skill.toLowerCase().replaceAll('.', '-').replaceAll('!', '-force');
  return skill === skill.toLowerCase() ? base : `${base}-caps`;
}

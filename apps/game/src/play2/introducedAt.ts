import type { StoryState } from '@escape/story';
import { stages } from './content.js';
import { HELP_KEYS, type HelpKey } from './help/keys.js';

/** Teaching order, independent of the world's command unlocks. Alias forms join their lesson. */
export const introducedAt: Readonly<Record<string, string>> = {
  h: 'margin', j: 'margin', k: 'margin', l: 'margin', '3l': 'margin',
  w: 'lowlands', b: 'lowlands', e: 'lowlands', '0': 'lowlands', $: 'lowlands',
  x: 'quarry-road', r: 'quarry-road', ':e!': 'quarry-road',
  dd: 'cut', u: 'cut', '<C-r>': 'cut', '.': 'shaft',
  o: 'ledger', D: 'ledger', i: 'ledger', a: 'ledger', A: 'ledger', I: 'ledger',
  '<Esc>': 'ledger', ':q': 'ledger',
  f: 'canopy', t: 'canopy', ';': 'canopy', ',': 'canopy',
  '{': 'glades', '}': 'glades', gg: 'glades', G: 'glades',
  '%': 'gates', '<C-d>': 'gates', '<C-u>': 'gates',
  d: 'jetty', y: 'warehouse', p: 'warehouse', '"': 'customs',
  c: 'harbour', C: 'harbour', P: 'harbour', yy: 'harbour',
  iw: 'stacks', aw: 'stacks', 'i(': 'reading', 'a(': 'reading', ib: 'reading', ab: 'reading',
  ip: 'archive', ap: 'archive', 'i[': 'notary', 'a[': 'notary',
  'i{': 'notary', 'a{': 'notary', iB: 'notary', aB: 'notary', it: 'notary', at: 'notary',
  'i"': 'contract', 'a"': 'contract', "i'": 'contract', "a'": 'contract',
  '/': 'mouth', '?': 'mouth', n: 'mouth', N: 'mouth', '*': 'gallery', '#': 'gallery',
  m: 'marked', '`': 'marked', "'": 'marked',
  v: 'study', V: 'study', '<C-v>': 'study', ':w': 'last-page',
};

/** Aliases and app controls: listed in `:help`, but a card for them would bury the key being taught. */
const REFERENCE_ONLY: ReadonlySet<string> = new Set([':e!', ':q', 'I', 'N', 'ib', 'ab', 'iB', 'aB', "i'", "a'"]);

/**
 * Cleared stages and earlier replays never interrupt play with a teaching card. A replay runs on the story as it
 * was before the clear, so the stages cleared since then come in separately.
 */
export function keyCardEntries(stageId: string, story: StoryState, clearedSince: readonly string[] = []): readonly HelpKey[] {
  const current = stages.findIndex(({ stage }) => stage.id === stageId);
  if (current < 0 || story.clearedStages.includes(stageId) || clearedSince.includes(stageId)) return [];
  const reached = stages.reduce((furthest, { stage }, index) =>
    story.unlockedStages.includes(stage.id) || story.clearedStages.includes(stage.id)
      || story.flags[`${stage.id}.intro-seen`] ? Math.max(furthest, index) : furthest, current);
  if (current !== reached) return [];
  return HELP_KEYS.filter(entry => introducedAt[entry.key] === stageId && !REFERENCE_ONLY.has(entry.key));
}

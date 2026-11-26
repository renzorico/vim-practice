import type { StoryContent, StoryState } from '@escape/story';
import { stages } from './content.js';
import { HELP_KEYS, type HelpKey } from './help/keys.js';
import { keyParts } from './KeyText.js';

/** Teaching order, independent of the world's command unlocks. Alias forms join their lesson. */
export const introducedAt: Readonly<Record<string, string>> = {
  h: 'margin', j: 'margin', k: 'margin', l: 'margin', '3l': 'margin',
  w: 'lowlands', b: 'lowlands', e: 'lowlands', $: 'lowlands', '0': 'lighthouse',
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

const HELP_KEY_NAMES: ReadonlySet<string> = new Set(HELP_KEYS.map(entry => entry.key));
/** Longest first, so `dd` wins over `d` and `i(` over `i`. */
const HELP_KEYS_BY_LENGTH: readonly string[] = [...HELP_KEY_NAMES].sort((first, second) => second.length - first.length);
const MOVE_KEYS: ReadonlySet<string> = new Set(['h', 'j', 'k', 'l']);
/** The one entry that teaches a number in front of a move. */
const COUNTED_MOVE_KEY = '3l';
const KEYCAP_ALIASES: Readonly<Record<string, string>> = { Esc: '<Esc>', Escape: '<Esc>' };
/** Most pages an objective or hint can earn a stage: the rest are in `:help`, marked "new". */
export const MAX_OBJECTIVE_PAGES = 2;

/**
 * The help entry a backticked keycap names: `5r=` names `r`, `10dd` names `dd`, `"0p` names `"`,
 * `30l` names the counted-move entry. Words that are not keys (`Enter`, `Tab`) name nothing.
 */
export function keyForKeycap(keycap: string): string | null {
  const text = KEYCAP_ALIASES[keycap] ?? keycap.replace(/^Ctrl-(.)$/, (_, letter: string) => `<C-${letter}>`);
  if (HELP_KEY_NAMES.has(text)) return text;
  const counted = /^(\d+)(.+)$/.exec(text);
  const rest = counted?.[2] ?? text;
  if (counted && MOVE_KEYS.has(rest)) return COUNTED_MOVE_KEY;
  const object = /^[dcy]\d*([ia].+)$/.exec(rest)?.[1];
  if (object && HELP_KEY_NAMES.has(object)) return object;
  return HELP_KEYS_BY_LENGTH.find(name => rest.startsWith(name)) ?? null;
}

/** Keys named by the keycaps of a text, in order of first mention. */
export function keysNamedIn(text: string): readonly string[] {
  const named = keyParts(text).filter(part => part.keycap).flatMap(part => keyForKeycap(part.text) ?? []);
  return [...new Set(named)];
}

export function keysNamedByDialogue(content: StoryContent, dialogueId: string): readonly string[] {
  const dialogue = content.dialogues.find(item => item.id === dialogueId);
  return [...new Set((dialogue?.lines ?? []).flatMap(line => keysNamedIn(line.text)))];
}

/** Stage ids and their first word prefix content ids: `quarry-road` owns `quarry-road.*` and `quarry.*`. */
function contentPrefixes(stageId: string): readonly string[] {
  return [...new Set([stageId, stageId.split('-')[0] ?? stageId])];
}
const ownedBy = (stageId: string, id: string): boolean => contentPrefixes(stageId).some(prefix => id.startsWith(`${prefix}.`));

/**
 * Keys of a stage that no dialogue of it names but an objective does. They open after the intro, at most
 * `MAX_OBJECTIVE_PAGES`; later ones get no page. Death hints are not dialogues the player reads in the queue.
 */
export function objectiveOnlyKeys(content: StoryContent, stageId: string, candidates: readonly string[], hints: readonly string[] = [],
  pageOf: (key: string) => string = key => key): readonly string[] {
  const inDialogue = new Set(content.dialogues.filter(item => ownedBy(stageId, item.id) && !item.id.endsWith('death-hint'))
    .flatMap(item => item.lines.flatMap(line => keysNamedIn(line.text))));
  const inObjective = new Set(content.quests.filter(quest => ownedBy(stageId, quest.id) || quest.id.endsWith(`.${stageId}`)
    || quest.steps.some(step => step.completeWhen.type === 'stage-cleared' && step.completeWhen.stage === stageId))
    .flatMap(quest => quest.steps.flatMap(step => keysNamedIn(step.objective))).concat(hints.flatMap(keysNamedIn)));
  // The limit counts pages, not keys: grouped keys (`{` and `}`) share one.
  const pages = new Set<string>();
  return candidates.filter(key => {
    if (inDialogue.has(key) || !inObjective.has(key)) return false;
    const page = pageOf(key);
    if (!pages.has(page) && pages.size >= MAX_OBJECTIVE_PAGES) return false;
    pages.add(page);
    return true;
  });
}

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

import type { Position } from '@escape/engine';
import type { StoryContent, StoryState } from '@escape/story';

export interface Guide {
  /** One keycap each: a key to press, or a whole command (`dap`) where the player already knows its parts. */
  readonly keys: readonly string[];
  /** Press these here, in order; or just the tools for a puzzle whose steps the player works out. */
  readonly kind: 'do' | 'use';
  readonly standAt?: readonly Position[];
}

const cell = (line: number, col: number): Position => ({ line, col });
const guide = (keys: readonly string[], standAt?: readonly Position[]): Guide =>
  standAt ? { kind: 'do', keys, standAt } : { kind: 'do', keys };
const use = (...keys: readonly string[]): Guide => ({ kind: 'use', keys });
/** The single keys a keycap stands for. */
export const keysOf = (cap: string): readonly string[] => cap.startsWith('<') ? [cap] : [...cap];

/** Authored instructions only. Puzzle objectives without a named command have no guide. */
export const GUIDES: Readonly<Record<string, Readonly<Record<string, Guide>>>> = {
  'margin.warning': {
    'meet-elder': guide(['<CR>'], [cell(3, 5), cell(3, 7), cell(4, 6)]),
    'see-mira': guide(['<CR>'], [cell(10, 11), cell(10, 13), cell(11, 12)]),
    cross: guide(['3', '0', 'l'], [cell(7, 18)]),
  },
  'lowlands.lighthouse': {
    cross: guide(['w'], [cell(7, 13), cell(7, 14), cell(7, 18), cell(7, 22), cell(7, 23)]),
    lighthouse: guide(['$'], [cell(11, 40)]),
  },
  'quarry.road': {
    cut: guide(['4', 'x'], [cell(6, 15)]),
    river: guide(['5', 'r', '='], Array.from({ length: 11 }, (_, index) => cell(index + 1, 30))),
    // Enter reaches the gate from beside it, not from its own cell.
    south: guide(['<CR>'], [cell(10, 42), cell(9, 43), cell(11, 43)]),
  },
  'quarry.cut': { ledge: use('dd', 'u'), dot: guide(['<CR>']) },
  'quarry.mason': { mason: use('10dd') },
  'wordwood.ferry': { canopy: use('fH'), lift: guide(['<CR>']) },
  'wordwood.glades': { floor: use('G'), lamp: use('{'), rope: use('gg'), gate: use('G') },
  'wordwood.gates': {
    shut: guide(['<CR>']), ope: use('%'), 'lamp-a': use('<C-d>'),
    'lamp-b': use('<C-u>'), tell: use('G'), open: use('%'),
  },
  'port.jetty': { bitt: guide(['<CR>']), clear: use('db'), ream: guide(['<CR>']) },
  'port.warehouse': { stock: use('y', 'p'), ream: guide(['<CR>']) },
  'port.customs': { oil: use('yw', '"0p'), mixed: use('"byw', '"bp'), tare: guide(['<CR>']) },
  'library.stacks': { dust: use('daw', 'j', '.'), quire: guide(['<CR>']) },
  'library.reading': { chains: use('da(', 'd2a('), folio: guide(['<CR>']) },
  'library.archive': { file: use('dap', 'p', 'yap', 'P') },
  'library.notary': { open: use('da[', 'da{', 'dit') },
  'library.contract': { contract: use('ci"', 'ci(', 'dap', 'cit') },
  'caves.mouth': { crystals: use('?x', '<CR>', 'n'), echo: guide(['<CR>']) },
  'caves.gallery': { follow: use('*', 'w') },
  'caves.marked': { fetch: use('ma', '/', '`a'), echo: guide(['<CR>']) },
  'caves.labyrinth': { levers: use('ma', '?', '`a') },
  'caves.study': { index: use('<C-v>') },
  'last.page': { write: guide([':w', '<CR>']) },
};

export function guideFor(questId: string, stepId: string): Guide | null {
  return GUIDES[questId]?.[stepId] ?? null;
}

/** Match the HUD's first active main quest. Derived; never stored on a session. */
export function activeGuide(content: StoryContent, story: StoryState): Guide | null {
  const quest = content.quests.find(item => item.kind === 'main'
    && story.quests[item.id] && !story.quests[item.id]?.done);
  const progress = quest && story.quests[quest.id];
  const step = quest && progress && quest.steps[progress.step];
  return quest && step ? guideFor(quest.id, step.id) : null;
}

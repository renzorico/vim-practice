import type { Position } from '@escape/engine';
import type { StoryContent, StoryState } from '@escape/story';

export interface Guide {
  readonly keys: readonly string[];
  readonly standAt?: readonly Position[];
}

const cell = (line: number, col: number): Position => ({ line, col });
const guide = (keys: readonly string[], standAt?: readonly Position[]): Guide =>
  standAt ? { keys, standAt } : { keys };

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
  'quarry.cut': { ledge: guide(['d', 'd', 'u']), dot: guide(['<CR>']) },
  'quarry.mason': { mason: guide(['1', '0', 'd', 'd']) },
  'wordwood.ferry': { canopy: guide(['f', 'H']), lift: guide(['<CR>']) },
  'wordwood.glades': {
    floor: guide(['G']), lamp: guide(['{']), rope: guide(['g', 'g']), gate: guide(['G']),
  },
  'wordwood.gates': {
    shut: guide(['<CR>']), ope: guide(['%']), 'lamp-a': guide(['<C-d>']),
    'lamp-b': guide(['<C-u>']), tell: guide(['G']), open: guide(['%']),
  },
  'port.jetty': { bitt: guide(['<CR>']), clear: guide(['d', 'b']), ream: guide(['<CR>']) },
  'port.warehouse': { stock: guide(['y', 'w', 'p']), ream: guide(['<CR>']) },
  'port.customs': {
    oil: guide(['y', 'w', '"', '0', 'p']),
    mixed: guide(['"', 'b', 'y', 'w', '"', 'b', 'p']), tare: guide(['<CR>']),
  },
  'port.counterfeiter': { crates: guide(['8', 'p']) },
  'library.stacks': { dust: guide(['d', 'a', 'w', 'j', '.']), quire: guide(['<CR>']) },
  'library.reading': { chains: guide(['d', 'a', '(']), folio: guide(['<CR>']) },
  'library.archive': { file: guide(['d', 'a', 'p', 'p', 'y', 'a', 'p', 'P']) },
  'library.notary': { open: guide(['d', 'a', '[', 'd', 'a', '{', 'd', 'i', 't']) },
  'library.contract': { contract: guide(['c', 'i', '"']) },
  'caves.mouth': { crystals: guide(['?', 'x', '<CR>', '<CR>', 'n']), echo: guide(['<CR>']) },
  'caves.gallery': { follow: guide(['*', 'w', '*']) },
  'caves.marked': { fetch: guide(['m', 'a', '/', 'x', '<CR>', '`', 'a']), echo: guide(['<CR>']) },
  'caves.labyrinth': { levers: guide(['m', 'a', '?', 'x', '<CR>', '<CR>', '`', 'a']) },
  'caves.study': { index: guide(['<C-v>']) },
  'last.page': { write: guide([':', 'w', '<CR>']) },
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

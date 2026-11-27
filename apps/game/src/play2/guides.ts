import { currentQuest } from './currentQuest.js';
import type { Position } from '@escape/engine';
import type { StoryContent, StoryState } from '@escape/story';
import type { WorldState } from '@escape/world';
import { stageGuide } from './stageGuides.js';

export interface Guide {
  /** One keycap each: a key to press, or a whole command (`dap`) where the player already knows its parts. */
  readonly keys: readonly string[];
  /** Press these here, in order; or just the tools for a puzzle whose steps the player works out. */
  readonly kind: 'do' | 'use';
  readonly standAt?: readonly Position[];
  /** The part of the map the guide is about; past it, the step goes on without one. */
  readonly within?: { readonly from: Position; readonly to: Position };
  /** Applies only while this row still has this character: once the rubble is gone, nothing asks to clear it. */
  readonly whileRow?: { readonly line: number; readonly has: string };
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
    cross: guide(['w'], [cell(7, 12), cell(7, 13), cell(7, 14), cell(7, 16), cell(7, 17)]),
    lighthouse: guide(['$'], [cell(14, 40)]),
    lamp: { ...guide(['8', 'k'], [cell(25, 1), cell(17, 1)]), within: { from: cell(12, 0), to: cell(25, 20) } },
  },
  'quarry.road': {
    // Once four of the five gravel cells are gone, the road has slid: nothing asks for 4x again.
    cut: { ...guide(['4', 'x'], [cell(9, 5)]), whileRow: { line: 9, has: '.....' } },
    river: guide(['5', 'r', '='], [cell(6, 15)]),
    // Enter reaches the gate from beside it, not from its own cell.
    south: guide(['<CR>'], [cell(1, 23), cell(2, 24), cell(1, 25)]),
  },
  'quarry.cut': { ledge: use('dd', 'u'), dot: guide(['<CR>']), back: use('<C-r>') },
  'quarry.mason': { mason: use('4dd', 'j', '.') },
  'wordwood.ferry': { canopy: use('fH'), lift: guide(['<CR>']) },
  'wordwood.glades': { floor: use('G'), lamp: use('{'), rope: use('gg'), gate: use('G') },
  'port.jetty': { bitt: guide(['<CR>']), ream: guide(['<CR>']) },
  'port.warehouse': { ream: guide(['<CR>']) },
  'port.customs': { tare: guide(['<CR>']) },
  'library.stacks': { dust: use('daw', '.', 'diw'), quire: guide(['<CR>']) },
  'library.reading': { chains: use('da(', 'd2a('), folio: guide(['<CR>']) },
  'library.archive': { file: use('dap', 'p', 'yip', 'P') },
  'library.notary': { open: use('da[', 'da{', 'dit') },
  'library.contract': { contract: use('ci"', 'ci(', 'da"', 'dap', 'cit') },
  'caves.mouth': { crystals: use('?x', '<CR>', 'n'), echo: guide(['<CR>']) },
  'caves.gallery': { follow: use('*', 'w') },
  'caves.marked': { fetch: use('ma', "'a", '`a'), echo: guide(['<CR>']) },
  'caves.labyrinth': { levers: use('ma', '?', '`a') },
  'caves.study': { index: use('<C-v>', 'V', 'v') },
  'last.page': { write: guide([':w', '<CR>']) },
};

export function guideFor(questId: string, stepId: string): Guide | null {
  return GUIDES[questId]?.[stepId] ?? null;
}

export function guideApplies(guide: Guide, at: Position, rows: readonly string[]): boolean {
  const { within, whileRow } = guide;
  if (whileRow && !rows[whileRow.line]?.includes(whileRow.has)) return false;
  return !within || at.line >= within.from.line && at.line <= within.to.line && at.col >= within.from.col && at.col <= within.to.col;
}

/** Match the HUD's main quest. Derived; never stored on a session. */
export function activeGuide(content: StoryContent, story: StoryState, world: WorldState): Guide | null {
  const current = currentQuest(content, story);
  if (!current) return null;
  const live = stageGuide(current.quest.id, current.step.id, world);
  return live === undefined ? guideFor(current.quest.id, current.step.id) : live;
}

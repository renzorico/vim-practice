import { createEngine, type EngineState, type Key } from '@escape/engine';
import type { HelpKey } from '../help/keys.js';

const engine = createEngine();
/** Auto-play steps the finished result stays on screen before the player's turn. */
const RESULT_HOLD_STEPS = 3;

/** Rows of a marked example such as `a[b]c`: the brackets name the cursor cell and are not buffer text. */
export function parseMarked(marked: string): { readonly lines: readonly string[]; readonly cursor: { readonly line: number; readonly col: number } } {
  // A greedy prefix lets an opening bracket be the cursor character: [[].
  const match = /\[([^\n]?)\]/.exec(marked);
  if (!match || match.index === undefined) throw new Error(`No cursor in ${marked}`);
  const prefix = marked.slice(0, match.index);
  const lines = (prefix + (match[1] ?? '') + marked.slice(match.index + match[0].length)).split('\n');
  return { lines, cursor: { line: prefix.split('\n').length - 1, col: prefix.split('\n').at(-1)?.length ?? 0 } };
}

/** The example's starting buffer: its `initial` text, then the setup keys the help reference types first. */
export function startState(entry: HelpKey): EngineState {
  const start = parseMarked(entry.example.initial ?? entry.example.before);
  return entry.example.setup.reduce((state, key) => engine.step(state, key).state, engine.init(start.lines, start.cursor));
}

/** frames[0] is the start; frames[n] is the buffer after the first n keys of the example. */
export function exampleFrames(entry: HelpKey): readonly EngineState[] {
  const frames = [startState(entry)];
  for (const key of entry.example.keys) frames.push(engine.step(frames[frames.length - 1] ?? startState(entry), key).state);
  return frames;
}

/** The phase of one page: the demo plays itself, then the player tries, then it is finished. */
export type Phase = 'watch' | 'try' | 'done';

export interface PageModel {
  readonly entry: HelpKey;
  readonly phase: Phase;
  /** Auto-play: keys shown so far; the result appears once it passes the key count. */
  readonly watched: number;
  /** Try-it: the real engine, driven by the player's correct keys. */
  readonly engine: EngineState;
  readonly typed: number;
  /** The key the player should have pressed, after a wrong one. */
  readonly expected: Key | null;
  /** Counts wrong keys so the prompt can shake again for each. */
  readonly misses: number;
  /** At least one correct key, or finished: the footer then reads "on you go". */
  readonly tried: boolean;
}

export function openPage(entry: HelpKey, reduced: boolean): PageModel {
  return {
    entry, phase: reduced ? 'try' : 'watch', watched: reduced ? entry.example.keys.length + RESULT_HOLD_STEPS : 0,
    engine: startState(entry), typed: 0, expected: null, misses: 0, tried: false,
  };
}

/** Advances the auto-play by one key, then the result, then hands over to the player. */
export function watchStep(page: PageModel): PageModel {
  if (page.phase !== 'watch') return page;
  const watched = page.watched + 1;
  return watched > page.entry.example.keys.length + RESULT_HOLD_STEPS ? { ...page, phase: 'try', watched } : { ...page, watched };
}

export const skipWatching = (page: PageModel): PageModel => page.phase === 'watch'
  ? { ...page, phase: 'try', watched: page.entry.example.keys.length + RESULT_HOLD_STEPS } : page;

export const expectedKey = (page: PageModel): Key | null => page.entry.example.keys[page.typed] ?? null;

/** The player presses a key. Only the example's next key reaches the engine. */
export function pressKey(page: PageModel, key: Key): PageModel {
  if (page.phase !== 'try') return page;
  const expected = expectedKey(page);
  if (expected === null) return page;
  if (key !== expected) return { ...page, expected, misses: page.misses + 1 };
  const typed = page.typed + 1;
  return {
    ...page, engine: engine.step(page.engine, key).state, typed, expected: null, tried: true,
    phase: typed >= page.entry.example.keys.length ? 'done' : 'try',
  };
}

/**
 * True when the key is practice rather than a way out: the example types it, is not finished, and has either
 * begun or begins with it. Before the first key, Enter and Esc still do what the page's buttons say. In Insert
 * mode both are always practice: Enter there is a slip of the typing hand, not a wish to leave.
 */
export const belongsToDemo = (page: PageModel, key: Key): boolean => page.phase !== 'done'
  && (page.typed > 0 ? page.engine.mode === 'insert' || page.entry.example.keys.includes(key) : page.entry.example.keys[0] === key);

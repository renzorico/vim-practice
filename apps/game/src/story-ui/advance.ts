import type { Line, Speaker } from '@escape/story';

/** Keys that move a dialogue or cutscene on. `<CR>` arrives as 'Enter'. */
const ADVANCE_KEYS: readonly string[] = ['Enter', ' '];

export function isAdvanceKey(key: string): boolean {
  return ADVANCE_KEYS.includes(key);
}

export interface Progress {
  readonly index: number;
  readonly done: boolean;
}

/** Moves one step through `length` items. `done` becomes true when the last one is dismissed. */
export function nextIndex(index: number, length: number): Progress {
  const next = index + 1;
  return next >= length ? { index: Math.max(length - 1, 0), done: true } : { index: next, done: false };
}

/**
 * Position in one dialogue or cutscene, tied to the content it belongs to by identity.
 * `finished` latches after the last item is dismissed, so `onFinish` cannot fire twice.
 */
export interface Sequence {
  readonly source: unknown;
  readonly index: number;
  readonly finished: boolean;
}

export function startSequence(source: unknown): Sequence {
  return { source, index: 0, finished: false };
}

export interface SequenceStep {
  readonly sequence: Sequence;
  /** True exactly once per content: when the last item is dismissed. */
  readonly finish: boolean;
}

/** One advance key press. New content (a different `source`) starts over; a finished sequence ignores presses. */
export function advanceSequence(current: Sequence, source: unknown, length: number): SequenceStep {
  const sequence = current.source === source ? current : startSequence(source);
  if (sequence.finished) return { sequence, finish: false };
  const progress = nextIndex(sequence.index, length);
  return { sequence: { source, index: progress.index, finished: progress.done }, finish: progress.done };
}

const SPEAKER_NAMES: Readonly<Record<Speaker, string>> = {
  scribe: 'The Scribe',
  dot: 'Dot',
  elder: 'The Elder',
  unwriter: 'The Unwriter',
  npc: '',
  sign: 'Sign',
  system: '',
};

/** The name shown above a line. 'npc' uses the line's own name; 'system' shows none. */
export function speakerName(line: Line): string {
  if (line.speaker === 'npc') return line.name ?? '';
  return SPEAKER_NAMES[line.speaker];
}

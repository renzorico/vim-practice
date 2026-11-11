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

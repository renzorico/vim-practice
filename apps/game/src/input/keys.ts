import type { Key } from '@escape/engine';

/** The subset of KeyboardEvent the mapping needs, so it can be tested without a DOM. */
export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

export interface MappedKey {
  /** Vim-notation key to send to the store, or null when the event is not for the game. */
  readonly key: Key | null;
  /** True when the browser default (scroll, quick-find, focus move, reload) must be suppressed. */
  readonly preventDefault: boolean;
}

const IGNORED: MappedKey = { key: null, preventDefault: false };

const SPECIAL_KEYS: Readonly<Record<string, Key>> = {
  Escape: '<Esc>',
  Enter: '<CR>',
  Backspace: '<BS>',
  Tab: '<Tab>',
};

/** Ctrl chords the engine understands. Others (C-w, C-t, C-n...) stay with the browser. */
const CTRL_CHORDS: ReadonlySet<string> = new Set(['r', 'd', 'u', 'v']);

/** Maps a browser key event to Vim notation. Cmd/Meta and Alt chords are never handled or prevented. */
export function mapKeyEvent(event: KeyEventLike): MappedKey {
  if (event.metaKey || event.altKey) return IGNORED;

  if (event.ctrlKey) {
    const letter = event.key.toLowerCase();
    if (CTRL_CHORDS.has(letter)) return { key: `<C-${letter}>`, preventDefault: true };
    return IGNORED;
  }

  const special = SPECIAL_KEYS[event.key];
  if (special !== undefined) return { key: special, preventDefault: true };

  // A single character keeps its shift case ('A', '$'). Named keys like 'Shift' are longer.
  if ([...event.key].length === 1) return { key: event.key, preventDefault: true };

  return IGNORED;
}

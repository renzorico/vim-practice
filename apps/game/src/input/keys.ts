import type { Key } from '@escape/engine';

/** The subset of KeyboardEvent the mapping needs, so it can be tested without a DOM. */
export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey?: boolean;
  /** Physical key position, used only to tell dead keys apart (their `key` is just 'Dead'). */
  readonly code?: string;
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

/** ASCII punctuation. On many layouts (Spanish, German, French) some of it needs Option or AltGr. */
const PUNCTUATION = /^[!-/:-@[-`{-~]$/;

/**
 * Dead keys report `key: 'Dead'`, so the character comes from the physical key. `S-` means shifted, `A-` Option.
 * Covers Spanish ISO (` ^ ~) and US International (' " ` ~ ^). Where layouts disagree, Spanish wins.
 */
const DEAD_KEYS: Readonly<Record<string, Key>> = {
  BracketLeft: '`',
  'S-BracketLeft': '^',
  'A-Semicolon': '~',
  Quote: "'",
  'S-Quote': '"',
  Backquote: '`',
  'S-Backquote': '~',
  'S-Digit6': '^',
};

function deadKey(event: KeyEventLike): Key | undefined {
  return DEAD_KEYS[`${event.altKey ? 'A-' : event.shiftKey ? 'S-' : ''}${event.code ?? ''}`];
}

/**
 * Maps a browser key event to Vim notation. Cmd/Meta chords are never handled or prevented, and neither are
 * Alt chords, except when Option or AltGr is how the layout types a punctuation character.
 */
export function mapKeyEvent(event: KeyEventLike): MappedKey {
  if (event.metaKey) return IGNORED;

  if (event.key === 'Dead') {
    const dead = event.ctrlKey ? undefined : deadKey(event);
    return dead === undefined ? IGNORED : { key: dead, preventDefault: true };
  }

  // Windows reports AltGr as Ctrl+Alt, so Ctrl does not exclude it here.
  if (event.altKey) return PUNCTUATION.test(event.key) ? { key: event.key, preventDefault: true } : IGNORED;

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

import type { Key } from '@escape/engine';

/** A dead key's physical position. `S-` means shifted, `A-` Option. */
type DeadTable = Readonly<Record<string, Key>>;
/** What each physical key types unmodified, as reported by the Keyboard API. */
export interface LayoutMap { get(code: string): string | undefined }

const SPANISH: DeadTable = { BracketLeft: '`', 'S-BracketLeft': '^', 'A-Semicolon': '~' };
const US_INTERNATIONAL: DeadTable = {
  Quote: "'", 'S-Quote': '"', Backquote: '`', 'S-Backquote': '~', 'S-Digit6': '^',
};
const FRENCH: DeadTable = { BracketLeft: '^', 'A-KeyN': '~' };
const GERMAN: DeadTable = { Backquote: '^', 'S-Equal': '`', 'A-KeyN': '~' };

/** Recognises a layout by letters only it has in that place. Unknown layouts give null: never guess a character. */
function tableFor(layout: LayoutMap): DeadTable | null {
  if (layout.get('Semicolon') === 'ñ') return SPANISH;
  if (layout.get('Semicolon') === 'ö') return GERMAN;
  if (layout.get('KeyQ') === 'a') return FRENCH;
  if (layout.get('KeyQ') === 'q' && layout.get('Semicolon') === ';') return US_INTERNATIONAL;
  return null;
}

export interface DeadKeyEvent {
  readonly code: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** The character a dead key stands for. Its event says only `key: 'Dead'`, so position and layout decide. */
export function deadKeyCharacter(event: DeadKeyEvent, layout: LayoutMap): Key | null {
  return tableFor(layout)?.[`${event.altKey ? 'A-' : event.shiftKey ? 'S-' : ''}${event.code}`] ?? null;
}

/**
 * The key press right after a dead key. The dead character was already sent, so the Space that usually
 * completes it is dropped (null), and a letter the system accented (a grave `a`) is sent as the plain letter.
 */
export function afterDeadKey(key: string, code: string): string | null {
  if (code === 'Space') return null;
  if (!/^Key[A-Z]$/.test(code) || [...key].length !== 1) return key;
  return key.normalize('NFD').charAt(0);
}

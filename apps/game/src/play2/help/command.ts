import type { Key } from '@escape/engine';
import { keySequence } from './keys.js';

/** Hold only a possible help command. Other command lines return to the real engine. */
export function routeHelpCommand(pending: string | null, key: Key): { pending: string | null; open: boolean; forward: readonly Key[] } {
  if (pending === null) return { pending: key === ':' ? ':' : null, open: false, forward: key === ':' ? [] : [key] };
  if (key === '<Esc>') return { pending: null, open: false, forward: [] };
  if (key === '<BS>') return { pending: pending.length > 1 ? pending.slice(0, -1) : null, open: false, forward: [] };
  if (key === '<CR>') return { pending: null, open: pending === ':h' || pending === ':help', forward: pending === ':h' || pending === ':help' ? [] : [...keySequence(pending), key] };
  const next = pending + key;
  if (':help'.startsWith(next)) return { pending: next, open: false, forward: [] };
  return { pending: null, open: false, forward: [...keySequence(pending), key] };
}

import type { Key } from '@escape/engine';
import { keySequence } from './keys.js';

export type AppCommand = 'help' | 'hint';
/** Commands the app answers itself; everything else belongs to the engine. */
const COMMANDS: Readonly<Record<string, AppCommand>> = { ':h': 'help', ':help': 'help', ':hint': 'hint' };

/** Hold only a possible app command. Other command lines return to the real engine. */
export function routeHelpCommand(pending: string | null, key: Key): { pending: string | null; open: AppCommand | null; forward: readonly Key[] } {
  if (pending === null) return { pending: key === ':' ? ':' : null, open: null, forward: key === ':' ? [] : [key] };
  if (key === '<Esc>') return { pending: null, open: null, forward: [] };
  if (key === '<BS>') return { pending: pending.length > 1 ? pending.slice(0, -1) : null, open: null, forward: [] };
  if (key === '<CR>') {
    const open = COMMANDS[pending] ?? null;
    return { pending: null, open, forward: open ? [] : [...keySequence(pending), key] };
  }
  const next = pending + key;
  if (Object.keys(COMMANDS).some(command => command.startsWith(next))) return { pending: next, open: null, forward: [] };
  return { pending: null, open: null, forward: [...keySequence(pending), key] };
}

import type { Key } from '@escape/engine';
import { mapKeyEvent, type KeyEventLike } from '../../input/keys.js';
import { exampleUses, type PageModel } from './pageModel.js';

/** A player tapping Enter through the last dialogue line must not dismiss the page unseen. */
export const PAGE_GUARD_MS = 300;

export type PageAction =
  | { readonly type: 'none' }
  /** A key for the demo; during auto-play it first hands the turn to the player. */
  | { readonly type: 'demo'; readonly key: Key }
  | { readonly type: 'continue' }
  | { readonly type: 'skip' };

export interface Routed {
  /** True when the key must not reach the game or any listener behind the page. */
  readonly stop: boolean;
  readonly preventDefault: boolean;
  readonly action: PageAction;
}
export interface RouteEvent extends KeyEventLike { readonly repeat: boolean; readonly onButton?: boolean }

const NOTHING: PageAction = { type: 'none' };
const PASS: Routed = { stop: false, preventDefault: false, action: { type: 'none' } };

/**
 * What one key press does while a page is open. F1 and browser shortcuts (Cmd chords, F-keys) are left
 * alone; every other key is held back from the game. Enter and Esc belong to the demo while its example
 * types them and is not finished; otherwise Enter continues and Esc skips, once the guard has passed.
 */
export function routeKey(event: RouteEvent, page: PageModel, ready: boolean): Routed {
  if (event.metaKey || /^F\d+$/.test(event.key)) return PASS;
  // Tab moves between the page's two buttons; a focused button keeps Enter and Space.
  if (event.key === 'Tab') return { stop: true, preventDefault: false, action: NOTHING };
  if (event.onButton && (event.key === 'Enter' || event.key === ' ')) return { stop: true, preventDefault: event.repeat, action: NOTHING };
  const mapped = mapKeyEvent(event);
  const held: Routed = { stop: true, preventDefault: mapped.preventDefault, action: { type: 'none' } };
  if (mapped.key === null || event.repeat) return held;
  const key = mapped.key;
  const finished = page.phase === 'done';
  const belongsToDemo = (key === '<CR>' || key === '<Esc>') && !finished && exampleUses(page.entry, key);
  if (belongsToDemo) return { ...held, action: page.phase === 'try' ? { type: 'demo', key } : { type: 'none' } };
  if (key === '<CR>') return { ...held, action: ready ? { type: 'continue' } : { type: 'none' } };
  if (key === '<Esc>') return { ...held, action: ready ? { type: 'skip' } : { type: 'none' } };
  return { ...held, action: finished && key !== ':' ? { type: 'none' } : { type: 'demo', key } };
}

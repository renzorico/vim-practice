import type { Key } from '@escape/engine';
import { afterDeadKey, deadKeyCharacter, type LayoutMap } from './deadKeys.js';
import type { KeyEventLike } from './keys.js';

/** A Space or letter this soon after a dead key belongs to it. */
const DEAD_KEY_WINDOW_MS = 1000;
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Alt', 'Control', 'Meta']);
const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** When the last dead key was pressed: it spans two presses, so the caller keeps this between events. */
export interface DeadKeyMemory { at: number }
export const newDeadKeyMemory = (): DeadKeyMemory => ({ at: Number.NEGATIVE_INFINITY });

export type KeyReading =
  /** A dead key: its character comes from `resolveDeadKey`, because only the layout knows it. */
  | { readonly type: 'dead' }
  /** The Space that completes a dead key, already sent. */
  | { readonly type: 'completed' }
  | { readonly type: 'key'; readonly event: KeyEventLike };

/** The one place that turns a browser key event into what the player typed, on any keyboard layout. */
export function readKey(event: KeyboardEvent, memory: DeadKeyMemory): KeyReading {
  if (event.key === 'Dead' && !event.metaKey && !event.ctrlKey) {
    memory.at = event.timeStamp;
    return { type: 'dead' };
  }
  let key: string = event.key;
  if (!MODIFIER_KEYS.has(key)) {
    const followsDead = event.timeStamp - memory.at < DEAD_KEY_WINDOW_MS;
    memory.at = Number.NEGATIVE_INFINITY;
    const completed = followsDead ? afterDeadKey(key, event.code) : key;
    if (completed === null) return { type: 'completed' };
    key = completed;
  }
  return { type: 'key', event: { key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
    altGraph: event.getModifierState?.('AltGraph') ?? false, mac: IS_MAC } };
}

/** The Keyboard API (Chromium only) says which layout is active. Without it dead keys stay ignored. */
async function activeLayout(): Promise<LayoutMap | null> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
  try { return await keyboard?.getLayoutMap?.() ?? null; }
  catch { return null; } // Blocked by a permissions policy: same as unsupported.
}

export async function resolveDeadKey(event: KeyboardEvent): Promise<Key | null> {
  const pressed = { code: event.code, shiftKey: event.shiftKey, altKey: event.altKey };
  const layout = await activeLayout();
  return layout && deadKeyCharacter(pressed, layout);
}

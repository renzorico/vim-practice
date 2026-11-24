import { useEffect, useRef } from 'react';
import type { Key } from '@escape/engine';
import { shouldLeaveToBrowser } from './capture.js';
import { afterDeadKey, deadKeyCharacter, type LayoutMap } from './deadKeys.js';
import { mapKeyEvent } from './keys.js';

const HINT_KEY = 'F1';
/** A Space or letter this soon after a dead key belongs to it. */
const DEAD_KEY_WINDOW_MS = 1000;
const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** The Keyboard API (Chromium only) says which layout is active. Without it dead keys stay ignored. */
async function activeLayout(): Promise<LayoutMap | null> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
  try { return await keyboard?.getLayoutMap?.() ?? null; }
  catch { return null; } // Blocked by a permissions policy: same as unsupported.
}

interface KeyCaptureHandlers {
  readonly enabled?: boolean;
  readonly onKey: (key: Key) => void;
  /** Called for F1, the keyboard shortcut for the hint (since '?' is a Vim search). */
  readonly onHint: () => void;
  /** True while Tab is a game key (insert or command-line mode). Otherwise Tab moves focus. */
  readonly captureTab: boolean;
}

/** Captures window keydown events, maps them to Vim notation and forwards them. */
export function useKeyCapture({ onKey, onHint, captureTab, enabled = true }: KeyCaptureHandlers): void {
  // Refs, because the listener below is rebuilt after every key and a dead key spans two presses.
  const deadAt = useRef(Number.NEGATIVE_INFINITY);
  const latest = useRef({ onKey, enabled });
  latest.current = { onKey, enabled };
  useEffect(() => {
    if (!enabled) return;
    const handleDeadKey = (event: KeyboardEvent): void => {
      const pressed = { code: event.code, shiftKey: event.shiftKey, altKey: event.altKey };
      event.preventDefault();
      deadAt.current = event.timeStamp;
      void activeLayout().then(layout => {
        const character = layout && deadKeyCharacter(pressed, layout);
        if (character && latest.current.enabled) latest.current.onKey(character);
      });
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (shouldLeaveToBrowser(event.key, target, captureTab)) return;
      if (event.key === HINT_KEY && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onHint();
        return;
      }
      if (event.key === 'Dead' && !event.metaKey && !event.ctrlKey) {
        if (!event.repeat) handleDeadKey(event);
        return;
      }
      let key: string = event.key;
      if (!['Shift', 'Alt', 'Control', 'Meta'].includes(key)) {
        const followsDead = event.timeStamp - deadAt.current < DEAD_KEY_WINDOW_MS;
        deadAt.current = Number.NEGATIVE_INFINITY;
        const completed = followsDead ? afterDeadKey(key, event.code) : key;
        if (completed === null) { event.preventDefault(); return; }
        key = completed;
      }
      const mapped = mapKeyEvent({ key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
        altGraph: event.getModifierState?.('AltGraph') ?? false, mac: IS_MAC });
      if (mapped.preventDefault) event.preventDefault();
      if (mapped.key !== null) onKey(mapped.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKey, onHint, captureTab, enabled]);
}

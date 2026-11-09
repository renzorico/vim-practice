import { useEffect } from 'react';
import type { Key } from '@escape/engine';
import { shouldLeaveToBrowser } from './capture.js';
import { mapKeyEvent } from './keys.js';

const HINT_KEY = 'F1';

interface KeyCaptureHandlers {
  readonly onKey: (key: Key) => void;
  /** Called for F1, the keyboard shortcut for the hint (since '?' is a Vim search). */
  readonly onHint: () => void;
  /** True while Tab is a game key (insert or command-line mode). Otherwise Tab moves focus. */
  readonly captureTab: boolean;
}

/** Captures window keydown events, maps them to Vim notation and forwards them. */
export function useKeyCapture({ onKey, onHint, captureTab }: KeyCaptureHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (shouldLeaveToBrowser(event.key, target, captureTab)) return;
      if (event.key === HINT_KEY && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onHint();
        return;
      }
      const mapped = mapKeyEvent(event);
      if (mapped.preventDefault) event.preventDefault();
      if (mapped.key !== null) onKey(mapped.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKey, onHint, captureTab]);
}

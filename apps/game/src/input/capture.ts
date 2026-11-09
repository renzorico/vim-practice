/** Pure decision logic for which keydown events the game captures. */

export interface TargetLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

const FORM_CONTROLS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATABLE: ReadonlySet<string> = new Set(['BUTTON', 'A', 'SUMMARY']);
/** Keys a focused button or link uses natively. */
const NATIVE_ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

/**
 * True when the browser should handle the event instead of the game.
 * - Form controls and editable content get every key.
 * - Buttons and links keep Enter and Space (native activation) and Tab (focus move).
 * - Tab is a game key only while `captureTab` is true (insert/command-line); otherwise it moves focus,
 *   so buttons stay reachable from the keyboard.
 */
export function shouldLeaveToBrowser(key: string, target: TargetLike | null, captureTab: boolean): boolean {
  const tag = target?.tagName?.toUpperCase() ?? '';
  if (target?.isContentEditable === true || FORM_CONTROLS.has(tag)) return true;
  if (key === 'Tab') return !captureTab || ACTIVATABLE.has(tag);
  return ACTIVATABLE.has(tag) && NATIVE_ACTIVATION_KEYS.has(key);
}

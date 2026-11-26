/** True when Enter will press a focused button natively, so a window shortcut must stand aside. */
export function focusedButton(event: KeyboardEvent): boolean {
  return typeof HTMLButtonElement !== 'undefined' && event.target instanceof HTMLButtonElement;
}

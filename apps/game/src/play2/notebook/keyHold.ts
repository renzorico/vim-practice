/**
 * A key still held when the notebook closes would keep repeating into the game. Swallow its repeats
 * until the next real press, release or blur.
 */
export function holdRepeats(): void {
  const release = (): void => {
    window.removeEventListener('keydown', swallow, true);
    window.removeEventListener('keyup', release, true);
    window.removeEventListener('blur', release);
  };
  function swallow(event: KeyboardEvent): void {
    if (!event.repeat) { release(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.addEventListener('keydown', swallow, true);
  window.addEventListener('keyup', release, true);
  window.addEventListener('blur', release);
}

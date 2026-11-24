import { afterEach, expect, it, vi } from 'vitest';
import { holdRepeats } from './keyHold.js';
afterEach(() => vi.unstubAllGlobals());
it('swallows held repeats after closing until release or a fresh press', () => {
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  holdRepeats();
  const game = vi.fn(); events.addEventListener('keydown', game);
  const press = (repeat: boolean): void => { events.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { repeat })); };
  press(true); expect(game).not.toHaveBeenCalled();
  events.dispatchEvent(new Event('keyup')); press(false); expect(game).toHaveBeenCalledOnce();
});

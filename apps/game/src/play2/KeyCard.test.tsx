import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const hooks = vi.hoisted(() => ({
  cursor: 0, values: new Map<number, unknown>(),
  pending: [] as (() => void)[], cleanups: [] as (() => void)[],
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!hooks.values.has(slot)) hooks.values.set(slot, typeof initial === 'function' ? initial() : initial);
    return [hooks.values.get(slot), (value: unknown) => hooks.values.set(slot,
      typeof value === 'function' ? value(hooks.values.get(slot)) : value)];
  },
  useEffect: (effect: () => (() => void) | undefined) => {
    hooks.pending.push(() => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); });
  },
}));
import { KeyCard, EXAMPLE_KEY_MS } from './KeyCard.js';
import { HELP_KEYS } from './help/keys.js';
let entries = HELP_KEYS.slice(0, 5);
const dismiss = vi.fn();
let html = '';
function render(): void {
  hooks.cleanups.splice(0).forEach(cleanup => cleanup());
  hooks.cursor = 0;
  html = renderToStaticMarkup(KeyCard({ entries, onDismiss: dismiss }));
  hooks.pending.splice(0).forEach(effect => effect());
}
function key(value: string, repeat = false): Event {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: value, repeat });
  window.dispatchEvent(event);
  render();
  return event;
}
beforeEach(() => {
  hooks.values.clear(); hooks.pending.length = 0; hooks.cleanups.length = 0;
  vi.clearAllMocks(); vi.useFakeTimers(); entries = HELP_KEYS.slice(0, 5);
  const events = new EventTarget();
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
    removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    setInterval, clearInterval,
  });
  render();
});
afterEach(() => { hooks.cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('presents at most three keys before continuing to the next card', () => {
  expect(html).toContain('1 of 2');
  expect(html).toContain('Move one line up.');
  expect(html).not.toContain('Move one character right.');
  key('Enter');
  expect(dismiss).not.toHaveBeenCalled();
  expect(html).toContain('2 of 2');
  expect(html).toContain('Move one character right.');
  key('Escape'); expect(dismiss).toHaveBeenCalledOnce();
});
it('captures typing and repeat dismissal without forwarding a game turn', () => {
  const gameInput = vi.fn();
  window.addEventListener('keydown', gameInput);
  key('x'); expect(gameInput).not.toHaveBeenCalled();
  expect(key('Enter', true).defaultPrevented).toBe(true);
  expect(html).toContain('1 of 2');
  expect(dismiss).not.toHaveBeenCalled();
});
it('types example keys every 400 ms and then shows the resulting cursor', () => {
  entries = HELP_KEYS.filter(entry => entry.key === 'r'); hooks.values.clear(); render();
  expect(html).toContain('<mark>b</mark>');
  vi.advanceTimersByTime(EXAMPLE_KEY_MS); render();
  expect(html).toContain('<kbd>r</kbd>');
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 2); render();
  expect(html).toContain('<mark>=</mark>');
});
it('shows both example rows statically for reduced motion', () => {
  entries = HELP_KEYS.filter(entry => entry.key === 'r'); hooks.values.clear();
  window.matchMedia = () => ({ matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }); render();
  expect(html).toContain('<mark>b</mark>');
  expect(html).toContain('<mark>=</mark>');
});

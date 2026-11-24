import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const hooks = vi.hoisted(() => ({
  cursor: 0, values: new Map<number, unknown>(),
  pending: [] as (() => void)[], cleanups: [] as (() => void)[],
  focus: vi.fn(), scroll: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!hooks.values.has(slot)) hooks.values.set(slot, initial);
    return [hooks.values.get(slot), (value: unknown) => hooks.values.set(slot, value)];
  },
  useRef: () => {
    hooks.cursor++;
    return { current: { focus: hooks.focus, scrollBy: hooks.scroll, querySelectorAll: () => [] } };
  },
  useEffect: (effect: () => (() => void) | undefined) => {
    hooks.pending.push(() => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); });
  },
}));
import { HelpOverlay } from './HelpOverlay.js';
import { HELP_KEYS } from './keys.js';
import { content } from '../content.js';
const close = vi.fn();
let html = '';
function render(): void {
  hooks.cleanups.splice(0).forEach(cleanup => cleanup());
  hooks.cursor = 0;
  html = renderToStaticMarkup(HelpOverlay({ entries: HELP_KEYS, newKeys: new Set(['w']), worlds: content.worlds, onClose: close }));
  hooks.pending.splice(0).forEach(effect => effect());
}
function key(value: string, repeat = false): void {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: value, repeat });
  window.dispatchEvent(event);
  render();
}
beforeEach(() => {
  hooks.values.clear(); hooks.cleanups.length = 0; hooks.pending.length = 0;
  vi.clearAllMocks();
  const events = new EventTarget();
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
    removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
  });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('HTMLElement', class {});
  render();
});
afterEach(() => { hooks.cleanups.splice(0).forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });
it('groups newest worlds first, marks new keys, and scrolls with j/k', () => {
  expect(html.indexOf('Echo')).toBeLessThan(html.indexOf('Margin'));
  expect(html).toContain('>new</span>');
  key('j'); expect(hooks.scroll).toHaveBeenLastCalledWith({ top: 120 });
  key('k'); expect(hooks.scroll).toHaveBeenLastCalledWith({ top: -120 });
});
it.each(['q', 'Escape'])('%s closes outside the filter', value => {
  key(value); expect(close).toHaveBeenCalledOnce();
});
it('slash focuses filtering, typing filters, Escape clears before closing', () => {
  key('/'); expect(hooks.focus).toHaveBeenCalled();
  // The controlled input's value is slot 3 (two refs, then filtering and query).
  hooks.values.set(3, 'rectangle'); render();
  expect(html).toContain('Start selecting a rectangle');
  expect(html).not.toContain('Move one character left.');
  key('q'); expect(close).not.toHaveBeenCalled();
  key('Escape'); expect(html).toContain('Move one character left.');
  expect(close).not.toHaveBeenCalled();
  key('Escape'); expect(close).toHaveBeenCalledOnce();
});
it.each(['q', 'Escape'])('a repeating %s does not close', value => {
  key(value, true); expect(close).not.toHaveBeenCalled();
});
it.each([['BUTTON', 'blur'], ['DIV', 'focus']] as const)('closing after opening from a %s calls its %s', (tagName, expected) => {
  hooks.cleanups.splice(0).forEach(cleanup => cleanup());
  const previous = Object.assign(new HTMLElement(), { tagName, isConnected: true, blur: vi.fn(), focus: vi.fn() });
  vi.stubGlobal('document', { activeElement: previous });
  render();
  hooks.cleanups.splice(0).forEach(cleanup => cleanup());
  expect(previous[expected]).toHaveBeenCalledOnce();
  expect(previous[expected === 'blur' ? 'focus' : 'blur']).not.toHaveBeenCalled();
});

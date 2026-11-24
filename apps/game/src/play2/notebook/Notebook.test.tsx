import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const hooks = vi.hoisted(() => ({
  cursor: 0, values: new Map<number, unknown>(),
  pending: [] as (() => void)[], cleanups: [] as (() => void)[],
  effects: new Map<number, { deps: readonly unknown[]; cleanup: (() => void) | undefined }>(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!hooks.values.has(slot)) hooks.values.set(slot, typeof initial === 'function' ? initial() : initial);
    return [hooks.values.get(slot), (value: unknown) => hooks.values.set(slot,
      typeof value === 'function' ? value(hooks.values.get(slot)) : value)];
  },
  useRef: (value: unknown) => {
    const slot = hooks.cursor++;
    if (!hooks.values.has(slot)) hooks.values.set(slot, { current: value });
    return hooks.values.get(slot);
  },
  useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.cursor++;
    const previous = hooks.effects.get(slot);
    if (previous && deps.length === previous.deps.length && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects.set(slot, { deps, cleanup: effect() });
    });
  },
}));
import { NotebookPage, EXAMPLE_KEY_MS } from './Notebook.js';
import { PAGE_GUARD_MS } from './routing.js';
import { HELP_KEYS } from '../help/keys.js';
import { clearSeenKeys, readSeenKeys } from './seen.js';
let entry = HELP_KEYS[0]!;
const next = vi.fn();
const skip = vi.fn();
const help = vi.fn();
let html = '';
let suspended = false;
function render(): void {
  hooks.cursor = 0;
  html = renderToStaticMarkup(NotebookPage({ entry, index: 0, total: 2, onNext: next, onSkip: skip, onOpenHelp: help, suspended }));
  hooks.pending.splice(0).forEach(effect => effect());
}
function key(value: string, repeat = false): Event {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: value, repeat, metaKey: false, ctrlKey: false, altKey: false });
  window.dispatchEvent(event);
  render();
  return event;
}
beforeEach(() => {
  hooks.values.clear(); hooks.effects.clear(); hooks.pending.length = 0; hooks.cleanups.length = 0;
  suspended = false; vi.clearAllMocks(); vi.useFakeTimers(); entry = HELP_KEYS[0]!;
  const events = new EventTarget();
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
    removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    setInterval, clearInterval,
  });
  clearSeenKeys(); render();
});
afterEach(() => { hooks.effects.forEach(effect => effect.cleanup?.()); window.dispatchEvent(new Event('blur')); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('shows one grouped movement page, a tile canvas, the Scribe and two page dots', () => {
  expect(html).toContain('From the Scribe');
  expect(html).toContain('Move: left, down, up, right.');
  expect(html).toContain('Move one character or line in Normal mode.');
  expect(html).not.toContain('Move one line down.');
  expect(html).toContain('<canvas'); expect(html).toContain('dialogue__portrait');
  expect(html).toContain('Page 1 of 2');
  expect(readSeenKeys().has('h')).toBe(true);
});
it('guards Enter and Escape, and skips all remaining pages', () => {
  key('Enter'); key('Escape'); expect(next).not.toHaveBeenCalled(); expect(skip).not.toHaveBeenCalled();
  vi.advanceTimersByTime(PAGE_GUARD_MS);
  key('Enter', true); expect(next).not.toHaveBeenCalled();
  key('Enter'); expect(next).toHaveBeenCalledOnce();
  key('Escape'); expect(skip).toHaveBeenCalledOnce();
});
it('blocks wrong and correct practice keys without spending game input', () => {
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 9); render();
  const game = vi.fn(); window.addEventListener('keydown', game);
  key('x'); expect(html).toContain('Try again: press'); expect(game).not.toHaveBeenCalled();
  for (const name of ['l', 'j', 'h', 'k']) key(name); expect(html).toContain("That&#x27;s it."); expect(game).not.toHaveBeenCalled();
});
it('auto-plays once then offers a fresh engine to the player', () => {
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 9); render();
  expect(html).toContain('Your turn: press');
  for (const name of ['l', 'j', 'h', 'k']) key(name); expect(html).toContain('on you go');
});
it('lets F1 and shortcuts through, and suspends both input and playback under help', () => {
  const game = vi.fn(); window.addEventListener('keydown', game);
  key('F1'); expect(game).toHaveBeenCalledOnce();
  for (const name of [':', 'h', 'e', 'l', 'p', 'Enter']) key(name);
  expect(help).toHaveBeenCalledOnce();
  suspended = true; render();
  expect(html).toContain('hidden=');
  expect(key('Escape').defaultPrevented).toBe(false); expect(skip).not.toHaveBeenCalled();
});
it('routes Escape to insertion practice until the example is finished', () => {
  entry = HELP_KEYS.find(item => item.key === 'i')!; hooks.effects.forEach(effect => effect.cleanup?.()); hooks.effects.clear(); hooks.values.clear(); render();
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 8); render();
  key('i'); key('x'); key('Escape');
  expect(skip).not.toHaveBeenCalled(); expect(html).toContain("That&#x27;s it.");
  key('Enter'); expect(next).toHaveBeenCalledOnce();
});
it('routes Enter to search practice until the example is finished', () => {
  entry = HELP_KEYS.find(item => item.key === '/')!; hooks.effects.forEach(effect => effect.cleanup?.()); hooks.effects.clear(); hooks.values.clear(); render();
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 10); render();
  for (const name of ['/', 't', 'w', 'o', 'Enter']) key(name);
  expect(next).not.toHaveBeenCalled(); expect(html).toContain("That&#x27;s it.");
  key('Enter'); expect(next).toHaveBeenCalledOnce();
});
it('starts directly in practice when reduced motion is preferred', () => {
  hooks.effects.forEach(effect => effect.cleanup?.()); hooks.effects.clear(); hooks.values.clear();
  window.matchMedia = () => ({ matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }); render();
  expect(html).toContain('Your turn: press');
});

it('lights each movement key and waits after completion until Enter', () => {
  vi.advanceTimersByTime(EXAMPLE_KEY_MS * 9); render();
  expect(html).toContain('skip practice');
  key('l'); expect(html).toContain('data-used="true">l</kbd>');
  expect(html).not.toContain('on you go');
  for (const name of ['j', 'h', 'k']) key(name);
  expect(html).toContain('data-complete="true"');
  expect(html).toContain('on you go');
  vi.advanceTimersByTime(10000); render();
  expect(next).not.toHaveBeenCalled();
  for (const name of ['h', 'j', 'k', 'l']) expect(readSeenKeys().has(name)).toBe(true);
  key('Enter'); expect(next).toHaveBeenCalledOnce();
});

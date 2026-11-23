import { createElement, isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Line } from '@escape/story';

// Small hook driver, matching the project's App test approach; no DOM dependency added.
const driver = vi.hoisted(() => ({
  path: '', slot: 0, reduced: false,
  states: new Map<string, unknown>(),
  effects: new Map<string, { deps: readonly unknown[]; cleanup: (() => void) | undefined }>(),
  pending: [] as (() => void)[],
}));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original,
    useCallback: (callback: unknown) => callback,
    useRef: (value: unknown) => {
      const key = `${driver.path}:${driver.slot++}`;
      if (!driver.states.has(key)) driver.states.set(key, { current: value });
      return driver.states.get(key);
    },
    useState: (initial: unknown) => {
      const key = `${driver.path}:${driver.slot++}`;
      if (!driver.states.has(key)) driver.states.set(key, typeof initial === 'function' ? initial() : initial);
      return [driver.states.get(key), (value: unknown) => driver.states.set(key,
        typeof value === 'function' ? value(driver.states.get(key)) : value)];
    },
    useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
      const key = `${driver.path}:${driver.slot++}`;
      const previous = driver.effects.get(key);
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      driver.pending.push(() => {
        previous?.cleanup?.();
        driver.effects.set(key, { deps, cleanup: effect() });
      });
    },
  };
});
import { DialogueBox } from './DialogueBox.js';
import { Portrait } from '../scene/sprites/Portrait.js';

function render(node: ReactNode, path = 'root'): ReactNode {
  if (Array.isArray(node)) return node.map((child, i) => render(child, `${path}/${i}`));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  const nextPath = `${path}/${node.key ?? ''}`;
  if (typeof node.type === 'function') {
    driver.path = `${nextPath}/${node.type.name}`;
    driver.slot = 0;
    const child: ReactNode = Reflect.apply(node.type, undefined, [node.props]);
    return render(child, driver.path);
  }
  return createElement(node.type, { ...node.props, key: node.key ?? nextPath }, render(node.props.children, nextPath));
}

function show(lines: readonly Line[], onFinish: () => void, activeIndex?: number): string {
  const props = activeIndex === undefined ? { lines, onFinish } : { lines, onFinish, activeIndex };
  const tree = render(createElement(DialogueBox, props));
  driver.pending.splice(0).forEach(effect => effect());
  return renderToStaticMarkup(createElement('div', null, tree));
}

beforeEach(() => {
  vi.useFakeTimers();
  driver.reduced = false;
  const target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, {
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    matchMedia: () => ({ matches: driver.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  }));
});
afterEach(() => {
  driver.effects.forEach(effect => effect.cleanup?.());
  driver.states.clear(); driver.effects.clear(); driver.pending.length = 0;
  vi.useRealTimers(); vi.unstubAllGlobals();
});

function enter(): void {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Enter' });
  window.dispatchEvent(event);
}

it('reveals at 60 characters per second and gives assistive technology the complete line immediately', () => {
  const text = 'A'.repeat(90);
  const lines: readonly Line[] = [{ speaker: 'elder', text }];
  const finish = vi.fn();
  const start = show(lines, finish);
  expect(start).toContain(`aria-atomic="true">${text}</span>`);
  expect(start).toContain(`dialogue__unrevealed">${text}</span>`);
  vi.advanceTimersByTime(500);
  const middle = show(lines, finish);
  const visible = middle.match(/<span aria-hidden="true">(A*)<span/)?.[1]?.length ?? 0;
  expect(visible).toBeGreaterThanOrEqual(29);
  expect(visible).toBeLessThanOrEqual(30);
  expect(finish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1500);
  expect(show(lines, finish)).toContain('dialogue__unrevealed"></span>');
});

it('advances once per Enter even during reveal, without swallowing a press', () => {
  const lines: readonly Line[] = [{ speaker: 'elder', text: 'First' }, { speaker: 'dot', text: 'Second!' }];
  const finish = vi.fn();
  show(lines, finish);
  enter();
  expect(show(lines, finish)).toContain('Second!');
  expect(finish).not.toHaveBeenCalled();
  enter();
  expect(show(lines, finish)).not.toContain('role="dialog"');
  expect(finish).toHaveBeenCalledTimes(1);
  enter();
  expect(finish).toHaveBeenCalledTimes(1);
});

it('leaves key capture to the session when activeIndex is supplied', () => {
  const finish = vi.fn();
  show([{ speaker: 'elder', text: 'Read me' }], finish, 0);
  enter();
  expect(finish).not.toHaveBeenCalled();
});

it('shows all visual text immediately with reduced motion', () => {
  driver.reduced = true;
  const markup = show([{ speaker: 'elder', text: 'Already visible' }], vi.fn());
  expect(markup).toContain('<span aria-hidden="true">Already visible<span class="dialogue__unrevealed"></span>');
  expect(vi.getTimerCount()).toBe(0);
});

it('renders crisp 96px mood portraits, uses a neutral fallback and hides faceless speakers', () => {
  const portrait = (sprite: string, mood: 'neutral' | 'worried' | 'glad' = 'neutral') =>
    renderToStaticMarkup(createElement(Portrait, { sprite, mood }));
  expect(portrait('THE ELDER')).toContain('viewBox="0 0 32 32"');
  expect(portrait('The Elder')).toContain('width="96"');
  expect(portrait('elder', 'worried')).not.toEqual(portrait('elder'));
  expect(portrait('Fern', 'glad')).toEqual(portrait('Fern'));
  expect(portrait('blot')).toContain('viewBox="0 0 16 16"');
  for (const speaker of ['system', 'sign', 'unwriter', 'unknown speaker']) expect(portrait(speaker)).toBe('');
});

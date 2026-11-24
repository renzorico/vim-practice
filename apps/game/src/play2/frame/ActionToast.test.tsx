import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorldEvent } from '@escape/world';
import { createWorldSim } from '@escape/world';
import { createEngine } from '@escape/engine';
import { stage, legend } from '../content.js';
const hook = vi.hoisted(() => ({
  slot: 0, states: new Map<number, unknown>(),
  effects: new Map<number, { deps: readonly unknown[]; cleanup: (() => void) | undefined }>(),
  pending: [] as (() => void)[],
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const slot = hook.slot++;
    if (!hook.states.has(slot)) hook.states.set(slot, { current: initial });
    return hook.states.get(slot);
  },
  useState: (initial: unknown) => {
    const slot = hook.slot++;
    if (!hook.states.has(slot)) hook.states.set(slot, typeof initial === 'function' ? initial() : initial);
    return [hook.states.get(slot), (value: unknown) => hook.states.set(slot, value)];
  },
  useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hook.slot++;
    const previous = hook.effects.get(slot);
    if (previous && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
    hook.pending.push(() => { previous?.cleanup?.(); hook.effects.set(slot, { deps, cleanup: effect() }); });
  },
}));
import { ActionToast } from './ActionToast.js';
const world = createWorldSim(createEngine()).init(stage, legend, { learnedCommands: [], flags: {} });
const bump: readonly WorldEvent[] = [{ type: 'bump', reason: 'edge', at: { line: 0, col: 0 } }];
function show(events: readonly WorldEvent[], hidden = false): string {
  const render = () => { hook.slot = 0; return ActionToast({ events, stage, world, legend, hidden }); };
  render(); hook.pending.splice(0).forEach(effect => effect());
  const tree = render(); hook.pending.splice(0).forEach(effect => effect());
  return renderToStaticMarkup(tree);
}
afterEach(() => {
  hook.effects.forEach(effect => effect.cleanup?.());
  hook.states.clear(); hook.effects.clear(); hook.pending.length = 0;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
it('appears, is replaced immediately, expires at 2.5s, and clears on a successful turn', () => {
  vi.useFakeTimers(); vi.stubGlobal('window', globalThis);
  expect(show(bump)).toContain('The edge of the world.');
  vi.advanceTimersByTime(1000);
  const next: readonly WorldEvent[] = [{ type: 'bump', reason: 'fixed', at: { line: 0, col: 0 } }];
  expect(show(next)).toContain('That stone is fixed.');
  vi.advanceTimersByTime(2499);
  expect(show(next)).toContain('That stone is fixed.');
  vi.advanceTimersByTime(1);
  expect(show(next)).not.toContain('That stone is fixed.');
  expect(show([...bump])).toContain('The edge of the world.');
  expect(show([])).toContain('The edge of the world.');
  expect(show([{ type: 'turn-ended', turn: 1 }])).toContain('data-visible="false"');
});
it('never shows under dialogue and does not resurrect after closing it', () => {
  vi.useFakeTimers(); vi.stubGlobal('window', globalThis);
  show(bump);
  expect(show(bump, true)).not.toContain('The edge of the world.');
  expect(show(bump)).not.toContain('The edge of the world.');
  expect(show([...bump])).toContain('The edge of the world.');
});

import { afterEach, expect, it, vi } from 'vitest';
import type { WorldEvent } from '@escape/world';
const hook = vi.hoisted(() => ({ expired: null as readonly WorldEvent[] | null,
  events: undefined as unknown, cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
  useState: () => [hook.expired, (value: readonly WorldEvent[]) => { hook.expired = value; }],
  useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    if (hook.events === deps[0]) return;
    hook.cleanup?.();
    hook.events = deps[0];
    hook.cleanup = effect();
  },
}));
import { useBlockedReason } from './useBlockedReason.js';
afterEach(() => {
  hook.cleanup?.(); hook.cleanup = undefined; hook.events = undefined; hook.expired = null;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
it('expires after 1.5 seconds and restarts for another blocked command', () => {
  vi.useFakeTimers(); vi.stubGlobal('window', globalThis);
  const bump: readonly WorldEvent[] = [{ type: 'bump', reason: 'wall', at: { line: 0, col: 0 } }];
  expect(useBlockedReason(bump)).toBe('Blocked: a wall.');
  vi.advanceTimersByTime(1499);
  expect(useBlockedReason(bump)).toBe('Blocked: a wall.');
  vi.advanceTimersByTime(1);
  expect(useBlockedReason(bump)).toBeNull();
  const next = [...bump];
  expect(useBlockedReason(next)).toBe('Blocked: a wall.');
  vi.advanceTimersByTime(1500);
  expect(useBlockedReason(next)).toBeNull();
});

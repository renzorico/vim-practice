import { afterEach, expect, it, vi } from 'vitest';
import { clearSeenKeys, KEYS_SEEN_KEY, markKeysSeen, readSeenKeys } from './seen.js';
afterEach(() => { clearSeenKeys(); vi.unstubAllGlobals(); });
it('persists seen keys, reads a previous save and clears on New game', () => {
  const values = new Map([[KEYS_SEEN_KEY, '["w"]']]);
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  expect(readSeenKeys().has('w')).toBe(true); markKeysSeen(['x']);
  expect(JSON.parse(values.get(KEYS_SEEN_KEY)!)).toEqual(expect.arrayContaining(['w', 'x']));
  clearSeenKeys(); expect(readSeenKeys().size).toBe(0); expect(values.has(KEYS_SEEN_KEY)).toBe(false);
});
it('uses memory when storage is blocked', () => {
  vi.stubGlobal('window', { get localStorage() { throw new Error('Blocked'); } });
  markKeysSeen(['h']); expect(readSeenKeys().has('h')).toBe(true); clearSeenKeys(); expect(readSeenKeys().size).toBe(0);
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveData } from '@escape/curriculum';
import { createLocalStorage } from './storage.js';

const KEY = 'escape.save.v1';
const VALID: SaveData = {
  version: 1,
  completed: { 'p-01-trapped': { stars: 3, bestKeystrokes: 3 } },
  mastery: { 'ex.q': { skill: 'ex.q', box: 1, lastPracticed: '2026-11-09T12:00:00.000Z', successes: 1, failures: 0 } },
};

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe('createLocalStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips a valid save', () => {
    const storage = memoryStorage();
    const adapter = createLocalStorage(() => storage);
    adapter.save(VALID);
    expect(adapter.load()).toEqual(VALID);
  });

  it('returns null when nothing is saved', () => {
    expect(createLocalStorage(() => memoryStorage()).load()).toBeNull();
  });

  it('survives storage whose access throws (blocked storage)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = createLocalStorage(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(adapter.load()).toBeNull();
    expect(() => adapter.save(VALID)).not.toThrow();
  });

  it.each([
    ['not JSON', '{oops'],
    ['null completion entry', JSON.stringify({ ...VALID, completed: { 'p-01-trapped': null } })],
    ['stars out of range', JSON.stringify({ ...VALID, completed: { 'p-01-trapped': { stars: 7, bestKeystrokes: 3 } } })],
    ['negative keystrokes', JSON.stringify({ ...VALID, completed: { 'p-01-trapped': { stars: 3, bestKeystrokes: -1 } } })],
    ['box out of range', JSON.stringify({ ...VALID, mastery: { 'ex.q': { ...VALID.mastery['ex.q'], box: 9 } } })],
    ['wrong version', JSON.stringify({ ...VALID, version: 2 })],
  ])('rejects a malformed save: %s', (_name, raw) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(createLocalStorage(() => memoryStorage({ [KEY]: raw })).load()).toBeNull();
  });
});

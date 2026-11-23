import { expect, it } from 'vitest';
import { readSound, saveSound, SOUND_STORAGE_KEY } from './settings.js';
it('defaults on and persists both settings', () => {
  const values = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } });
  expect(readSound(storage)).toBe(true);
  saveSound(false, storage);
  expect(values.get(SOUND_STORAGE_KEY)).toBe('off');
  expect(readSound(storage)).toBe(false);
  saveSound(true, storage);
  expect(readSound(storage)).toBe(true);
});
it('defaults on with blocked storage and ignores failed writes', () => {
  const blocked = () => { throw new Error('blocked'); };
  expect(readSound(blocked)).toBe(true);
  expect(() => saveSound(false, blocked)).not.toThrow();
});

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

it('loads legacy on/off values and persists the three-state cycle', async () => {
  const { readSoundMode, saveSoundMode, nextSoundMode } = await import('./settings.js');
  let value: string | null = 'on';
  const storage = () => ({ getItem: () => value, setItem: (_key: string, next: string) => { value = next; } });
  expect(readSoundMode(storage)).toBe('on');
  value = 'off'; expect(readSoundMode(storage)).toBe('off');
  value = 'unknown'; expect(readSoundMode(storage)).toBe('on');
  let mode = readSoundMode(storage);
  for (const expected of ['effects only', 'off', 'on']) {
    mode = nextSoundMode(mode); saveSoundMode(mode, storage);
    expect(readSoundMode(storage)).toBe(expected);
    expect(readSound(storage)).toBe(expected !== 'off');
  }
});

import { createContext } from 'react';

export const SOUND_STORAGE_KEY = 'unsaved.sound.v1';
export type SoundMode = 'on' | 'effects only' | 'off';
export const SoundModeContext = createContext<SoundMode>('on');
type SoundStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): SoundStorage => window.localStorage;
export function readSoundMode(storage: () => SoundStorage = browserStorage): SoundMode {
  try {
    const value = storage().getItem(SOUND_STORAGE_KEY);
    return value === 'off' || value === 'effects only' ? value : 'on';
  } catch { return 'on'; }
}
export const nextSoundMode = (mode: SoundMode): SoundMode => mode === 'on' ? 'effects only' : mode === 'effects only' ? 'off' : 'on';
export function saveSoundMode(mode: SoundMode, storage: () => SoundStorage = browserStorage): void {
  try { storage().setItem(SOUND_STORAGE_KEY, mode); }
  catch { /* Sound remains usable when storage is blocked. */ }
}
/** Boolean compatibility for existing effects callers. */
export const readSound = (storage: () => SoundStorage = browserStorage): boolean => readSoundMode(storage) !== 'off';
export const saveSound = (enabled: boolean, storage: () => SoundStorage = browserStorage): void => saveSoundMode(enabled ? 'on' : 'off', storage);

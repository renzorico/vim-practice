export const SOUND_STORAGE_KEY = 'unsaved.sound.v1';
type SoundStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): SoundStorage => window.localStorage;
export function readSound(storage: () => SoundStorage = browserStorage): boolean {
  try { return storage().getItem(SOUND_STORAGE_KEY) !== 'off'; }
  catch { return true; }
}
export function saveSound(enabled: boolean, storage: () => SoundStorage = browserStorage): void {
  try { storage().setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off'); }
  catch { /* Sound remains usable when storage is blocked. */ }
}

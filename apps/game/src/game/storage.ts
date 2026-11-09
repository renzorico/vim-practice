import type { SaveData, StorageAdapter } from '@escape/curriculum';

const STORAGE_KEY = 'escape.save.v1';

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate['version'] === 1 && typeof candidate['completed'] === 'object' && candidate['completed'] !== null
    && typeof candidate['mastery'] === 'object' && candidate['mastery'] !== null;
}

/**
 * localStorage can be missing or throw (private windows, blocked storage). The game must still run,
 * so failures fall back to "no save" and are reported once to the console.
 */
export function createLocalStorage(storage: Storage | undefined = globalThis.localStorage): StorageAdapter {
  return {
    load() {
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (raw === null || raw === undefined) return null;
        const parsed: unknown = JSON.parse(raw);
        return isSaveData(parsed) ? parsed : null;
      } catch (error) {
        console.warn('ESCAPE: could not read saved progress', error);
        return null;
      }
    },
    save(data) {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('ESCAPE: could not save progress', error);
      }
    },
  };
}

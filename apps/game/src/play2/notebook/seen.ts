export const KEYS_SEEN_KEY = 'unsaved.keys-seen.v1';

/** Used when localStorage is blocked, and as the write-through copy while it works. */
let memory: ReadonlySet<string> = new Set();

function storedKeys(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(KEYS_SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Keys whose notebook page has already opened in this save. */
export function readSeenKeys(): ReadonlySet<string> {
  return new Set([...memory, ...storedKeys()]);
}

export function markKeysSeen(keys: readonly string[]): void {
  memory = new Set([...memory, ...keys]);
  try {
    window.localStorage.setItem(KEYS_SEEN_KEY, JSON.stringify([...readSeenKeys()]));
  } catch {
    // Blocked storage: the pages stay seen for this session only.
  }
}

/** A new game teaches everything again. */
export function clearSeenKeys(): void {
  memory = new Set();
  try {
    window.localStorage.removeItem(KEYS_SEEN_KEY);
  } catch {
    // Nothing stored that we could remove.
  }
}

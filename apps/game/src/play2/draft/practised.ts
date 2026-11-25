export const PRACTISED_KEY = 'unsaved.practised.v1';

/** Used when localStorage is blocked, and as the write-through copy while it works. */
let memory: ReadonlySet<string> = new Set();

/** Stages whose written exercise was finished. A finished one is not offered again after a replay. */
export function readPractised(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PRACTISED_KEY) ?? '[]');
    return new Set([...memory, ...(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])]);
  } catch {
    return memory;
  }
}

export function markPractised(stage: string): void {
  memory = new Set([...memory, stage]);
  try {
    window.localStorage.setItem(PRACTISED_KEY, JSON.stringify([...readPractised()]));
  } catch {
    // Blocked storage: it stays finished for this session only.
  }
}

/** A new game practises everything again. */
export function clearPractised(): void {
  memory = new Set();
  try {
    window.localStorage.removeItem(PRACTISED_KEY);
  } catch {
    // Nothing stored that we could remove.
  }
}

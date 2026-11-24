import { useEffect, useState } from 'react';
import type { StoryContent } from '@escape/story';
import type { Stage } from '@escape/world';
import type { Session } from '../session.js';
import { keyCardEntries } from '../introducedAt.js';
import { dismissed, isIdle, track, type Tracker } from './queue.js';
import { readSeenKeys } from './seen.js';

/** Presentation state stays outside the replayable session. */
export function useNotebook(session: Session, stage: Stage, content: StoryContent, cleared: readonly string[] = []) {
  const [previous, setPrevious] = useState<Tracker | null>(null);
  const candidates = keyCardEntries(stage.id, session.story, cleared);
  const current = track(previous, session, { stage, content, candidates: candidates.map(entry => entry.key), seen: readSeenKeys() });
  // Adjust during render so a dialogue's closing key cannot expose an idle game frame.
  if (current !== previous) setPrevious(current);
  const group = current.queue.group;
  const entries = candidates.filter(entry => group?.includes(entry.key)).sort((a, b) =>
    (group?.indexOf(a.key) ?? 0) - (group?.indexOf(b.key) ?? 0));
  const close = (): void => setPrevious({ ...current, queue: dismissed(current.queue) });
  useEffect(() => {
    if (group && !isIdle(session)) close();
  }, [session, group]);
  return { entries: isIdle(session) ? entries : [], close };
}

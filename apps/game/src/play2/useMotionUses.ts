import { useState } from 'react';
import { countMotionUses, type MotionUses } from './feedback.js';
import type { Session } from './session.js';

/** Presentation history only: solver snapshots never retain these counters. */
export function useMotionUses(session: Session): MotionUses {
  const stage = session.world.stage;
  const entry = session.stageEntry.story;
  const events = session.lastEvents;
  const [tracked, setTracked] = useState(() => ({ stage, entry, events, uses: countMotionUses({}, events) }));
  if (tracked.stage === stage && tracked.entry === entry && tracked.events === events) return tracked.uses;
  const uses = countMotionUses(tracked.stage === stage && tracked.entry === entry ? tracked.uses : {}, events);
  // Adjust during render so markers never flash with the previous attempt's counts.
  setTracked({ stage, entry, events, uses });
  return uses;
}

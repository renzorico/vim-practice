import { useEffect, useState } from 'react';
import type { Session } from './session.js';
import { SET_RIGHT_MS } from './ScriptPanel.js';

/** Derive the stamp immediately on solve, before paint or another key can advance the story. */
export function useScriptStamp(session: Session): boolean {
  const [dismissed, setDismissed] = useState<Session['world']['solvedScripts'] | null>(null);
  const solved = session.lastEvents.some(event => event.type === 'script-solved');
  const active = solved && dismissed !== session.world.solvedScripts;
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setDismissed(session.world.solvedScripts), SET_RIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [active, session.world.solvedScripts]);
  return active;
}

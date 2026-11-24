import { useEffect, useState } from 'react';
import type { Legend, Stage, WorldState, WorldEvent } from '@escape/world';
import { blockedReason } from './feedback.js';

export const BLOCKED_REASON_MS = 1500;
export function useBlockedReason(events: readonly WorldEvent[], stage?: Stage, world?: WorldState, legend?: Legend): string | null {
  const [expired, setExpired] = useState<readonly WorldEvent[] | null>(null);
  const reason = blockedReason(events, stage, world, legend);
  useEffect(() => {
    if (!reason) return;
    const timer = window.setTimeout(() => setExpired(events), BLOCKED_REASON_MS);
    return () => window.clearTimeout(timer);
  }, [events, reason]);
  return expired === events ? null : reason;
}

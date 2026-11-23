import { useEffect, useState } from 'react';
import type { WorldEvent } from '@escape/world';
import { blockedReason } from './feedback.js';

export const BLOCKED_REASON_MS = 1500;
export function useBlockedReason(events: readonly WorldEvent[]): string | null {
  const [expired, setExpired] = useState<readonly WorldEvent[] | null>(null);
  const reason = blockedReason(events);
  useEffect(() => {
    if (!reason) return;
    const timer = window.setTimeout(() => setExpired(events), BLOCKED_REASON_MS);
    return () => window.clearTimeout(timer);
  }, [events, reason]);
  return expired === events ? null : reason;
}

import { useEffect, useRef, useState } from 'react';
import type { Legend, Stage, WorldEvent, WorldState } from '@escape/world';
import { blockedReason } from '../feedback.js';

export const TOAST_MS = 2500;
interface ActionToastProps {
  readonly events: readonly WorldEvent[];
  readonly stage: Stage;
  readonly world: WorldState;
  readonly legend: Legend;
  readonly hidden: boolean;
}
interface Slip {
  readonly generation: number;
  readonly text: string;
  readonly turn: number;
}
export function ActionToast({ events, stage, world, legend, hidden }: ActionToastProps) {
  const reason = blockedReason(events, stage, world, legend);
  // A partly blocked turn ends and still has something to say.
  const successful = !reason && events.some(event => event.type === 'turn-ended');
  const generation = useRef(0);
  const consumed = useRef<readonly WorldEvent[] | null>(hidden ? null : events);
  const [slip, setSlip] = useState<Slip | null>(() => reason && !hidden && !successful
    ? { text: reason, turn: world.turn, generation: generation.current } : null);
  useEffect(() => {
    if (hidden || successful) { consumed.current = events; setSlip(null); return; }
    if (consumed.current === events) return;
    consumed.current = events;
    if (reason) {
      generation.current += 1;
      setSlip({ text: reason, turn: world.turn, generation: generation.current });
    }
  }, [events, reason, hidden, successful, world.turn]);
  useEffect(() => {
    if (!slip) return;
    const timer = window.setTimeout(() => setSlip(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [slip]);
  const visible = !hidden && !successful && slip !== null && slip.turn === world.turn;
  return <div className="action-toast" role="status" aria-live="polite" aria-atomic="true"
    data-visible={visible}>
    {visible ? <span className="action-toast__slip" key={slip.generation}>{slip.text}</span> : null}
  </div>;
}

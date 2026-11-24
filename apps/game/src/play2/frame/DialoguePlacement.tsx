import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import type { Stage, WorldState } from '@escape/world';
import { dialogueSide } from './dialogueSide.js';

const useOpeningLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Mounted once per dialogue, so advancing lines cannot flip the placement. */
export function DialoguePlacement({ field, world, stage, children }: {
  readonly field: RefObject<HTMLDivElement>;
  readonly world: WorldState;
  readonly stage: Stage;
  readonly children: ReactNode;
}) {
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  useOpeningLayoutEffect(() => {
    const box = field.current?.getBoundingClientRect();
    if (box && box.height > 0) setSide(dialogueSide(world.engine.lines, world.engine.cursor, box, stage.windowHeight));
    // Deliberately latch the opening snapshot, not each line or resize.
  }, []);
  return <div className={`dialogue-placement dialogue-placement--${side}`}>{children}</div>;
}

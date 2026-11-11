import { useCallback, useRef, useState } from 'react';
import { advanceSequence, startSequence, type Sequence } from './advance';
import { useAdvanceKeys } from './useAdvanceKeys';

interface SequenceView {
  /** Index of the item to show, or null while closed or finished. */
  readonly item: number | null;
}

/**
 * Steps through `items` on the advance keys and calls `onFinish` once per `items` identity.
 * Keys are only captured while open and not finished.
 */
export function useSequence<T>(items: readonly T[] | null, onFinish: () => void): SequenceView {
  const length = items?.length ?? 0;
  const open = items !== null && length > 0;
  const latch = useRef<Sequence>(startSequence(items));
  const [shown, setShown] = useState<Sequence>(latch.current);

  const advance = useCallback(() => {
    const step = advanceSequence(latch.current, items, length);
    latch.current = step.sequence;
    setShown(step.sequence);
    if (step.finish) onFinish();
  }, [items, length, onFinish]);

  const current = shown.source === items ? shown : startSequence(items);
  useAdvanceKeys(open && !current.finished, advance);
  return { item: open && !current.finished ? current.index : null };
}

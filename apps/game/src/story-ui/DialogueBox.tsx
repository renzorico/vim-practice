import { useCallback, useEffect, useState } from 'react';
import type { Line } from '@escape/story';
import { nextIndex, speakerName } from './advance';
import { useAdvanceKeys } from './useAdvanceKeys';

interface DialogueBoxProps {
  /** The lines to show. null or empty means closed: nothing renders and no key is captured. */
  readonly lines: readonly Line[] | null;
  /** Called once, when the last line is dismissed. The app then calls `StoryEngine.apply` with the dialogue's `then`. */
  readonly onFinish: () => void;
}

export function DialogueBox({ lines, onFinish }: DialogueBoxProps) {
  const [index, setIndex] = useState(0);
  const open = lines !== null && lines.length > 0;
  const length = lines?.length ?? 0;

  useEffect(() => setIndex(0), [lines]);

  const advance = useCallback(() => {
    const progress = nextIndex(index, length);
    if (progress.done) onFinish();
    else setIndex(progress.index);
  }, [index, length, onFinish]);

  useAdvanceKeys(open, advance);

  const line = lines?.[index];
  if (!open || line === undefined) return null;
  const name = speakerName(line);
  return (
    <div className={`dialogue dialogue--${line.speaker}`} role="dialog" aria-live="polite">
      {name !== '' && <div className="dialogue__name">{name}</div>}
      <p className="dialogue__text">{line.text}</p>
      <div className="dialogue__hint">
        <kbd className="keycap">Enter</kbd> to go on
      </div>
    </div>
  );
}

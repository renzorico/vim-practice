import type { Line } from '@escape/story';
import { speakerName } from './advance';
import { useSequence } from './useSequence';

interface DialogueBoxProps {
  /** The lines to show. null or empty means closed: nothing renders and no key is captured. */
  readonly lines: readonly Line[] | null;
  /** Called once per `lines` identity, when the last line is dismissed. The app then calls `StoryEngine.apply` with the dialogue's `then`. */
  readonly onFinish: () => void;
}

export function DialogueBox({ lines, onFinish }: DialogueBoxProps) {
  const { item } = useSequence(lines, onFinish);
  const line = item === null ? undefined : lines?.[item];
  if (line === undefined) return null;
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

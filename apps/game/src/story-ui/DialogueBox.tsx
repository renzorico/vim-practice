import { Portrait } from '../scene/sprites/Portrait.js';
import type { Line } from '@escape/story';
import { speakerName } from './advance';
import { useSequence } from './useSequence';

interface DialogueBoxProps {
  /** The lines to show. null or empty means closed: nothing renders and no key is captured. */
  readonly lines: readonly Line[] | null;
  /** When supplied, the session owns progression and keyboard capture. */
  readonly activeIndex?: number;
  /** Called once per `lines` identity, when the last line is dismissed. The app then calls `StoryEngine.apply` with the dialogue's `then`. */
  readonly onFinish: () => void;
}

export function DialogueBox(props: DialogueBoxProps) {
  if (props.activeIndex !== undefined) {
    return <DialogueLine line={props.lines?.[props.activeIndex]} onAdvance={props.onFinish} />;
  }
  return <SequenceDialogueBox {...props} />;
}

function SequenceDialogueBox({ lines, onFinish }: DialogueBoxProps) {
  const { item } = useSequence(lines, onFinish);
  return <DialogueLine line={item === null ? undefined : lines?.[item]} />;
}

function DialogueLine({ line, onAdvance }: { readonly line: Line | undefined; readonly onAdvance?: () => void }) {
  if (line === undefined) return null;
  const name = speakerName(line);
  return (
    <div className={`dialogue dialogue--${line.speaker}`} role="dialog" aria-live="polite">
      <Portrait sprite={line.speaker === 'npc' ? (line.name ?? '').replace(/^The /, '').toLowerCase() : line.speaker} />
      {name !== '' && <div className="dialogue__name">{name}</div>}
      <p className="dialogue__text">{line.text}</p>
      {onAdvance ? <button type="button" className="dialogue__hint" onClick={onAdvance}>
        <kbd className="keycap">Enter</kbd> to go on
      </button> : <div className="dialogue__hint"><kbd className="keycap">Enter</kbd> to go on</div>}
    </div>
  );
}

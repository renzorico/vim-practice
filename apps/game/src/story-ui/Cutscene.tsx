import type { Beat } from '@escape/story';
import { speakerName } from './advance';
import { useSequence } from './useSequence';

interface CutsceneProps {
  /** null or empty means closed: nothing renders and no key is captured. */
  readonly beats: readonly Beat[] | null;
  /** Called once, after the last beat. The app then applies the cutscene's `then`. */
  readonly onFinish: () => void;
}

function BeatView({ beat }: { readonly beat: Beat }) {
  switch (beat.type) {
    case 'line':
      return (
        <div className="cutscene__line">
          {speakerName(beat.line) !== '' && <div className="dialogue__name">{speakerName(beat.line)}</div>}
          <p className="dialogue__text">{beat.line.text}</p>
        </div>
      );
    case 'title':
      return <h1 className="cutscene__title">{beat.text}</h1>;
    case 'image':
      return <div className="cutscene__image" data-image={beat.image} role="img" aria-label={beat.image} />;
    case 'terminal':
      return <pre className="cutscene__terminal">{beat.lines.join('\n')}</pre>;
  }
}

export function Cutscene({ beats, onFinish }: CutsceneProps) {
  const { item } = useSequence(beats, onFinish);
  const beat = item === null ? undefined : beats?.[item];
  if (beat === undefined) return null;
  return (
    <div className="cutscene" role="dialog" aria-live="polite">
      <BeatView beat={beat} />
      <div className="dialogue__hint">
        <kbd className="keycap">Enter</kbd> to go on
      </div>
    </div>
  );
}

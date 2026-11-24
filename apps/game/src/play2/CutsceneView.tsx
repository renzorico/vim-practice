import type { Beat } from '@escape/story';
import type { Legend, Stage } from '@escape/world';
import { StagePicture } from '../scene/StagePicture.js';
import { DialogueBox } from '../story-ui/DialogueBox.js';
import { KeyText } from './KeyText.js';

const PICTURE_ROWS = 10;
const PICTURE_COLS = 18;
/** What the Scribe carved at the end of every world. */
const CARVED = 'The Scribe is in another buffer.';
const CHAPTER = /^End of World \d\.$/;

function Advance({ onAdvance }: { readonly onAdvance: () => void }) {
  return <button type="button" className="dialogue__hint" aria-label="Enter to go on" onClick={onAdvance}>
    <span className="dialogue__triangle" aria-hidden="true">▾</span> <kbd className="keycap">Enter</kbd>
  </button>;
}

/** A story beat over the place it happens in: speech as dialogue, carvings as stone, the end of a world as a page. */
export function CutsceneView({ id, index, beat, stage, legend, onAdvance }: {
  readonly id: string; readonly index: number; readonly beat: Beat | undefined;
  readonly stage: Stage; readonly legend: Legend; readonly onAdvance: () => void;
}) {
  if (!beat) return null;
  const chapter = beat.type === 'line' && CHAPTER.test(beat.line.text);
  const picture = stage.type !== 'text' && <StagePicture stage={stage} legend={legend} rows={PICTURE_ROWS} cols={PICTURE_COLS} className="story-scene__picture" />;
  // The dialogue box is the dialog for a spoken line; every other beat is one itself.
  if (beat.type === 'line' && !chapter) return <div className="story-scene">
    {picture}
    <div className="dialogue-placement"><DialogueBox dialogueId={`${id}:${index}`} lines={[beat.line]} activeIndex={0} onFinish={onAdvance} /></div>
  </div>;
  const kind = chapter ? 'chapter' : beat.type === 'terminal' ? 'terminal' : beat.type === 'title' && beat.text === CARVED ? 'carving' : 'caption';
  return <section className="story-scene" role="dialog" aria-label="Story">
    {picture}
    <div className={`story-scene__${kind}`} aria-live="polite" key={index}>
      {beat.type === 'line' && <h2>{beat.line.text}</h2>}
      {beat.type === 'title' && <h2><KeyText text={beat.text} /></h2>}
      {beat.type === 'terminal' && <pre className="play-terminal">{beat.lines.join('\n')}</pre>}
      {beat.type === 'image' && <div role="img" aria-label={beat.image} data-image={beat.image} />}
      <Advance onAdvance={onAdvance} />
    </div>
  </section>;
}

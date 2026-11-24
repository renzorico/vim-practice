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
export function CutsceneView({ beat, stage, legend, onAdvance }: {
  readonly beat: Beat | undefined; readonly stage: Stage; readonly legend: Legend; readonly onAdvance: () => void;
}) {
  if (!beat) return null;
  const chapter = beat.type === 'line' && CHAPTER.test(beat.line.text);
  return <section className="story-scene" role="dialog" aria-label="Story">
    {stage.type !== 'text' && <StagePicture stage={stage} legend={legend} rows={PICTURE_ROWS} cols={PICTURE_COLS} className="story-scene__picture" />}
    {beat.type === 'line' && !chapter && <div className="dialogue-placement">
      <DialogueBox lines={[beat.line]} activeIndex={0} onFinish={onAdvance} />
    </div>}
    {chapter && <div className="story-scene__chapter"><h2>{beat.line.text}</h2><Advance onAdvance={onAdvance} /></div>}
    {beat.type === 'title' && <div className={beat.text === CARVED ? 'story-scene__carving' : 'story-scene__caption'}><h2><KeyText text={beat.text} /></h2><Advance onAdvance={onAdvance} /></div>}
    {beat.type === 'terminal' && <div className="story-scene__terminal"><pre className="play-terminal">{beat.lines.join('\n')}</pre><Advance onAdvance={onAdvance} /></div>}
    {beat.type === 'image' && <div className="story-scene__carving"><div role="img" aria-label={beat.image} data-image={beat.image} /><Advance onAdvance={onAdvance} /></div>}
  </section>;
}

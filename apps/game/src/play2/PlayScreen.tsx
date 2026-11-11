import type { Beat } from '@escape/story';
import type { Legend, Stage } from '@escape/world';
import { FieldView } from '../scene/FieldView.js';
import { DialogueBox } from '../story-ui/DialogueBox.js';
import { ObjectiveHud } from '../story-ui/ObjectiveHud.js';
import { resultData, type Session } from './session.js';
import type { StoryContent } from '@escape/story';

interface PlayScreenProps {
  readonly session: Session;
  readonly stage: Stage;
  readonly legend: Legend;
  readonly content: StoryContent;
  readonly showSource: boolean;
  readonly onAdvance: () => void;
}
function BeatView({ beat }: { readonly beat: Beat | undefined }) {
  if (!beat) return null;
  switch (beat.type) {
    case 'line': return <p className="dialogue__text">{beat.line.text}</p>;
    case 'title': return <h1>{beat.text}</h1>;
    case 'terminal': return <pre>{beat.lines.join('\n')}</pre>;
    case 'image': return <div role="img" aria-label={beat.image} data-image={beat.image} />;
  }
}
export function PlayScreen({ session, stage, legend, content, showSource, onAdvance }: PlayScreenProps) {
  const { world } = session;
  const presentation = session.queue[0];
  const dialogue = presentation?.type === 'dialogue'
    ? content.dialogues.find(item => item.id === presentation.dialogue) : undefined;
  const cutscene = presentation?.type === 'cutscene'
    ? content.cutscenes.find(item => item.id === presentation.cutscene) : undefined;
  const result = resultData(session, stage);
  return <main className="play-screen">
    <header className="play-header">
      <h1>{stage.id} · {stage.title}</h1>
      <ObjectiveHud objectives={[stage.goalText]} hearts={world.hearts} maxHearts={stage.hearts} turn={world.turn} />
    </header>
    <div className="play-field"><FieldView state={world} events={session.lastEvents} stage={stage}
      legend={legend} showSource={showSource} /></div>
    <footer className="play-controls">
      <span><kbd>h</kbd> left · <kbd>j</kbd> down · <kbd>k</kbd> up · <kbd>l</kbd> right</span>
      <output aria-label="Pending keys">{world.engine.pendingKeys.join('') || '\u00a0'}</output>
      <span>Hold <kbd>Tab</kbd> for Source</span>
    </footer>
    {world.status === 'dead' ? <section className="play-panel" role="dialog" aria-label="You were unwritten">
      <h2>You were unwritten</h2><p>Your last checkpoint is waiting.</p>
      <button onClick={onAdvance}>Press any key to return</button>
    </section> : <>
      {dialogue && presentation && <DialogueBox lines={dialogue.lines} activeIndex={presentation.index} onFinish={onAdvance} />}
      {cutscene && presentation && <section className="play-panel" role="dialog" aria-label="Story">
        <BeatView beat={cutscene.beats[presentation.index]} /><button onClick={onAdvance}>Enter to go on</button>
      </section>}
      {presentation?.type === 'teach' && <section className="play-panel" role="dialog" aria-label="Lesson">
        <h2>{presentation.skill}</h2><p>Lesson practice is coming in a later stage.</p><button onClick={onAdvance}>Continue</button>
      </section>}
      {presentation?.type === 'ending' && <section className="play-panel" role="dialog" aria-label="Ending">
        <h2>{presentation.ending}</h2><button onClick={onAdvance}>Continue</button>
      </section>}
      {world.status === 'cleared' && !presentation && <section className="play-panel" role="dialog" aria-label="Stage cleared">
        <h2>The Road Out, cleared</h2>
        <p>You took {result.turns} turns. The best possible is {result.parTurns}.</p>
        <p>{result.hearts} of {stage.hearts} hearts left.</p>
        <button onClick={onAdvance}>Enter to play again</button>
      </section>}
    </>}
  </main>;
}
